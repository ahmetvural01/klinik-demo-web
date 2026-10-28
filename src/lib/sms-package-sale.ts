import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { syncInstitutionPaymentGate } from "@/lib/billing";
import { turkeyDateKey, turkeyDayRangeUtc } from "@/lib/tz";

export type SmsPackageSaleErrorCode = "INSUFFICIENT_STOCK" | "TARGET_INACTIVE" | "CONFLICT";

export class SmsPackageSaleError extends Error {
  constructor(public readonly code: SmsPackageSaleErrorCode, public readonly available = 0) {
    super(code);
  }
}

/**
 * SMS paketi satışı — süperadmin satışı (Klinik dosyası › Paket sat) ve
 * kliniğin kendi alımı (İletişim › SMS paketi al) AYNI işlemi kullanır:
 * platform stoğundan düşülür, kliniğin bakiyesine eklenir, satış kaydı ve
 * vadeli fatura açılır; fatura vadesi kliniğin ödeme takibine girer.
 */
export async function sellSmsPackage(params: { institutionId: string; smsPackageId: string; quantity: number; dueDays: number }) {
  const { institutionId, smsPackageId, quantity, dueDays } = params;
  const dueDate = turkeyDayRangeUtc(turkeyDateKey(new Date(Date.now() + dueDays * 86_400_000))).end;
  const invoiceNo = `INV-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;

  try {
    return await prisma.$transaction(async (tx) => {
      const wallet = await tx.platformSmsWallet.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, availableBalance: 0 },
      });
      await tx.$queryRaw`SELECT "id" FROM "PlatformSmsWallet" WHERE "id" = ${wallet.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Institution" WHERE "id" = ${institutionId} FOR UPDATE`;

      const [institution, smsPackage] = await Promise.all([
        tx.institution.findUnique({ where: { id: institutionId }, select: { id: true, name: true, isActive: true } }),
        tx.smsPackage.findUnique({ where: { id: smsPackageId } }),
      ]);
      if (!institution?.isActive || !smsPackage?.isActive) throw new SmsPackageSaleError("TARGET_INACTIVE");

      const smsToAdd = smsPackage.smsCount * quantity;
      const totalPrice = Number(smsPackage.price) * quantity;

      const decremented = await tx.platformSmsWallet.updateMany({
        where: { id: wallet.id, availableBalance: { gte: smsToAdd } },
        data: { availableBalance: { decrement: smsToAdd } },
      });
      if (decremented.count === 0) {
        const current = await tx.platformSmsWallet.findUniqueOrThrow({ where: { id: wallet.id } });
        throw new SmsPackageSaleError("INSUFFICIENT_STOCK", current.availableBalance);
      }
      const updatedWallet = await tx.platformSmsWallet.findUniqueOrThrow({ where: { id: wallet.id } });

      const updatedInstitution = await tx.institution.update({
        where: { id: institutionId },
        data: { smsBalance: { increment: smsToAdd } },
        select: { id: true, name: true, smsBalance: true },
      });

      const transaction = await tx.smsTransaction.create({
        data: {
          institutionId,
          smsPackageId: smsPackage.id,
          quantity,
          totalPrice,
          balanceBefore: updatedInstitution.smsBalance - smsToAdd,
          balanceAfter: updatedInstitution.smsBalance,
          status: "COMPLETED",
        },
      });

      const invoice = await tx.invoice.create({
        data: {
          institutionId,
          invoiceNo,
          amount: totalPrice,
          description: `${smsPackage.name} paketi x ${quantity} adet`,
          status: "PENDING",
          dueDate,
        },
      });

      await syncInstitutionPaymentGate(institutionId, tx);

      return { updatedWallet, updatedInstitution, transaction, invoice, smsToAdd, totalPrice, packageName: smsPackage.name };
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2034") {
      throw new SmsPackageSaleError("CONFLICT");
    }
    throw error;
  }
}
