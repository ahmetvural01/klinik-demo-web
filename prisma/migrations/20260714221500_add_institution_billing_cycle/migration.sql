-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('AYLIK', 'YILLIK');

-- AlterTable
ALTER TABLE "Institution" ADD COLUMN "billingCycle" "BillingCycle" NOT NULL DEFAULT 'AYLIK';
