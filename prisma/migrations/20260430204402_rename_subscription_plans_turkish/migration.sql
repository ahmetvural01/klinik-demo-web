/*
  Warnings:

  - The values [STARTER,PROFESSIONAL,ENTERPRISE] on the enum `SubscriptionPlan` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum: önce mevcut veriyi güncelle, sonra enum tipini değiştir
-- Mevcut satırlardaki eski değerleri geçici olarak text'e çevir
ALTER TABLE "Institution" ALTER COLUMN "subscriptionPlan" DROP DEFAULT;
ALTER TABLE "Institution" ALTER COLUMN "subscriptionPlan" TYPE TEXT;
-- Eski İngilizce değerleri Türkçe karşılıklarına güncelle
UPDATE "Institution" SET "subscriptionPlan" = 'TEMEL' WHERE "subscriptionPlan" = 'STARTER';
UPDATE "Institution" SET "subscriptionPlan" = 'PROFESYONEL' WHERE "subscriptionPlan" = 'PROFESSIONAL';
UPDATE "Institution" SET "subscriptionPlan" = 'KURUMSAL' WHERE "subscriptionPlan" = 'ENTERPRISE';
-- Yeni enum tipini oluştur
CREATE TYPE "SubscriptionPlan_new" AS ENUM ('TEMEL', 'PROFESYONEL', 'KURUMSAL');
-- Kolonu yeni enum tipine çevir
ALTER TABLE "Institution" ALTER COLUMN "subscriptionPlan" TYPE "SubscriptionPlan_new" USING ("subscriptionPlan"::"SubscriptionPlan_new");
-- Eski enum tipini yeniden adlandır ve sil
ALTER TYPE "SubscriptionPlan" RENAME TO "SubscriptionPlan_old";
ALTER TYPE "SubscriptionPlan_new" RENAME TO "SubscriptionPlan";
DROP TYPE "SubscriptionPlan_old";
-- Default değeri ayarla
ALTER TABLE "Institution" ALTER COLUMN "subscriptionPlan" SET DEFAULT 'TEMEL';
