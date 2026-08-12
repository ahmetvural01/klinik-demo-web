import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";

// GET hatırlatmalar, POST ekle
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth("appointments:read");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "AKTIF";
    if (!new Set(["HEPSI", "AKTIF", "GONDERILIYOR", "TAMAMLANDI", "BASARISIZ"]).has(status)) {
      return NextResponse.json({ error: "Geçersiz hatırlatma durumu" }, { status: 400 });
    }
    const where: Record<string, unknown> = {};
    if (status !== "HEPSI") where.status = status;
    if (!auth.user.institutionId) return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    where.OR = [
      { patient: { institutionId: auth.user.institutionId, homeBranchId: branch.branchId } },
      { plan: { institutionId: auth.user.institutionId, branchId: branch.branchId } },
    ];

    const reminders = await (prisma as any).reminder.findMany({
      where,
      include: { patient: { select: { id: true, fullName: true } } },
      orderBy: { reminderDate: "asc" }
    });
    return NextResponse.json(reminders);
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth("appointments:write");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
    }
    const { patientId, planId, reminderDate } = body;
    const note = typeof body.note === "string" ? body.note.trim() : "";
    const parsedReminderDate = typeof reminderDate === "string" ? new Date(reminderDate) : new Date(Number.NaN);
    if (!note || note.length > 1000 || Number.isNaN(parsedReminderDate.getTime())) {
      return NextResponse.json({ error: "Not 1-1000 karakter ve tarih geçerli olmalı" }, { status: 400 });
    }
    if (!patientId && !planId) return NextResponse.json({ error: "Hasta veya plan zorunlu" }, { status: 400 });

    if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }
    const institutionId = auth.user.institutionId;
    if (!institutionId) return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });

    const [patient, plan] = await Promise.all([
      patientId
        ? (prisma as any).patient.findFirst({
            where: { id: patientId, archivedAt: null, ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}), homeBranchId: branch.branchId },
            select: { id: true },
          })
        : Promise.resolve(null),
      planId
        ? (prisma as any).taksitPlan.findFirst({
            where: { id: planId, ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}), branchId: branch.branchId },
            select: { id: true, patientId: true },
          })
        : Promise.resolve(null),
    ]);
    if (patientId && !patient) return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });
    if (planId && !plan) return NextResponse.json({ error: "Plan bulunamadı" }, { status: 404 });
    if (patientId && plan?.patientId && plan.patientId !== patientId) {
      return NextResponse.json({ error: "Seçilen taksit planı bu hastaya ait değil" }, { status: 400 });
    }

    const r = await (prisma as any).reminder.create({
      data: {
        institutionId,
        branchId: branch.branchId,
        patientId: patientId || null,
        planId: planId || null,
        note, reminderDate: parsedReminderDate, status: "AKTIF"
      }
    });
    await writeAudit(auth.user.id, "REMINDER_CREATE", "Hatırlatma eklendi");
    return NextResponse.json(r, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
