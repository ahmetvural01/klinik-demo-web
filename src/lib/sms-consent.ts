import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { dispatchPatientMessage } from "@/lib/notification-dispatch";
import { SMS_CONSENT_MESSAGE_TEMPLATE } from "@/lib/sms-consent-copy";
import type { SmsConsentTokenPurpose } from "@prisma/client";

/**
 * Hasta SMS izin token akışı: onay isteği gönderimi + giriş gerektirmeyen
 * onay linkinin doğrulanması/işlenmesi (bkz. docs/ILETISIM-MIMARISI-RAPORU.md §1).
 * Onay metni ve SMS metni SABİTTİR — klinikler bunu değiştiremez, yalnızca
 * klinik adı gibi değişken alanlar otomatik doldurulur.
 */

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ConsentDecision = "ENABLED" | "DISABLED";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashIp(ip: string) {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

function consentUrl(token: string) {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/sms-onay/${token}`;
}

function buildConsentMessage(institutionName: string, token: string) {
  return SMS_CONSENT_MESSAGE_TEMPLATE
    .replace("{{institutionName}}", institutionName)
    .replace("{{link}}", consentUrl(token));
}

export async function sendSmsConsentRequest(params: {
  institutionId: string;
  patientId: string;
  purpose?: SmsConsentTokenPurpose;
  actorId?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const { institutionId, patientId, actorId } = params;
  const purpose: SmsConsentTokenPurpose = params.purpose ?? "INITIAL";

  const [patient, institution] = await Promise.all([
    prisma.patient.findFirst({ where: { id: patientId, institutionId }, select: { id: true, phone: true } }),
    prisma.institution.findUnique({ where: { id: institutionId }, select: { name: true } }),
  ]);
  if (!patient || !institution) {
    return { success: false, error: "Hasta veya kurum bulunamadı." };
  }

  await prisma.patientSmsPreference.upsert({
    where: { patientId },
    create: { institutionId, patientId, status: "PENDING" },
    update: {},
  });

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenRow = await prisma.patientSmsConsentToken.create({
    data: {
      institutionId,
      patientId,
      tokenHash: hashToken(token),
      purpose,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      createdById: actorId || null,
    },
  });

  const message = buildConsentMessage(institution.name, token);

  const result = await dispatchPatientMessage({
    institutionId,
    patientId,
    eventType: "SMS_CONSENT_REQUEST",
    purpose: "CONSENT_REQUEST",
    templateCode: "SMS_CONSENT_REQUEST",
    message,
    idempotencyKey: `sms-consent-token:${tokenRow.id}`,
    actorId,
  });

  // Eski, henüz kullanılmamış token'lar yalnızca YENİ SMS gerçekten
  // gönderildiyse geçersizleştirilir — aksi halde bakiye/sağlayıcı hatası
  // yüzünden gönderim başarısız olduğunda hasta elindeki hâlâ çalışan eski
  // bağlantıyı da kaybedip hiçbir geçerli bağlantısı kalmazdı. Gönderim
  // başarılıysa hasta artık iki bağlantıdan çelişkili işlem yapamasın diye
  // yeni token dışındaki tüm açık token'lar geçersizleştirilir (bkz.
  // docs/ILETISIM-MIMARISI-RAPORU.md §1.6).
  if (result.success) {
    await prisma.patientSmsConsentToken.updateMany({
      where: { patientId, id: { not: tokenRow.id }, usedAt: null, invalidatedAt: null },
      data: { invalidatedAt: new Date() },
    });
  }

  // lastRequestAttemptAt HER denemede güncellenir (başarılı ya da değil);
  // lastRequestSentAt yalnızca gerçekten gönderildiğinde — hasta kartının
  // "gönderilmiş ve cevap bekleniyor" ile "gönderilemedi" durumlarını
  // birbirinden ayırabilmesi için (bkz. rapor §1.5 güncellemesi).
  await prisma.patientSmsPreference.update({
    where: { patientId },
    data: {
      lastRequestAttemptAt: new Date(),
      ...(result.success
        ? { lastRequestSentAt: new Date(), lastRequestError: null }
        : { lastRequestError: (result.error || result.reason || "Bilinmeyen hata").slice(0, 500) }),
    },
  });

  return { success: result.success, error: result.error || result.reason };
}

export type ConsentTokenValidation =
  | { ok: true; institutionName: string; patientInitial: string }
  | { ok: false; status: "NOT_FOUND" | "USED" | "EXPIRED" | "SUPERSEDED" };

export async function validateConsentToken(rawToken: string): Promise<ConsentTokenValidation> {
  const tokenRow = await prisma.patientSmsConsentToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { patient: { select: { fullName: true } } },
  });
  if (!tokenRow) return { ok: false, status: "NOT_FOUND" };
  if (tokenRow.usedAt) return { ok: false, status: "USED" };
  if (tokenRow.invalidatedAt) return { ok: false, status: "SUPERSEDED" };
  if (tokenRow.expiresAt < new Date()) return { ok: false, status: "EXPIRED" };

  const institution = await prisma.institution.findUnique({
    where: { id: tokenRow.institutionId },
    select: { name: true },
  });

  return {
    ok: true,
    institutionName: institution?.name || "",
    patientInitial: tokenRow.patient.fullName.trim().charAt(0).toUpperCase() || "H",
  };
}

export type ConsentDecisionResult =
  | { ok: true }
  | { ok: false; status: "NOT_FOUND" | "USED" | "EXPIRED" | "SUPERSEDED" };

export async function submitConsentDecision(params: {
  rawToken: string;
  decision: ConsentDecision;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<ConsentDecisionResult> {
  const tokenHash = hashToken(params.rawToken);

  return prisma.$transaction(async (tx) => {
    const tokenRow = await tx.patientSmsConsentToken.findUnique({ where: { tokenHash } });
    if (!tokenRow) return { ok: false, status: "NOT_FOUND" } as const;
    if (tokenRow.usedAt) return { ok: false, status: "USED" } as const;
    if (tokenRow.invalidatedAt) return { ok: false, status: "SUPERSEDED" } as const;
    if (tokenRow.expiresAt < new Date()) return { ok: false, status: "EXPIRED" } as const;

    const preference = await tx.patientSmsPreference.findUnique({ where: { patientId: tokenRow.patientId } });
    const oldStatus = preference?.status ?? null;
    const now = new Date();

    await tx.patientSmsConsentToken.update({
      where: { id: tokenRow.id },
      data: {
        usedAt: now,
        usedFromIp: params.ip || null,
        usedUserAgent: params.userAgent?.slice(0, 300) || null,
        resultStatus: params.decision,
      },
    });

    const firstConsentAt = params.decision === "ENABLED" ? preference?.firstConsentAt ?? now : preference?.firstConsentAt ?? null;
    const lastRejectionAt = params.decision === "DISABLED" ? now : preference?.lastRejectionAt ?? null;

    await tx.patientSmsPreference.upsert({
      where: { patientId: tokenRow.patientId },
      create: {
        institutionId: tokenRow.institutionId,
        patientId: tokenRow.patientId,
        status: params.decision,
        firstConsentAt,
        lastRejectionAt,
        consentTokenId: tokenRow.id,
        lastChangeSource: "PUBLIC_LINK",
      },
      update: {
        status: params.decision,
        firstConsentAt,
        lastRejectionAt,
        consentTokenId: tokenRow.id,
        lastChangeSource: "PUBLIC_LINK",
      },
    });

    await tx.patientSmsPreferenceEvent.create({
      data: {
        institutionId: tokenRow.institutionId,
        patientId: tokenRow.patientId,
        oldStatus,
        newStatus: params.decision,
        source: "PUBLIC_LINK",
        tokenId: tokenRow.id,
        ipHash: params.ip ? hashIp(params.ip) : null,
      },
    });

    return { ok: true } as const;
  });
}
