import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAnyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireActiveBranch } from "@/lib/branch-context";
import { ensureDefaultCelebrationDays, isCelebrationDate, isoLocalDate } from "@/lib/celebration-days";
import { WHATSAPP_ALLOWED_WHERE } from "@/lib/whatsapp-consent";
import { findConnectedWhatsapp } from "@/lib/whatsapp-connection";

type CelebrationRule = Parameters<typeof isCelebrationDate>[0];

// Bugünden itibaren kuralın denk geldiği ilk gün (en fazla ~13 ay ileri).
// Ekranda "01.01" gibi yılsız ya da geçmiş bir tarih yerine sıradaki gerçek
// gönderim günü gösterilir (Ramazan Bayramı 2026 geçtiyse 2027 tarihi).
function nextOccurrence(rule: CelebrationRule, from: Date) {
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12, 0, 0, 0);
  for (let i = 0; i < 400; i += 1) {
    if (isCelebrationDate(rule, cursor)) return isoLocalDate(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

// Kutlama mesajının bugünkü kanal ayarıyla GERÇEKTEN kime gidebileceği
// (src/lib/notification-dispatch.ts ile aynı kural): WhatsApp kanalı seçili ve
// numara bağlıysa WhatsApp'ı kapatmamış hastalar (yedek SMS açıksa SMS izinliler
// de); WhatsApp seçili ama bağlı değilse yalnız yedek SMS; aksi halde SMS
// izinliler. SMS kapalıysa SMS yolu sayılmaz. Önceden "SMS VEYA WhatsApp izni"
// sayılıyordu: kanal "Yalnız SMS" ve WhatsApp bağlı değilken bile WhatsApp'ı
// kapatmamış herkes "izinli" görünüyor, açma onayı yanlış sayı söylüyordu.
async function reachableWhere(institutionId: string): Promise<Prisma.PatientWhereInput | null> {
  const [institution, setting, connection] = await Promise.all([
    prisma.institution.findUnique({ where: { id: institutionId }, select: { whatsappEnabled: true } }),
    prisma.setting.findUnique({
      where: { institutionId },
      select: { defaultNotificationChannel: true, whatsappSmsFallback: true, smsEnabled: true },
    }),
    findConnectedWhatsapp(institutionId),
  ]);
  const smsWhere: Prisma.PatientWhereInput | null = setting?.smsEnabled === false
    ? null
    : { smsPreference: { is: { status: "ENABLED" } } };
  const whatsappChannel = Boolean(institution?.whatsappEnabled && setting?.defaultNotificationChannel === "WHATSAPP");
  const fallback = setting?.whatsappSmsFallback ?? true;
  if (whatsappChannel && connection) {
    return fallback && smsWhere ? { OR: [smsWhere, WHATSAPP_ALLOWED_WHERE] } : WHATSAPP_ALLOWED_WHERE;
  }
  if (whatsappChannel) return fallback ? smsWhere : null;
  return smsWhere;
}

// Klinik, süperadmin'in yönettiği kutlama günü kataloğunu (bkz.
// /api/superadmin/celebration-days) burada görür ve her satırı kendi
// CelebrationDaySetting'i ile ayrı ayrı açar/kapatır (varsayılan kapalı —
// bkz. src/lib/celebration-sms.ts). Açmadan önce kime ve kaç kişiye
// gideceği görünsün diye alıcı sayıları da döner (gönderim taramasıyla aynı
// ölçüt: arşivlenmemiş, telefonu olan hastalar). Sayılar şube izolasyonu
// gereği yalnız AKTİF ŞUBE için hesaplanır; ekranda "bu şubede" diye yazılır.
// `?counts=0`: yalnız katalog + açık/kapalı (Mesaj gönder'deki hazır metin
// listesi ve Otomatik mesajlar özeti) — alıcı sayımı yapılmaz.
export async function GET(request: NextRequest) {
  const auth = await requireAnyAuth(["sms:read", "whatsapp:read"]);
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları görüntüleyebilir." }, { status: 403 });
  }
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 403 });
  const institutionId = auth.user.institutionId;
  const withCounts = request.nextUrl.searchParams.get("counts") !== "0";

  await ensureDefaultCelebrationDays();
  const audienceWhere = { institutionId, homeBranchId: activeBranch.branchId, archivedAt: null, phone: { not: "" } };
  const now = new Date();
  const [days, settings, byProfession, reachByProfession, sentLogs] = await Promise.all([
    prisma.celebrationDay.findMany({ where: { isActive: true }, orderBy: [{ month: "asc" }, { day: "asc" }] }),
    prisma.celebrationDaySetting.findMany({ where: { institutionId } }),
    withCounts
      ? prisma.patient.groupBy({ by: ["profession"], where: audienceWhere, _count: { _all: true } })
      : Promise.resolve([]),
    withCounts
      ? reachableWhere(institutionId).then((reach) => (reach
        ? prisma.patient.groupBy({ by: ["profession"], where: { ...audienceWhere, ...reach }, _count: { _all: true } })
        : []))
      : Promise.resolve([]),
    withCounts
      ? prisma.celebrationSmsLog.groupBy({
          by: ["celebrationCode"],
          where: { institutionId, branchId: activeBranch.branchId, year: now.getFullYear(), status: "SENT" },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const enabledByCode = new Map(settings.map((s) => [s.celebrationCode, s.enabled]));
  const sentByCode = new Map(sentLogs.map((entry) => [entry.celebrationCode, entry._count._all]));
  const sumFor = (groups: { profession: string | null; _count: { _all: number } }[], professions: string[]) => groups
    .filter((group) => professions.length === 0 || (group.profession !== null && professions.includes(group.profession)))
    .reduce((sum, group) => sum + group._count._all, 0);

  const merged = days.map((d) => ({
    code: d.code,
    title: d.title,
    month: d.month,
    day: d.day,
    category: d.category,
    recurrenceRule: d.recurrenceRule,
    weekOfMonth: d.weekOfMonth,
    weekday: d.weekday,
    dateOverrides: d.dateOverrides,
    targetProfessions: d.targetProfessions,
    messageTemplate: d.messageTemplate,
    whatsappMessageTemplate: d.whatsappMessageTemplate,
    enabled: enabledByCode.get(d.code) ?? false,
    nextDate: nextOccurrence(d, now),
    ...(withCounts
      ? {
          audience: {
            total: sumFor(byProfession, d.targetProfessions),
            // Bugünkü kanal ayarıyla mesajın gidebileceği hasta sayısı (bkz. reachableWhere).
            consented: sumFor(reachByProfession, d.targetProfessions),
          },
          sentThisYear: sentByCode.get(d.code) ?? 0,
        }
      : {}),
  }));

  return NextResponse.json({ days: merged });
}
