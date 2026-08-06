-- Serbest String durum/tip alanları enum'a çevriliyor (bkz. denetim raporu —
-- sabit bir değer kümesi olmasına rağmen DB seviyesinde korunmuyordu, bir
-- yazım hatası hiç yakalanmadan kaydedilebilirdi). Mevcut veriler korunur:
-- DROP+ADD yerine USING dönüşümüyle mevcut değerler yeni enum'a taşınır.

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('BEKLIYOR', 'GELDI', 'TAMAMLANDI', 'GELMEDI', 'IPTAL', 'ONAYLANDI');

-- CreateEnum
CREATE TYPE "AktifIptalStatus" AS ENUM ('AKTIF', 'IPTAL');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('GIRIS', 'CIKIS');

-- AlterTable: Appointment.status (veri korunarak)
ALTER TABLE "Appointment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Appointment" ALTER COLUMN "status" TYPE "AppointmentStatus" USING ("status"::"AppointmentStatus");
ALTER TABLE "Appointment" ALTER COLUMN "status" SET DEFAULT 'BEKLIYOR';

-- AlterTable: Expense.status (veri korunarak)
ALTER TABLE "Expense" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Expense" ALTER COLUMN "status" TYPE "AktifIptalStatus" USING ("status"::"AktifIptalStatus");
ALTER TABLE "Expense" ALTER COLUMN "status" SET DEFAULT 'AKTIF';

-- AlterTable: FirmaIslem.status (veri korunarak)
ALTER TABLE "FirmaIslem" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "FirmaIslem" ALTER COLUMN "status" TYPE "AktifIptalStatus" USING ("status"::"AktifIptalStatus");
ALTER TABLE "FirmaIslem" ALTER COLUMN "status" SET DEFAULT 'AKTIF';

-- AlterTable: Purchase.status (veri korunarak)
ALTER TABLE "Purchase" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Purchase" ALTER COLUMN "status" TYPE "AktifIptalStatus" USING ("status"::"AktifIptalStatus");
ALTER TABLE "Purchase" ALTER COLUMN "status" SET DEFAULT 'AKTIF';

-- AlterTable: StockMovement.type (veri korunarak, default yok)
ALTER TABLE "StockMovement" ALTER COLUMN "type" TYPE "StockMovementType" USING ("type"::"StockMovementType");
