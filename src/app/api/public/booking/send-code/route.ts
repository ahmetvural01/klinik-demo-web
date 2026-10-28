import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { formatZodError, publicBookingSendCodeSchema } from "@/lib/validators";
import { sendSms } from "@/lib/sms";
import { generatePublicBookingOtp } from "@/lib/public-booking-otp";
import { normalizeLocalPhone } from "@/lib/phone-number";

export async function POST(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers);
  const rate = await checkRateLimit(`public-booking-code:${ip}`, 5, 15 * 60_000);
  if (!rate.ok) {
    return NextResponse.json({ error: "Çok fazla kod talebi gönderildi. Lütfen daha sonra tekrar deneyin." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  // Telefon "0532…", "532…" ya da "+90 532…" yazılabilir; kod da talep de aynı
  // kanonik 10 haneyle (5XXXXXXXXX) işlenir — doğrulama kodu anahtarı telefona
  // bağlı olduğu için iki uçta aynı değer şart. Önceden sayfa 0'lı numarayı
  // gönderiyor, sunucu reddediyordu: talep hiç tamamlanamıyordu (denetim G1).
  const parsed = publicBookingSendCodeSchema.safeParse({
    ...(body && typeof body === "object" ? body : {}),
    phone: normalizeLocalPhone(String((body as { phone?: unknown })?.phone ?? ""), "+90"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error)[0] || "Geçersiz veri" }, { status: 400 });
  }
  const { kurum, phone } = parsed.data;

  // Aynı telefona kısa sürede tekrar kod istenmesini de ayrıca sınırla —
  // IP bazlı limit paylaşılan ağlarda (klinik bekleme salonu wifi'si gibi)
  // yetersiz kalabilir.
  const phoneRate = await checkRateLimit(`public-booking-code-phone:${phone}`, 3, 15 * 60_000);
  if (!phoneRate.ok) {
    return NextResponse.json({ error: "Bu numara için çok fazla kod istendi. Lütfen daha sonra tekrar deneyin." }, { status: 429 });
  }

  const institution = await prisma.institution.findFirst({
    where: {
      isActive: true,
      OR: [
        { id: kurum },
        { name: { equals: kurum, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, smsSender: true },
  });
  if (!institution) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 });

  const code = await generatePublicBookingOtp(institution.id, phone);
  const result = await sendSms(phone, `${institution.name}: Randevu doğrulama kodunuz ${code}. 5 dakika geçerlidir.`, { sender: institution.smsSender });
  if (!result.success) {
    return NextResponse.json({ error: "Doğrulama kodu gönderilemedi. Lütfen daha sonra tekrar deneyin." }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
