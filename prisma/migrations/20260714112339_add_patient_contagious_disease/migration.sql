-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "hasContagiousDisease" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contagiousDiseaseNote" TEXT;
