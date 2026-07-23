import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeInstitution, requireAuth, writeAudit } from "@/lib/api";
import { applyLabInvoiceFirmaIntegration, reverseLabInvoiceFirmaIntegration } from "@/lib/lab-firma-integration";
import { shouldHidePatientPhone } from "@/lib/patient-visibility";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("lab:read");
  if (auth.error) return auth.error;
  const user = auth.user;

  const order = await (prisma as any).labOrder.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { patient: { institutionId: auth.user.institutionId } } : {}),
    },
    include: {
      invoices: { orderBy: { issuedAt: "asc" } },
      patient: { select: { id: true, fullName: true, phone: true } },
      doctor: { select: { id: true, fullName: true } },
      trips: { orderBy: { order: "asc" } },
    },
  });

  if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });

  const hidePhone = shouldHidePatientPhone(user.role);
  if (hidePhone && order.patient) {
    return NextResponse.json({
      ...order,
      patient: { ...order.patient, phone: "***" },
    });
  }

  return NextResponse.json(order);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("lab:write");
  if (auth.error) return auth.error;

  const body = await req.json();
  const { status, price, invoiceNo, appendInvoice, action, reason, restartDescription } = body;

  // Mevcut siparişi al — firma entegrasyonu için önceki fatura durumuna bakıyoruz
  const existing = await (prisma as any).labOrder.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { patient: { institutionId: auth.user.institutionId } } : {}),
    },
    select: { id: true, status: true, notes: true, labName: true, labType: true, invoiceNo: true, price: true, patient: { select: { fullName: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });

  const isRpt = /(^|\s|\[)RPT(\]|\s|$)/i.test(existing.notes || "");

  if (action === "RPT_REOPEN") {
    if (!reason || typeof reason !== "string") {
      return NextResponse.json({ error: "RPT nedeni zorunludur" }, { status: 400 });
    }
    const timestamp = new Date().toISOString();
    const rptNote = `RPT yeniden açıldı (${timestamp}): ${reason.trim()}`;

    const reopened = await (prisma as any).$transaction(async (tx: any) => {
      const existingInvoices = await tx.labOrderInvoice.findMany({
        where: { labOrderId: params.id },
        select: { id: true, item: true, amount: true, invoiceNo: true },
      });

      for (const invoice of existingInvoices) {
        await reverseLabInvoiceFirmaIntegration(tx, auth.user.id, {
          labInvoiceId: invoice.id,
          labOrderId: params.id,
          invoiceNo: invoice.invoiceNo || null,
          item: invoice.item || null,
          amount: Number(invoice.amount || 0),
        });
      }

      if (existingInvoices.length > 0) {
        await tx.labOrderInvoice.deleteMany({ where: { labOrderId: params.id } });
      }

      if (existing.invoiceNo || existing.price) {
        await reverseLabInvoiceFirmaIntegration(tx, auth.user.id, {
          labOrderId: params.id,
          invoiceNo: existing.invoiceNo || null,
          item: existing.labType,
          amount: Number(existing.price || 0),
        });
      }

      const currentTrip = await tx.labTrip.findFirst({
        where: { labOrderId: params.id },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const nextOrder = (currentTrip?.order || 0) + 1;

      await tx.labOrder.update({
        where: { id: params.id },
        data: {
          status: "DEVAM_EDIYOR",
          notes: existing.notes ? `${existing.notes}\n[RPT] ${rptNote}` : `[RPT] ${rptNote}`,
          price: null,
          invoiceNo: null,
        },
      });

      await tx.labTrip.create({
        data: {
          labOrderId: params.id,
          order: nextOrder,
          description: restartDescription || "Ölçü",
          sentAt: new Date(),
          sentNote: `RPT_RESET_START | ${rptNote}`,
        },
      });

      return tx.labOrder.findUnique({
        where: { id: params.id },
        include: {
          invoices: { orderBy: { issuedAt: "asc" } },
          patient: { select: { id: true, fullName: true } },
          doctor: { select: { id: true, fullName: true } },
          trips: { orderBy: { order: "asc" } },
        },
      });
    });

    await writeAudit(auth.user.id, "LAB_ORDER_RPT_REOPEN", `Laboratuvar siparişi RPT ile yeniden açıldı (${params.id})`);
    await bumpRealtimeInstitution(auth.user.institutionId || null);
    return NextResponse.json(reopened);
  }

  if (isRpt && (appendInvoice?.amount || price !== undefined || invoiceNo !== undefined)) {
    return NextResponse.json({ error: "RPT işlerde ücret/fatura eklenemez" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (status    !== undefined) data.status    = status;
  if (price     !== undefined) data.price     = price !== null ? Number(price) : null;
  if (invoiceNo !== undefined) data.invoiceNo = invoiceNo || null;

  const wasInvoiced = !!existing.invoiceNo;
  const nowInvoiced = !!(invoiceNo || existing.invoiceNo) && !!(price !== undefined ? price : existing.price);

  const updated = await (prisma as any).$transaction(async (tx: any) => {
    if (status === "IPTAL" && existing.status !== "IPTAL") {
      const existingInvoices = await tx.labOrderInvoice.findMany({
        where: { labOrderId: params.id },
        select: { id: true, item: true, amount: true, invoiceNo: true },
      });

      for (const invoice of existingInvoices) {
        await reverseLabInvoiceFirmaIntegration(tx, auth.user.id, {
          labInvoiceId: invoice.id,
          labOrderId: params.id,
          invoiceNo: invoice.invoiceNo || null,
          item: invoice.item || null,
          amount: Number(invoice.amount || 0),
        });
      }

      if (existingInvoices.length === 0 && (existing.invoiceNo || existing.price)) {
        await reverseLabInvoiceFirmaIntegration(tx, auth.user.id, {
          labOrderId: params.id,
          invoiceNo: existing.invoiceNo || null,
          item: existing.labType,
          amount: Number(existing.price || 0),
        });
      }
    }

    const order = await tx.labOrder.update({
      where: { id: params.id },
      data,
      include: {
        invoices: { orderBy: { issuedAt: "asc" } },
        patient: { select: { id: true, fullName: true } },
        doctor: { select: { id: true, fullName: true } },
        trips: { orderBy: { order: "asc" } },
      },
    });

    let createdInvoice: any = null;
    if (appendInvoice?.item && appendInvoice?.amount) {
      createdInvoice = await tx.labOrderInvoice.create({
        data: {
          labOrderId: params.id,
          item: appendInvoice.item,
          amount: Number(appendInvoice.amount),
          invoiceNo: appendInvoice.invoiceNo || null,
          issuedAt: appendInvoice.issuedAt ? new Date(appendInvoice.issuedAt) : new Date(),
          note: appendInvoice.note || null,
        },
      });
    }

    if (createdInvoice && existing.labName) {
      await applyLabInvoiceFirmaIntegration({
        tx,
        userId: auth.user.id,
        institutionId: auth.user.institutionId || null,
        labName: existing.labName,
        labType: existing.labType,
        patientName: existing.patient?.fullName || null,
        item: createdInvoice.item,
        amount: Number(createdInvoice.amount),
        invoiceNo: createdInvoice.invoiceNo || null,
        issuedAt: createdInvoice.issuedAt,
        note: createdInvoice.note || null,
        labOrderId: params.id,
        labInvoiceId: createdInvoice.id,
      });
    } else if (!wasInvoiced && nowInvoiced && existing.labName) {
      await applyLabInvoiceFirmaIntegration({
        tx,
        userId: auth.user.id,
        institutionId: auth.user.institutionId || null,
        labName: existing.labName,
        labType: existing.labType,
        patientName: existing.patient?.fullName || null,
        item: existing.labType,
        amount: Number(price ?? existing.price),
        invoiceNo: invoiceNo || existing.invoiceNo || null,
        issuedAt: new Date(),
        note: null,
        labOrderId: params.id,
      });
    }

    return order;
  });

  const fresh = await (prisma as any).labOrder.findUnique({
    where: { id: params.id },
    include: {
      invoices: { orderBy: { issuedAt: "asc" } },
      patient: { select: { id: true, fullName: true } },
      doctor: { select: { id: true, fullName: true } },
      trips: { orderBy: { order: "asc" } },
    },
  });

  await writeAudit(auth.user.id, "LAB_ORDER_UPDATE", `Laboratuvar siparişi güncellendi (${params.id})`);
  await bumpRealtimeInstitution(auth.user.institutionId || null);
  return NextResponse.json(fresh || updated);
}
