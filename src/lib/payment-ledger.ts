import type { PaymentMethod, Prisma } from "@prisma/client";
import { applyTaksitIntegration, reverseTaksitIntegrationForPayment } from "@/lib/taksit-integration";

type CreatePaymentInput = {
  tx: Prisma.TransactionClient;
  institutionId: string;
  requestKey?: string | null;
  patientId?: string | null;
  doctorId?: string | null;
  method: PaymentMethod;
  amount: number;
  description?: string | null;
  posId?: string | null;
  createdAt?: string | Date | null;
};

function paymentSnapshot(payment: {
  institutionId: string;
  patientId: string | null;
  doctorId: string | null;
  method: PaymentMethod;
  amount: Prisma.Decimal;
  description: string | null;
  posId: string | null;
  status: string;
  createdAt: Date;
}) {
  return {
    institutionId: payment.institutionId,
    patientId: payment.patientId,
    doctorId: payment.doctorId,
    method: payment.method,
    amount: payment.amount.toString(),
    description: payment.description,
    posId: payment.posId,
    status: payment.status,
    createdAt: payment.createdAt.toISOString(),
  };
}

export function toPublicPayment<T extends { requestKey?: string | null }>(payment: T) {
  const { requestKey: _requestKey, ...publicPayment } = payment;
  return publicPayment;
}

export async function createIntegratedPayment({
  tx,
  institutionId,
  requestKey,
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
      institutionId,
      requestKey: requestKey || null,
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
    ? await applyTaksitIntegration(tx, patientId, amount, method, posId || null, payment.createdAt, payment.id, doctorId || null)
    : null;

  return { payment, taksitInfo };
}

export async function deleteIntegratedPayment(
  tx: Prisma.TransactionClient,
  paymentId: string,
  actorId?: string | null,
  reason?: string | null,
) {
  const existing = await tx.payment.findUnique({ where: { id: paymentId } });
  if (!existing || existing.status !== "ACTIVE") throw new Error("Aktif ödeme bulunamadı");
  const taksitReverseInfo = await reverseTaksitIntegrationForPayment(tx, paymentId);
  const payment = await tx.payment.update({
    where: { id: paymentId },
    data: {
      status: "VOID",
      voidedAt: new Date(),
      voidedById: actorId || null,
      voidReason: reason || "Tahsilat iptal edildi.",
    },
  });
  await tx.paymentRevision.create({
    data: {
      paymentId,
      actorId: actorId || null,
      action: "VOID",
      beforeData: paymentSnapshot(existing),
      afterData: paymentSnapshot(payment),
      reason: reason || "Tahsilat iptal edildi.",
    },
  });
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
  actorId,
  reason,
}: {
  tx: Prisma.TransactionClient;
  paymentId: string;
  method?: PaymentMethod;
  amount?: number;
  description?: string | null;
  posId?: string | null;
  createdAt?: string | Date | null;
  doctorId?: string | null;
  actorId?: string | null;
  reason?: string | null;
}) {
  const existing = await tx.payment.findUnique({ where: { id: paymentId } });
  if (!existing) throw new Error("Ödeme bulunamadı");
  if (existing.status !== "ACTIVE") throw new Error("İptal edilmiş ödeme düzenlenemez");

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
  const nextDoctorId = doctorId !== undefined ? (doctorId || null) : existing.doctorId;

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

  await tx.paymentRevision.create({
    data: {
      paymentId,
      actorId: actorId || null,
      action: "UPDATE",
      beforeData: paymentSnapshot(existing),
      afterData: paymentSnapshot(payment),
      reason: reason || "Tahsilat bilgileri güncellendi.",
    },
  });

  if (shouldReapply && existing.patientId) {
    taksitInfo = await applyTaksitIntegration(tx, existing.patientId, nextAmount, nextMethod, nextPosId || null, nextCreatedAt, payment.id, nextDoctorId);
  }

  return { payment, taksitReverseInfo, taksitInfo };
}
