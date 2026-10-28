-- Klinik sahibi, ana şubesinin yöneticisi olmalı. Süperadmin'in açtığı kliniklerde
-- sahibin şube üyeliği "şube yöneticisi" işaretsiz oluşuyordu; sahip Personel
-- ekranında pasif personeli göremiyor ve geri açamıyordu. Yalnız henüz yöneticisi
-- olmayan şubelerde sahibin birincil üyeliği işaretlenir.
UPDATE "UserBranch" ub
SET "isBranchManager" = true
FROM "Institution" i
WHERE ub."userId" = i."ownerId"
  AND ub."institutionId" = i."id"
  AND ub."isPrimary" = true
  AND ub."isActive" = true
  AND NOT EXISTS (
    SELECT 1 FROM "UserBranch" x
    WHERE x."branchId" = ub."branchId" AND x."isBranchManager" = true
  );
