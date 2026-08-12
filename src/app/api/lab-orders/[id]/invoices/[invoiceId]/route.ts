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
import { requireActiveBranch } from "@/lib/branch-context";
import { BusinessRuleError, publicErrorResponse } from "@/lib/public-error";

type RouteParams = { params: Promise<{ id: string; invoiceId: string }> };

function publicOrder(order: any) {
  if (!order) return order;
  const { requestKey: _orderRequestKey, ...rest } = order;
  return {
    ...rest,
    invoices: (rest.invoices || []).map(({ requestKey: _requestKey, ...invoice }: any) => invoice),
  };
}

async function loadInvoice(id: string, invoiceId: string, institutionId: string, branchId: string) {
  return (prisma as any).labOrderInvoice.findFirst({
    where: {
      id: invoiceId,
      labOrderId: id,
      status: "ACTIVE",
      labOrder: { institutionId, branchId },
    },
    include: {
      labOrder: {
        select: {
          id: true,
          firmaId: true,
          labName: true,
          labType: true,
          status: true,
          institutionId: true,
          branchId: true,
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
      invoices: { where: { status: "ACTIVE" }, orderBy: { issuedAt: "asc" } },
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
      where: { labOrderId: orderId, status: "ACTIVE" },
      _sum: { amount: true },
    }),
    tx.labOrderInvoice.findFirst({
      where: { labOrderId: orderId, status: "ACTIVE" },
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
      branchId: invoice.labOrder.branchId,
      aciklama: { contains: labSourceToken({ labInvoiceId: invoice.id }) },
    },
    select: { firmaId: true },
  });
  const firmaId = source?.firmaId || invoice.labOrder.firmaId;
  if (!firmaId) return;

  await tx.$queryRaw`SELECT "id" FROM "Firma" WHERE "id" = ${firmaId} FOR UPDATE`;
  const rows = await tx.firmaIslem.groupBy({
    by: ["islemTipi"],
    where: { firmaId, branchId: invoice.labOrder.branchId, status: "AKTIF" },
    _sum: { tutar: true },
  });
  const balance = Math.round(rows.reduce((sum: number, row: any) => {
    const amount = Number(row._sum.tutar || 0);
    return sum + (row.islemTipi === "ODEME" ? -amount : amount);
  }, 0) * 100) / 100;

  if (balance - reduction < 0) {
    throw new BusinessRuleError(
      "Bu düzeltme firma bakiyesini eksiye düşürür. Önce bu faturaya ilişkin firma ödemesini düzeltin veya iptal edin.",
      409,
    );
  }
}

export async function PATCH(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  const auth = await requireAuth("lab:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok || !auth.user.institutionId) return NextResponse.json({ error: branch.ok ? "Kurum bağlamı zorunlu" : branch.message }, { status: 403 });

  const invoice = await loadInvoice(params.id, params.invoiceId, auth.user.institutionId, branch.branchId);
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
      const currentInvoice = await tx.labOrderInvoice.findFirst({
        where: { id: params.invoiceId, labOrderId: params.id, status: "ACTIVE" },
        include: {
          labOrder: {
            select: {
              id: true,
              firmaId: true,
              labName: true,
              labType: true,
              status: true,
              branchId: true,
              patient: { select: { fullName: true } },
            },
          },
        },
      });
      if (!currentInvoice) throw new Error("LAB_INVOICE_CHANGED");
      if (currentInvoice.labOrder.status === "IPTAL") throw new Error("LAB_ORDER_CANCELLED");
      await assertDebtReductionAllowed(tx, currentInvoice, parsed.data.amount);
      const oldDebt = await tx.firmaIslem.findFirst({
        where: {
          status: "AKTIF",
          aciklama: { contains: labSourceToken({ labInvoiceId: currentInvoice.id }) },
        },
        select: {
          firmaId: true,
          debtAllocations: { select: { paymentIslemId: true } },
        },
      });
      await reverseLabInvoiceFirmaIntegration(tx, auth.user.id, { labInvoiceId: currentInvoice.id, branchId: branch.branchId });

      const updated = await tx.labOrderInvoice.update({
        where: { id: currentInvoice.id },
        data: {
          item: parsed.data.item,
          amount: parsed.data.amount,
          invoiceNo: parsed.data.invoiceNo || null,
          issuedAt: parsed.data.issuedAt ? new Date(parsed.data.issuedAt) : currentInvoice.issuedAt,
          note: parsed.data.note || null,
        },
      });

      const integration = await applyLabInvoiceFirmaIntegration({
        tx,
        userId: auth.user.id,
        institutionId: auth.user.institutionId!,
        branchId: branch.branchId,
        labName: currentInvoice.labOrder.labName,
        labType: currentInvoice.labOrder.labType,
        patientName: currentInvoice.labOrder.patient?.fullName || null,
        item: updated.item,
        amount: Number(updated.amount),
        invoiceNo: updated.invoiceNo,
        issuedAt: updated.issuedAt,
        note: updated.note,
        labOrderId: params.id,
        labInvoiceId: updated.id,
        firmaId: currentInvoice.labOrder.firmaId,
      });
      if (integration && !currentInvoice.labOrder.firmaId) {
        await tx.labOrder.update({
          where: { id: params.id },
          data: { firmaId: integration.firmaId },
        });
      }
      if (integration && oldDebt?.debtAllocations.length) {
        await rebuildFirmaPaymentAllocations(tx, integration.firmaId, branch.branchId, {
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
    if (error instanceof Error && error.message === "LAB_INVOICE_CHANGED") {
      return NextResponse.json({ error: "Fatura başka bir işlemde değiştirildi. Listeyi yenileyip tekrar deneyin." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "LAB_ORDER_CANCELLED") {
      return NextResponse.json({ error: "İptal edilmiş siparişin faturası değiştirilemez." }, { status: 409 });
    }
    console.error("[lab invoice PATCH]", error);
    const publicError = publicErrorResponse(error, "Laboratuvar faturası güncellenemedi. Lütfen tekrar deneyin.");
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}

export async function DELETE(_req: NextRequest, props: RouteParams) {
  const params = await props.params;
  const auth = await requireAuth("lab:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok || !auth.user.institutionId) return NextResponse.json({ error: branch.ok ? "Kurum bağlamı zorunlu" : branch.message }, { status: 403 });

  const invoice = await loadInvoice(params.id, params.invoiceId, auth.user.institutionId, branch.branchId);
  if (!invoice) return NextResponse.json({ error: "Laboratuvar faturası bulunamadı" }, { status: 404 });

  try {
    const fresh = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT "id" FROM "LabOrder" WHERE "id" = ${params.id} FOR UPDATE`;
      const currentInvoice = await tx.labOrderInvoice.findFirst({
        where: { id: params.invoiceId, labOrderId: params.id, status: "ACTIVE" },
        include: {
          labOrder: {
            select: {
              firmaId: true,
              labName: true,
              labType: true,
              status: true,
              branchId: true,
              patient: { select: { fullName: true } },
            },
          },
        },
      });
      if (!currentInvoice) throw new Error("LAB_INVOICE_CHANGED");
      await assertDebtReductionAllowed(tx, currentInvoice, 0);
      await reverseLabInvoiceFirmaIntegration(tx, auth.user.id, { labInvoiceId: currentInvoice.id, branchId: branch.branchId });
      await tx.labOrderInvoice.update({
        where: { id: currentInvoice.id },
        data: {
          status: "VOID",
          voidedAt: new Date(),
          voidedById: auth.user.id,
          voidReason: "Laboratuvar faturası iptal edildi.",
        },
      });
      await updateOrderInvoiceSummary(tx, params.id);
      return loadFreshOrder(tx, params.id);
    });

    await writeAudit(auth.user.id, "LAB_ORDER_INVOICE_CANCEL", `Laboratuvar faturası iptal edildi (${params.invoiceId})`);
    await bumpRealtimeInstitution(auth.user.institutionId || null);
    return NextResponse.json(fresh);
  } catch (error) {
    if (error instanceof Error && error.message === "LAB_INVOICE_CHANGED") {
      return NextResponse.json({ error: "Fatura başka bir işlemde değiştirildi. Listeyi yenileyip tekrar deneyin." }, { status: 409 });
    }
    console.error("[lab invoice DELETE]", error);
    const publicError = publicErrorResponse(error, "Laboratuvar faturası iptal edilemedi. Lütfen tekrar deneyin.");
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
