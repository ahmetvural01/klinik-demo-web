import type { PaymentMethod, Prisma } from "@prisma/client";
import { applyTaksitIntegration } from "@/lib/taksit-integration";

type CreatePaymentInput = {
  tx: Prisma.TransactionClient;
  patientId?: string | null;
  doctorId?: string | null;
  method: PaymentMethod;
  amount: number;
  description?: string | null;
  posId?: string | null;
};

export async function createIntegratedPayment({
  tx,
  patientId,
  doctorId,
  method,
  amount,
  description,
  posId,
}: CreatePaymentInput) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Ödeme tutarı pozitif olmalı");
  }

  const payment = await tx.payment.create({
    data: {
      patientId: patientId || null,
      doctorId: doctorId || null,
      method,
      amount,
      description: description || null,
      posId: posId || null,
    },
    include: { patient: { select: { id: true, fullName: true } } },
  });

  const taksitInfo = patientId
    ? await applyTaksitIntegration(tx, patientId, amount, method, posId || null)
    : null;

  return { payment, taksitInfo };
}
