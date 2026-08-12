import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { dispatchPatientMessage } from "@/lib/notification-dispatch";
import { requireActiveBranch } from "@/lib/branch-context";

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? "");
}

// POST - Ozel gunler/kampanyalar icin secili hasta grubuna serbest metin SMS
// gonderimi. "sms:bulk" yuksek riskli bir yetki (bkz. src/lib/role-permissions.ts) —
// varsayilan olarak sadece YONETICI'de var, BANKO/DOKTOR/ASISTAN'da yok.
export async function POST(request: NextRequest) {
  const auth = await requireAuth("sms:bulk");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları toplu SMS gönderebilir." }, { status: 403 });
  }
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek gövdesi." }, { status: 400 });
  }
  const audience = typeof body.audience === "string" ? body.audience : "SELECTED";
  const rawPatientIds = body.patientIds ?? [];
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const whatsappContent = typeof body.whatsappContent === "string" ? body.whatsappContent.trim() : undefined;
  const rawChannelPreference = typeof body.channelPreference === "string" ? body.channelPreference : "AUTO";
  const templateCode = typeof body.templateCode === "string" ? body.templateCode.trim() : "TOPLU";
  const celebrationCode = typeof body.celebrationCode === "string" ? body.celebrationCode.trim() : undefined;
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";

  if (audience !== "ALL" && audience !== "SELECTED") {
    return NextResponse.json({ message: "Geçersiz alıcı grubu." }, { status: 400 });
  }
  if (!Array.isArray(rawPatientIds) || rawPatientIds.length > 1000
    || rawPatientIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 100)) {
    return NextResponse.json({ message: "Geçersiz hasta seçimi." }, { status: 400 });
  }
  const patientIds = Array.from(new Set(rawPatientIds as string[]));
  if (content.length > 1600 || (whatsappContent?.length ?? 0) > 4096) {
    return NextResponse.json({ message: "Mesaj metni izin verilen uzunluğu aşıyor." }, { status: 400 });
  }
  if (!templateCode || templateCode.length > 100 || (celebrationCode?.length ?? 0) > 100) {
    return NextResponse.json({ message: "Geçersiz şablon seçimi." }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestId)) {
    return NextResponse.json({ message: "Gönderim kimliği eksik veya geçersiz." }, { status: 400 });
  }
  if (audience === "SELECTED" && !patientIds.length) {
    return NextResponse.json({ message: "En az bir hasta seçin." }, { status: 400 });
  }
  if (!content.trim()) {
    return NextResponse.json({ message: "Mesaj metni boş olamaz." }, { status: 400 });
  }
  if (!["AUTO", "SMS", "WHATSAPP"].includes(rawChannelPreference)) {
    return NextResponse.json({ message: "Geçersiz iletişim kanalı." }, { status: 400 });
  }
  const channelPreference = rawChannelPreference as "AUTO" | "SMS" | "WHATSAPP";
  let effectiveChannelPreference: "AUTO" | "SMS" | "WHATSAPP" = channelPreference;
  if (channelPreference !== "SMS") {
    const whatsappAuth = await requireAuth("whatsapp:write");
    if (whatsappAuth.error) {
      if (channelPreference === "WHATSAPP") return whatsappAuth.error;
      effectiveChannelPreference = "SMS";
    }
  }

  const [settings, institution, celebrationDay] = await Promise.all([
    prisma.setting.findUnique({ where: { institutionId: auth.user.institutionId } }),
    prisma.institution.findUnique({ where: { id: auth.user.institutionId } }),
    celebrationCode ? prisma.celebrationDay.findFirst({ where: { code: celebrationCode, isActive: true } }) : null,
  ]);

  if (!institution) {
    return NextResponse.json({ message: "Klinik bulunamadı." }, { status: 404 });
  }
  if (effectiveChannelPreference === "WHATSAPP" && !institution.whatsappEnabled) {
    return NextResponse.json({ message: "WhatsApp modülü bu klinik için açık değil." }, { status: 403 });
  }
  if (celebrationCode && !celebrationDay) {
    return NextResponse.json({ message: "Seçilen özel gün şablonu bulunamadı." }, { status: 404 });
  }

  const professionFilter = celebrationDay?.targetProfessions.length
    ? { profession: { in: celebrationDay.targetProfessions } }
    : {};

  // institutionId + homeBranchId filtresi kritik: bu filtreler olmadan baska
  // bir kurumun veya subenin hasta ID'si gonderilirse cross-tenant/cross-branch
  // SMS gonderimi riski olurdu. "ALL" modunda da ayni filtre kullanilir,
  // sadece patientIds yerine aktif subenin tum hastalari.
  const patients = audience === "ALL"
    ? await prisma.patient.findMany({
        where: { institutionId: auth.user.institutionId, homeBranchId: activeBranch.branchId, archivedAt: null, ...professionFilter },
        select: { id: true, fullName: true, phone: true },
      })
    : await prisma.patient.findMany({
        where: { id: { in: patientIds }, institutionId: auth.user.institutionId, homeBranchId: activeBranch.branchId, archivedAt: null, ...professionFilter },
        select: { id: true, fullName: true, phone: true },
      });

  if (!patients.length) {
    return NextResponse.json({ message: "Seçilen ölçütlere uygun hasta bulunamadı." }, { status: 404 });
  }

  const withPhone = patients.filter((p) => p.phone);
  const skippedNoPhone = patients.length - withPhone.length;

  if (!withPhone.length) {
    return NextResponse.json({ message: "Seçili hastaların hiçbirinde telefon numarası bulunmuyor." }, { status: 400 });
  }

  const institutionName = settings?.institutionName || institution.name;
  const institutionPhone = settings?.institutionPhone || institution.phone || "";

  let sent = 0;
  const failedRecipients: { patientId: string; phone: string; reason: string }[] = [];
  const packageId = `TOPLU-${requestId}`;

  const batchSize = 8;
  for (let i = 0; i < withPhone.length; i += batchSize) {
    const chunk = withPhone.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map(async (patient) => {
      const message = renderTemplate(content, {
        institutionName,
        institutionPhone,
        patientName: patient.fullName,
      });
      const renderedWhatsappMessage = renderTemplate(whatsappContent?.trim() || content, {
        institutionName,
        institutionPhone,
        patientName: patient.fullName,
      });
      const result = await dispatchPatientMessage({
        institutionId: institution.id,
        patientId: patient.id,
        eventType: celebrationDay ? "HOLIDAY_GREETING" : "BULK_SMS",
        purpose: celebrationDay ? "GREETING" : "SERVICE",
        templateCode,
        message,
        whatsappMessage: renderedWhatsappMessage,
        channelPreference: effectiveChannelPreference,
        // Her toplu gönderim personelin o anki bilinçli eylemidir — aynı hasta
        // başka bir toplu gönderimde tekrar seçilebilir, bu yüzden anahtar
        // paket kimliğine bağlı (kalıcı olarak tekilleştirilmez).
        idempotencyKey: `bulk-sms:${packageId}:${patient.id}`,
        actorId: auth.user.id,
      });
      return { patient, result };
    }));

    for (const { patient, result } of chunkResults) {
      if (result.success) {
        sent += 1;
        await writeAudit(
          auth.user.id,
          `${result.channel}_TOPLU`,
          `[Paket:${packageId}] ${patient.fullName} (${patient.phone}) - ProviderMsgId: ${result.providerMessageId || "-"}`
        );
      } else {
        failedRecipients.push({
          patientId: patient.id,
          phone: patient.phone,
          reason: result.reason || result.error || "Bilinmeyen hata",
        });
        await writeAudit(
          auth.user.id,
          "SMS_TOPLU_FAILED",
          `[Paket:${packageId}] ${patient.fullName} (${patient.phone}) - ${result.reason || result.error || "Bilinmeyen hata"}`
        );
      }
    }
  }

  const failed = failedRecipients.length;
  const refreshedInstitution = await prisma.institution.findUnique({ where: { id: institution.id } });

  return NextResponse.json({
    sent,
    failed,
    failedRecipients,
    skippedNoPhone,
    remainingBalance: refreshedInstitution?.smsBalance ?? institution.smsBalance,
    message: `${sent} hastaya toplu ileti gönderildi${failed ? `, ${failed} gönderim başarısız` : ""}${skippedNoPhone ? `, ${skippedNoPhone} hastanın telefonu yok` : ""}`,
  });
}
