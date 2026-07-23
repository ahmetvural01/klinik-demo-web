import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { shouldHidePatientPhone } from "@/lib/patient-visibility";

function taksitPlanTenantWhere(id: string, institutionId: string | null | undefined, role: string) {
  return {
    id,
    ...(role !== "SUPERADMIN" ? { patient: { institutionId } } : {}),
  };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("installments:read");
    if (auth.error) return auth.error;
    const user = auth.user;
    if (user.role !== "SUPERADMIN" && !user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }

    const plan = await (prisma as any).taksitPlan.findFirst({
      where: taksitPlanTenantWhere(params.id, user.institutionId, user.role),
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
    const hidePhone = shouldHidePatientPhone(user.role);
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
    const auth = await requireAuth("installments:write");
    if (auth.error) return auth.error;
    const user = auth.user;
    if (user.role !== "SUPERADMIN" && !user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }

    const body = await req.json();
    const { status, notes } = body;

    const existing = await (prisma as any).taksitPlan.findFirst({
      where: taksitPlanTenantWhere(params.id, user.institutionId, user.role),
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    const plan = await (prisma as any).taksitPlan.update({
      where: { id: params.id },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes })
      }
    });
    await writeAudit(auth.user.id, "TAKSIT_PLAN_UPDATE", `Taksit planı güncellendi (${params.id})`);
    return NextResponse.json(plan);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("installments:write");
    if (auth.error) return auth.error;
    if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }

    const existing = await (prisma as any).taksitPlan.findFirst({
      where: taksitPlanTenantWhere(params.id, auth.user.institutionId, auth.user.role),
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    // Hatırlatıcıları sil, sonra plan (Taksit + TaksitOdeme cascade ile silinir)
    await prisma.$transaction(async (tx) => {
      await (tx as any).reminder.deleteMany({ where: { planId: params.id } });
      await (tx as any).taksitPlan.delete({ where: { id: params.id } });
    });

    await writeAudit(auth.user.id, "TAKSIT_PLAN_DELETE", `Taksit planı silindi (${params.id})`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
