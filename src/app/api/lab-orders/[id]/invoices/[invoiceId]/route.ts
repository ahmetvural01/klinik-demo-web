import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeInstitution, requireAuth, writeAudit } from "@/lib/api";
import {
  applyLabInvoiceFirmaIntegration,
  labSourceToken,
  reverseLabInvoiceFirmaIntegration,
} from "@/lib/lab-firma-integration";
import { formatZodError, labInvoiceUpdateSchema } from "@/lib/validators";
import { rebuildFirmaPaymentAllocations } from "@/lib/firma-payment-allocation";

type RouteParams = { params: Promise<{ id: string; invoiceId: string }> };

function publicOrder(order: any) {
  if (!order) return order;
  const { requestKey: _orderRequestKey, ...rest } = order;
  return {
    ...rest,
    invoices: (rest.invoices || []).map(({ requestKey: _requestKey, ...invoice }: any) => invoice),
  };
}

async function loadInvoice(id: string, invoiceId: string, institutionId: string | null) {
  return (prisma as any).labOrderInvoice.findFirst({
    where: {
      id: invoiceId,
      labOrderId: id,
      ...(institutionId ? { labOrder: { patient: { institutionId } } } : {}),
    },
    include: {
      labOrder: {
        select: {
          id: true,
          firmaId: true,
          labName: true,
          labType: true,
          status: true,
          patient: { select: { fullName: true } },
        },
      },
    },
  });
}

async function loadFreshOrder(tx: any, id: string) {
  const order = await tx.labOrder.findUnique({
    where: { id },
    include: {
      invoices: { orderBy: { issuedAt: "asc" } },
      patient: { select: { id: true, fullName: true, phone: true } },
      doctor: { select: { id: true, fullName: true } },
      trips: { orderBy: { order: "asc" } },
    },
  });
  return publicOrder(order);
}

async function updateOrderInvoiceSummary(tx: any, orderId: string) {
  const [total, latest] = await Promise.all([
    tx.labOrderInvoice.aggregate({
      where: { labOrderId: orderId },
      _sum: { amount: true },
    }),
    tx.labOrderInvoice.findFirst({
      where: { labOrderId: orderId },
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      select: { invoiceNo: true },
    }),
  ]);
  await tx.labOrder.update({
    where: { id: orderId },
    data: {
      price: Number(total._sum.amount || 0),
      invoiceNo: latest?.invoiceNo || null,
    },
  });
}

async function assertDebtReductionAllowed(tx: any, invoice: any, nextAmount: number) {
  const reduction = Math.max(0, Number(invoice.amount) - nextAmount);
  if (reduction <= 0) return;

  const source = await tx.firmaIslem.findFirst({
    where: {
      status: "AKTIF",
      aciklama: { contains: labSourceToken({ labInvoiceId: invoice.id }) },
    },
    select: { firmaId: true },
  });
  const firmaId = source?.firmaId || invoice.labOrder.firmaId;
  if (!firmaId) return;

  await tx.$queryRaw`SELECT "id" FROM "Firma" WHERE "id" = ${firmaId} FOR UPDATE`;
  const rows = await tx.firmaIslem.groupBy({
    by: ["islemTipi"],
    where: { firmaId, status: "AKTIF" },
    _sum: { tutar: true },
  });
  const balance = Math.round(rows.reduce((sum: number, row: any) => {
    const amount = Number(row._sum.tutar || 0);
    return sum + (row.islemTipi === "ODEME" ? -amount : amount);
  }, 0) * 100) / 100;

  if (balance - reduction < 0) {
    throw new Error(
      "Bu düzeltme firma bakiyesini eksiye düşürür. Önce bu faturaya ilişkin firma ödemesini düzeltin veya iptal edin.",
    );
  }
}

export async function PATCH(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  const auth = await requireAuth("lab:write");
  if (auth.error) return auth.error;

  const invoice = await loadInvoice(params.id, params.invoiceId, auth.user.institutionId);
  if (!invoice) return NextResponse.json({ error: "Laboratuvar faturası bulunamadı" }, { status: 404 });

  const parsed = labInvoiceUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Fatura bilgileri geçersiz", errors: formatZodError(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const fresh = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT "id" FROM "LabOrder" WHERE "id" = ${params.id} FOR UPDATE`;
      await assertDebtReductionAllowed(tx, invoice, parsed.data.amount);
      const oldDebt = await tx.firmaIslem.findFirst({
        where: {
          status: "AKTIF",
          aciklama: { contains: labSourceToken({ labInvoiceId: invoice.id }) },
        },
        select: {
          firmaId: true,
          debtAllocations: { select: { paymentIslemId: true } },
        },
      });
      await reverseLabInvoiceFirmaIntegration(tx, auth.user.id, { labInvoiceId: invoice.id });

      const updated = await tx.labOrderInvoice.update({
        where: { id: invoice.id },
        data: {
          item: parsed.data.item,
          amount: parsed.data.amount,
          invoiceNo: parsed.data.invoiceNo || null,
          issuedAt: parsed.data.issuedAt ? new Date(parsed.data.issuedAt) : invoice.issuedAt,
          note: parsed.data.note || null,
        },
      });

      const integration = await applyLabInvoiceFirmaIntegration({
        tx,
        userId: auth.user.id,
        institutionId: auth.user.institutionId || null,
        labName: invoice.labOrder.labName,
        labType: invoice.labOrder.labType,
        patientName: invoice.labOrder.patient?.fullName || null,
        item: updated.item,
        amount: Number(updated.amount),
        invoiceNo: updated.invoiceNo,
        issuedAt: updated.issuedAt,
        note: updated.note,
        labOrderId: params.id,
        labInvoiceId: updated.id,
        firmaId: invoice.labOrder.firmaId,
      });
      if (integration && !invoice.labOrder.firmaId) {
        await tx.labOrder.update({
          where: { id: params.id },
          data: { firmaId: integration.firmaId },
        });
      }
      if (integration && oldDebt?.debtAllocations.length) {
        await rebuildFirmaPaymentAllocations(tx, integration.firmaId, {
          preferredDebtByPayment: new Map(
            oldDebt.debtAllocations.map(
              (allocation: { paymentIslemId: string }) => [
                allocation.paymentIslemId,
                [integration.islemId],
              ],
            ),
          ),
        });
      }

      await updateOrderInvoiceSummary(tx, params.id);
      return loadFreshOrder(tx, params.id);
    });

    await writeAudit(auth.user.id, "LAB_ORDER_INVOICE_UPDATE", `Laboratuvar faturası düzeltildi (${params.invoiceId})`);
    await bumpRealtimeInstitution(auth.user.institutionId || null);
    return NextResponse.json(fresh);
  } catch (error) {
    console.error("[lab invoice PATCH]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Laboratuvar faturası güncellenemedi" },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: NextRequest, props: RouteParams) {
  const params = await props.params;
  const auth = await requireAuth("lab:write");
  if (auth.error) return auth.error;

  const invoice = await loadInvoice(params.id, params.invoiceId, auth.user.institutionId);
  if (!invoice) return NextResponse.json({ error: "Laboratuvar faturası bulunamadı" }, { status: 404 });

  try {
    const fresh = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT "id" FROM "LabOrder" WHERE "id" = ${params.id} FOR UPDATE`;
      await assertDebtReductionAllowed(tx, invoice, 0);
      await reverseLabInvoiceFirmaIntegration(tx, auth.user.id, { labInvoiceId: invoice.id });
      await tx.labOrderInvoice.delete({ where: { id: invoice.id } });
      await updateOrderInvoiceSummary(tx, params.id);
      return loadFreshOrder(tx, params.id);
    });

    await writeAudit(auth.user.id, "LAB_ORDER_INVOICE_CANCEL", `Laboratuvar faturası iptal edildi (${params.invoiceId})`);
    await bumpRealtimeInstitution(auth.user.institutionId || null);
    return NextResponse.json(fresh);
  } catch (error) {
    console.error("[lab invoice DELETE]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Laboratuvar faturası iptal edilemedi" },
      { status: 400 },
    );
  }
}
