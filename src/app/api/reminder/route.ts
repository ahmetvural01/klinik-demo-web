import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

// GET hatırlatmalar, POST ekle
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth("appointments:read");
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "AKTIF";
    const where: Record<string, unknown> = {};
    if (status !== "HEPSI") where.status = status;
    if (auth.user.role !== "SUPERADMIN") {
      if (!auth.user.institutionId) return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
      where.OR = [
        { patient: { institutionId: auth.user.institutionId } },
        { plan: { patient: { institutionId: auth.user.institutionId } } },
      ];
    }

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
    const auth = await requireAuth("appointments:write");
    if (auth.error) return auth.error;

    const { patientId, planId, note, reminderDate } = await req.json();
    if (!note || !reminderDate) return NextResponse.json({ error: "Not ve tarih zorunlu" }, { status: 400 });
    if (!patientId && !planId) return NextResponse.json({ error: "Hasta veya plan zorunlu" }, { status: 400 });

    if (auth.user.role !== "SUPERADMIN") {
      if (!auth.user.institutionId) return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });

      if (patientId) {
        const patient = await (prisma as any).patient.findFirst({
          where: { id: patientId, institutionId: auth.user.institutionId },
          select: { id: true },
        });
        if (!patient) return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });
      }

      if (planId) {
        const plan = await (prisma as any).taksitPlan.findFirst({
          where: { id: planId, patient: { institutionId: auth.user.institutionId } },
          select: { id: true },
        });
        if (!plan) return NextResponse.json({ error: "Plan bulunamadı" }, { status: 404 });
      }
    }

    const r = await (prisma as any).reminder.create({
      data: {
        patientId: patientId || null,
        planId: planId || null,
        note, reminderDate: new Date(reminderDate), status: "AKTIF"
      }
    });
    await writeAudit(auth.user.id, "REMINDER_CREATE", "Hatırlatma eklendi");
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
