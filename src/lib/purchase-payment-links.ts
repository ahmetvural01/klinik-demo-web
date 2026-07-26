import { getDebtPaymentSummary } from "@/lib/firma-payment-allocation";

type TxClient = any;

export const PURCHASE_PAYMENT_PREFIX = "[SISTEM:PURCHASE_PAYMENT:";
export const FIRMA_ISLEM_PREFIX = "[SISTEM:FIRMA_ISLEM:";

export function purchasePaymentToken(purchaseId: string) {
  return `${PURCHASE_PAYMENT_PREFIX}${purchaseId}]`;
}

export function firmaIslemToken(islemId: string) {
  return `${FIRMA_ISLEM_PREFIX}${islemId}]`;
}

export async function findPurchasePayments(
  tx: TxClient,
  purchaseId: string,
  firmaId?: string | null,
  debtIslemId?: string | null,
) {
  if (debtIslemId) {
    const summary = await getDebtPaymentSummary(tx, debtIslemId);
    if (summary) return summary.payments;
  }
  return tx.firmaIslem.findMany({
    where: {
      ...(firmaId ? { firmaId } : {}),
      islemTipi: "ODEME",
      status: "AKTIF",
      aciklama: { contains: purchasePaymentToken(purchaseId) },
    },
    orderBy: { tarih: "asc" },
  });
}

export function sumPurchasePayments(payments: { tutar: unknown }[]) {
  return Math.round(payments.reduce((sum, payment) => sum + Number(payment.tutar || 0), 0) * 100) / 100;
}
