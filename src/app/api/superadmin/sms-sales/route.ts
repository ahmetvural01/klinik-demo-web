import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
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
    return NextResponse.json({ message: "Klinik veya paket bulunamadi" }, { status: 404 });
  }

  const smsToAdd = smsPackage.smsCount * quantity;
  const totalPrice = Number(smsPackage.price) * quantity;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueDays);

  const invoiceNo = `INV-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.platformSmsWallet.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, availableBalance: 0 },
      });
      await tx.$queryRaw`SELECT "id" FROM "PlatformSmsWallet" WHERE "id" = ${wallet.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Institution" WHERE "id" = ${institution.id} FOR UPDATE`;

      const [currentInstitution, currentPackage] = await Promise.all([
        tx.institution.findUnique({ where: { id: institution.id } }),
        tx.smsPackage.findUnique({ where: { id: smsPackage.id } }),
      ]);
      if (!currentInstitution?.isActive || !currentPackage?.isActive) {
        throw new Error("SALE_TARGET_INACTIVE");
      }
      const currentSmsToAdd = currentPackage.smsCount * quantity;
      const currentTotalPrice = Number(currentPackage.price) * quantity;

      // Bakiye kontrolü ile düşme aynı atomik güncellemede yapılır — aksi
      // halde iki eşzamanlı satış isteği ikisi de "yeterli bakiye var"
      // kontrolünü geçip cüzdanı negatife düşürebilir (TOCTOU yarış koşulu).
      const decremented = await tx.platformSmsWallet.updateMany({
        where: { id: wallet.id, availableBalance: { gte: currentSmsToAdd } },
        data: { availableBalance: { decrement: currentSmsToAdd } },
      });

      if (decremented.count === 0) {
        const current = await tx.platformSmsWallet.findUniqueOrThrow({ where: { id: wallet.id } });
        throw new Error(`INSUFFICIENT_STOCK:${current.availableBalance}`);
      }

      const updatedWallet = await tx.platformSmsWallet.findUniqueOrThrow({ where: { id: wallet.id } });

      const updatedInstitution = await tx.institution.update({
        where: { id: institution.id },
        data: { smsBalance: { increment: currentSmsToAdd } },
      });
      const balanceBefore = updatedInstitution.smsBalance - currentSmsToAdd;

      const transaction = await tx.smsTransaction.create({
        data: {
          institutionId: institution.id,
          smsPackageId: smsPackage.id,
          quantity,
          totalPrice: currentTotalPrice,
          balanceBefore,
          balanceAfter: updatedInstitution.smsBalance,
          status: "COMPLETED",
        },
      });

      const invoice = await tx.invoice.create({
        data: {
          institutionId: institution.id,
          invoiceNo,
          amount: currentTotalPrice,
          description: `${currentPackage.name} paketi x ${quantity} adet`,
          status: "PENDING",
          dueDate,
        },
      });

      return { updatedWallet, updatedInstitution, transaction, invoice };
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg.startsWith("INSUFFICIENT_STOCK:")) {
      const current = msg.split(":")[1];
      return NextResponse.json({
        message: `Platform SMS stogu yetersiz. Gerekli: ${smsToAdd}, Mevcut: ${current}`,
      }, { status: 400 });
    }
    if (msg === "SALE_TARGET_INACTIVE") {
      return NextResponse.json({ message: "Klinik veya SMS paketi artık aktif değil" }, { status: 409 });
    }
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2034") {
      return NextResponse.json({ message: "SMS satışı başka bir işlemle çakıştı. Tekrar deneyin." }, { status: 409 });
    }
    throw error;
  }

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
