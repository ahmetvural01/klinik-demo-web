type TxClient = any;

const toCents = (value: unknown) => Math.round(Number(value || 0) * 100);
const fromCents = (value: number) => Math.round(value) / 100;

type RebuildOptions = {
  preferredDebtByPayment?: Map<string, string[]>;
};

export async function rebuildFirmaPaymentAllocations(
  tx: TxClient,
  firmaId: string,
  options: RebuildOptions = {},
) {
  const [debts, payments, existing] = await Promise.all([
    tx.firmaIslem.findMany({
      where: {
        firmaId,
        status: "AKTIF",
        islemTipi: { in: ["ALIM", "HIZMET"] },
      },
      select: { id: true, tutar: true },
      orderBy: [{ tarih: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    tx.firmaIslem.findMany({
      where: {
        firmaId,
        status: "AKTIF",
        islemTipi: "ODEME",
      },
      select: { id: true, tutar: true },
      orderBy: [{ tarih: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    tx.firmaPaymentAllocation.findMany({
      where: { firmaId },
      select: { paymentIslemId: true, debtIslemId: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const existingPreference = new Map<string, string[]>();
  for (const allocation of existing) {
    const list = existingPreference.get(allocation.paymentIslemId) || [];
    if (!list.includes(allocation.debtIslemId)) list.push(allocation.debtIslemId);
    existingPreference.set(allocation.paymentIslemId, list);
  }

  await tx.firmaPaymentAllocation.deleteMany({ where: { firmaId } });

  const debtRemaining = new Map<string, number>(
    debts.map((debt: { id: string; tutar: unknown }) => [debt.id, toCents(debt.tutar)]),
  );
  const debtIds = debts.map((debt: { id: string }) => debt.id);
  const rows: Array<{
    firmaId: string;
    paymentIslemId: string;
    debtIslemId: string;
    tutar: number;
  }> = [];

  for (const payment of payments) {
    let paymentRemaining = toCents(payment.tutar);
    const orderedDebtIds = Array.from(new Set([
      ...(options.preferredDebtByPayment?.get(payment.id) || []),
      ...(existingPreference.get(payment.id) || []),
      ...debtIds,
    ]));

    for (const debtId of orderedDebtIds) {
      if (paymentRemaining <= 0) break;
      const remaining = debtRemaining.get(debtId) || 0;
      if (remaining <= 0) continue;
      const allocated = Math.min(paymentRemaining, remaining);
      rows.push({
        firmaId,
        paymentIslemId: payment.id,
        debtIslemId: debtId,
        tutar: fromCents(allocated),
      });
      debtRemaining.set(debtId, remaining - allocated);
      paymentRemaining -= allocated;
    }
  }

  if (rows.length > 0) {
    await tx.firmaPaymentAllocation.createMany({ data: rows });
  }

  return {
    allocationCount: rows.length,
    allocatedTotal: fromCents(rows.reduce((sum, row) => sum + toCents(row.tutar), 0)),
    unallocatedPaymentTotal: fromCents(
      payments.reduce((sum: number, payment: { tutar: unknown }) => sum + toCents(payment.tutar), 0)
      - rows.reduce((sum, row) => sum + toCents(row.tutar), 0),
    ),
  };
}

export async function getDebtPaymentSummary(tx: TxClient, debtIslemId: string) {
  const debt = await tx.firmaIslem.findUnique({
    where: { id: debtIslemId },
    select: {
      tutar: true,
      debtAllocations: {
        where: {
          paymentIslem: { status: "AKTIF", islemTipi: "ODEME" },
        },
        include: {
          paymentIslem: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!debt) return null;

  const payments = debt.debtAllocations.map((allocation: any) => ({
    id: allocation.paymentIslem.id,
    tarih: allocation.paymentIslem.tarih,
    tutar: Number(allocation.tutar),
    yontem: allocation.paymentIslem.yontem,
  }));
  const total = fromCents(toCents(debt.tutar));
  const paidTotal = fromCents(
    debt.debtAllocations.reduce(
      (sum: number, allocation: { tutar: unknown }) => sum + toCents(allocation.tutar),
      0,
    ),
  );
  const remaining = fromCents(Math.max(0, toCents(total) - toCents(paidTotal)));

  return { total, paidTotal, remaining, payments };
}
