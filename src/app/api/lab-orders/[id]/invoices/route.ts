import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeInstitution, requireAuth, writeAudit } from "@/lib/api";
import { applyLabInvoiceFirmaIntegration } from "@/lib/lab-firma-integration";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("lab:write");
  if (auth.error) return auth.error;

  const body = await req.json();
  const { item, amount, invoiceNo, issuedAt, note } = body;

  if (!item || !amount) {
    return NextResponse.json({ error: "item ve amount zorunlu" }, { status: 400 });
  }

  const orderMeta = await (prisma as any).labOrder.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { patient: { institutionId: auth.user.institutionId } } : {}),
    },
    select: { notes: true, status: true },
  });

  if (!orderMeta) {
    return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
  }

  if (/(^|\s|\[)RPT(\]|\s|$)/i.test(orderMeta.notes || "")) {
    return NextResponse.json({ error: "RPT işlerde laboratuvar ücreti/fatura eklenemez" }, { status: 400 });
  }

  if (orderMeta.status === "IPTAL" || orderMeta.status === "HASTAYA_TAKILDI") {
    return NextResponse.json(
      { error: "İptal edilmiş veya hastaya teslim edilmiş siparişe yeni fatura eklenemez. Önce sipariş durumunu değiştirin." },
      { status: 400 }
    );
  }

  const invoice = await (prisma as any).$transaction(async (tx: any) => {
    const createdInvoice = await tx.labOrderInvoice.create({
      data: {
        labOrderId: params.id,
        item,
        amount: Number(amount),
        invoiceNo: invoiceNo || null,
        issuedAt: issuedAt ? new Date(issuedAt) : new Date(),
        note: note || null,
      },
    });

    await tx.labOrder.update({
      where: { id: params.id },
      data: {
        price: Number(amount),
        invoiceNo: invoiceNo || null,
      },
    });

    const order = await tx.labOrder.findUnique({
      where: { id: params.id },
      select: {
        labName: true,
        labType: true,
        firmaId: true,
        patient: { select: { fullName: true } },
      },
    });

    if (order?.labName) {
      await applyLabInvoiceFirmaIntegration({
        tx,
        userId: auth.user.id,
        institutionId: auth.user.institutionId || null,
        labName: order.labName,
        labType: order.labType,
        patientName: order.patient?.fullName || null,
        item,
        amount: Number(amount),
        invoiceNo: invoiceNo || null,
        issuedAt: createdInvoice.issuedAt,
        note: note || null,
        labOrderId: params.id,
        labInvoiceId: createdInvoice.id,
        firmaId: order.firmaId,
      });
    }

    return createdInvoice;
  });

  const fresh = await (prisma as any).labOrder.findUnique({
    where: { id: params.id },
    include: {
      invoices: { orderBy: { issuedAt: "asc" } },
      patient: { select: { id: true, fullName: true, phone: true } },
      doctor: { select: { id: true, fullName: true } },
      trips: { orderBy: { order: "asc" } },
    },
  });

  await writeAudit(auth.user.id, "LAB_ORDER_INVOICE_CREATE", `Laboratuvar faturası eklendi (${params.id})`);
  await bumpRealtimeInstitution(auth.user.institutionId || null);
  return NextResponse.json(fresh || invoice, { status: 201 });
}
