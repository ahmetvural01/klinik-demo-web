import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeInstitution, requireAuth, writeAudit } from "@/lib/api";
import { applyLabInvoiceFirmaIntegration } from "@/lib/lab-firma-integration";
import { requireActiveBranch } from "@/lib/branch-context";
import { formatZodError, labInvoiceCreateSchema } from "@/lib/validators";
import { publicErrorResponse } from "@/lib/public-error";
import { isReworkOrder } from "@/lib/lab-workflow";
import { toPublicLabOrder } from "@/app/api/lab-orders/lab-order-api";

/**
 * Yeniden yapım (ücretsiz) işi mi? Yalnız sistemin yazdığı işarete bakılır;
 * önceden notunda herhangi bir yerde "RPT" kelimesi geçen normal iş de
 * ücretsiz sayılıyor, faturalanamıyor ve bu yüzden hiç kapatılamıyordu.
 */
function isFreeRework(order: { notes: string | null; trips: { sentNote: string | null; description: string; sentAt: Date }[] }) {
  return isReworkOrder({
    notes: order.notes,
    trips: order.trips.map((trip) => ({ ...trip, sentAt: trip.sentAt.toISOString() })),
  });
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("lab:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok || !auth.user.institutionId) return NextResponse.json({ error: branch.ok ? "Kurum bağlamı zorunlu" : branch.message }, { status: 403 });

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
        labOrder: { institutionId: auth.user.institutionId, branchId: branch.branchId },
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
      institutionId: auth.user.institutionId,
      branchId: branch.branchId,
    },
    select: { notes: true, status: true, trips: { select: { sentNote: true, description: true, sentAt: true } } },
  });

  if (!orderMeta) {
    return NextResponse.json({ error: "Laboratuvar işi bulunamadı" }, { status: 404 });
  }

  if (isFreeRework(orderMeta)) {
    return NextResponse.json({ error: "Yeniden yapım (ücretsiz) işine lab faturası eklenmez." }, { status: 400 });
  }

  if (orderMeta.status === "IPTAL" || orderMeta.status === "HASTAYA_TAKILDI") {
    return NextResponse.json(
      { error: orderMeta.status === "IPTAL"
        ? "İptal edilmiş işe fatura eklenemez."
        : "Hastaya takılmış işe yeni fatura eklenemez. Mevcut faturanın tutarını “Faturayı düzenle” ile düzeltebilirsiniz." },
      { status: 400 }
    );
  }

  let invoice;
  try {
    invoice = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT "id" FROM "LabOrder" WHERE "id" = ${params.id} FOR UPDATE`;
      const lockedOrder = await tx.labOrder.findUnique({
        where: { id: params.id },
        select: { notes: true, status: true, trips: { select: { sentNote: true, description: true, sentAt: true } } },
      });
      if (!lockedOrder || lockedOrder.status === "IPTAL" || lockedOrder.status === "HASTAYA_TAKILDI") {
        throw new Error("LAB_ORDER_NOT_INVOICEABLE");
      }
      if (isFreeRework(lockedOrder)) {
        throw new Error("LAB_ORDER_RPT");
      }
      const createdInvoice = await tx.labOrderInvoice.create({
        data: {
          institutionId: auth.user.institutionId!,
          branchId: branch.branchId,
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
          where: { labOrderId: params.id, status: "ACTIVE" },
          _sum: { amount: true },
        }),
        tx.labOrderInvoice.findFirst({
          where: { labOrderId: params.id, status: "ACTIVE" },
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
          institutionId: auth.user.institutionId!,
          branchId: branch.branchId,
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
      return NextResponse.json({ error: "İşin durumu değişti; fatura eklenemedi. Listeyi yenileyin." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "LAB_ORDER_RPT") {
      return NextResponse.json({ error: "Yeniden yapım (ücretsiz) işine lab faturası eklenmez." }, { status: 409 });
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
          labOrder: { institutionId: auth.user.institutionId, branchId: branch.branchId },
        },
      });
      if (existingInvoice) {
        const { requestKey: _requestKey, ...publicInvoice } = existingInvoice;
        return NextResponse.json({ ...publicInvoice, duplicateRequest: true }, { status: 200 });
      }
    }
    console.error("[lab invoice POST]", error);
    const publicError = publicErrorResponse(error, "Laboratuvar faturası kaydedilemedi. Lütfen tekrar deneyin.");
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }

  const fresh = await (prisma as any).labOrder.findFirst({
    where: { id: params.id, institutionId: auth.user.institutionId, branchId: branch.branchId },
    include: {
      invoices: { where: { status: "ACTIVE" }, orderBy: { issuedAt: "asc" } },
      patient: { select: { id: true, fullName: true, phone: true } },
      doctor: { select: { id: true, fullName: true } },
      trips: { orderBy: { order: "asc" } },
    },
  });

  await writeAudit(auth.user.id, "LAB_ORDER_INVOICE_CREATE", `Laboratuvar faturası eklendi (${params.id})`);
  await bumpRealtimeInstitution(auth.user.institutionId || null);
  if (fresh) {
    return NextResponse.json(await toPublicLabOrder(fresh, auth.user.role), { status: 201 });
  }
  const { requestKey: _requestKey, ...publicInvoice } = invoice;
  return NextResponse.json(publicInvoice, { status: 201 });
}
