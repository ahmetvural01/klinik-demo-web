import type { Prisma } from "@prisma/client";

// Kliniğin KENDİ ekranlarına giden her işlem kaydı (AuditLog) okuması bu
// kuralı uygular: sistem sahibinin (süperadmin) ve kliniğe gizli girişteki
// işlemleri klinik personeline — yönetici dahil — hiçbir yerde görünmez.
// Kayıtlar silinmez; Platform Denetim Günlüğü'nde gerçek aktörle durur.
//
// Kural tek yerde tutulur çünkü yeni bir ekran/uç aynı tabloyu okurken bu
// filtreyi unutursa sahibin adı ("… kliniğine X giriş yaptı") kliniğe sızar
// (bkz. scripts/architecture-invariants.ts — süperadmin dışındaki her
// auditLog okuması bu dosyayı kullanmak zorunda).
export const CLINIC_HIDDEN_AUDIT_NOT: Prisma.AuditLogWhereInput[] = [
  { actorRole: "SUPERADMIN" },
  { isGhost: true },
];
