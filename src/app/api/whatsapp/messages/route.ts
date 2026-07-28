import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { decryptField } from "@/lib/field-crypto";
import { sendWhatsapp } from "@/lib/whatsapp";

function parseTake(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(200, Math.max(1, Math.trunc(parsed))) : 100;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth("sms:read");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) return NextResponse.json({ messages: [] });

  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  const direction = (request.nextUrl.searchParams.get("direction") || "").toUpperCase();
  const status = (request.nextUrl.searchParams.get("status") || "").toUpperCase();
  const messages = await prisma.whatsappMessage.findMany({
    where: {
      institutionId: auth.user.institutionId,
      ...(direction && direction !== "ALL" ? { direction } : {}),
      ...(status && status !== "ALL" ? { status } : {}),
      ...(q
        ? {
            OR: [
              { phone: { contains: q } },
              { patient: { fullName: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
      patient: { select: { id: true, fullName: true } },
      appointment: { select: { id: true, startAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: parseTake(request.nextUrl.searchParams.get("take")),
  });

  return NextResponse.json({
    messages: messages.map((message) => ({
      ...message,
      content: decryptField(message.content),
      errorDetail: message.errorDetail ? decryptField(message.errorDetail) : null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("sms:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 400 });
  }

  const body = await request.json() as { patientId?: string; message?: string };
  const content = String(body.message || "").trim();
  if (!body.patientId || !content) {
    return NextResponse.json({ message: "Hasta ve mesaj zorunludur." }, { status: 400 });
  }
  if (content.length > 4096) {
    return NextResponse.json({ message: "Mesaj 4096 karakterden uzun olamaz." }, { status: 400 });
  }

  const patient = await prisma.patient.findFirst({
    where: {
      id: body.patientId,
      institutionId: auth.user.institutionId,
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
  const recentInbound = await prisma.whatsappMessage.findFirst({
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

  const result = await sendWhatsapp(patient.phone, content, {
    institutionId: auth.user.institutionId,
    patientId: patient.id,
    countryCode: patient.phoneCountryCode,
  });
  if (!result.success) {
    return NextResponse.json({ message: result.error || "WhatsApp mesajı gönderilemedi." }, { status: 503 });
  }
  await writeAudit(auth.user.id, "WHATSAPP_REPLY", `Hasta: ${patient.id} · Mesaj: ${result.providerMessageId || "-"}`);
  return NextResponse.json({ ok: true, providerMessageId: result.providerMessageId });
}
