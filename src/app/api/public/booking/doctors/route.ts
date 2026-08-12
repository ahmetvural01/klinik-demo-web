import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDailySchedules } from "@/lib/working-hours";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";

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
        settings: { select: { institutionName: true } },
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

    const staff = await prisma.user.findMany({
      where: {
        institutionId: institution.id,
        isActive: true,
        role: { in: ["DOKTOR", "YONETICI"] },
        branchMemberships: { some: { branchId: selectedBranch.id, isActive: true } },
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
      branches: institution.branches.map(({ sortOrder: _sortOrder, isHeadquarters: _isHeadquarters, ...branch }) => branch),
      selectedBranchId: selectedBranch.id,
      doctors,
      dailySchedules,
    });
  } catch (error) {
    console.error("[public booking doctors GET]", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
