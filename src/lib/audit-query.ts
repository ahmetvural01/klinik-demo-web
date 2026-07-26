import type { Prisma } from "@prisma/client";

// Denetim günlüğü listesi ve CSV dışa aktarma route'u AYNI filtreleri
// kullanmalı — kullanıcı ekranda ne görüyorsa dışa aktardığı da o olmalı.
export function buildAuditWhere(searchParams: URLSearchParams): Prisma.AuditLogWhereInput {
  const search = searchParams.get("search") || "";
  const userId = searchParams.get("userId") || "";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";

  // Superadmin ve ghost müdahale kayıtları kurum/personel geçmişinde görünmez.
  // Yeni kayıtlar writeAudit içinde yazılmadan atlanır; eski kayıtlar varsa bu
  // filtreyle denetim ekranına da taşınmaz.
  const where: Prisma.AuditLogWhereInput = {
    user: { role: { not: "SUPERADMIN" } },
    NOT: [{ actorRole: "SUPERADMIN" }, { isGhost: true }],
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
