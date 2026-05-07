import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const order = await (prisma as any).labOrder.findUnique({
    where: { id: params.id },
    include: {
      invoices: { orderBy: { issuedAt: "asc" } },
      patient: { select: { id: true, fullName: true, phone: true } },
      doctor: { select: { id: true, fullName: true } },
      trips: { orderBy: { order: "asc" } },
    },
  });

  if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });

  const hidePhone = user.role === "DOKTOR" || user.role === "ASISTAN";
  if (hidePhone && order.patient) {
    return NextResponse.json({
      ...order,
      patient: { ...order.patient, phone: "***" },
    });
  }

  return NextResponse.json(order);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const body = await req.json();
  const { status, price, invoiceNo, appendInvoice, action, reason, restartDescription } = body;

  // Mevcut siparişi al — firma entegrasyonu için önceki fatura durumuna bakıyoruz
  const existing = await (prisma as any).labOrder.findUnique({
    where: { id: params.id },
    select: { id: true, notes: true, labName: true, labType: true, invoiceNo: true, price: true, patient: { select: { fullName: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });

  const isRpt = /(^|\s|\[)RPT(\]|\s|$)/i.test(existing.notes || "");

  if (action === "RPT_REOPEN") {
    if (!reason || typeof reason !== "string") {
      return NextResponse.json({ error: "RPT nedeni zorunludur" }, { status: 400 });
    }

    const currentTrips = await (prisma as any).labTrip.findMany({
      where: { labOrderId: params.id },
      orderBy: { order: "desc" },
      take: 1,
      select: { order: true },
    });

    const nextOrder = (currentTrips[0]?.order || 0) + 1;
    const timestamp = new Date().toISOString();
    const rptNote = `RPT yeniden açıldı (${timestamp}): ${reason.trim()}`;

    await (prisma as any).labOrder.update({
      where: { id: params.id },
      data: {
        status: "DEVAM_EDIYOR",
        notes: existing.notes ? `${existing.notes}\n[RPT] ${rptNote}` : `[RPT] ${rptNote}`,
        price: null,
        invoiceNo: null,
      },
    });

    await (prisma as any).labTrip.create({
      data: {
        labOrderId: params.id,
        order: nextOrder,
        description: restartDescription || "Ölçü",
        sentAt: new Date(),
        sentNote: `RPT_RESET_START | ${rptNote}`,
      },
    });
  }

  if (isRpt && (appendInvoice?.amount || price !== undefined || invoiceNo !== undefined)) {
    return NextResponse.json({ error: "RPT işlerde ücret/fatura eklenemez" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (status    !== undefined) data.status    = status;
  if (price     !== undefined) data.price     = price !== null ? Number(price) : null;
  if (invoiceNo !== undefined) data.invoiceNo = invoiceNo || null;

  const order = await (prisma as any).labOrder.update({
    where: { id: params.id },
    data,
    include: {
      invoices: { orderBy: { issuedAt: "asc" } },
      patient: { select: { id: true, fullName: true } },
      doctor:  { select: { id: true, fullName: true } },
      trips:   { orderBy: { order: "asc" } },
    },
  });

  if (appendInvoice?.item && appendInvoice?.amount) {
    await (prisma as any).labOrderInvoice.create({
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

  // ── Fatura ekleniyorsa → firma cari borç oluştur ───────────────────────
  // Daha önce faturası olmayan ve şimdi hem price hem invoiceNo geliyorsa tetikle
  const wasInvoiced = !!existing.invoiceNo;
  const nowInvoiced = !!(invoiceNo || existing.invoiceNo) && !!(price !== undefined ? price : existing.price);
  if (!wasInvoiced && nowInvoiced && existing.labName) {
    try {
      const matchedFirma = await (prisma as any).firma.findFirst({
        where: { name: { contains: existing.labName, mode: "insensitive" }, isActive: true },
        select: { id: true, name: true },
      });
      if (matchedFirma) {
        await (prisma as any).firmaIslem.create({
          data: {
            firmaId:    matchedFirma.id,
            tarih:      new Date(),
            islemTipi:  "HIZMET",
            urunHizmet: `Lab: ${existing.labType}${existing.patient ? ` — ${existing.patient.fullName}` : ""}`,
            tutar:      Number(price ?? existing.price),
            faturaNo:   invoiceNo || existing.invoiceNo || null,
            status:     "AKTIF",
            kdvOrani:   0,
          },
        });
      }
    } catch (err) {
      console.error("[lab-orders/[id]] firma entegrasyonu hatası:", err);
    }
  }

  const fresh = await (prisma as any).labOrder.findUnique({
    where: { id: params.id },
    include: {
      invoices: { orderBy: { issuedAt: "asc" } },
      patient: { select: { id: true, fullName: true } },
      doctor:  { select: { id: true, fullName: true } },
      trips:   { orderBy: { order: "asc" } },
    },
  });

  return NextResponse.json(fresh || order);
}
