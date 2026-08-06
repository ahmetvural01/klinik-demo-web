import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeInstitution, requireAuth, writeAudit } from "@/lib/api";
import { applyLabInvoiceFirmaIntegration } from "@/lib/lab-firma-integration";
import { formatZodError, labInvoiceCreateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("lab:write");
  if (auth.error) return auth.error;

  const requestKey = req.headers.get("Idempotency-Key")?.trim() || null;
  if (requestKey && (requestKey.length < 8 || requestKey.length > 180)) {
    return NextResponse.json({ error: "İşlem anahtarı geçersiz" }, { status: 400 });
  }
  const parsed = labInvoiceCreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Fatura bilgileri geçersiz", errors: formatZodError(parsed.error) },
      { status: 400 },
    );
  }
  const { item, amount, invoiceNo, issuedAt, note } = parsed.data;

  if (requestKey) {
    const existingInvoice = await (prisma as any).labOrderInvoice.findFirst({
      where: {
        requestKey,
        labOrderId: params.id,
        ...(auth.user.institutionId
          ? { labOrder: { patient: { institutionId: auth.user.institutionId } } }
          : {}),
      },
    });
    if (existingInvoice) {
      const { requestKey: _requestKey, ...publicInvoice } = existingInvoice;
      return NextResponse.json({ ...publicInvoice, duplicateRequest: true }, { status: 200 });
    }
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

  let invoice;
  try {
    invoice = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT "id" FROM "LabOrder" WHERE "id" = ${params.id} FOR UPDATE`;
      const lockedOrder = await tx.labOrder.findUnique({
        where: { id: params.id },
        select: { notes: true, status: true },
      });
      if (!lockedOrder || lockedOrder.status === "IPTAL" || lockedOrder.status === "HASTAYA_TAKILDI") {
        throw new Error("LAB_ORDER_NOT_INVOICEABLE");
      }
      if (/(^|\s|\[)RPT(\]|\s|$)/i.test(lockedOrder.notes || "")) {
        throw new Error("LAB_ORDER_RPT");
      }
      const createdInvoice = await tx.labOrderInvoice.create({
        data: {
          labOrderId: params.id,
          requestKey,
          item,
          amount,
          invoiceNo: invoiceNo || null,
          issuedAt: issuedAt ? new Date(issuedAt) : new Date(),
          note: note || null,
        },
      });

      const [invoiceTotal, latestInvoice] = await Promise.all([
        tx.labOrderInvoice.aggregate({
          where: { labOrderId: params.id },
          _sum: { amount: true },
        }),
        tx.labOrderInvoice.findFirst({
          where: { labOrderId: params.id },
          orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
          select: { invoiceNo: true },
        }),
      ]);
      await tx.labOrder.update({
        where: { id: params.id },
        data: {
          price: Number(invoiceTotal._sum.amount || 0),
          invoiceNo: latestInvoice?.invoiceNo || null,
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
        const integration = await applyLabInvoiceFirmaIntegration({
          tx,
          userId: auth.user.id,
          institutionId: auth.user.institutionId || null,
          labName: order.labName,
          labType: order.labType,
          patientName: order.patient?.fullName || null,
          item,
          amount,
          invoiceNo: invoiceNo || null,
          issuedAt: createdInvoice.issuedAt,
          note: note || null,
          labOrderId: params.id,
          labInvoiceId: createdInvoice.id,
          firmaId: order.firmaId,
        });
        if (integration && !order.firmaId) {
          await tx.labOrder.update({
            where: { id: params.id },
            data: { firmaId: integration.firmaId },
          });
        }
      }

      return createdInvoice;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "LAB_ORDER_NOT_INVOICEABLE") {
      return NextResponse.json({ error: "Sipariş artık fatura eklemeye uygun değil" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "LAB_ORDER_RPT") {
      return NextResponse.json({ error: "RPT işlerde laboratuvar ücreti/fatura eklenemez" }, { status: 409 });
    }
    if (
      requestKey
      && error
      && typeof error === "object"
      && "code" in error
      && (error as { code?: string }).code === "P2002"
    ) {
      const existingInvoice = await (prisma as any).labOrderInvoice.findFirst({
        where: {
          requestKey,
          labOrderId: params.id,
          ...(auth.user.institutionId
            ? { labOrder: { patient: { institutionId: auth.user.institutionId } } }
            : {}),
        },
      });
      if (existingInvoice) {
        const { requestKey: _requestKey, ...publicInvoice } = existingInvoice;
        return NextResponse.json({ ...publicInvoice, duplicateRequest: true }, { status: 200 });
      }
    }
    console.error("[lab invoice POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Laboratuvar faturası kaydedilemedi" },
      { status: 400 },
    );
  }

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
  if (fresh) {
    const publicFresh = {
      ...fresh,
      invoices: fresh.invoices.map(({ requestKey: _requestKey, ...publicInvoice }: any) => publicInvoice),
    };
    return NextResponse.json(publicFresh, { status: 201 });
  }
  const { requestKey: _requestKey, ...publicInvoice } = invoice;
  return NextResponse.json(publicInvoice, { status: 201 });
}
