import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;
  const user = auth.user;

  const orders = await (prisma as any).labOrder.findMany({
    include: {
      patient: { select: { id: true, fullName: true, phone: true } },
      doctor:  { select: { id: true, fullName: true } },
      trips:   { orderBy: { order: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

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
  const { patientId, doctorId, labName, labType, teeth, notes, price, invoiceNo, firstTrip } = body;

  if (!patientId || !doctorId || !labName || !labType) {
    return NextResponse.json({ error: "Zorunlu alanlar eksik" }, { status: 400 });
  }

  const order = await (prisma as any).labOrder.create({
    data: {
      patientId,
      doctorId,
      labName,
      labType,
      teeth,
      notes,
      price:     price ? Number(price) : null,
      invoiceNo: invoiceNo || null,
      trips: firstTrip?.description ? {
        create: [{
          order:       1,
          description: firstTrip.description,
          sentAt:      firstTrip.sentAt     ? new Date(firstTrip.sentAt)     : new Date(),
          expectedAt:  firstTrip.expectedAt ? new Date(firstTrip.expectedAt) : null,
          sentNote:    firstTrip.sentNote || null,
        }],
      } : undefined,
    },
    include: {
      patient: { select: { id: true, fullName: true, phone: true } },
      doctor:  { select: { id: true, fullName: true } },
      trips:   { orderBy: { order: "asc" } },
    },
  });

  // ── Lab fatura → Firma cari borç otomasyonu ────────────────────────────
  // Fatura No ve fiyat varsa, aynı isimli firmanın cari hesabına otomatik yaz
  let firmaIntegration: { firmaId: string; firmaName: string } | null = null;
  if (price && invoiceNo && labName) {
    try {
      const matchedFirma = await (prisma as any).firma.findFirst({
        where: { name: { contains: labName, mode: "insensitive" }, isActive: true },
        select: { id: true, name: true },
      });
      if (matchedFirma) {
        await (prisma as any).firmaIslem.create({
          data: {
            firmaId:   matchedFirma.id,
            tarih:     new Date(),
            islemTipi: "HIZMET",
            urunHizmet: `Lab: ${labType}${order.patient ? ` — ${order.patient.fullName}` : ""}`,
            tutar:     Number(price),
            faturaNo:  invoiceNo,
            status:    "AKTIF",
            kdvOrani:  0,
          },
        });
        firmaIntegration = { firmaId: matchedFirma.id, firmaName: matchedFirma.name };
      }
    } catch (integrationErr) {
      // Entegrasyon hatası lab kaydını engellemez — loglayıp devam et
      console.error("[lab-orders] firma entegrasyonu hatası:", integrationErr);
    }
  }

  return NextResponse.json({ ...order, firmaIntegration }, { status: 201 });
}
