import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// GET /api/superadmin/institutions/[id] - Klinik detayını getir
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
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

  return NextResponse.json({
    ...institution,
    allAds,
    paymentSummary: {
      overdueCount,
      pendingCount,
      paidCount,
      unpaidTotal: unpaidTotalAgg._sum.amount || 0,
    },
  });
}

// PUT /api/superadmin/institutions/[id] - Klinik bilgilerini güncelle
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
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

  const updated = await prisma.institution.update({
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
      ...(body.maxActiveUsers !== undefined && { maxActiveUsers: body.maxActiveUsers ? Number(body.maxActiveUsers) : null }),
      ...(body.maxActiveDoctors !== undefined && { maxActiveDoctors: body.maxActiveDoctors ? Number(body.maxActiveDoctors) : null }),
      ...(body.adsEnabled !== undefined && { adsEnabled: Boolean(body.adsEnabled) }),
      ...(body.adIntensity !== undefined && { adIntensity: body.adIntensity }),
      ...(body.paymentGraceUntil !== undefined && { paymentGraceUntil }),
      ...(body.suspendedUntil !== undefined && { suspendedUntil }),
    },
  });

  // Ayarları da güncelle (klinik adı vs.)
  if (body.name) {
    await prisma.setting.updateMany({
      where: { institutionId: params.id },
      data: { institutionName: body.name },
    });
  }

  return NextResponse.json(updated);
}

// DELETE /api/superadmin/institutions/[id] - Kliniği pasife al (silme değil, deactivate)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const updated = await prisma.institution.update({
    where: { id: params.id },
    data: { isActive: false },
  });

  return NextResponse.json(updated);
}
