import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeInstitution, requireAuth, writeAudit } from "@/lib/api";
import { reverseLabInvoiceFirmaIntegration } from "@/lib/lab-firma-integration";
import { shouldHidePatientPhoneForRole } from "@/lib/patient-visibility-server";

const VALID_LAB_ORDER_STATUSES = new Set(["DEVAM_EDIYOR", "HASTAYA_TAKILDI", "IPTAL"]);

export const dynamic = "force-dynamic";

function toPublicOrder(order: any) {
  if (!order) return order;
  const { requestKey: _requestKey, ...publicOrder } = order;
  return {
    ...publicOrder,
    invoices: Array.isArray(publicOrder.invoices)
      ? publicOrder.invoices.map((invoice: any) => {
          const { requestKey: _invoiceRequestKey, ...publicInvoice } = invoice;
          return publicInvoice;
        })
      : publicOrder.invoices,
  };
}

export async function GET(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  const hidePhone = await shouldHidePatientPhoneForRole(user.role);
  if (hidePhone && order.patient) {
    return NextResponse.json(toPublicOrder({
      ...order,
      patient: { ...order.patient, phone: "***" },
    }));
  }

  return NextResponse.json(toPublicOrder(order));
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("lab:write");
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  const { status, price, invoiceNo, appendInvoice, action, reason, restartDescription } = body;
  if (status !== undefined && (typeof status !== "string" || !VALID_LAB_ORDER_STATUSES.has(status))) {
    return NextResponse.json({ error: "Geçersiz laboratuvar siparişi durumu" }, { status: 400 });
  }
  if (action !== undefined && action !== "RPT_REOPEN") {
    return NextResponse.json({ error: "Geçersiz laboratuvar işlemi" }, { status: 400 });
  }

  // Mevcut siparişi al — firma entegrasyonu için önceki fatura durumuna bakıyoruz
  const existing = await (prisma as any).labOrder.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { patient: { institutionId: auth.user.institutionId } } : {}),
    },
    select: { id: true, status: true, notes: true, labName: true, labType: true, invoiceNo: true, price: true, patient: { select: { fullName: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });

  if (appendInvoice !== undefined || price !== undefined || invoiceNo !== undefined) {
    return NextResponse.json(
      { error: "Fatura işlemleri yalnızca laboratuvar fatura formundan yapılabilir." },
      { status: 400 },
    );
  }

  // "Hastaya takıldı" (teslim/tamamlandı) durumuna geçerken hiçbir maliyet
  // kaydı yoksa, bu lab gideri hiçbir doktorun hakediş hesabına yansımadan
  // sessizce kaybolur — geçişi engelleyip fatura girilmesini zorunlu kılıyoruz.
  if (status === "HASTAYA_TAKILDI" && existing.status !== "HASTAYA_TAKILDI") {
    const invoiceCount = await (prisma as any).labOrderInvoice.count({ where: { labOrderId: params.id } });
    if (invoiceCount === 0 && !existing.price) {
      return NextResponse.json(
        { error: "Bu durumu \"Hastaya Takıldı\" yapmadan önce laboratuvar faturası/tutarı girmelisiniz — aksi halde bu maliyet hakediş hesabına hiç yansımaz." },
        { status: 400 },
      );
    }
  }

  if (action === "RPT_REOPEN") {
    if (typeof reason !== "string" || reason.trim().length < 3 || reason.length > 1000) {
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
          description: typeof restartDescription === "string" && restartDescription.trim() ? restartDescription.trim().slice(0, 180) : "Ölçü",
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
    return NextResponse.json(toPublicOrder(reopened));
  }

  // İptal edilmiş bir siparişi bu genel PATCH ile başka bir duruma taşımak,
  // firma cari hesabına hiç geri yansımadan (yalnızca RPT_REOPEN akışı eski
  // faturaları silip entegrasyonu doğru şekilde sıfırdan kuruyor) siparişi
  // "faturası var, borcu yok" bir hayalet duruma düşürüyordu (bkz. denetim
  // raporu). İptalden çıkış artık yalnızca RPT_REOPEN akışı üzerinden mümkün.
  if (existing.status === "IPTAL" && status !== undefined && status !== "IPTAL") {
    return NextResponse.json(
      { error: "İptal edilmiş bir sipariş yalnızca \"RPT ile yeniden aç\" işlemiyle tekrar aktif edilebilir." },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  if (status    !== undefined) data.status    = status;

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
  return NextResponse.json(toPublicOrder(fresh || updated));
}
