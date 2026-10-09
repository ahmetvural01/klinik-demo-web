import { NextResponse } from "next/server";
import { requireAnyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireActiveBranch } from "@/lib/branch-context";
import { ensureDefaultCelebrationDays, isCelebrationDate, isoLocalDate } from "@/lib/celebration-days";
import { WHATSAPP_ALLOWED_WHERE } from "@/lib/whatsapp-consent";

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

// Klinik, süperadmin'in yönettiği kutlama günü kataloğunu (bkz.
// /api/superadmin/celebration-days) burada görür ve her satırı kendi
// CelebrationDaySetting'i ile ayrı ayrı açar/kapatır (varsayılan kapalı —
// bkz. src/lib/celebration-sms.ts). Açmadan önce kime ve kaç kişiye
// gideceği görünsün diye alıcı sayıları da döner (gönderim taramasıyla aynı
// ölçüt: arşivlenmemiş, telefonu olan hastalar). Sayılar şube izolasyonu
// gereği yalnız AKTİF ŞUBE için hesaplanır; ekranda "bu şubede" diye yazılır.
export async function GET() {
  const auth = await requireAnyAuth(["sms:read", "whatsapp:read"]);
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları görüntüleyebilir." }, { status: 403 });
  }
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 403 });
  const institutionId = auth.user.institutionId;

  await ensureDefaultCelebrationDays();
  const audienceWhere = { institutionId, homeBranchId: activeBranch.branchId, archivedAt: null, phone: { not: "" } };
  const now = new Date();
  const [days, settings, byProfession, consentByProfession, sentLogs] = await Promise.all([
    prisma.celebrationDay.findMany({ where: { isActive: true }, orderBy: [{ month: "asc" }, { day: "asc" }] }),
    prisma.celebrationDaySetting.findMany({ where: { institutionId } }),
    prisma.patient.groupBy({ by: ["profession"], where: audienceWhere, _count: { _all: true } }),
    prisma.patient.groupBy({
      by: ["profession"],
      where: {
        ...audienceWhere,
        OR: [
          { smsPreference: { is: { status: "ENABLED" } } },
          WHATSAPP_ALLOWED_WHERE,
        ],
      },
      _count: { _all: true },
    }),
    prisma.celebrationSmsLog.groupBy({
      by: ["celebrationCode"],
      where: { institutionId, branchId: activeBranch.branchId, year: now.getFullYear(), status: "SENT" },
      _count: { _all: true },
    }),
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
    audience: {
      total: sumFor(byProfession, d.targetProfessions),
      consented: sumFor(consentByProfession, d.targetProfessions),
    },
    sentThisYear: sentByCode.get(d.code) ?? 0,
  }));

  return NextResponse.json({ days: merged });
}
