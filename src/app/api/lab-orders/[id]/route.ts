import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const body = await req.json();
  const { status, price, invoiceNo, appendInvoice } = body;

  // Mevcut siparişi al — firma entegrasyonu için önceki fatura durumuna bakıyoruz
  const existing = await (prisma as any).labOrder.findUnique({
    where: { id: params.id },
    select: { labName: true, labType: true, invoiceNo: true, price: true, patient: { select: { fullName: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });

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
