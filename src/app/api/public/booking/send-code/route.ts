import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { formatZodError, publicBookingSendCodeSchema } from "@/lib/validators";
import { sendSms } from "@/lib/sms";
import { generatePublicBookingOtp } from "@/lib/public-booking-otp";

export async function POST(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers);
  const rate = checkRateLimit(`public-booking-code:${ip}`, 5, 15 * 60_000);
  if (!rate.ok) {
    return NextResponse.json({ error: "Çok fazla kod talebi gönderildi. Lütfen daha sonra tekrar deneyin." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = publicBookingSendCodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error)[0] || "Geçersiz veri" }, { status: 400 });
  }
  const { kurum, phone } = parsed.data;

  // Aynı telefona kısa sürede tekrar kod istenmesini de ayrıca sınırla —
  // IP bazlı limit paylaşılan ağlarda (klinik bekleme salonu wifi'si gibi)
  // yetersiz kalabilir.
  const phoneRate = checkRateLimit(`public-booking-code-phone:${phone}`, 3, 15 * 60_000);
  if (!phoneRate.ok) {
    return NextResponse.json({ error: "Bu numara için çok fazla kod istendi. Lütfen daha sonra tekrar deneyin." }, { status: 429 });
  }

  const institution = await prisma.institution.findFirst({
    where: { name: { equals: kurum, mode: "insensitive" }, isActive: true },
    select: { id: true, name: true },
  });
  if (!institution) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 });

  const code = generatePublicBookingOtp(institution.id, phone);
  const result = await sendSms(phone, `${institution.name}: Randevu doğrulama kodunuz ${code}. 5 dakika geçerlidir.`);
  if (!result.success) {
    return NextResponse.json({ error: "Doğrulama kodu gönderilemedi. Lütfen daha sonra tekrar deneyin." }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
