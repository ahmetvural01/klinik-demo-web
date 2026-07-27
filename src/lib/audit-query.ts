import type { Prisma } from "@prisma/client";

// Denetim günlüğü listesi ve CSV dışa aktarma route'u AYNI filtreleri
// kullanmalı — kullanıcı ekranda ne görüyorsa dışa aktardığı da o olmalı.
export function buildAuditWhere(searchParams: URLSearchParams): Prisma.AuditLogWhereInput {
  const search = searchParams.get("search") || "";
  const userId = searchParams.get("userId") || "";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";

  // Bu filtre yalnızca /superadmin/audit (ve CSV export) tarafından kullanılır.
  // Klinik personelinin kendi /log ekranı AYRI bir where inşa eder
  // (src/app/api/logs/route.ts) ve orada superadmin/ghost kayıtları bilerek
  // gizlenir. Burada, süperadmin'in kendi hesap verebilirlik ekranında,
  // superadmin/ghost işlemleri GÖRÜNMELİDİR — writeAudit bunları tam olarak
  // bu amaçla kaydediyor (bkz. src/lib/api.ts writeAudit yorumu).
  const where: Prisma.AuditLogWhereInput = {};
  if (userId) where.userId = userId;
  if (search) {
    where.OR = [
      { action: { contains: search, mode: "insensitive" } },
      { detail: { contains: search, mode: "insensitive" } },
    ];
  }
  if (startDate || endDate) {
    where.createdAt = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate + "T23:59:59.999Z") } : {}),
    };
  }

  return where;
}
