import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDailySchedules } from "@/lib/working-hours";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers);
  // Kimlik doğrulaması olmayan bu uç nokta, kurum adı brute-force edilerek
  // klinik/doktor bilgisi taranmasına (enumeration) açıktı — sınır koyuluyor.
  const rate = checkRateLimit(`public-booking-doctors:${ip}`, 20, 60_000);
  if (!rate.ok) {
    return NextResponse.json({ error: "Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin." }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const kurum = searchParams.get("kurum")?.trim();
  if (!kurum) return NextResponse.json({ error: "Kurum belirtilmedi" }, { status: 400 });

  try {
    const institution = await prisma.institution.findFirst({
      where: { name: { equals: kurum, mode: "insensitive" }, isActive: true },
      select: {
        id: true,
        name: true,
        logo: true,
        settings: { select: { institutionName: true } },
      },
    });
    if (!institution) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 });

    const staff = await prisma.user.findMany({
      where: {
        institutionId: institution.id,
        isActive: true,
        role: { in: ["DOKTOR", "YONETICI"] },
      },
      select: { id: true, fullName: true, role: true, profile: { select: { hideAsDoctor: true } } },
    });

    const doctors = staff
      .filter((s) => (s.role === "YONETICI" ? !s.profile?.hideAsDoctor : true))
      .map((s) => ({ id: s.id, fullName: s.fullName }));

    const dailySchedules = await getDailySchedules(institution.id);
    return NextResponse.json({
      institutionName: institution.settings?.institutionName?.trim() || institution.name,
      logoUrl: institution.logo || null,
      doctors,
      dailySchedules,
    });
  } catch (error) {
    console.error("[public booking doctors GET]", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
