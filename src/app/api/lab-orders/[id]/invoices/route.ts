import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("appointments:write");
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
    select: { notes: true },
  });

  if (!orderMeta) {
    return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
  }

  if (/(^|\s|\[)RPT(\]|\s|$)/i.test(orderMeta.notes || "")) {
    return NextResponse.json({ error: "RPT işlerde laboratuvar ücreti/fatura eklenemez" }, { status: 400 });
  }

  const invoice = await (prisma as any).labOrderInvoice.create({
    data: {
      labOrderId: params.id,
      item,
      amount: Number(amount),
      invoiceNo: invoiceNo || null,
      issuedAt: issuedAt ? new Date(issuedAt) : new Date(),
      note: note || null,
    },
  });

  await (prisma as any).labOrder.update({
    where: { id: params.id },
    data: {
      price: Number(amount),
      invoiceNo: invoiceNo || null,
    },
  });

  try {
    const order = await (prisma as any).labOrder.findUnique({
      where: { id: params.id },
      select: {
        labName: true,
        labType: true,
        patient: { select: { fullName: true } },
      },
    });

    if (order?.labName) {
      const matchedFirma = await (prisma as any).firma.findFirst({
        where: {
          name: { contains: order.labName, mode: "insensitive" },
          isActive: true,
          ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        },
        select: { id: true },
      });

      if (matchedFirma) {
        await (prisma as any).firmaIslem.create({
          data: {
            firmaId: matchedFirma.id,
            tarih: new Date(),
            islemTipi: "HIZMET",
            urunHizmet: `Lab: ${item}${order.patient ? ` — ${order.patient.fullName}` : ""}`,
            tutar: Number(amount),
            faturaNo: invoiceNo || null,
            status: "AKTIF",
            kdvOrani: 0,
          },
        });
      }
    }
  } catch (err) {
    console.error("[lab-orders/[id]/invoices] firma entegrasyonu hatası:", err);
  }

  await writeAudit(auth.user.id, "LAB_ORDER_INVOICE_CREATE", `Laboratuvar faturası eklendi (${params.id})`);
  return NextResponse.json(invoice, { status: 201 });
}
