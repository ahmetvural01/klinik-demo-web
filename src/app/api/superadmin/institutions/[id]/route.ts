import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { invalidateInstitutionCache, requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getPlanDefaultLimits, type SubscriptionPlanId } from "@/lib/subscription-plans";
import { getMetaWhatsappReadiness } from "@/lib/meta-whatsapp";
import { deriveInvoiceStatus, summarizeInvoices } from "@/components/superadmin/invoice-status";
import { SERVICE_MODE_META, cycleLabel, planLabel, type ServiceMode } from "@/components/superadmin/sa-labels";

const VALID_SUBSCRIPTION_PLANS = new Set(["TEMEL", "PROFESYONEL", "KURUMSAL"]);
const VALID_BILLING_CYCLES = new Set(["AYLIK", "YILLIK"]);
const VALID_SERVICE_MODES = new Set(["NORMAL", "LIMITED", "READ_ONLY", "SUSPENDED"]);
const VALID_AD_INTENSITIES = new Set(["LOW", "MEDIUM", "HIGH"]);

// GET /api/superadmin/institutions/[id] - Klinik dosyası
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const institution = await prisma.institution.findUnique({
    where: { id: params.id },
    include: {
      owner: { select: { id: true, fullName: true, email: true, role: true } },
      // TC kimlik no ekranda kullanılmıyor; kişisel veri tarayıcıya gönderilmez.
      users: {
        select: { id: true, fullName: true, email: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      smsTransactions: {
        include: { smsPackage: { select: { name: true, smsCount: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!institution) return NextResponse.json({ message: "Klinik bulunamadı" }, { status: 404 });

  const now = new Date();
  // Borç özeti Faturalar sayfası ve Kontrol Paneli ile AYNI fonksiyondan:
  // vadesi geçmiş açık fatura gecikmiş sayılır, iptal edilen fatura borca girmez.
  // Liste: TÜM açık faturalar (eskiler de tahsil edilebilsin diye) + son 20
  // kapanmış fatura. Önceden yalnız son 20 fatura geliyordu; eski bir açık
  // fatura özette sayılıp listede görünmeyebiliyordu.
  const [allInvoices, openInvoices, closedInvoices, reminderCounts] = await Promise.all([
    prisma.invoice.findMany({
      where: { institutionId: params.id },
      select: { status: true, amount: true, dueDate: true, paidAt: true },
    }),
    prisma.invoice.findMany({
      where: { institutionId: params.id, status: { in: ["PENDING", "OVERDUE"] } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      include: { reminders: { select: { sentAt: true }, orderBy: { sentAt: "desc" }, take: 1 } },
    }),
    prisma.invoice.findMany({
      where: { institutionId: params.id, status: { in: ["PAID", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.invoiceReminder.groupBy({ by: ["invoiceId"], where: { institutionId: params.id }, _count: { _all: true } }),
  ]);
  const summary = summarizeInvoices(allInvoices, now);
  const reminderCountById = new Map(reminderCounts.map((row) => [row.invoiceId, row._count._all]));
  const invoices = [
    ...openInvoices.map(({ reminders, ...invoice }) => ({ ...invoice, lastReminderAt: reminders[0]?.sentAt ?? null })),
    ...closedInvoices.map((invoice) => ({ ...invoice, lastReminderAt: null })),
  ].map((invoice) => ({
    ...invoice,
    amount: Number(invoice.amount),
    status: deriveInvoiceStatus(invoice, now),
    reminderCount: reminderCountById.get(invoice.id) ?? 0,
  }));

  const whatsappProvider = await prisma.whatsappProviderConfig.findFirst({
    where: { institutionId: params.id, code: "META_EMBEDDED" },
    orderBy: [{ isActive: "desc" }, { priority: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      providerType: true,
      isActive: true,
      connectionStatus: true,
      displayPhoneNumber: true,
      verifiedName: true,
      updatedAt: true,
    },
  });

  const activeUsers = institution.users.filter((user) => user.isActive);

  return NextResponse.json({
    ...institution,
    invoices,
    // Prisma Decimal JSON'da metin olarak gider; ekranda tutar ve gerçek SMS
    // adedi (paket × adet) gösterilir.
    smsTransactions: institution.smsTransactions.map((transaction) => ({
      id: transaction.id,
      createdAt: transaction.createdAt,
      packageName: transaction.smsPackage?.name ?? null,
      quantity: transaction.quantity,
      smsCount: (transaction.smsPackage?.smsCount ?? 0) * transaction.quantity,
      totalPrice: Number(transaction.totalPrice),
      balanceAfter: transaction.balanceAfter,
    })),
    whatsappPlatform: getMetaWhatsappReadiness(),
    whatsappProvider: whatsappProvider
      ? {
          exists: true,
          id: whatsappProvider.id,
          code: whatsappProvider.code,
          name: whatsappProvider.name,
          providerType: whatsappProvider.providerType,
          isActive: whatsappProvider.isActive,
          connectionStatus: whatsappProvider.connectionStatus,
          displayPhoneNumber: whatsappProvider.displayPhoneNumber,
          verifiedName: whatsappProvider.verifiedName,
          updatedAt: whatsappProvider.updatedAt,
        }
      : { exists: false },
    usage: {
      activeUsers: activeUsers.length,
      // Lisans sınırı API'de yalnız DOKTOR rolünü sayar (bkz. PUT ve users route).
      activeDoctors: activeUsers.filter((user) => user.role === "DOKTOR").length,
    },
    paymentSummary: {
      overdueCount: summary.overdueCount,
      overdueAmount: summary.overdueAmount,
      pendingCount: summary.upcomingCount,
      openCount: summary.openCount,
      paidCount: summary.paidCount,
      unpaidTotal: summary.openAmount,
      upcomingAmount: summary.upcomingAmount,
      nextDueDate: summary.nextDueDate,
      totalInvoices: allInvoices.length,
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
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek" }, { status: 400 });
  }
  if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 160)) {
    return NextResponse.json({ message: "Klinik adı 1-160 karakter olmalı" }, { status: 400 });
  }
  if (body.email !== undefined && body.email !== null && body.email !== "" && (typeof body.email !== "string" || !/^\S+@\S+\.\S+$/.test(body.email.trim()))) {
    return NextResponse.json({ message: "Geçerli bir e-posta adresi girin" }, { status: 400 });
  }
  for (const field of ["isActive", "adsEnabled", "whatsappEnabled"] as const) {
    if (body[field] !== undefined && typeof body[field] !== "boolean") {
      return NextResponse.json({ message: `${field} alanı doğru/yanlış olmalı` }, { status: 400 });
    }
  }

  const throttleMs = body.throttleMs !== undefined ? Number(body.throttleMs) : undefined;
  if (throttleMs !== undefined && (!Number.isInteger(throttleMs) || throttleMs < 0 || throttleMs > 3000)) {
    return NextResponse.json({ message: "İstek gecikmesi 0-3000 ms arasında tam sayı olmalı" }, { status: 400 });
  }
  const parseLimit = (value: unknown): number | null => value === null || value === "" ? null : Number(value);
  const maxActiveUsers = body.maxActiveUsers !== undefined ? parseLimit(body.maxActiveUsers) : undefined;
  const maxActiveDoctors = body.maxActiveDoctors !== undefined ? parseLimit(body.maxActiveDoctors) : undefined;
  if (maxActiveUsers !== undefined && maxActiveUsers !== null && (!Number.isInteger(maxActiveUsers) || maxActiveUsers < 1 || maxActiveUsers > 100000)) {
    return NextResponse.json({ message: "Aktif kullanıcı limiti 1-100000 arasında tam sayı olmalı" }, { status: 400 });
  }
  if (maxActiveDoctors !== undefined && maxActiveDoctors !== null && (!Number.isInteger(maxActiveDoctors) || maxActiveDoctors < 1 || maxActiveDoctors > 100000)) {
    return NextResponse.json({ message: "Aktif doktor limiti 1-100000 arasında tam sayı olmalı" }, { status: 400 });
  }
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
  const nextMaxActiveUsers = maxActiveUsers !== undefined
    ? maxActiveUsers
    : planLimits ? planLimits.maxActiveUsers : existing.maxActiveUsers;
  const nextMaxActiveDoctors = maxActiveDoctors !== undefined
    ? maxActiveDoctors
    : planLimits ? planLimits.maxActiveDoctors : existing.maxActiveDoctors;
  const [activeUserCount, activeDoctorCount] = await Promise.all([
    prisma.user.count({ where: { institutionId: params.id, isActive: true } }),
    prisma.user.count({ where: { institutionId: params.id, isActive: true, role: "DOKTOR" } }),
  ]);
  if (nextMaxActiveUsers !== null && activeUserCount > nextMaxActiveUsers) {
    return NextResponse.json({ message: `Klinikte ${activeUserCount} aktif kullanıcı var; limit bunun altına indirilemez.` }, { status: 409 });
  }
  if (nextMaxActiveDoctors !== null && activeDoctorCount > nextMaxActiveDoctors) {
    return NextResponse.json({ message: `Klinikte ${activeDoctorCount} aktif doktor var; limit bunun altına indirilemez.` }, { status: 409 });
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const institution = await tx.institution.update({
      where: { id: params.id },
      data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.email && { email: body.email }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.taxNo !== undefined && { taxNo: typeof body.taxNo === "string" ? body.taxNo.trim() || null : null }),
      ...(body.website !== undefined && { website: body.website }),
      ...(body.subscriptionPlan && { subscriptionPlan: body.subscriptionPlan }),
      ...(body.billingCycle && { billingCycle: body.billingCycle }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.serviceMode && { serviceMode: body.serviceMode }),
      ...(body.serviceNote !== undefined && { serviceNote: body.serviceNote || null }),
      ...(throttleMs !== undefined && { throttleMs }),
      ...(body.maxActiveUsers !== undefined
        ? { maxActiveUsers }
        : planLimits ? { maxActiveUsers: planLimits.maxActiveUsers } : {}),
      ...(body.maxActiveDoctors !== undefined
        ? { maxActiveDoctors }
        : planLimits ? { maxActiveDoctors: planLimits.maxActiveDoctors } : {}),
      ...(body.adsEnabled !== undefined && { adsEnabled: body.adsEnabled }),
      ...(body.adIntensity !== undefined && { adIntensity: body.adIntensity }),
      ...(body.paymentGraceUntil !== undefined && { paymentGraceUntil }),
      ...(body.suspendedUntil !== undefined && { suspendedUntil }),
      // Yalnızca süperadmin açabilir/kapatabilir — klinik kendi ayarlarından
      // bu bayrağı hiç değiştiremez (bkz. src/lib/notification-dispatch.ts).
      ...(body.whatsappEnabled !== undefined && { whatsappEnabled: body.whatsappEnabled }),
    },
      });
      if (body.name !== undefined) {
        await tx.setting.updateMany({
          where: { institutionId: params.id },
          data: { institutionName: body.name.trim() },
        });
      }
      if (body.whatsappEnabled === false) {
        await Promise.all([
          tx.setting.updateMany({
            where: { institutionId: params.id },
            data: { defaultNotificationChannel: "SMS" },
          }),
          tx.whatsappProviderConfig.updateMany({
            where: { institutionId: params.id },
            data: {
              isActive: false,
              connectionStatus: "DISCONNECTED",
              accessTokenEncrypted: null,
              registrationPinEncrypted: null,
              apiKey: null,
              password: null,
              appSecret: null,
              verifyToken: null,
              connectionError: null,
              disconnectedAt: new Date(),
            },
          }),
          tx.whatsappSignupSession.deleteMany({ where: { institutionId: params.id } }),
        ]);
      }
      return institution;
    });
  } catch (error) {
    console.error("[superadmin institutions PUT]", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target || "");
      if (target.includes("taxNo")) return NextResponse.json({ message: "Bu vergi numarası başka bir klinikte kullanılıyor." }, { status: 409 });
      if (target.includes("email")) return NextResponse.json({ message: "Bu e-posta adresi başka bir klinikte kullanılıyor." }, { status: 409 });
      if (target.includes("name")) return NextResponse.json({ message: "Bu klinik adı başka bir kurumda kullanılıyor." }, { status: 409 });
    }
    return NextResponse.json({ message: "Klinik güncellenemedi" }, { status: 400 });
  }

  // Askıya alma, plan değişikliği, servis modu gibi yüksek etkili işlemler
  // hiç denetim kaydına yazılmıyordu (bkz. denetim raporu) — artık hangi
  // alanların değiştiği açıkça kaydediliyor.
  const changedFields: string[] = [];
  const modeLabel = (mode: string) => SERVICE_MODE_META[mode as ServiceMode]?.label || mode;
  const onOff = (value: boolean) => (value ? "açık" : "kapalı");
  const limit = (value: number | null) => (value == null ? "sınırsız" : String(value));
  const when = (value: Date | null) => (value ? value.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : "yok");
  if (body.isActive !== undefined && body.isActive !== existing.isActive) changedFields.push(`klinik ${updated.isActive ? "yeniden açıldı" : "kapatıldı"}`);
  if (body.subscriptionPlan && body.subscriptionPlan !== existing.subscriptionPlan) changedFields.push(`plan: ${planLabel(existing.subscriptionPlan)} → ${planLabel(updated.subscriptionPlan)}`);
  if (body.billingCycle && body.billingCycle !== existing.billingCycle) changedFields.push(`fatura dönemi: ${cycleLabel(existing.billingCycle)} → ${cycleLabel(updated.billingCycle)}`);
  if (body.serviceMode && body.serviceMode !== existing.serviceMode) changedFields.push(`hizmet durumu: ${modeLabel(existing.serviceMode)} → ${modeLabel(updated.serviceMode)}`);
  if (body.suspendedUntil !== undefined && String(existing.suspendedUntil) !== String(updated.suspendedUntil)) changedFields.push(`askı bitişi: ${when(existing.suspendedUntil)} → ${when(updated.suspendedUntil)}`);
  if (body.maxActiveUsers !== undefined && existing.maxActiveUsers !== updated.maxActiveUsers) changedFields.push(`kullanıcı sınırı: ${limit(existing.maxActiveUsers)} → ${limit(updated.maxActiveUsers)}`);
  if (body.maxActiveDoctors !== undefined && existing.maxActiveDoctors !== updated.maxActiveDoctors) changedFields.push(`doktor sınırı: ${limit(existing.maxActiveDoctors)} → ${limit(updated.maxActiveDoctors)}`);
  if (body.whatsappEnabled !== undefined && existing.whatsappEnabled !== updated.whatsappEnabled) changedFields.push(`WhatsApp modülü: ${onOff(existing.whatsappEnabled)} → ${onOff(updated.whatsappEnabled)}${updated.whatsappEnabled ? "" : " (bağlantı bilgileri silindi)"}`);
  if (body.name !== undefined && body.name.trim() !== existing.name) changedFields.push(`ad: ${existing.name} → ${updated.name}`);
  if (body.email && body.email !== existing.email) changedFields.push(`e-posta değişti`);
  await writeAudit(
    auth.user.id,
    "SUPERADMIN_INSTITUTION_UPDATE",
    `${updated.name}: ${changedFields.length > 0 ? changedFields.join(", ") : "iletişim bilgileri güncellendi"}`,
  );

  invalidateInstitutionCache(params.id);

  // WhatsApp erişimi kapatıldıysa QR ile bağlı numaranın oturumu da kapatılır
  // (telefondaki bağlı cihazlardan çıkar, şifreli oturum anahtarları silinir).
  if (body.whatsappEnabled === false && existing.whatsappEnabled) {
    try {
      const { disconnect } = await import("@/lib/whatsapp-web");
      await disconnect(params.id, auth.user.id);
    } catch (error) {
      console.error("[superadmin institutions PUT] WhatsApp oturumu kapatılamadı:", error instanceof Error ? error.message : "bilinmeyen hata");
    }
  }

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

  await writeAudit(auth.user.id, "SUPERADMIN_INSTITUTION_DEACTIVATE", `${updated.name} kapatıldı (kullanıcılar giriş yapamaz).`);
  invalidateInstitutionCache(params.id);

  return NextResponse.json(updated);
}
