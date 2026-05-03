import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

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
    return NextResponse.json({ message: "Klinik ve paket secimi zorunlu" }, { status: 400 });
  }

  const quantity = Number(body.quantity ?? 1);
  const dueDays = Number(body.dueDays ?? 7);

  if (!Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json({ message: "Gecersiz adet" }, { status: 400 });
  }

  const [institution, smsPackage] = await Promise.all([
    prisma.institution.findUnique({ where: { id: body.institutionId } }),
    prisma.smsPackage.findUnique({ where: { id: body.smsPackageId } }),
  ]);

  if (!institution || !smsPackage) {
    return NextResponse.json({ message: "Klinik veya paket bulunamadi" }, { status: 404 });
  }

  const smsToAdd = smsPackage.smsCount * quantity;
  const totalPrice = Number(smsPackage.price) * quantity;
  const before = institution.smsBalance;
  const after = before + smsToAdd;

  const wallet = await prisma.platformSmsWallet.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, availableBalance: 0 },
  });

  if (wallet.availableBalance < smsToAdd) {
    return NextResponse.json({
      message: `Platform SMS stogu yetersiz. Gerekli: ${smsToAdd}, Mevcut: ${wallet.availableBalance}`,
    }, { status: 400 });
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueDays);

  const invoiceNo = `INV-${Date.now()}`;

  const result = await prisma.$transaction(async (tx) => {
    const updatedWallet = await tx.platformSmsWallet.update({
      where: { id: wallet.id },
      data: { availableBalance: { decrement: smsToAdd } },
    });

    const updatedInstitution = await tx.institution.update({
      where: { id: institution.id },
      data: { smsBalance: after },
    });

    const transaction = await tx.smsTransaction.create({
      data: {
        institutionId: institution.id,
        smsPackageId: smsPackage.id,
        quantity,
        totalPrice,
        balanceBefore: before,
        balanceAfter: after,
        status: "COMPLETED",
      },
    });

    const invoice = await tx.invoice.create({
      data: {
        institutionId: institution.id,
        invoiceNo,
        amount: totalPrice,
        description: `${smsPackage.name} paketi x ${quantity} adet`,
        status: "PENDING",
        dueDate,
      },
    });

    return { updatedWallet, updatedInstitution, transaction, invoice };
  });

  await writeAudit(
    auth.user.id,
    "SMS_PACKAGE_SALE",
    `${institution.name} icin ${smsToAdd} SMS satildi. Paket: ${smsPackage.name}, Adet: ${quantity}, Tutar: ${totalPrice}`
  );

  return NextResponse.json({
    message: `${institution.name} klinigine ${smsToAdd} SMS kredisi tanimlandi`,
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
