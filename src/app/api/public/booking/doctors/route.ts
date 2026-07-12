import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const kurum = searchParams.get("kurum")?.trim();
  if (!kurum) return NextResponse.json({ error: "Kurum belirtilmedi" }, { status: 400 });

  try {
    const institution = await prisma.institution.findFirst({
      where: { name: { equals: kurum, mode: "insensitive" }, isActive: true },
      select: { id: true, name: true },
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

    return NextResponse.json({ institutionName: institution.name, doctors });
  } catch (error) {
    console.error("[public booking doctors GET]", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
