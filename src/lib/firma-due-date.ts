export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0);
}

export function paymentTermDays(paymentTerms?: string | null, customPaymentDays?: number | null) {
  if (paymentTerms === "COD") return 0;
  if (paymentTerms === "NET_15") return 15;
  if (paymentTerms === "NET_60") return 60;
  if (paymentTerms === "NET_90") return 90;
  if (paymentTerms === "NET_120") return 120;
  if (paymentTerms === "CUSTOM") return Number(customPaymentDays) || 0;
  return 30;
}

export function resolveDueDate(
  transactionDate: Date,
  islemTipi: string,
  dueDate: string | null | undefined,
  firma: { paymentTerms?: string | null; customPaymentDays?: number | null },
) {
  if (islemTipi === "ODEME") return null;
  if (dueDate) return new Date(dueDate);
  if (firma.paymentTerms === "EOM") return endOfMonth(transactionDate);
  return addDays(transactionDate, paymentTermDays(firma.paymentTerms, firma.customPaymentDays));
}
