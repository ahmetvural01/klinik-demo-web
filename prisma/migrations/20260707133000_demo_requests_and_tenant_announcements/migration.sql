-- Demo workflow and tenant-scoped announcements.

ALTER TABLE "Institution"
ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "demoExpiresAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "demoSourceRequestId" TEXT;

CREATE TABLE IF NOT EXISTS "DemoRequest" (
  "id" TEXT NOT NULL,
  "institutionName" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DEMO_CREATED',
  "demoInstitutionId" TEXT,
  "demoExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DemoRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Announcement"
ADD COLUMN IF NOT EXISTS "institutionId" TEXT,
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "createdById" TEXT;

WITH first_institution AS (
  SELECT "id" FROM "Institution" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "Announcement"
SET "institutionId" = (SELECT "id" FROM first_institution)
WHERE "institutionId" IS NULL
  AND EXISTS (SELECT 1 FROM first_institution);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DemoRequest_demoInstitutionId_fkey'
  ) THEN
    ALTER TABLE "DemoRequest"
    ADD CONSTRAINT "DemoRequest_demoInstitutionId_fkey"
    FOREIGN KEY ("demoInstitutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Announcement_institutionId_fkey'
  ) THEN
    ALTER TABLE "Announcement"
    ADD CONSTRAINT "Announcement_institutionId_fkey"
    FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DemoRequest_email_idx" ON "DemoRequest"("email");
CREATE INDEX IF NOT EXISTS "DemoRequest_status_idx" ON "DemoRequest"("status");
CREATE INDEX IF NOT EXISTS "DemoRequest_demoInstitutionId_idx" ON "DemoRequest"("demoInstitutionId");
CREATE INDEX IF NOT EXISTS "DemoRequest_createdAt_idx" ON "DemoRequest"("createdAt");
CREATE INDEX IF NOT EXISTS "Announcement_institutionId_isActive_createdAt_idx" ON "Announcement"("institutionId", "isActive", "createdAt");
