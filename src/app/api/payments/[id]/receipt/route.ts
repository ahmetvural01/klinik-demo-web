import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { computePatientBalances } from "@/lib/patient-balance";
import { paymentMethodLabel } from "@/lib/payment-methods";

type Params = { params: Promise<{ id: string }> };

/**
 * Tahsilat makbuzu: hastaya verilecek ödeme belgesinin bilgisi (resmî fatura
 * değildir). Hasta adı, tutar, yöntem (ve POS), tarih, açıklama, hekim ve
 * hastanın bu andaki kalan borcu. Tahsilatı görebilen herkes yazdırabilir.
 */
export async function GET(_request: NextRequest, props: Params) {
  const { id } = await props.params;
  const auth = await requireAuth("payments:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı" }, { status: 403 });

  const payment = await prisma.payment.findFirst({
    where: { id, institutionId, branchId: branch.branchId, status: "ACTIVE" },
    select: {
      id: true,
      amount: true,
      method: true,
      description: true,
      createdAt: true,
      patientId: true,
      patient: { select: { fullName: true } },
      doctor: { select: { fullName: true } },
      pos: { select: { name: true } },
    },
  });
  if (!payment) return NextResponse.json({ message: "Tahsilat bulunamadı ya da iptal edilmiş." }, { status: 404 });

  const balances = payment.patientId
    ? await computePatientBalances({ institutionId, branchId: branch.branchId, patientIds: [payment.patientId] })
    : null;
  const remaining = payment.patientId ? balances?.get(payment.patientId)?.bakiye : null;

  return NextResponse.json({
    receiptNo: payment.id.slice(-8).toUpperCase(),
    amount: Number(payment.amount),
    method: paymentMethodLabel(payment.method),
    posName: payment.pos?.name || null,
    description: payment.description || null,
    date: payment.createdAt,
    patientName: payment.patient?.fullName || null,
    doctorName: payment.doctor?.fullName || null,
    remaining: remaining === null || remaining === undefined ? null : Number(remaining),
  });
}
