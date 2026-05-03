import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// GET hatırlatmalar, POST ekle
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "AKTIF";
    const where: Record<string, unknown> = {};
    if (status !== "HEPSI") where.status = status;

    const reminders = await (prisma as any).reminder.findMany({
      where,
      include: { patient: { select: { id: true, fullName: true } } },
      orderBy: { reminderDate: "asc" }
    });
    return NextResponse.json(reminders);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { patientId, planId, note, reminderDate } = await req.json();
    if (!note || !reminderDate) return NextResponse.json({ error: "Not ve tarih zorunlu" }, { status: 400 });

    const r = await (prisma as any).reminder.create({
      data: {
        patientId: patientId || null,
        planId: planId || null,
        note, reminderDate: new Date(reminderDate), status: "AKTIF"
      }
    });
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
