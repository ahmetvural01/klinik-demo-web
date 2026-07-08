import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;
  const user = auth.user;

  let orders: any[] = [];
  try {
    orders = await (prisma as any).labOrder.findMany({
      where: {
        ...(auth.user.institutionId ? { patient: { institutionId: auth.user.institutionId } } : {}),
      },
      include: {
        invoices: { orderBy: { issuedAt: "asc" } },
        patient: { select: { id: true, fullName: true, phone: true } },
        doctor:  { select: { id: true, fullName: true } },
        trips:   { orderBy: { order: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    console.error("[lab-orders GET] fallback:", error);
    orders = [];
  }

  const hidePhone = user.role === "DOKTOR" || user.role === "ASISTAN";
  const masked = hidePhone
    ? orders.map((o: any) => ({ ...o, patient: o.patient ? { ...o.patient, phone: "***" } : o.patient }))
    : orders;

  return NextResponse.json(masked);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;
  const user = auth.user;

  const body = await req.json();
  const { patientId, doctorId, labName, labType, teeth, notes, price, invoiceNo, firstTrip, firstInvoice } = body;

  if (!patientId || !doctorId || !labName || !labType) {
    return NextResponse.json({ error: "Zorunlu alanlar eksik" }, { status: 400 });
  }

  if (auth.user.institutionId) {
    const [patient, doctor] = await Promise.all([
      prisma.patient.findFirst({
        where: { id: patientId, institutionId: auth.user.institutionId },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { id: doctorId, institutionId: auth.user.institutionId, isActive: true },
        select: { id: true },
      }),
    ]);
    if (!patient || !doctor) {
      return NextResponse.json({ error: "Hasta veya doktor kurum kapsamı disinda" }, { status: 403 });
    }
  }

  let order: any;
  try {
    order = await (prisma as any).labOrder.create({
      data: {
        patientId,
        doctorId,
        labName,
        labType,
        teeth,
        notes,
        price:     price ? Number(price) : firstInvoice?.amount ? Number(firstInvoice.amount) : null,
        invoiceNo: invoiceNo || firstInvoice?.invoiceNo || null,
        invoices: firstInvoice?.item && firstInvoice?.amount ? {
          create: [{
            item: firstInvoice.item,
            amount: Number(firstInvoice.amount),
            invoiceNo: firstInvoice.invoiceNo || null,
            issuedAt: firstInvoice.issuedAt ? new Date(firstInvoice.issuedAt) : new Date(),
            note: firstInvoice.note || null,
          }],
        } : price ? {
          create: [{
            item: labType,
            amount: Number(price),
            invoiceNo: invoiceNo || null,
            issuedAt: new Date(),
            note: null,
          }],
        } : undefined,
        trips: firstTrip?.description ? {
          create: [{
            order:       1,
            description: firstTrip.description,
            sentAt:      firstTrip.sentAt     ? new Date(firstTrip.sentAt)     : new Date(),
            sentNote:    firstTrip.sentNote || null,
          }],
        } : undefined,
      },
      include: {
        invoices: { orderBy: { issuedAt: "asc" } },
        patient: { select: { id: true, fullName: true, phone: true } },
        doctor:  { select: { id: true, fullName: true } },
        trips:   { orderBy: { order: "asc" } },
      },
    });
  } catch (error) {
    console.error("[lab-orders POST] fallback:", error);
    return NextResponse.json({ error: "Laboratuvar kaydı oluşturulamadı" }, { status: 503 });
  }

  // ── Lab fatura → Firma cari borç otomasyonu ────────────────────────────
  // Fatura No ve fiyat varsa, aynı isimli firmanın cari hesabına otomatik yaz
  let firmaIntegration: { firmaId: string; firmaName: string; error?: string } | null = null;
  if (price && invoiceNo && labName) {
    try {
      const matchedFirma = await (prisma as any).firma.findFirst({
        where: {
          name: { contains: labName, mode: "insensitive" },
          isActive: true,
          ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        },
        select: { id: true, name: true },
      });
      if (matchedFirma) {
        await (prisma as any).firmaIslem.create({
          data: {
            firmaId:    matchedFirma.id,
            tarih:      new Date(),
            islemTipi:  "HIZMET",
            urunHizmet: `Lab: ${labType}${order.patient ? ` — ${order.patient.fullName}` : ""}`,
            tutar:      Number(price),
            faturaNo:   invoiceNo,
            status:     "AKTIF",
            kdvOrani:   0,
          },
        });
        firmaIntegration = { firmaId: matchedFirma.id, firmaName: matchedFirma.name };
      } else {
        firmaIntegration = { firmaId: "", firmaName: "", error: "Eşleşen firma bulunamadı" };
      }
    } catch (integrationErr) {
      const errMsg = integrationErr instanceof Error ? integrationErr.message : "Bilinmeyen hata";
      firmaIntegration = { firmaId: "", firmaName: "", error: `Firma entegrasyon hatası: ${errMsg}` };
      // Loglama - production'da centralized logging'e git
      console.error("[lab-orders POST] firma entegrasyonu hatası:", integrationErr);
    }
  }

  await writeAudit(auth.user.id, "LAB_ORDER_CREATE", `${labName} (${labType}) laboratuvar siparişi oluşturuldu`);
  return NextResponse.json({ ...order, firmaIntegration }, { status: 201 });
}
