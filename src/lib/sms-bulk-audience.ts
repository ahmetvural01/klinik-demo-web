import { prisma } from "@/lib/prisma";

// Toplu iletişimin alıcı sorgusu TEK yerde: hem gönderim (api/sms/bulk) hem
// gönderim öncesi özet (api/sms/bulk/preview) bunu kullanır. Önizleme ile
// gönderim ayrı sorgu kullanırsa ekrandaki sayı gerçekte gidenle tutmaz.
// institutionId + homeBranchId filtresi kritik: başka kurumun/şubenin hasta
// kimliği gönderilse bile sorgu onu döndürmez (cross-tenant gönderim yok).

export type BulkAudience = "ALL" | "SELECTED";

export type BulkAudienceQuery = {
  institutionId: string;
  branchId: string;
  audience: BulkAudience;
  patientIds: string[];
  /** Mesleğe özel gün seçildiyse yalnız bu mesleklerdeki hastalar (boşsa filtre yok). */
  targetProfessions: string[];
};

function scopeWhere(query: BulkAudienceQuery) {
  return {
    institutionId: query.institutionId,
    homeBranchId: query.branchId,
    archivedAt: null,
    ...(query.audience === "SELECTED" ? { id: { in: query.patientIds } } : {}),
  };
}

export async function findBulkAudience(query: BulkAudienceQuery) {
  return prisma.patient.findMany({
    where: {
      ...scopeWhere(query),
      ...(query.targetProfessions.length ? { profession: { in: query.targetProfessions } } : {}),
    },
    select: {
      id: true,
      fullName: true,
      phone: true,
      whatsappOptInAt: true,
      whatsappOptOutAt: true,
      smsPreference: { select: { status: true } },
    },
  });
}

/** Meslek filtresi uygulanmadan kapsamdaki hasta sayısı (filtre dışında kalanları göstermek için). */
export async function countBulkScope(query: BulkAudienceQuery) {
  return prisma.patient.count({ where: scopeWhere(query) });
}
