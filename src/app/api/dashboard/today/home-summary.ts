import { NextResponse } from "next/server";
import { Prisma, type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { getRealtimeInstitutionVersion } from "@/lib/realtime-bus";
import { getPermissionMap } from "@/lib/role-permission-store";
import { hasBranchPermission, requireActiveBranch, type BranchContext } from "@/lib/branch-context";
import { turkeyDateKey, turkeyDayRangeUtc, turkeyTodayStartUtc } from "@/lib/tz";
import { summarizeLabOrders } from "@/lib/lab-workflow";
import { appointmentNeedsFollowUp } from "@/lib/appointment-follow-up";
import { loadPatientListExtras } from "@/lib/patient-list-extras";
import { buildItems, followBucket, isOverdueItem, type ApiAppointment, type ApiFollowUp, type PatientVisit } from "@/components/takip/follow-up-model";
import { DAY_MS, OPEN_PAST_LOOKBACK_DAYS, openPastWhere } from "./open-past";
import type { HomeSummary, HomeSummarySection } from "./home-summary-types";

// Ana sayfanın "Bekleyen işler" listesi ve başlıktaki sayıların TEK isteği.
// Önceden ana sayfa yalnız birkaç sayı için 300 lab işini, 100 taksit planını,
// tüm stok kartlarını ve denetim günlüğünü indiriyor; yine de taksit sayısı
// yanıt biçimi uyuşmadığı için hep boş kalıyordu. Burada her sayı yalnız
// count/aggregate sorgusuyla, kurum + aktif şube kapsamında ve kendi izniyle
// hesaplanır. Tanımlar ilgili modül sayfasıyla birebir aynıdır (yorumlarda
// kaynak yazılı) — kullanıcı satıra tıklayınca açılan listede aynı sayıyı görür.

type SummaryUser = {
  id: string;
  role: string;
  institutionId: string | null;
  ghost?: boolean;
  ghostSession?: boolean;
  branchContext: BranchContext;
};

type Scope = { institutionId: string; branchId: string };

/**
 * hasEffectivePermission ile aynı kural (rol matrisi + şube izin kodları;
 * görünmez oturum her şeyi görür), ama izin haritası istek başına bir kez
 * okunur — her bölüm için ayrı veritabanı turu yapılmaz.
 */
async function permissionChecker(user: SummaryUser) {
  if (user.ghost || user.role === "SUPERADMIN") return () => true;
  const map = await getPermissionMap();
  const rolePermissions = map[user.role as Role] || [];
  return (permission: string) =>
    (rolePermissions.includes("*") || rolePermissions.includes(permission))
    && hasBranchPermission(user.branchContext, permission);
}

const decimalText = (value: Prisma.Decimal | null | undefined) => (value ?? new Prisma.Decimal(0)).toFixed(2);

// ── Randevular (Randevular sayfasının ?lite=1 sayaçlarıyla aynı) ─────────────
async function appointmentsSection(scope: Scope, viewerId: string, todayStart: Date) {
  const tomorrow = { gte: new Date(todayStart.getTime() + DAY_MS), lt: new Date(todayStart.getTime() + 2 * DAY_MS) };
  const todayRange = { gte: todayStart, lt: new Date(todayStart.getTime() + DAY_MS) };
  const [onlineRequests, waitlist, openPast, tomorrowAll, tomorrowMine, todayByStatus] = await Promise.all([
    prisma.bookingRequest.count({ where: { ...scope, status: "BEKLIYOR" } }),
    prisma.waitlist.count({ where: { ...scope, status: { in: ["BEKLIYOR", "ARANDI"] } } }),
    prisma.appointment.count({ where: openPastWhere(scope, todayStart) }),
    prisma.appointment.count({ where: { ...scope, startAt: tomorrow, status: { not: "IPTAL" } } }),
    prisma.appointment.count({ where: { ...scope, startAt: tomorrow, status: { not: "IPTAL" }, doctorId: viewerId } }),
    prisma.appointment.groupBy({ by: ["status"], where: { ...scope, startAt: todayRange }, _count: { _all: true } }),
  ]);
  const countOf = (statuses: string[]) => todayByStatus.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
  const today = {
    total: countOf(["BEKLIYOR", "ONAYLANDI", "GELDI", "TAMAMLANDI", "GELMEDI"]),
    arrived: countOf(["GELDI", "TAMAMLANDI"]),
    noShow: countOf(["GELMEDI"]),
  };
  return { onlineRequests, waitlist, openPast, openPastLookbackDays: OPEN_PAST_LOOKBACK_DAYS, tomorrow: tomorrowAll, tomorrowMine, today };
}

// ── Görevler (üst bar zilindeki "zamanı gelen görev" ile aynı) ───────────────
// Bana atanmış (tek ya da çoklu atama), açık/beklemede ve hatırlatma zamanı —
// yoksa son tarihi — gelmiş görevler. Gecikmiş = son tarihi de geçmiş olanlar.
async function tasksSection(scope: Scope, userId: string, now: Date) {
  const where: Prisma.ClinicTaskWhereInput = {
    ...scope,
    status: { in: ["ACIK", "BEKLEMEDE"] },
    AND: [
      { OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }] },
      { OR: [{ remindAt: { lte: now } }, { remindAt: null, dueAt: { lte: now } }] },
    ],
  };
  const [due, overdue] = await Promise.all([
    prisma.clinicTask.count({ where }),
    prisma.clinicTask.count({ where: { ...where, dueAt: { lt: now } } }),
  ]);
  return { due, overdue };
}

// ── Laboratuvar (GET /api/lab-orders?summary=true ve Lab sekmeleriyle aynı) ──
// Doktor yalnız kendi işlerini görür ("kendi lab işleri"); diğer roller kliniğin tümünü.
async function labSection(scope: Scope, userId: string, mine: boolean) {
  const orders = await prisma.labOrder.findMany({
    where: { ...scope, status: "DEVAM_EDIYOR", ...(mine ? { doctorId: userId } : {}) },
    select: {
      labType: true,
      notes: true,
      status: true,
      trips: { select: { description: true, sentAt: true, expectedAt: true, receivedAt: true, sentNote: true, receivedNote: true, order: true } },
    },
    take: 2000,
  });
  const counts = summarizeLabOrders(orders.map((order) => ({
    labType: order.labType,
    notes: order.notes,
    status: order.status,
    trips: order.trips.map((trip) => ({
      ...trip,
      sentAt: trip.sentAt.toISOString(),
      expectedAt: trip.expectedAt?.toISOString() || null,
      receivedAt: trip.receivedAt?.toISOString() || null,
    })),
    // Aşama (klinikte/gecikti) faturaya bağlı değil; tutar burada kullanılmaz.
    invoices: [],
  })));
  return { clinic: counts.clinic, late: counts.late, mine };
}

// ── Taksitler (GET /api/taksit-plani stats ile aynı) ─────────────────────────
// Geciken: kalanı olan, ödenmemiş/iptal edilmemiş, vadesi bugünden önce olan
// taksit (DB'de henüz GECIKTI'ye çevrilmemiş BEKLIYOR da dahil) — Muhasebe >
// Taksitler "Gecikmiş" görünümü. Bu hafta: ödemesi süren planlarda bugün dahil
// 7 gün içinde vadesi gelen. Tutarlar Prisma.Decimal toplamı, metin olarak döner.
async function installmentsSection(scope: Scope, todayStart: Date) {
  const rowBase: Prisma.TaksitWhereInput = { ...scope, kalan: { gt: 0 }, status: { notIn: ["ODENDI", "IPTAL"] } };
  const weekEnd = new Date(todayStart.getTime() + 7 * DAY_MS - 1);
  const [overdue, week] = await Promise.all([
    prisma.taksit.aggregate({ where: { ...rowBase, vadeDate: { lt: todayStart } }, _count: { _all: true }, _sum: { kalan: true } }),
    prisma.taksit.aggregate({
      where: { ...rowBase, plan: { status: { in: ["AKTIF", "DEVAM_EDIYOR"] } }, vadeDate: { gte: todayStart, lte: weekEnd } },
      _count: { _all: true },
      _sum: { kalan: true },
    }),
  ]);
  return {
    overdueCount: overdue._count._all,
    overdueAmount: decimalText(overdue._sum.kalan),
    weekCount: week._count._all,
    weekAmount: decimalText(week._sum.kalan),
  };
}

// ── Gönderilemeyen mesajlar (GET /api/sms/dispatches?status=failed ile aynı) ─
// WhatsApp satırları yalnız kurumda WhatsApp açıksa ve kullanıcı görebiliyorsa sayılır.
async function messagingSection(scope: Scope, canReadWhatsappPermission: boolean, now: Date) {
  const institution = await prisma.institution.findUnique({ where: { id: scope.institutionId }, select: { whatsappEnabled: true } });
  const includeWhatsapp = Boolean(institution?.whatsappEnabled && canReadWhatsappPermission);
  const failed7d = await prisma.smsDispatch.count({
    where: {
      ...scope,
      status: "FAILED",
      createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) },
      ...(includeWhatsapp ? {} : { channel: "SMS" as const }),
    },
  });
  return { failed7d };
}

// ── Bugünkü tahsilat (Muhasebe defteriyle aynı: hastadan alınan aktif ödemeler) ─
async function collectionsSection(scope: Scope) {
  const { start, end } = turkeyDayRangeUtc(turkeyDateKey());
  const total = await prisma.payment.aggregate({
    where: { ...scope, patientId: { not: null }, status: "ACTIVE", createdAt: { gte: start, lte: end } },
    _sum: { amount: true },
  });
  return decimalText(total._sum.amount);
}

// ── Hasta aramaları (Aramalar ve görevler > Hasta aramaları ile aynı model) ────────
// Liste ekranıyla (GET /api/patient-follow-ups/worklist) aynı kaynaklar ve aynı
// sınırlar okunur: açık aramalar + son 90 günün aramaya bağlanmamış "Gelmedi"
// ya da notunda takip durumu olan randevuları + hastaların ziyaret bilgisi.
// Satırlar ve gruplar ekranın kendi model fonksiyonlarıyla (buildItems,
// followBucket, isOverdueItem) hesaplanır: sekmedeki "Bugün aranacak" sayısı
// ile buradaki sayı aynı tanımdan gelir. Bugün aranacak = günü gelmiş, geçmiş
// ya da tarihsiz açık aramalar; gecikmiş = günü geçmiş olanlar.
const DERIVED_RANGE_DAYS = 90;
const DERIVED_LIMIT = 500;
const OPEN_FOLLOW_UP_LIMIT = 500;
const VISIT_LIMIT = 300;

async function followUpsSection(scope: Scope, includeDerived: boolean, now: Date) {
  const [followUpRows, appointmentRows] = await Promise.all([
    prisma.patientFollowUp.findMany({
      where: {
        institutionId: scope.institutionId,
        status: "ACIK",
        patient: { institutionId: scope.institutionId, homeBranchId: scope.branchId, archivedAt: null },
      },
      select: {
        id: true,
        patientId: true,
        appointmentId: true,
        doctorId: true,
        type: true,
        priority: true,
        status: true,
        note: true,
        nextActionAt: true,
        createdAt: true,
        updatedAt: true,
        labOrderId: true,
        labTripId: true,
        labOrder: { select: { id: true, labName: true, labType: true } },
        appointment: { select: { id: true, startAt: true, endAt: true, status: true } },
      },
      orderBy: [{ nextActionAt: "asc" }, { createdAt: "desc" }],
      take: OPEN_FOLLOW_UP_LIMIT,
    }),
    includeDerived
      ? prisma.appointment.findMany({
          where: {
            ...scope,
            startAt: { gte: new Date(now.getTime() - DERIVED_RANGE_DAYS * DAY_MS), lte: now },
            patient: { archivedAt: null },
            followUps: { none: {} },
            OR: [{ status: "GELMEDI" }, { note: { contains: "Takip durumu:", mode: "insensitive" } }],
          },
          select: { id: true, startAt: true, endAt: true, status: true, note: true, patient: { select: { id: true, fullName: true } } },
          orderBy: { startAt: "desc" },
          take: DERIVED_LIMIT,
        })
      : Promise.resolve([]),
  ]);

  const followUps: ApiFollowUp[] = followUpRows.map((row) => ({
    id: row.id,
    patientId: row.patientId,
    appointmentId: row.appointmentId,
    doctorId: row.doctorId,
    type: row.type as ApiFollowUp["type"],
    priority: row.priority,
    status: "ACIK",
    note: row.note,
    nextActionAt: row.nextActionAt?.toISOString() || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    labOrderId: row.labOrderId,
    labTripId: row.labTripId,
    labOrder: row.labOrder,
    appointment: row.appointment
      ? { id: row.appointment.id, startAt: row.appointment.startAt.toISOString(), endAt: row.appointment.endAt.toISOString(), status: row.appointment.status }
      : null,
  }));
  const appointments: ApiAppointment[] = appointmentRows
    .filter((row) => appointmentNeedsFollowUp(row.status, row.note))
    .map((row) => ({
      id: row.id,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      status: row.status,
      note: row.note,
      patient: { id: row.patient.id, fullName: row.patient.fullName },
    }));

  // "Gelmedi" satırı, hasta sonradan geldiyse ya da yeni randevu aldıysa düşer.
  const visits: Record<string, PatientVisit> = {};
  if (includeDerived) {
    const patientIds = Array.from(new Set([
      ...followUps.map((followUp) => followUp.patientId),
      ...appointments.map((appointment) => appointment.patient?.id || ""),
    ].filter(Boolean))).slice(0, VISIT_LIMIT);
    if (patientIds.length > 0) {
      const extras = await loadPatientListExtras({
        institutionId: scope.institutionId,
        branchId: scope.branchId,
        patients: patientIds.map((id) => ({ id })),
        includeVisits: true,
        includeBalance: false,
        now,
      });
      for (const [id, extra] of extras) {
        if (extra.lastVisitAt || extra.nextAppointment) visits[id] = { lastVisitAt: extra.lastVisitAt, nextAppointment: extra.nextAppointment };
      }
    }
  }

  const todayKey = turkeyDateKey(now);
  const items = buildItems(followUps, appointments, visits);
  return {
    dueToday: items.filter((item) => followBucket(item, todayKey) === "bugun").length,
    overdue: items.filter((item) => isOverdueItem(item, todayKey)).length,
  };
}

// Hasta aramaları sayımı en ağır bölümdür (500 arama + 500 randevu + 300 hasta)
// ve her gerçek zamanlı olayda kurumun açık sekmelerinin HEPSİ aynı anda yeniden
// ister. Sonuç kullanıcıya değil kapsama bağlıdır (yalnız sayı; hasta verisi
// yok): kurum + şube + gün + kurumun gerçek zamanlı sürümü anahtarıyla 30 sn
// süreç içinde tutulur. Aynı olaydan gelen istekler tek hesaplamayı paylaşır;
// yeni bir değişiklik (sürüm artışı) önbelleği hemen geçersiz kılar.
const FOLLOW_UPS_CACHE_TTL_MS = 30_000;
const FOLLOW_UPS_CACHE_MAX = 500;
type FollowUpsCounts = Awaited<ReturnType<typeof followUpsSection>>;
const followUpsCache = new Map<string, { expiresAt: number; value: Promise<FollowUpsCounts> }>();

function cachedFollowUpsSection(scope: Scope, includeDerived: boolean, now: Date): Promise<FollowUpsCounts> {
  const key = [
    scope.institutionId,
    scope.branchId,
    includeDerived ? "derived" : "open",
    turkeyDateKey(now),
    getRealtimeInstitutionVersion(scope.institutionId),
  ].join(":");
  const nowMs = now.getTime();
  const hit = followUpsCache.get(key);
  if (hit && hit.expiresAt > nowMs) return hit.value;

  for (const [cachedKey, entry] of followUpsCache) {
    if (entry.expiresAt <= nowMs) followUpsCache.delete(cachedKey);
  }
  if (followUpsCache.size >= FOLLOW_UPS_CACHE_MAX) followUpsCache.clear();

  const value = followUpsSection(scope, includeDerived, now);
  followUpsCache.set(key, { expiresAt: nowMs + FOLLOW_UPS_CACHE_TTL_MS, value });
  // Hata önbellekte kalmaz: sonraki istek yeniden dener.
  value.catch(() => {
    if (followUpsCache.get(key)?.value === value) followUpsCache.delete(key);
  });
  return value;
}

export async function buildHomeSummary(user: SummaryUser, branchId: string): Promise<HomeSummary> {
  const institutionId = user.institutionId as string;
  const scope: Scope = { institutionId, branchId };
  const allow = await permissionChecker(user);
  const now = new Date();
  const todayStart = turkeyTodayStartUtc();

  const canAppointments = allow("appointments:read");
  // Doktor kendi gününü görür: lab işleri kendi işleriyle sınırlı, hasta
  // aramaları (ön büro işi, en ağır sayım) hiç hesaplanmaz.
  const doctorView = user.role === "DOKTOR";
  const jobs: Array<[HomeSummarySection, () => Promise<unknown>]> = [];
  if (canAppointments) jobs.push(["appointments", () => appointmentsSection(scope, user.id, todayStart)]);
  if (allow("hastatracking:read") && !doctorView) jobs.push(["followUps", () => cachedFollowUpsSection(scope, canAppointments, now)]);
  if (allow("clinictasks:read")) jobs.push(["tasks", () => tasksSection(scope, user.id, now)]);
  // Lab satırları işi yapan içindir (hasta çağırma, laboratuvarı arama): yazma izni.
  if (allow("lab:read") && allow("lab:write")) jobs.push(["lab", () => labSection(scope, user.id, doctorView)]);
  const canFinance = allow("finance:center");
  if (canFinance && allow("installments:read")) jobs.push(["installments", () => installmentsSection(scope, todayStart)]);
  if (allow("sms:read")) jobs.push(["messaging", () => messagingSection(scope, allow("whatsapp:read"), now)]);
  if (canFinance && allow("payments:read")) jobs.push(["collections", () => collectionsSection(scope)]);

  const results = await Promise.allSettled(jobs.map(([, run]) => run()));
  const summary: HomeSummary = {
    date: turkeyDateKey(now),
    viewer: { id: user.id, ghost: Boolean(user.ghostSession), doctor: doctorView },
    failed: [],
  };
  results.forEach((result, index) => {
    const section = jobs[index][0];
    if (result.status === "rejected") {
      console.error(`[dashboard today ozet] ${section}`, result.reason);
      summary.failed.push(section);
      return;
    }
    const value = result.value;
    if (section === "appointments") summary.appointments = value as HomeSummary["appointments"];
    else if (section === "followUps") summary.followUps = value as HomeSummary["followUps"];
    else if (section === "tasks") summary.tasks = value as HomeSummary["tasks"];
    else if (section === "lab") summary.lab = value as HomeSummary["lab"];
    else if (section === "installments") summary.installments = value as HomeSummary["installments"];
    else if (section === "messaging") summary.messaging = value as HomeSummary["messaging"];
    else if (section === "collections") summary.collectionsToday = value as string;
  });
  return summary;
}

/** GET /api/dashboard/today?ozet=1 — ana sayfayı açabilen herkes; her bölüm kendi izniyle. */
export async function homeSummaryResponse() {
  const auth = await requireAuth("dashboard:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
  if (!auth.user.institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });
  try {
    const summary = await buildHomeSummary(auth.user, branch.branchId);
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[dashboard today ozet]", error);
    return NextResponse.json({ message: "Günlük özet yüklenemedi." }, { status: 503 });
  }
}
