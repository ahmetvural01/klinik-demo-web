-- Institution remains the tenant/billing boundary. ClinicBranch represents a
-- physical location inside that tenant.
ALTER TABLE "Institution" ADD COLUMN "maxActiveBranches" INTEGER;

CREATE TABLE "ClinicBranch" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "slug" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "district" TEXT,
    "city" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "colorCode" TEXT NOT NULL DEFAULT '#0f766e',
    "isHeadquarters" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClinicBranch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicBranch_institutionId_name_key" ON "ClinicBranch"("institutionId", "name");
CREATE UNIQUE INDEX "ClinicBranch_institutionId_code_key" ON "ClinicBranch"("institutionId", "code");
CREATE UNIQUE INDEX "ClinicBranch_institutionId_slug_key" ON "ClinicBranch"("institutionId", "slug");
CREATE UNIQUE INDEX "ClinicBranch_id_institutionId_key" ON "ClinicBranch"("id", "institutionId");
CREATE INDEX "ClinicBranch_institutionId_isActive_sortOrder_idx" ON "ClinicBranch"("institutionId", "isActive", "sortOrder");
CREATE UNIQUE INDEX "ClinicBranch_one_headquarters_per_institution" ON "ClinicBranch"("institutionId") WHERE "isHeadquarters" = true;
ALTER TABLE "ClinicBranch" ADD CONSTRAINT "ClinicBranch_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing tenant receives a deterministic default branch so the
-- migration is lossless and old records remain operational.
INSERT INTO "ClinicBranch" (
    "id", "institutionId", "name", "code", "slug", "isHeadquarters", "isActive", "sortOrder", "createdAt", "updatedAt"
)
SELECT
    'branch_' || substr(md5("id"), 1, 20),
    "id",
    'Merkez Şube',
    'MRK',
    'merkez',
    true,
    true,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Institution";

CREATE TABLE "UserBranch" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserBranch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserBranch_userId_branchId_key" ON "UserBranch"("userId", "branchId");
CREATE INDEX "UserBranch_institutionId_branchId_isActive_idx" ON "UserBranch"("institutionId", "branchId", "isActive");
CREATE INDEX "UserBranch_userId_isActive_isPrimary_idx" ON "UserBranch"("userId", "isActive", "isPrimary");
CREATE UNIQUE INDEX "UserBranch_one_primary_per_user" ON "UserBranch"("userId") WHERE "isPrimary" = true AND "isActive" = true;
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "UserBranch" (
    "id", "institutionId", "userId", "branchId", "isPrimary", "isActive", "createdAt", "updatedAt"
)
SELECT
    'ub_' || substr(md5(u."id" || b."id"), 1, 22),
    u."institutionId",
    u."id",
    b."id",
    true,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User" u
JOIN "ClinicBranch" b ON b."institutionId" = u."institutionId" AND b."isHeadquarters" = true
WHERE u."institutionId" IS NOT NULL;

ALTER TABLE "ClinicUnit" ADD COLUMN "branchId" TEXT;
UPDATE "ClinicUnit" u
SET "branchId" = b."id"
FROM "ClinicBranch" b
WHERE b."institutionId" = u."institutionId" AND b."isHeadquarters" = true;
ALTER TABLE "ClinicUnit" ALTER COLUMN "branchId" SET NOT NULL;
DROP INDEX IF EXISTS "ClinicUnit_institutionId_name_key";
DROP INDEX IF EXISTS "ClinicUnit_institutionId_code_key";
DROP INDEX IF EXISTS "ClinicUnit_institutionId_isActive_idx";
CREATE UNIQUE INDEX "ClinicUnit_branchId_name_key" ON "ClinicUnit"("branchId", "name");
CREATE UNIQUE INDEX "ClinicUnit_branchId_code_key" ON "ClinicUnit"("branchId", "code");
CREATE INDEX "ClinicUnit_institutionId_branchId_isActive_idx" ON "ClinicUnit"("institutionId", "branchId", "isActive");
ALTER TABLE "ClinicUnit" ADD CONSTRAINT "ClinicUnit_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Patient" ADD COLUMN "homeBranchId" TEXT;
UPDATE "Patient" p
SET "homeBranchId" = b."id"
FROM "ClinicBranch" b
WHERE b."institutionId" = p."institutionId" AND b."isHeadquarters" = true;
CREATE INDEX "Patient_homeBranchId_idx" ON "Patient"("homeBranchId");
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_homeBranchId_institutionId_fkey" FOREIGN KEY ("homeBranchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Appointment" ADD COLUMN "institutionId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "branchId" TEXT;
UPDATE "Appointment" a
SET "institutionId" = p."institutionId",
    "branchId" = b."id"
FROM "Patient" p
JOIN "ClinicBranch" b ON b."institutionId" = p."institutionId" AND b."isHeadquarters" = true
WHERE p."id" = a."patientId";
ALTER TABLE "Appointment" ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "Appointment" ALTER COLUMN "branchId" SET NOT NULL;
CREATE INDEX "Appointment_institutionId_branchId_startAt_idx" ON "Appointment"("institutionId", "branchId", "startAt");
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
