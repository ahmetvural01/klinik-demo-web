import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { dispatchPatientMessage } from "@/lib/notification-dispatch";
import { requireActiveBranch } from "@/lib/branch-context";
import { maskPatientName } from "@/lib/audit-mask";
import { canMessageOnWhatsapp } from "@/lib/whatsapp-consent";

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? "");
}

// GET - Gönderim öncesi kontrol (hiçbir şey göndermez): seçilen hastaya
// mesaj gidebilir mi? Ekran "Gönder"e basılmadan önce "SMS izni yok" gibi
// engelleri gösterir; toplu özetteki (bulk/preview) ölçütün tek hasta hâli.
export async function GET(request: NextRequest) {
  const auth = await requireAuth("sms:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları mesaj gönderebilir." }, { status: 403 });
  }
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 403 });
  const patientId = (request.nextUrl.searchParams.get("patientId") || "").trim();
  if (!patientId || patientId.length > 100) return NextResponse.json({ message: "Hasta seçin." }, { status: 400 });

  const [patient, institution] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: patientId, institutionId: auth.user.institutionId, homeBranchId: activeBranch.branchId, archivedAt: null },
      select: { id: true, phone: true, whatsappOptInAt: true, whatsappOptOutAt: true, smsPreference: { select: { status: true } } },
    }),
    prisma.institution.findUnique({ where: { id: auth.user.institutionId }, select: { smsBalance: true } }),
  ]);
  if (!patient) return NextResponse.json({ message: "Hasta bulunamadı." }, { status: 404 });
  return NextResponse.json({
    hasPhone: Boolean(patient.phone),
    smsConsent: patient.smsPreference?.status || "NONE",
    whatsappConsent: canMessageOnWhatsapp(patient),
    smsBalance: institution?.smsBalance ?? 0,
  });
}

// POST - TEK hastaya serbest metin mesajı. Yetki "sms:write": rol tanımı bu
// yetkiyi zaten "Tek bir hastaya ... SMS gönderebilir" diye açıklıyor; toplu
// gönderim ayrı ve yüksek riskli "sms:bulk" yetkisinde kalır. İzin, kredi,
// kanal ve idempotency kuralları merkezi dispatch'ten geçer (bkz.
// src/lib/notification-dispatch.ts); burada yalnız hasta/şube doğrulanır.
export async function POST(request: NextRequest) {
  const auth = await requireAuth("sms:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları mesaj gönderebilir." }, { status: 403 });
  }
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek gövdesi." }, { status: 400 });
  }
  const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const whatsappContent = typeof body.whatsappContent === "string" ? body.whatsappContent.trim() : "";
  const rawChannelPreference = typeof body.channelPreference === "string" ? body.channelPreference : "AUTO";
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";

  if (!patientId || patientId.length > 100) return NextResponse.json({ message: "Hasta seçin." }, { status: 400 });
  if (!content) return NextResponse.json({ message: "Mesaj metni boş olamaz." }, { status: 400 });
  if (content.length > 1600 || whatsappContent.length > 4096) {
    return NextResponse.json({ message: "Mesaj metni izin verilen uzunluğu aşıyor." }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestId)) {
    return NextResponse.json({ message: "Gönderim kimliği eksik veya geçersiz." }, { status: 400 });
  }
  if (!["AUTO", "SMS", "WHATSAPP"].includes(rawChannelPreference)) {
    return NextResponse.json({ message: "Geçersiz iletişim kanalı." }, { status: 400 });
  }
  let channelPreference = rawChannelPreference as "AUTO" | "SMS" | "WHATSAPP";
  if (channelPreference !== "SMS") {
    // WhatsApp seçimi WhatsApp yazma yetkisi ister; "Otomatik" seçimde yetki
    // yoksa yalnız SMS kullanılır (toplu gönderimle aynı kural).
    const whatsappAuth = await requireAuth("whatsapp:write");
    if (whatsappAuth.error) {
      if (channelPreference === "WHATSAPP") return whatsappAuth.error;
      channelPreference = "SMS";
    }
  }

  // institutionId + homeBranchId: başka kurumun/şubenin hastasına gönderim yok.
  const [patient, settings, institution] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: patientId, institutionId: auth.user.institutionId, homeBranchId: activeBranch.branchId, archivedAt: null },
      select: { id: true, fullName: true, phone: true },
    }),
    prisma.setting.findUnique({ where: { institutionId: auth.user.institutionId } }),
    prisma.institution.findUnique({ where: { id: auth.user.institutionId } }),
  ]);
  if (!institution) return NextResponse.json({ message: "Klinik bulunamadı." }, { status: 404 });
  if (!patient) return NextResponse.json({ message: "Hasta bulunamadı." }, { status: 404 });
  if (!patient.phone) return NextResponse.json({ message: "Hastanın kayıtlı telefonu yok." }, { status: 400 });
  if (channelPreference === "WHATSAPP" && !institution.whatsappEnabled) {
    return NextResponse.json({ message: "WhatsApp modülü bu klinik için açık değil." }, { status: 403 });
  }

  const vars = {
    institutionName: settings?.institutionName || institution.name,
    institutionPhone: settings?.institutionPhone || institution.phone || "",
    patientName: patient.fullName,
  };
  const result = await dispatchPatientMessage({
    institutionId: institution.id,
    patientId: patient.id,
    eventType: "MANUAL_SMS",
    purpose: "SERVICE",
    templateCode: "ELLE",
    message: renderTemplate(content, vars),
    whatsappMessage: renderTemplate(whatsappContent || content, vars),
    channelPreference,
    idempotencyKey: `manual-sms:${requestId}:${patient.id}`,
    actorId: auth.user.id,
  });

  const maskedName = maskPatientName(patient.fullName);
  if (result.success) {
    await writeAudit(auth.user.id, `${result.channel}_MANUAL`, `Hastaya mesaj gönderildi: ${maskedName} (${result.channel === "WHATSAPP" ? "WhatsApp" : "SMS"}).`);
  } else {
    await writeAudit(auth.user.id, "SMS_MANUAL_FAILED", `Hastaya mesaj gönderilemedi: ${maskedName} - ${result.reason || result.error || "Bilinmeyen hata"}`);
  }
  const refreshed = await prisma.institution.findUnique({ where: { id: institution.id }, select: { smsBalance: true } });

  const outcome = result.success
    ? "sent"
    : result.suppressed
      ? "notSent"
      : result.retryable === false
        ? "uncertain"
        : "failed";
  return NextResponse.json({
    outcome,
    channel: result.channel,
    reason: result.reason || result.error || null,
    remainingBalance: refreshed?.smsBalance ?? institution.smsBalance,
    message: outcome === "sent"
      ? `${patient.fullName} için mesaj ${result.channel === "WHATSAPP" ? "WhatsApp" : "SMS"} ile gönderildi.`
      : outcome === "notSent"
        ? `Mesaj gönderilmedi: ${result.reason || "gönderim koşulları sağlanmadı"}`
        : outcome === "uncertain"
          ? "Gönderimin sonucu kesinleşmedi. Çift mesaj olmaması için tekrar göndermeden önce Gönderim Geçmişi'ne bakın."
          : `Mesaj gönderilemedi: ${result.error || "sağlayıcı hatası"}`,
  });
}
