import { prisma } from "@/lib/prisma";

export type ConsentSummaryBucket = "ENABLED" | "DISABLED" | "PENDING" | "EXPIRED" | "SEND_FAILED";

export type ConsentSummary = Record<ConsentSummaryBucket, number>;

/**
 * Hasta kartındaki SMS izin durumlarının kurum genelindeki dağılımı — SMS
 * Ayarları ekranındaki "İzin Yönetimi" özetinde kullanılır (bkz.
 * docs/ILETISIM-MIMARISI-RAPORU.md §1.5, kullanıcı onayı 2026-07-29 §7).
 * PENDING/EXPIRED/SEND_FAILED birbirini dışlar: bir hasta aynı anda yalnızca
 * birine sayılır (öncelik: gönderim hiç başarılı olmadıysa SEND_FAILED, sonra
 * en son token süresi dolmuşsa EXPIRED, aksi halde PENDING).
 */
export async function computeSmsConsentSummary(institutionId: string): Promise<ConsentSummary> {
  const [enabled, disabled, pendingPrefs] = await Promise.all([
    prisma.patientSmsPreference.count({ where: { institutionId, status: "ENABLED" } }),
    prisma.patientSmsPreference.count({ where: { institutionId, status: "DISABLED" } }),
    prisma.patientSmsPreference.findMany({
      where: { institutionId, status: "PENDING" },
      select: { patientId: true, lastRequestSentAt: true, lastRequestError: true },
    }),
  ]);

  const pendingPatientIds = pendingPrefs.map((p) => p.patientId);
  const latestTokenByPatient = new Map<string, { expiresAt: Date; usedAt: Date | null }>();
  if (pendingPatientIds.length > 0) {
    const tokens = await prisma.patientSmsConsentToken.findMany({
      where: { patientId: { in: pendingPatientIds } },
      orderBy: { createdAt: "desc" },
      select: { patientId: true, expiresAt: true, usedAt: true },
    });
    for (const token of tokens) {
      if (!latestTokenByPatient.has(token.patientId)) {
        latestTokenByPatient.set(token.patientId, { expiresAt: token.expiresAt, usedAt: token.usedAt });
      }
    }
  }

  const now = Date.now();
  let pending = 0;
  let expired = 0;
  let sendFailed = 0;

  for (const pref of pendingPrefs) {
    if (!pref.lastRequestSentAt && pref.lastRequestError) {
      sendFailed += 1;
      continue;
    }
    const latestToken = latestTokenByPatient.get(pref.patientId);
    if (latestToken && !latestToken.usedAt && latestToken.expiresAt.getTime() < now) {
      expired += 1;
      continue;
    }
    pending += 1;
  }

  return { ENABLED: enabled, DISABLED: disabled, PENDING: pending, EXPIRED: expired, SEND_FAILED: sendFailed };
}

/**
 * Özet karttaki bir sayının üzerine tıklanınca hasta listesini filtrelemek
 * için kullanılır — yalnızca türetilmiş (PENDING/EXPIRED/SEND_FAILED)
 * durumlar için gereklidir; ENABLED/DISABLED doğrudan
 * `smsPreference.status` ile filtrelenebilir (bkz. src/app/api/patients/route.ts).
 */
export async function listPatientIdsForDerivedBucket(
  institutionId: string,
  bucket: "PENDING" | "EXPIRED" | "SEND_FAILED",
): Promise<string[]> {
  const pendingPrefs = await prisma.patientSmsPreference.findMany({
    where: { institutionId, status: "PENDING" },
    select: { patientId: true, lastRequestSentAt: true, lastRequestError: true },
  });
  const pendingPatientIds = pendingPrefs.map((p) => p.patientId);
  if (pendingPatientIds.length === 0) return [];

  const latestTokenByPatient = new Map<string, { expiresAt: Date; usedAt: Date | null }>();
  const tokens = await prisma.patientSmsConsentToken.findMany({
    where: { patientId: { in: pendingPatientIds } },
    orderBy: { createdAt: "desc" },
    select: { patientId: true, expiresAt: true, usedAt: true },
  });
  for (const token of tokens) {
    if (!latestTokenByPatient.has(token.patientId)) {
      latestTokenByPatient.set(token.patientId, { expiresAt: token.expiresAt, usedAt: token.usedAt });
    }
  }

  const now = Date.now();
  const matched: string[] = [];
  for (const pref of pendingPrefs) {
    const isSendFailed = !pref.lastRequestSentAt && Boolean(pref.lastRequestError);
    if (isSendFailed) {
      if (bucket === "SEND_FAILED") matched.push(pref.patientId);
      continue;
    }
    const latestToken = latestTokenByPatient.get(pref.patientId);
    const isExpired = Boolean(latestToken && !latestToken.usedAt && latestToken.expiresAt.getTime() < now);
    if (isExpired) {
      if (bucket === "EXPIRED") matched.push(pref.patientId);
      continue;
    }
    if (bucket === "PENDING") matched.push(pref.patientId);
  }
  return matched;
}
