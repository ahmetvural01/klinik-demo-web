import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sendSmsConsentRequest } from "@/lib/sms-consent";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

// Personel "SMS Onayını Tekrar Gönder"e bastığında yeni bir güvenli token
// üretir ve yeni onay SMS'i gönderir — eski token'lar/geçmiş silinmez, yalnızca
// geçersizleştirilir (bkz. docs/ILETISIM-MIMARISI-RAPORU.md §1.6). Art arda
// hızlı tıklamaya karşı hem hasta bazlı kısa bekleme (DB'den, sunucu
// yeniden başlasa/çoklu instance olsa da geçerli) hem de kullanıcı+IP bazlı
// genel bir rate limit uygulanır.
const COOLDOWN_MS = 30_000;

export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("patients:write");
  if (auth.error) return auth.error;

  const ip = getClientIpFromHeaders(request.headers);
  const actorRate = checkRateLimit(`sms-consent-resend:actor:${auth.user.id}:${ip}`, 20, 15 * 60_000);
  if (!actorRate.ok) {
    return NextResponse.json({ message: "Çok fazla tekrar gönderim isteği. Lütfen kısa bir süre sonra tekrar deneyin." }, { status: 429 });
  }

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      archivedAt: null,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
    select: { id: true, institutionId: true, fullName: true },
  });
  if (!patient || !patient.institutionId) {
    return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
  }

  const lastToken = await prisma.patientSmsConsentToken.findFirst({
    where: { patientId: patient.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastToken) {
    const elapsedMs = Date.now() - lastToken.createdAt.getTime();
    if (elapsedMs < COOLDOWN_MS) {
      const waitSeconds = Math.ceil((COOLDOWN_MS - elapsedMs) / 1000);
      return NextResponse.json(
        { message: `Çok hızlı tekrar gönderim. Lütfen ${waitSeconds} saniye bekleyip tekrar deneyin.` },
        { status: 429 },
      );
    }
  }

  const result = await sendSmsConsentRequest({
    institutionId: patient.institutionId,
    patientId: patient.id,
    purpose: "RESEND",
    actorId: auth.user.id,
  });

  if (!result.success) {
    return NextResponse.json({ message: result.error || "SMS izin isteği gönderilemedi." }, { status: 503 });
  }

  await writeAudit(auth.user.id, "PATIENT_SMS_CONSENT_RESEND", `${patient.fullName} için SMS izin bağlantısı tekrar gönderildi.`);
  return NextResponse.json({ ok: true });
}
