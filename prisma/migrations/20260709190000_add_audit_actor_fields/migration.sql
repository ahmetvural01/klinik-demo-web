-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "actorRole" TEXT,
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "isGhost" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
