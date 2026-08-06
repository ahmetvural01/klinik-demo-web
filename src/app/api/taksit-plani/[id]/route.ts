import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { shouldHidePatientPhoneForRole } from "@/lib/patient-visibility-server";
import { turkeyTodayStartUtc } from "@/lib/tz";

function taksitPlanTenantWhere(id: string, institutionId: string | null | undefined) {
  return {
    id,
    ...(institutionId ? { patient: { institutionId } } : {}),
  };
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("installments:read");
    if (auth.error) return auth.error;
    const user = auth.user;
    if (user.role !== "SUPERADMIN" && !user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }

    const plan = await (prisma as any).taksitPlan.findFirst({
      where: taksitPlanTenantWhere(params.id, user.institutionId),
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

    // Vadesi geçmiş BEKLIYOR taksitler yalnızca mark-gecikti tarandıktan sonra
    // DB'de gerçekten GECIKTI olur (bkz. /api/taksit-plani/route.ts aynı not) —
    // burada da canlı türetilmiş durum döndürülür.
    const todayStart = turkeyTodayStartUtc();
    const planWithLiveStatus = {
      ...plan,
      taksitler: (plan.taksitler || []).map((t: any) =>
        t.status === "BEKLIYOR" && new Date(t.vadeDate).getTime() < todayStart.getTime()
          ? { ...t, status: "GECIKTI" }
          : t
      ),
    };

    const hidePhone = await shouldHidePatientPhoneForRole(user.role);
    const result = hidePhone
      ? {
          ...planWithLiveStatus,
          patient: planWithLiveStatus.patient ? { ...planWithLiveStatus.patient, phone: "***" } : planWithLiveStatus.patient,
        }
      : planWithLiveStatus;
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("installments:write");
    if (auth.error) return auth.error;
    const user = auth.user;
    if (user.role !== "SUPERADMIN" && !user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
    }
    const { status, notes } = body;
    if (status !== undefined && status !== "IPTAL") {
      return NextResponse.json({ error: "Plan durumu tahsilatlara göre otomatik hesaplanır; yalnızca iptal işlemi elle yapılabilir." }, { status: 400 });
    }
    if (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.trim().length > 2_000)) {
      return NextResponse.json({ error: "Not en fazla 2000 karakter olabilir" }, { status: 400 });
    }
    if (status === undefined && notes === undefined) {
      return NextResponse.json({ error: "Güncellenecek alan bulunamadı" }, { status: 400 });
    }

    const existing = await (prisma as any).taksitPlan.findFirst({
      where: taksitPlanTenantWhere(params.id, user.institutionId),
      select: { id: true, status: true },
    });
    if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    const plan = status === "IPTAL"
      ? await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "TaksitPlan" WHERE id = ${params.id} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM "Taksit" WHERE "planId" = ${params.id} FOR UPDATE`;
          if (existing.status !== "IPTAL") {
            await (tx as any).taksit.updateMany({
              where: { planId: params.id, status: { in: ["BEKLIYOR", "GECIKTI"] } },
              data: { status: "IPTAL" },
            });
            await (tx as any).reminder.deleteMany({
              where: { planId: params.id, status: { not: "TAMAMLANDI" } },
            });
          }
          return (tx as any).taksitPlan.update({
            where: { id: params.id },
            data: { status: "IPTAL", ...(notes !== undefined && { notes: notes?.trim() || null }) },
          });
        }, { isolationLevel: "Serializable" })
      : await (prisma as any).taksitPlan.update({
          where: { id: params.id },
          data: { notes: notes?.trim() || null },
        });
    await writeAudit(auth.user.id, "TAKSIT_PLAN_UPDATE", `Taksit planı güncellendi (${params.id})`);
    return NextResponse.json(plan);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("installments:delete");
    if (auth.error) return auth.error;
    if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }

    const existing = await (prisma as any).taksitPlan.findFirst({
      where: taksitPlanTenantWhere(params.id, auth.user.institutionId),
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    // Plana ait gerçek tahsilat (TaksitOdeme) varsa, planı silmek Taksit/
    // TaksitOdeme kayıtlarını cascade ile yok eder ama alttaki Payment kaydı
    // (ve tahsil edilmiş para) kasada kalır — hangi taksitlerin ödendiğine
    // dair tüm iz ve yaşlandırma geçmişi sessizce kaybolur (bkz. denetim
    // raporu). Ödemesi olan bir plan silinemez; önce ilgili ödemeler kendi
    // ekranından (payments:refund yetkisiyle) geri alınmalı.
    const paidCount = await (prisma as any).taksitOdeme.count({
      where: { taksit: { planId: params.id } },
    });
    if (paidCount > 0) {
      return NextResponse.json(
        { error: "Bu plana ait tahsilat kayıtları var — plan silinemez. Önce ilgili ödemeleri geri alın." },
        { status: 400 },
      );
    }

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
