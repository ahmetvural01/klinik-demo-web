import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDailySchedules } from "@/lib/working-hours";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { effectiveDoctorWhere } from "@/lib/hakedis";

export async function GET(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers);
  // Kimlik doğrulaması olmayan bu uç nokta, kurum adı brute-force edilerek
  // klinik/doktor bilgisi taranmasına (enumeration) açıktı — sınır koyuluyor.
  const rate = await checkRateLimit(`public-booking-doctors:${ip}`, 20, 60_000);
  if (!rate.ok) {
    return NextResponse.json({ error: "Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin." }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const kurum = searchParams.get("kurum")?.trim();
  const requestedBranchId = searchParams.get("branchId")?.trim() || null;
  if (!kurum) return NextResponse.json({ error: "Kurum belirtilmedi" }, { status: 400 });

  try {
    const institution = await prisma.institution.findFirst({
      where: {
        isActive: true,
        OR: [
          { id: kurum },
          { name: { equals: kurum, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        logo: true,
        phone: true,
        settings: { select: { institutionName: true, institutionPhone: true } },
        branches: {
          where: { isActive: true },
          select: { id: true, name: true, city: true, district: true, isHeadquarters: true, sortOrder: true },
          orderBy: [{ isHeadquarters: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
        },
      },
    });
    if (!institution) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 });
    const selectedBranch = requestedBranchId
      ? institution.branches.find((branch) => branch.id === requestedBranchId)
      : institution.branches[0];
    if (!selectedBranch) return NextResponse.json({ error: "Aktif şube bulunamadı" }, { status: 404 });

    // Talep gönderiminde doktor aynı kuralla (effectiveDoctorWhere) doğrulanır;
    // önceden liste farklı kuralla üretiliyordu ve listede görünen bir yönetici
    // gönderimde "Doktor bulunamadı" hatası verebiliyordu.
    const [doctors, dailySchedules] = await Promise.all([
      prisma.user.findMany({
        where: effectiveDoctorWhere(institution.id, selectedBranch.id),
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      }),
      getDailySchedules(institution.id),
    ]);
    return NextResponse.json({
      institutionName: institution.settings?.institutionName?.trim() || institution.name,
      logoUrl: institution.logo || null,
      // Kliniğin hastalara açık telefonu (hasta mesajlarında da yazan numara):
      // talep sonrası "kliniği arayın" bağlantısı için.
      institutionPhone: institution.settings?.institutionPhone?.trim() || institution.phone?.trim() || null,
      branches: institution.branches.map(({ sortOrder: _sortOrder, isHeadquarters: _isHeadquarters, ...branch }) => branch),
      selectedBranchId: selectedBranch.id,
      doctors: doctors.map((doctor) => ({ id: doctor.id, fullName: doctor.fullName })),
      dailySchedules,
    });
  } catch (error) {
    console.error("[public booking doctors GET]", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
