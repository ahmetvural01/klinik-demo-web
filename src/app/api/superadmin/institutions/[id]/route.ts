import { NextRequest, NextResponse } from "next/server";
import { invalidateInstitutionCache, requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getPlanDefaultLimits, type SubscriptionPlanId } from "@/lib/subscription-plans";

const VALID_SUBSCRIPTION_PLANS = new Set(["TEMEL", "PROFESYONEL", "KURUMSAL"]);
const VALID_BILLING_CYCLES = new Set(["AYLIK", "YILLIK"]);
const VALID_SERVICE_MODES = new Set(["NORMAL", "LIMITED", "READ_ONLY", "SUSPENDED"]);
const VALID_AD_INTENSITIES = new Set(["LOW", "MEDIUM", "HIGH"]);

// GET /api/superadmin/institutions/[id] - Klinik detayını getir
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const institution = await prisma.institution.findUnique({
    where: { id: params.id },
    include: {
      owner: { select: { id: true, fullName: true, email: true, role: true } },
      users: {
        select: { id: true, fullName: true, email: true, role: true, isActive: true, createdAt: true, identityNo: true },
        orderBy: { createdAt: "asc" },
      },
      smsTransactions: {
        include: { smsPackage: { select: { name: true, smsCount: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      adAssignments: {
        include: {
          advertisement: {
            select: {
              id: true,
              title: true,
              sponsorName: true,
              isActive: true,
              priority: true,
              startAt: true,
              endAt: true,
            },
          },
        },
        orderBy: { weight: "desc" },
      },
      settings: true,
    },
  });

  if (!institution) return NextResponse.json({ message: "Bulunamadı" }, { status: 404 });

  const now = new Date();
  const [overdueCount, pendingCount, paidCount, unpaidTotalAgg] = await Promise.all([
    prisma.invoice.count({ where: { institutionId: params.id, status: { not: "PAID" }, dueDate: { lt: now } } }),
    prisma.invoice.count({ where: { institutionId: params.id, status: "PENDING" } }),
    prisma.invoice.count({ where: { institutionId: params.id, status: "PAID" } }),
    prisma.invoice.aggregate({
      where: { institutionId: params.id, status: { not: "PAID" } },
      _sum: { amount: true },
    }),
  ]);

  const allAds = await prisma.advertisement.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      sponsorName: true,
      isActive: true,
      priority: true,
      startAt: true,
      endAt: true,
    },
  });

  const whatsappProvider = await prisma.whatsappProviderConfig.findFirst({
    where: { institutionId: params.id },
    orderBy: [{ isActive: "desc" }, { priority: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      providerType: true,
      isActive: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    ...institution,
    allAds,
    whatsappProvider: whatsappProvider
      ? {
          exists: true,
          id: whatsappProvider.id,
          code: whatsappProvider.code,
          name: whatsappProvider.name,
          providerType: whatsappProvider.providerType,
          isActive: whatsappProvider.isActive,
          updatedAt: whatsappProvider.updatedAt,
        }
      : { exists: false },
    paymentSummary: {
      overdueCount,
      pendingCount,
      paidCount,
      unpaidTotal: unpaidTotalAgg._sum.amount || 0,
    },
  });
}

// PUT /api/superadmin/institutions/[id] - Klinik bilgilerini güncelle
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json();
  const paymentGraceUntil = body.paymentGraceUntil ? new Date(body.paymentGraceUntil) : null;
  const suspendedUntil = body.suspendedUntil ? new Date(body.suspendedUntil) : null;

  if (body.paymentGraceUntil && Number.isNaN(paymentGraceUntil?.getTime())) {
    return NextResponse.json({ message: "paymentGraceUntil ISO tarih formatında olmalı" }, { status: 400 });
  }

  if (body.suspendedUntil && Number.isNaN(suspendedUntil?.getTime())) {
    return NextResponse.json({ message: "suspendedUntil ISO tarih formatında olmalı" }, { status: 400 });
  }

  // Önceden bu enum alanları hiç doğrulanmadan Prisma'ya veriliyordu — geçersiz
  // bir değer ham/stilsiz bir 500 hatasına yol açıyordu (bkz. denetim raporu).
  if (body.subscriptionPlan && !VALID_SUBSCRIPTION_PLANS.has(body.subscriptionPlan)) {
    return NextResponse.json({ message: "Geçersiz abonelik planı" }, { status: 400 });
  }
  if (body.billingCycle && !VALID_BILLING_CYCLES.has(body.billingCycle)) {
    return NextResponse.json({ message: "Geçersiz fatura döngüsü" }, { status: 400 });
  }
  if (body.serviceMode && !VALID_SERVICE_MODES.has(body.serviceMode)) {
    return NextResponse.json({ message: "Geçersiz servis modu" }, { status: 400 });
  }
  if (body.adIntensity !== undefined && !VALID_AD_INTENSITIES.has(body.adIntensity)) {
    return NextResponse.json({ message: "Geçersiz reklam yoğunluğu" }, { status: 400 });
  }

  const existing = await prisma.institution.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ message: "Bulunamadı" }, { status: 404 });

  // Plan değiştiyse ve limitler elle gönderilmediyse, yeni planın varsayılan
  // doktor/kullanıcı limitlerine düş — süperadmin özel bir sayı girdiyse
  // (body.maxActiveDoctors/maxActiveUsers gönderildiyse) o değer her zaman kazanır.
  const planLimits = body.subscriptionPlan ? getPlanDefaultLimits(body.subscriptionPlan as SubscriptionPlanId) : null;

  let updated;
  try {
    updated = await prisma.institution.update({
    where: { id: params.id },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.email && { email: body.email }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.taxNo !== undefined && { taxNo: body.taxNo }),
      ...(body.website !== undefined && { website: body.website }),
      ...(body.subscriptionPlan && { subscriptionPlan: body.subscriptionPlan }),
      ...(body.billingCycle && { billingCycle: body.billingCycle }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.serviceMode && { serviceMode: body.serviceMode }),
      ...(body.serviceNote !== undefined && { serviceNote: body.serviceNote || null }),
      ...(body.throttleMs !== undefined && { throttleMs: Math.max(0, Math.min(Number(body.throttleMs) || 0, 3000)) }),
      ...(body.maxActiveUsers !== undefined
        ? { maxActiveUsers: body.maxActiveUsers ? Number(body.maxActiveUsers) : null }
        : planLimits ? { maxActiveUsers: planLimits.maxActiveUsers } : {}),
      ...(body.maxActiveDoctors !== undefined
        ? { maxActiveDoctors: body.maxActiveDoctors ? Number(body.maxActiveDoctors) : null }
        : planLimits ? { maxActiveDoctors: planLimits.maxActiveDoctors } : {}),
      ...(body.adsEnabled !== undefined && { adsEnabled: Boolean(body.adsEnabled) }),
      ...(body.adIntensity !== undefined && { adIntensity: body.adIntensity }),
      ...(body.paymentGraceUntil !== undefined && { paymentGraceUntil }),
      ...(body.suspendedUntil !== undefined && { suspendedUntil }),
      // Yalnızca süperadmin açabilir/kapatabilir — klinik kendi ayarlarından
      // bu bayrağı hiç değiştiremez (bkz. src/lib/notification-dispatch.ts).
      ...(body.whatsappEnabled !== undefined && { whatsappEnabled: Boolean(body.whatsappEnabled) }),
    },
    });
  } catch (error) {
    console.error("[superadmin institutions PUT]", error);
    return NextResponse.json({ message: "Klinik güncellenemedi" }, { status: 400 });
  }

  // Ayarları da güncelle (klinik adı vs.)
  if (body.name) {
    await prisma.setting.updateMany({
      where: { institutionId: params.id },
      data: { institutionName: body.name },
    });
  }

  // Askıya alma, plan değişikliği, servis modu gibi yüksek etkili işlemler
  // hiç denetim kaydına yazılmıyordu (bkz. denetim raporu) — artık hangi
  // alanların değiştiği açıkça kaydediliyor.
  const changedFields: string[] = [];
  if (body.isActive !== undefined && body.isActive !== existing.isActive) changedFields.push(`isActive: ${existing.isActive} → ${updated.isActive}`);
  if (body.subscriptionPlan && body.subscriptionPlan !== existing.subscriptionPlan) changedFields.push(`plan: ${existing.subscriptionPlan} → ${updated.subscriptionPlan}`);
  if (body.serviceMode && body.serviceMode !== existing.serviceMode) changedFields.push(`serviceMode: ${existing.serviceMode} → ${updated.serviceMode}`);
  if (body.suspendedUntil !== undefined && String(existing.suspendedUntil) !== String(updated.suspendedUntil)) changedFields.push(`suspendedUntil: ${existing.suspendedUntil?.toISOString() || "-"} → ${updated.suspendedUntil?.toISOString() || "-"}`);
  if (body.maxActiveUsers !== undefined && existing.maxActiveUsers !== updated.maxActiveUsers) changedFields.push(`maxActiveUsers: ${existing.maxActiveUsers ?? "-"} → ${updated.maxActiveUsers ?? "-"}`);
  if (body.maxActiveDoctors !== undefined && existing.maxActiveDoctors !== updated.maxActiveDoctors) changedFields.push(`maxActiveDoctors: ${existing.maxActiveDoctors ?? "-"} → ${updated.maxActiveDoctors ?? "-"}`);
  if (body.whatsappEnabled !== undefined && existing.whatsappEnabled !== updated.whatsappEnabled) changedFields.push(`whatsappEnabled: ${existing.whatsappEnabled} → ${updated.whatsappEnabled}`);
  await writeAudit(
    auth.user.id,
    "SUPERADMIN_INSTITUTION_UPDATE",
    `${updated.name}: ${changedFields.length > 0 ? changedFields.join(", ") : "alan değişikliği yok"}`,
  );

  invalidateInstitutionCache(params.id);

  return NextResponse.json(updated);
}

// DELETE /api/superadmin/institutions/[id] - Kliniği pasife al (silme değil, deactivate)
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const updated = await prisma.institution.update({
    where: { id: params.id },
    data: { isActive: false },
  });

  await writeAudit(auth.user.id, "SUPERADMIN_INSTITUTION_DEACTIVATE", `${updated.name} pasife alındı.`);
  invalidateInstitutionCache(params.id);

  return NextResponse.json(updated);
}
