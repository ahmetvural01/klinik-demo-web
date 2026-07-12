import type { PaymentMethod, Prisma } from "@prisma/client";
import { applyTaksitIntegration, reverseTaksitIntegrationForPayment } from "@/lib/taksit-integration";

type CreatePaymentInput = {
  tx: Prisma.TransactionClient;
  patientId?: string | null;
  doctorId?: string | null;
  method: PaymentMethod;
  amount: number;
  description?: string | null;
  posId?: string | null;
  createdAt?: string | Date | null;
};

export async function createIntegratedPayment({
  tx,
  patientId,
  doctorId,
  method,
  amount,
  description,
  posId,
  createdAt,
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
      ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
    },
    include: { patient: { select: { id: true, fullName: true } } },
  });

  const taksitInfo = patientId
    ? await applyTaksitIntegration(tx, patientId, amount, method, posId || null, payment.createdAt, payment.id)
    : null;

  return { payment, taksitInfo };
}

export async function deleteIntegratedPayment(tx: Prisma.TransactionClient, paymentId: string) {
  const taksitReverseInfo = await reverseTaksitIntegrationForPayment(tx, paymentId);
  const payment = await tx.payment.delete({ where: { id: paymentId } });
  return { payment, taksitReverseInfo };
}

export async function updateIntegratedPayment({
  tx,
  paymentId,
  method,
  amount,
  description,
  posId,
  createdAt,
  doctorId,
}: {
  tx: Prisma.TransactionClient;
  paymentId: string;
  method?: PaymentMethod;
  amount?: number;
  description?: string | null;
  posId?: string | null;
  createdAt?: string | Date | null;
  doctorId?: string | null;
}) {
  const existing = await tx.payment.findUnique({ where: { id: paymentId } });
  if (!existing) throw new Error("Ödeme bulunamadı");

  const shouldReapply =
    amount !== undefined || method !== undefined || posId !== undefined || createdAt !== undefined;

  let taksitReverseInfo = { reversed: 0, updatedCount: 0 };
  let taksitInfo = null;

  if (shouldReapply) {
    taksitReverseInfo = await reverseTaksitIntegrationForPayment(tx, paymentId);
  }

  const nextAmount = amount !== undefined ? amount : Number(existing.amount);
  const nextMethod = method ?? existing.method;
  const nextPosId = posId !== undefined ? posId : existing.posId;
  const nextCreatedAt = createdAt !== undefined ? (createdAt ? new Date(createdAt) : existing.createdAt) : existing.createdAt;

  const payment = await tx.payment.update({
    where: { id: paymentId },
    data: {
      ...(amount !== undefined && { amount: nextAmount }),
      ...(method !== undefined && { method: nextMethod }),
      ...(description !== undefined && { description }),
      ...(posId !== undefined && { posId: nextPosId }),
      ...(createdAt !== undefined && { createdAt: nextCreatedAt }),
      ...(doctorId !== undefined && { doctorId: doctorId || null }),
    },
  });

  if (shouldReapply && existing.patientId) {
    taksitInfo = await applyTaksitIntegration(tx, existing.patientId, nextAmount, nextMethod, nextPosId || null, nextCreatedAt, payment.id);
  }

  return { payment, taksitReverseInfo, taksitInfo };
}
