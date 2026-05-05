import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const plan = await (prisma as any).taksitPlan.findUnique({
      where: { id: params.id },
      include: {
        patient: { select: { id: true, fullName: true, phone: true } },
        doctor: { select: { id: true, fullName: true } },
        taksitler: {
          orderBy: { siraNo: "asc" },
          include: { odemeler: { orderBy: { tarih: "asc" } } }
        },
        reminders: { orderBy: { reminderDate: "asc" } }
      }
    });
    if (!plan) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    const hidePhone = user.role === "DOKTOR" || user.role === "ASISTAN";
    const result = hidePhone
      ? {
          ...plan,
          patient: plan.patient ? { ...plan.patient, phone: "***" } : plan.patient,
        }
      : plan;
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const body = await req.json();
    const { status, notes } = body;

    const plan = await (prisma as any).taksitPlan.update({
      where: { id: params.id },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes })
      }
    });
    return NextResponse.json(plan);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    // Önce hatırlatıcıları sil, sonra plan (Taksit + TaksitOdeme cascade ile silinir)
    await prisma.$transaction(async (tx) => {
      await (tx as any).reminder.deleteMany({ where: { planId: params.id } });
      await (tx as any).taksitPlan.delete({ where: { id: params.id } });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
