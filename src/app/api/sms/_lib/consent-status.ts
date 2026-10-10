import { prisma } from "@/lib/prisma";

// Hastanın SMS izninin EKRANDA gösterilen durumu. Veritabanında yalnız
// PENDING/ENABLED/DISABLED tutulur; "izin SMS'i hiç gitmedi" (SEND_FAILED) ve
// "onay bağlantısının süresi doldu" (EXPIRED) türetilir. Kural, İletişim'deki
// izin özetiyle ve Hastalar listesindeki süzgeçle aynıdır
// (bkz. src/lib/sms-consent-stats.ts): önce hiç gönderilemediyse SEND_FAILED,
// sonra son bağlantı kullanılmadan süresi dolduysa EXPIRED, aksi halde PENDING.
// Önceden alıcı listesi ve tek hasta kontrolü ham durumu döndürüyordu; izin
// SMS'i kredi yetmediği için hiç gitmemiş hasta "Onay bekliyor" görünüyordu.

export type DerivedSmsConsent = "ENABLED" | "PENDING" | "DISABLED" | "EXPIRED" | "SEND_FAILED" | "NONE";

export type ConsentPreferenceFields = {
  status: string;
  lastRequestSentAt: Date | null;
  lastRequestError: string | null;
} | null | undefined;

export type ConsentTokenFields = { expiresAt: Date; usedAt: Date | null } | null | undefined;

export function deriveSmsConsent(preference: ConsentPreferenceFields, latestToken: ConsentTokenFields, now = Date.now()): DerivedSmsConsent {
  if (!preference) return "NONE";
  if (preference.status === "ENABLED" || preference.status === "DISABLED") return preference.status;
  if (preference.status !== "PENDING") return "NONE";
  if (!preference.lastRequestSentAt && preference.lastRequestError) return "SEND_FAILED";
  if (latestToken && !latestToken.usedAt && latestToken.expiresAt.getTime() < now) return "EXPIRED";
  return "PENDING";
}

/** Verilen (zaten kurum/şube süzgecinden geçmiş) hastaların en son izin bağlantısı. */
export async function latestConsentTokens(institutionId: string, patientIds: string[]) {
  const latest = new Map<string, { expiresAt: Date; usedAt: Date | null }>();
  if (patientIds.length === 0) return latest;
  const tokens = await prisma.patientSmsConsentToken.findMany({
    where: { institutionId, patientId: { in: patientIds } },
    orderBy: { createdAt: "desc" },
    select: { patientId: true, expiresAt: true, usedAt: true },
  });
  for (const token of tokens) {
    if (!latest.has(token.patientId)) latest.set(token.patientId, { expiresAt: token.expiresAt, usedAt: token.usedAt });
  }
  return latest;
}

/** Prisma `select` parçası: türetme için gereken izin alanları. */
export const CONSENT_PREFERENCE_SELECT = {
  select: { status: true, lastRequestSentAt: true, lastRequestError: true },
} as const;
