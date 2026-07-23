import type { Prisma } from "@prisma/client";

// Denetim günlüğü listesi ve CSV dışa aktarma route'u AYNI filtreleri
// kullanmalı — kullanıcı ekranda ne görüyorsa dışa aktardığı da o olmalı.
export function buildAuditWhere(searchParams: URLSearchParams): Prisma.AuditLogWhereInput {
  const search = searchParams.get("search") || "";
  const userId = searchParams.get("userId") || "";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";

  // Bu ekran superadmin'in kendi hesap verimliliği/uyum denetimi içindir — kurum
  // bazlı /api/logs'un aksine, superadmin/ghost işlemlerini DIŞLAMAZ; tam tersine
  // asıl amacı bunları görünür kılmaktır (bkz. src/lib/api.ts writeAudit).
  const where: Prisma.AuditLogWhereInput = {
    user: { role: { not: "SUPERADMIN" } },
  };
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
