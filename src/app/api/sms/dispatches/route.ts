import { NextRequest, NextResponse } from "next/server";
import type { Prisma, SmsDispatchStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";

// Gönderim Geçmişi — hastaya giden (ya da gidemeyen) HER mesajın tek kaynağı
// SmsDispatch tablosudur (bkz. src/lib/notification-dispatch.ts: otomatik
// hatırlatmalar, kutlamalar, izin SMS'leri, toplu ve elle gönderimler).
// Önceki ekran yalnız işlem günlüğündeki "SMS_" kayıtlarını okuduğu için
// otomatik mesajlar ve izin/kredi yüzünden hiç gönderilmeyenler görünmüyordu.
// Salt okunur uç nokta: kurum + aktif şube filtresi zorunludur.

const STATUS_GROUPS: Record<string, SmsDispatchStatus[]> = {
  sent: ["SENT", "DELIVERED", "READ"],
  "not-sent": ["SUPPRESSED"],
  failed: ["FAILED"],
  pending: ["QUEUED"],
};

const EVENT_GROUPS: Record<string, string[]> = {
  randevu: ["APPOINTMENT_CREATED", "APPOINTMENT_INFO", "APPOINTMENT_CHANGED", "APPOINTMENT_CANCELLED", "APPOINTMENT_REMINDER", "TREATMENT_SURVEY"],
  odeme: ["PAYMENT_REMINDER"],
  kutlama: ["BIRTHDAY_GREETING", "HOLIDAY_GREETING"],
  izin: ["SMS_CONSENT_REQUEST"],
  elle: ["MANUAL_SMS", "MANUAL_WHATSAPP", "BULK_SMS"],
};

const PERIODS: Record<string, number> = { "7": 7, "30": 30, "90": 90 };

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

// Toplu gönderimin idempotency anahtarı `bulk-sms:<paket>:<hasta>` biçimindedir
// (bkz. api/sms/bulk/route.ts) — aynı paketin alıcıları bu kimlikle bulunur.
function bulkBatchOf(idempotencyKey: string) {
  const match = /^bulk-sms:([^:]+):/.exec(idempotencyKey);
  return match?.[1] || null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth("sms:read");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları gönderim geçmişini görebilir." }, { status: 403 });
  }
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const take = parsePositiveInt(sp.get("take"), 25, 100);
  const page = parsePositiveInt(sp.get("page"), 1, 100000);
  const q = (sp.get("q") || "").trim().slice(0, 80);
  const status = sp.get("status") || "";
  const channel = (sp.get("channel") || "").toUpperCase();
  const event = sp.get("event") || "";
  const period = sp.get("period") || "30";
  const batch = (sp.get("batch") || "").trim();

  if (status && !STATUS_GROUPS[status]) return NextResponse.json({ message: "Geçersiz durum filtresi." }, { status: 400 });
  if (channel && channel !== "SMS" && channel !== "WHATSAPP") return NextResponse.json({ message: "Geçersiz kanal filtresi." }, { status: 400 });
  if (event && !EVENT_GROUPS[event]) return NextResponse.json({ message: "Geçersiz mesaj türü filtresi." }, { status: 400 });
  if (period !== "all" && !PERIODS[period]) return NextResponse.json({ message: "Geçersiz tarih aralığı." }, { status: 400 });
  if (batch && !/^[A-Za-z0-9-]{1,120}$/.test(batch)) return NextResponse.json({ message: "Geçersiz toplu gönderim kimliği." }, { status: 400 });

  // WhatsApp satırları ayrıca WhatsApp okuma yetkisi ve kurumun WhatsApp
  // modülü ister; yoksa yalnız SMS satırları döner (erişim genişletilmez).
  const [canReadWhatsappPermission, institution] = await Promise.all([
    hasEffectivePermission(auth.user, "whatsapp:read"),
    prisma.institution.findUnique({ where: { id: auth.user.institutionId }, select: { whatsappEnabled: true } }),
  ]);
  const canReadWhatsapp = Boolean(institution?.whatsappEnabled && canReadWhatsappPermission);
  if (channel === "WHATSAPP" && !canReadWhatsapp) {
    return NextResponse.json({ message: "WhatsApp gönderimlerini görme yetkiniz yok." }, { status: 403 });
  }
  const effectiveChannel = canReadWhatsapp ? channel : "SMS";

  const since = period === "all" ? null : new Date(Date.now() - PERIODS[period] * 24 * 60 * 60 * 1000);
  const digits = q.replace(/\D/g, "");

  // Durum dışındaki filtreler: özet sayılar (gönderildi/gönderilmedi/başarısız)
  // aynı süzgeçle hesaplanır ki durum seçenekleri listede göreceğini söylesin.
  const baseWhere: Prisma.SmsDispatchWhereInput = {
    institutionId: auth.user.institutionId,
    branchId: activeBranch.branchId,
    ...(since ? { createdAt: { gte: since } } : {}),
    ...(effectiveChannel ? { channel: effectiveChannel as "SMS" | "WHATSAPP" } : {}),
    ...(event ? { eventType: { in: EVENT_GROUPS[event] } } : {}),
    ...(batch ? { idempotencyKey: { startsWith: `bulk-sms:${batch}:` } } : {}),
    ...(q
      ? {
          OR: [
            { patient: { fullName: { contains: q, mode: "insensitive" as const } } },
            ...(digits.length >= 3 ? [{ phoneMasked: { contains: digits.slice(-4) } }] : []),
          ],
        }
      : {}),
  };
  const where: Prisma.SmsDispatchWhereInput = status
    ? { AND: [baseWhere, { status: { in: STATUS_GROUPS[status] } }] }
    : baseWhere;

  const [rows, total, grouped] = await Promise.all([
    prisma.smsDispatch.findMany({
      where,
      select: {
        id: true,
        channel: true,
        eventType: true,
        purpose: true,
        status: true,
        phoneMasked: true,
        lastError: true,
        idempotencyKey: true,
        createdById: true,
        createdAt: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        patient: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.smsDispatch.count({ where }),
    prisma.smsDispatch.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
  ]);

  const creatorIds = Array.from(new Set(rows.map((row) => row.createdById).filter((id): id is string => Boolean(id))));
  const creators = creatorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: creatorIds }, institutionId: auth.user.institutionId },
        select: { id: true, fullName: true },
      })
    : [];
  const creatorName = new Map(creators.map((user) => [user.id, user.fullName]));

  const countOf = (statuses: SmsDispatchStatus[]) => grouped
    .filter((entry) => statuses.includes(entry.status))
    .reduce((sum, entry) => sum + entry._count._all, 0);

  return NextResponse.json({
    items: rows.map(({ idempotencyKey, createdById, ...row }) => ({
      ...row,
      batchId: bulkBatchOf(idempotencyKey),
      createdByName: createdById ? creatorName.get(createdById) || null : null,
    })),
    total,
    page,
    take,
    pageCount: Math.max(1, Math.ceil(total / take)),
    canSeeWhatsapp: canReadWhatsapp,
    summary: {
      sent: countOf(STATUS_GROUPS.sent),
      notSent: countOf(STATUS_GROUPS["not-sent"]),
      failed: countOf(STATUS_GROUPS.failed),
      pending: countOf(STATUS_GROUPS.pending),
    },
  });
}
