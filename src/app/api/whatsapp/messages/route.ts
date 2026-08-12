import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { decryptField } from "@/lib/field-crypto";
import { normalizeWhatsappPhone } from "@/lib/whatsapp";
import { dispatchPatientMessage } from "@/lib/notification-dispatch";
import { requireActiveBranch } from "@/lib/branch-context";

function parseTake(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(200, Math.max(1, Math.trunc(parsed))) : 100;
}

async function requireWhatsappModule(institutionId: string) {
  const institution = await prisma.institution.findFirst({
    where: { id: institutionId, isActive: true, whatsappEnabled: true },
    select: { id: true },
  });
  return Boolean(institution);
}

function presentMessage<T extends { content: string | null; errorDetail: string | null }>(message: T) {
  return {
    ...message,
    content: decryptField(message.content),
    errorDetail: message.errorDetail ? decryptField(message.errorDetail) : null,
  };
}

function whatsappBranchScope(branch: { id: string; isHeadquarters: boolean; isBranchManager: boolean }) {
  return {
    branchId: branch.id,
    // Hasta ile henüz eşleşmeyen numaralar merkez şubeye düşer; bunları
    // yalnız merkez şube yöneticisi görüp doğru hastaya yönlendirebilir.
    ...(branch.isHeadquarters && branch.isBranchManager ? {} : { patientId: { not: null } }),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth("whatsapp:read");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) return NextResponse.json({ messages: [] });
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 403 });
  const activeBranchSummary = auth.user.branchContext.activeBranch;
  if (!activeBranchSummary) return NextResponse.json({ message: "Aktif şube bulunamadı." }, { status: 403 });

  const institutionId = auth.user.institutionId;
  if (!(await requireWhatsappModule(institutionId))) {
    return NextResponse.json({ message: "WhatsApp modülü bu klinik için açık değil." }, { status: 403 });
  }
  // Eşleşmiş konuşmalar hastanın şubesine aittir. Henüz hastayla eşleşmeyen
  // numaralar tüm şubelere yayılmaz; yalnız merkez şube yöneticisinin gelen
  // kutusunda görünür ve buradan doğru hastaya yönlendirilebilir.
  const branchScope = whatsappBranchScope(activeBranchSummary);
  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  const direction = (request.nextUrl.searchParams.get("direction") || "").toUpperCase();
  const status = (request.nextUrl.searchParams.get("status") || "").toUpperCase();
  const phone = (request.nextUrl.searchParams.get("phone") || "").trim();
  const mode = request.nextUrl.searchParams.get("mode") || "messages";
  const validDirections = new Set(["", "ALL", "INBOUND", "OUTBOUND"]);
  const validStatuses = new Set(["", "ALL", "PENDING", "SENT", "DELIVERED", "READ", "FAILED", "RECEIVED"]);
  if (!validDirections.has(direction) || !validStatuses.has(status)) {
    return NextResponse.json({ message: "Geçersiz mesaj filtresi." }, { status: 400 });
  }
  if (!["messages", "conversations"].includes(mode)) {
    return NextResponse.json({ message: "Geçersiz görünüm modu." }, { status: 400 });
  }

  if (mode === "conversations") {
    const where = {
      institutionId,
      AND: [
        branchScope,
        ...(q
          ? [{
              OR: [
                { phone: { contains: q } },
                { patient: { fullName: { contains: q, mode: "insensitive" as const } } },
              ],
            }]
          : []),
      ],
    };
    const [latestMessages, unreadGroups] = await Promise.all([
      prisma.whatsappMessage.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              whatsappOptInAt: true,
              whatsappOptOutAt: true,
            },
          },
        },
        orderBy: [{ phone: "asc" }, { createdAt: "desc" }],
        distinct: ["phone"],
        take: parseTake(request.nextUrl.searchParams.get("take")),
      }),
      prisma.whatsappMessage.groupBy({
        by: ["phone"],
        where: {
          institutionId,
          direction: "INBOUND",
          seenAt: null,
          ...branchScope,
        },
        _count: { _all: true },
      }),
    ]);
    const unreadByPhone = new Map(unreadGroups.map((entry) => [entry.phone, entry._count._all]));
    const conversations = latestMessages
      .map((message) => ({
        phone: message.phone,
        patient: message.patient,
        lastMessage: presentMessage(message),
        unreadCount: unreadByPhone.get(message.phone) || 0,
      }))
      .sort((left, right) => right.lastMessage.createdAt.getTime() - left.lastMessage.createdAt.getTime());
    return NextResponse.json({ conversations });
  }

  if (phone) {
    const take = parseTake(request.nextUrl.searchParams.get("take"));
    const descending = await prisma.whatsappMessage.findMany({
      where: { institutionId, phone, ...branchScope },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            whatsappOptInAt: true,
            whatsappOptOutAt: true,
          },
        },
        appointment: { select: { id: true, startAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    });
    const messages = descending.reverse().map(presentMessage);
    const patient = messages.find((message) => message.patient)?.patient || null;
    const recentInbound = descending.find((message) => (
      message.direction === "INBOUND"
      && message.createdAt.getTime() >= Date.now() - 24 * 60 * 60 * 1000
    ));
    return NextResponse.json({
      messages,
      patient,
      canReply: Boolean(
        patient?.whatsappOptInAt
        && !patient.whatsappOptOutAt
        && recentInbound,
      ),
      templateAllowed: Boolean(patient?.whatsappOptInAt && !patient.whatsappOptOutAt),
    });
  }

  const messages = await prisma.whatsappMessage.findMany({
    where: {
      institutionId,
      ...(direction && direction !== "ALL" ? { direction } : {}),
      ...(status && status !== "ALL" ? { status } : {}),
      AND: [
        branchScope,
        ...(q
          ? [{
              OR: [
                { phone: { contains: q } },
                { patient: { fullName: { contains: q, mode: "insensitive" as const } } },
              ],
            }]
          : []),
      ],
    },
    include: {
      patient: { select: { id: true, fullName: true } },
      appointment: { select: { id: true, startAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: parseTake(request.nextUrl.searchParams.get("take")),
  });

  return NextResponse.json({
    messages: messages.map(presentMessage),
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth("whatsapp:read");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 400 });
  }
  if (!(await requireWhatsappModule(auth.user.institutionId))) {
    return NextResponse.json({ message: "WhatsApp modülü bu klinik için açık değil." }, { status: 403 });
  }
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 403 });
  const activeBranchSummary = auth.user.branchContext.activeBranch;
  if (!activeBranchSummary) return NextResponse.json({ message: "Aktif şube bulunamadı." }, { status: 403 });
  const body = await request.json().catch(() => null) as { phone?: unknown } | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek gövdesi." }, { status: 400 });
  }
  const phone = String(body.phone || "").trim();
  if (!phone) return NextResponse.json({ message: "Konuşma telefonu zorunludur." }, { status: 400 });
  if (phone.length > 30) return NextResponse.json({ message: "Telefon bilgisi geçersiz." }, { status: 400 });

  const result = await prisma.whatsappMessage.updateMany({
    where: {
      institutionId: auth.user.institutionId,
      phone,
      direction: "INBOUND",
      seenAt: null,
      ...whatsappBranchScope(activeBranchSummary),
    },
    data: { seenAt: new Date() },
  });
  return NextResponse.json({ ok: true, updated: result.count });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("whatsapp:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 400 });
  }
  if (!(await requireWhatsappModule(auth.user.institutionId))) {
    return NextResponse.json({ message: "WhatsApp modülü bu klinik için açık değil." }, { status: 403 });
  }
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 403 });

  const body = await request.json().catch(() => null) as { requestKey?: unknown; patientId?: unknown; message?: unknown; templateName?: unknown; templateLanguage?: unknown } | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek gövdesi." }, { status: 400 });
  }
  const content = String(body.message || "").trim();
  const templateName = String(body.templateName || "").trim();
  const templateLanguage = String(body.templateLanguage || "tr").trim() || "tr";
  const patientId = String(body.patientId || "").trim();
  const requestKey = String(body.requestKey || "").trim();
  if (!patientId || (!content && !templateName)) {
    return NextResponse.json({ message: "Hasta ve mesaj zorunludur." }, { status: 400 });
  }
  if (content.length > 4096) {
    return NextResponse.json({ message: "Mesaj 4096 karakterden uzun olamaz." }, { status: 400 });
  }
  if (templateName.length > 180 || templateLanguage.length > 20) {
    return NextResponse.json({ message: "WhatsApp şablon bilgisi geçersiz." }, { status: 400 });
  }
  if (!/^[A-Za-z0-9:_-]{12,160}$/.test(requestKey)) {
    return NextResponse.json({ message: "Mesaj istek anahtarı geçersiz. Lütfen yeniden deneyin." }, { status: 400 });
  }

  // Serbest metin yanıtı da merkezi dispatch sözleşmesinden geçer; böylece
  // izin, tenant, idempotency ve sağlayıcı kaydı diğer hasta mesajlarıyla aynıdır.
  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      institutionId: auth.user.institutionId,
      homeBranchId: activeBranch.branchId,
      archivedAt: null,
    },
    select: {
      id: true,
      fullName: true,
      phone: true,
      phoneCountryCode: true,
      whatsappOptInAt: true,
      whatsappOptOutAt: true,
    },
  });
  if (!patient) return NextResponse.json({ message: "Hasta bulunamadı." }, { status: 404 });
  if (!patient.whatsappOptInAt || patient.whatsappOptOutAt) {
    return NextResponse.json(
      { message: "Hastanın geçerli bir WhatsApp iletişim izni bulunmuyor." },
      { status: 409 },
    );
  }

  const serviceWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentInbound = templateName
    ? true
    : await prisma.whatsappMessage.findFirst({
        where: {
          institutionId: auth.user.institutionId,
          patientId: patient.id,
          direction: "INBOUND",
          createdAt: { gte: serviceWindowStart },
        },
        select: { id: true },
      });
  if (!recentInbound) {
    return NextResponse.json(
      { message: "24 saatlik görüşme penceresi kapalı. Bu hastaya yalnızca onaylı bir WhatsApp şablonu gönderilebilir." },
      { status: 409 },
    );
  }

  const result = await dispatchPatientMessage({
    institutionId: auth.user.institutionId,
    patientId: patient.id,
    eventType: "MANUAL_WHATSAPP",
    purpose: "SERVICE",
    templateCode: templateName || "WHATSAPP_REPLY",
    message: content || templateName,
    whatsappMessage: content || templateName,
    channelPreference: "WHATSAPP",
    allowSmsFallback: false,
    idempotencyKey: `whatsapp-reply:${requestKey}`,
    actorId: auth.user.id,
    whatsappTemplate: templateName ? { name: templateName, language: templateLanguage, bodyParameters: content ? [content] : [] } : undefined,
  });
  if (!result.success) {
    await writeAudit(auth.user.id, "WHATSAPP_REPLY_FAILED", `Hasta: ${patient.id} · Hata: ${result.error || result.reason || "bilinmeyen hata"}`);
    return NextResponse.json({ message: result.error || "WhatsApp mesajı gönderilemedi." }, { status: 503 });
  }
  await writeAudit(auth.user.id, "WHATSAPP_REPLY", `Hasta: ${patient.id} · Mesaj: ${result.providerMessageId || "-"}`);
  return NextResponse.json({
    ok: true,
    providerMessageId: result.providerMessageId,
    phone: normalizeWhatsappPhone(patient.phone, patient.phoneCountryCode),
  });
}
