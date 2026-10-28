import { NextRequest, NextResponse } from "next/server";
import { invalidateInstitutionCache, requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { SmsPackageSaleError, sellSmsPackage } from "@/lib/sms-package-sale";

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const body = await request.json() as {
    institutionId?: string;
    smsPackageId?: string;
    quantity?: number;
    dueDays?: number;
  };

  if (!body.institutionId || !body.smsPackageId) {
    return NextResponse.json({ message: "Klinik ve paket seçimi zorunlu" }, { status: 400 });
  }

  const quantity = Number(body.quantity ?? 1);
  const dueDays = Number(body.dueDays ?? 7);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
    return NextResponse.json({ message: "Geçersiz adet" }, { status: 400 });
  }
  if (!Number.isInteger(dueDays) || dueDays < 1 || dueDays > 3650) {
    return NextResponse.json({ message: "Vade günü 1-3650 arasında tam sayı olmalı" }, { status: 400 });
  }

  const [institution, smsPackage] = await Promise.all([
    prisma.institution.findUnique({ where: { id: body.institutionId } }),
    prisma.smsPackage.findUnique({ where: { id: body.smsPackageId } }),
  ]);

  if (!institution || !smsPackage || !institution.isActive || !smsPackage.isActive) {
    return NextResponse.json({ message: "Klinik kapalı ya da paket pasif; satış yapılamaz" }, { status: 404 });
  }

  let result;
  try {
    result = await sellSmsPackage({ institutionId: institution.id, smsPackageId: smsPackage.id, quantity, dueDays });
  } catch (error) {
    if (error instanceof SmsPackageSaleError) {
      if (error.code === "INSUFFICIENT_STOCK") {
        return NextResponse.json({
          message: `Platform SMS stoğu yetersiz. Gerekli: ${(smsPackage.smsCount * quantity).toLocaleString("tr-TR")}, stokta: ${error.available.toLocaleString("tr-TR")}. Önce SMS Yönetimi › Stok'tan stok ekleyin.`,
        }, { status: 400 });
      }
      if (error.code === "TARGET_INACTIVE") {
        return NextResponse.json({ message: "Klinik veya SMS paketi artık aktif değil" }, { status: 409 });
      }
      return NextResponse.json({ message: "SMS satışı başka bir işlemle çakıştı. Tekrar deneyin." }, { status: 409 });
    }
    throw error;
  }
  const { smsToAdd, totalPrice } = result;

  invalidateInstitutionCache(institution.id);

  await writeAudit(
    auth.user.id,
    "SMS_PACKAGE_SALE",
    `${institution.name} için ${smsToAdd} SMS satıldı. Paket: ${smsPackage.name}, Adet: ${quantity}, Tutar: ${totalPrice.toLocaleString("tr-TR")} TL`
  );

  return NextResponse.json({
    message: `${institution.name} kliniğine ${smsToAdd} SMS kredisi tanımlandı`,
    platformAvailableBalance: result.updatedWallet.availableBalance,
    institution: {
      id: result.updatedInstitution.id,
      name: result.updatedInstitution.name,
      smsBalance: result.updatedInstitution.smsBalance,
    },
    transactionId: result.transaction.id,
    invoiceId: result.invoice.id,
  });
}
