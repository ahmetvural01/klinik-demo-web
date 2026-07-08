import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

// GET /api/doctor-blocks?doctorId=xxx&date=2026-05-06
// GET /api/doctor-blocks?from=2026-05-01&to=2026-05-31  (tüm doktorlar için)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("*");
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const doctorId = searchParams.get("doctorId");
    const date     = searchParams.get("date");
    const from     = searchParams.get("from");
    const to       = searchParams.get("to");

    const where: Record<string, unknown> = {};

    if (doctorId) where.doctorId = doctorId;
    if (date)     where.date = date;
    if (from && to) {
      where.date = { gte: from, lte: to };
    }
    if (auth.user.role !== "SUPERADMIN") {
      where.doctor = { institutionId: auth.user.institutionId };
    }

    const blocks = await prisma.doctorBlock.findMany({
      where,
      include: { doctor: { select: { id: true, fullName: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    return NextResponse.json(blocks);
  } catch (error) {
    console.error("[doctor-blocks GET] fallback:", error);
    return NextResponse.json([]);
  }
}

// POST /api/doctor-blocks
// { doctorId, date, startTime, endTime, reason? }
export async function POST(request: NextRequest) {
  const auth = await requireAuth("*");
  if (auth.error) return auth.error;

  const allowedRoles = ["SUPERADMIN", "YONETICI", "ADMIN"];
  if (!allowedRoles.includes(auth.user!.role)) {
    return NextResponse.json({ message: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const body = await request.json();
  const { doctorId, date, startTime, endTime, reason } = body;

  if (!doctorId || !date || !startTime || !endTime) {
    return NextResponse.json({ message: "doctorId, date, startTime, endTime gerekli" }, { status: 400 });
  }

  if (startTime >= endTime) {
    return NextResponse.json({ message: "Başlangıç saati bitiş saatinden önce olmalı" }, { status: 400 });
  }

  if (auth.user!.role !== "SUPERADMIN") {
    const doctor = await prisma.user.findFirst({
      where: { id: doctorId, institutionId: auth.user!.institutionId },
      select: { id: true },
    });
    if (!doctor) {
      return NextResponse.json({ message: "Doktor bulunamadı" }, { status: 404 });
    }
  }

  try {
    const block = await prisma.doctorBlock.create({
      data: { doctorId, date, startTime, endTime, reason: reason || null },
      include: { doctor: { select: { id: true, fullName: true } } },
    });

    return NextResponse.json(block, { status: 201 });
  } catch (error) {
    console.error("[doctor-blocks POST] fallback:", error);
    return NextResponse.json({ message: "Blok oluşturulamadı" }, { status: 503 });
  }
}

// DELETE /api/doctor-blocks?id=xxx
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth("*");
  if (auth.error) return auth.error;

  const allowedRoles = ["SUPERADMIN", "YONETICI", "ADMIN"];
  if (!allowedRoles.includes(auth.user!.role)) {
    return NextResponse.json({ message: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ message: "id gerekli" }, { status: 400 });

  try {
    const existing = await prisma.doctorBlock.findFirst({
      where: {
        id,
        ...(auth.user!.role !== "SUPERADMIN" ? { doctor: { institutionId: auth.user!.institutionId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ message: "Blok bulunamadı" }, { status: 404 });
    }
    await prisma.doctorBlock.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[doctor-blocks DELETE] fallback:", error);
    return NextResponse.json({ message: "Blok silinemedi" }, { status: 503 });
  }
}
