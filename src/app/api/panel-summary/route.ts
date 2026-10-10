import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { getPermissionMap } from "@/lib/role-permission-store";
import { getBranchScopedPermissions, requireActiveBranch } from "@/lib/branch-context";
import { hasPanelPermission } from "@/lib/panel-permissions";
import { turkeyDateKey, turkeyTimeKey, turkeyTodayStartUtc } from "@/lib/tz";
import { summarizeLabOrders } from "@/lib/lab-workflow";
import { isCriticalStock } from "@/components/stock/stock-shared";

export const dynamic = "force-dynamic";

/**
 * Panel kabuğunun (sol menü rozetleri, "Bekleyen işler" zili, bekleme salonu,
 * erişim yoklaması) TEK ve hafif özeti. Önceden kabuk aynı sayılar için beş
 * tam liste ucunu (tüm stok + alış geçmişi, 500 görev, 20.000 satırlık taksit
 * istatistiği, günün tüm randevuları, 300 lab işi) ve ayrıca 15 sn'de bir
 * /api/auth/me + /api/capabilities çağırıyordu; geciken taksit sayısı yanıt
 * biçimi uyuşmadığı için hep 0 görünüyordu.
 *
 * Kurallar:
 * - Rozet = kullanıcının YAPACAĞI iş: her sayı yalnız o işi yapabilen kişiye
 *   (okuma + işi yapan yazma izni) hesaplanır, yoksa null döner; kurum + aktif
 *   şube ile süzülür (requireAuth + requireActiveBranch).
 * - Her sayı, rozetin götürdüğü listedeki sayıyla AYNI tanımı kullanır:
 *   lab = Laboratuvar > "Laboratuvarda" (lab-workflow), stok = Stok > "Kritik"
 *   (stock-shared isCriticalStock), taksit = Muhasebe > Taksitler "geciken"
 *   (taksit-plani stats.gecikenTaksit), talepler = Randevular > Talepler.
 * - İzin ve özellik listesi /api/auth/me ve /api/capabilities ile aynı
 *   hesaplanır; istemci yetki yoklamasını bu tek istekle yapar.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WAITING_LIMIT = 50;
const UNREAD_LIMIT = 99;
const UNREAD_DEFAULT_LOOKBACK_DAYS = 7;

type Scope = { institutionId: string; branchId: string };

type WaitingPatient = {
  id: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  startAt: string;
  /** Türkiye takvim günü (YYYY-AA-GG) — istemci saat dilimine bağlı kalmasın. */
  date: string;
  /** Türkiye saati (SS:dd). */
  time: string;
};

type PanelSummaryCounts = {
  waiting: { count: number; items: WaitingPatient[] } | null;
  onlineRequests: number | null;
  tasksDue: number | null;
  lab: { open: number; notSent: number; atLab: number; late: number; clinic: number } | null;
  stockCritical: number | null;
  installmentsOverdue: number | null;
  unreadMessages: number | null;
};

const EMPTY_COUNTS: PanelSummaryCounts = {
  waiting: null,
  onlineRequests: null,
  tasksDue: null,
  lab: null,
  stockCritical: null,
  installmentsOverdue: null,
  unreadMessages: null,
};

// Tek bir sayının hatası tüm özeti düşürmesin: o sayı "bilinmiyor" (null) olur.
async function safe<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.error(`[panel-summary] ${label}`, error);
    return null;
  }
}

async function loadWaiting(scope: Scope, todayStart: Date): Promise<PanelSummaryCounts["waiting"]> {
  const rows = await prisma.appointment.findMany({
    where: { ...scope, status: "GELDI", startAt: { gte: todayStart, lt: new Date(todayStart.getTime() + DAY_MS) } },
    orderBy: { startAt: "asc" },
    take: WAITING_LIMIT,
    select: {
      id: true,
      startAt: true,
      doctorId: true,
      patient: { select: { fullName: true } },
      doctor: { select: { fullName: true } },
    },
  });
  const items = rows.map((row) => ({
    id: row.id,
    patientName: row.patient?.fullName || "Hasta",
    doctorId: row.doctorId,
    doctorName: row.doctor?.fullName || "",
    startAt: row.startAt.toISOString(),
    date: turkeyDateKey(row.startAt),
    time: turkeyTimeKey(row.startAt),
  }));
  return { count: items.length, items };
}

// Laboratuvar sayfasının sekme sayılarıyla aynı hesap (bkz. /api/lab-orders?summary=true).
async function loadLabSummary(scope: Scope): Promise<PanelSummaryCounts["lab"]> {
  const openOrders = await prisma.labOrder.findMany({
    where: { ...scope, status: "DEVAM_EDIYOR" },
    select: {
      labType: true,
      notes: true,
      status: true,
      trips: { select: { description: true, sentAt: true, expectedAt: true, receivedAt: true, sentNote: true, receivedNote: true, order: true } },
      invoices: { where: { status: "ACTIVE" }, select: { amount: true } },
    },
    take: 2000,
  });
  const counts = summarizeLabOrders(openOrders.map((order) => ({
    labType: order.labType,
    notes: order.notes,
    status: order.status,
    trips: order.trips.map((trip) => ({
      ...trip,
      sentAt: trip.sentAt.toISOString(),
      expectedAt: trip.expectedAt?.toISOString() || null,
      receivedAt: trip.receivedAt?.toISOString() || null,
    })),
    // Tutar aşamayı etkilemez; tür gereği aktarılır (lab-orders özetiyle aynı).
    invoices: order.invoices.map((invoice) => ({ amount: Number(invoice.amount) })),
  })));
  return { open: counts.open, notSent: counts.notSent, atLab: counts.atLab, late: counts.late, clinic: counts.clinic };
}

// Stok sayfasındaki "Kritik" sekmesiyle AYNI kural (stock-shared isCriticalStock):
// minimumun altında ve siparişi verilmemiş aktif ürün; son kullanma tarihinden
// bağımsız. (Önceki sürüm stockStatus kullanıyordu: SKT'si geçmiş ve azalan ürünü
// "expired" sayıp rozetten düşürüyordu; rozet 1, Stok > Kritik 2 görünüyordu.)
// Önce yalnız minimumun altındaki adaylar okunur; tüm stok + alış geçmişi değil.
async function countCriticalStock(scope: Scope): Promise<number> {
  const candidates = await prisma.stockItem.findMany({
    where: { ...scope, isActive: true, quantity: { lt: prisma.stockItem.fields.minQuantity } },
    select: { id: true, quantity: true, minQuantity: true },
    take: 2000,
  });
  if (candidates.length === 0) return 0;
  const onOrderLines = await prisma.purchaseItem.findMany({
    where: {
      stockItemId: { in: candidates.map((item) => item.id) },
      archivedAt: null,
      purchase: { ...scope, status: "AKTIF", receiptStatus: "SIPARIS_VERILDI" },
    },
    select: { stockItemId: true, quantity: true },
  });
  const onOrder = new Map<string, number>();
  for (const line of onOrderLines) onOrder.set(line.stockItemId, (onOrder.get(line.stockItemId) || 0) + Number(line.quantity));
  return candidates.filter((item) => isCriticalStock({
    quantity: item.quantity,
    minQuantity: item.minQuantity,
    onOrderQuantity: onOrder.get(item.id) || 0,
  })).length;
}

function parseSince(value: string | null, now: Date) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() > now.getTime()) return null;
  return date;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const user = auth.user;
  const now = new Date();

  const institutionId = user.institutionId;
  // Yetki matrisi ve kurum durumu birbirinden bağımsız: tek turda okunur.
  const [permissionMap, institution] = await Promise.all([
    getPermissionMap(),
    institutionId
      ? prisma.institution.findUnique({ where: { id: institutionId }, select: { isActive: true, whatsappEnabled: true } })
      : Promise.resolve(null),
  ]);
  // /api/auth/me ile aynı: rol izinleri, aktif şubenin daraltmasıyla.
  const permissions = getBranchScopedPermissions(
    user.branchContext,
    permissionMap[user.role as Role] || [],
    Boolean(user.ghost),
  );
  const can = (permission: string) => hasPanelPermission(permissions, permission);
  const scopeKey = `${user.id}:${user.institutionId || "platform"}:${user.branchContext.activeBranchId || "none"}`;
  const headers = { "Cache-Control": "no-store" };

  if (!institutionId) {
    return NextResponse.json({ generatedAt: now.toISOString(), scopeKey, permissions, features: { whatsapp: false }, counts: EMPTY_COUNTS }, { headers });
  }

  // /api/capabilities ile aynı: WhatsApp yalnız aktif ve özelliği açık kurumda.
  const features = { whatsapp: Boolean(institution?.isActive && institution.whatsappEnabled) };

  const branch = requireActiveBranch(user.branchContext);
  if (!branch.ok) {
    return NextResponse.json({ generatedAt: now.toISOString(), scopeKey, permissions, features, counts: EMPTY_COUNTS }, { headers });
  }
  const scope: Scope = { institutionId, branchId: branch.branchId };
  const todayStart = turkeyTodayStartUtc();
  const messagesSince = parseSince(request.nextUrl.searchParams.get("messagesSince"), now)
    || new Date(now.getTime() - UNREAD_DEFAULT_LOOKBACK_DAYS * DAY_MS);

  const [waiting, onlineRequests, tasksDue, lab, stockCritical, installmentsOverdue, unreadMessages] = await Promise.all([
    // Bekleme salonu klinik akışıdır: hasta kaydını açamayan rol (ör. muhasebe) görmez.
    can("appointments:read") && can("patients:read")
      ? safe("waiting", () => loadWaiting(scope, todayStart))
      : Promise.resolve(null),
    // Rozet = yapılacak iş: talebi randevuya çevirebilen (appointments:write) görür.
    can("appointments:read") && can("appointments:write")
      ? safe("onlineRequests", () => prisma.bookingRequest.count({ where: { ...scope, status: "BEKLIYOR" } }))
      : Promise.resolve(null),
    // Bana atanmış, açık/beklemede ve hatırlatma (yoksa son tarih) zamanı gelmiş görevler.
    can("clinictasks:read")
      ? safe("tasksDue", () => prisma.clinicTask.count({
          where: {
            ...scope,
            status: { in: ["ACIK", "BEKLEMEDE"] },
            AND: [
              { OR: [{ assignedToId: user.id }, { assignees: { some: { userId: user.id } } }] },
              { OR: [{ remindAt: { lte: now } }, { remindAt: null, dueAt: { lte: now } }] },
            ],
          },
        }))
      : Promise.resolve(null),
    // Laboratuvardaki işi teslim alabilen (lab:write) görür; yalnız okuyan muhasebeye iş değildir.
    can("lab:read") && can("lab:write") ? safe("lab", () => loadLabSummary(scope)) : Promise.resolve(null),
    // Kritik malzeme = sipariş verilecek; Stok sayfasındaki "sipariş ver" koşuluyla aynı (stock:write + finance:write).
    can("stock:read") && can("stock:write") && can("finance:write")
      ? safe("stockCritical", () => countCriticalStock(scope))
      : Promise.resolve(null),
    // Taksit listesi Muhasebe ekranındadır; o ekranı açamayan rol için sayı işe yaramaz.
    can("installments:read") && can("finance:center")
      ? safe("installmentsOverdue", () => prisma.taksit.count({
          where: { ...scope, kalan: { gt: 0 }, status: { notIn: ["ODENDI", "IPTAL"] }, vadeDate: { lt: todayStart } },
        }))
      : Promise.resolve(null),
    can("messages:read")
      ? safe("unreadMessages", () => prisma.message.count({
          where: { ...scope, deletedAt: null, userId: { not: user.id }, createdAt: { gt: messagesSince } },
          take: UNREAD_LIMIT,
        }))
      : Promise.resolve(null),
  ]);

  const counts: PanelSummaryCounts = { waiting, onlineRequests, tasksDue, lab, stockCritical, installmentsOverdue, unreadMessages };
  return NextResponse.json({ generatedAt: now.toISOString(), scopeKey, permissions, features, counts }, { headers });
}
