import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

const PERIOD_DAYS: Record<string, number> = {
  HAFTALIK: 7, IKIHALFTALIK: 14, AYLIK: 30,
  IKIAYLIK: 60, UCAYLIK: 90, ALTIAYLIK: 180, YILLIK: 365,
};

export async function GET(req: NextRequest) {
  const auth = await requireAuth("payments:read");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) return NextResponse.json([]);

  const patientId = req.nextUrl.searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ message: "patientId zorunlu" }, { status: 400 });

  const packages = await prisma.patientPackage.findMany({
    where: { institutionId: auth.user.institutionId, patientId },
    orderBy: { purchasedAt: "desc" },
    include: {
      doctor: { select: { id: true, fullName: true } },
      definition: { select: { id: true, name: true, treatmentType: true } },
      usages: { orderBy: { usedAt: "desc" }, select: { id: true, usedAt: true, note: true, appointmentId: true } },
    },
  });

  const now = Date.now();
  const withEffectiveStatus = packages.map((p) => ({
    ...p,
    effectiveStatus:
      p.status === "AKTIF" && p.expiresAt && p.expiresAt.getTime() < now
        ? "SURESI_DOLDU"
        : p.status,
  }));

  return NextResponse.json(withEffectiveStatus);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum bilgisi bulunamadı" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const patientId = String(body.patientId || "");
  const doctorId = String(body.doctorId || "");
  const definitionId = body.definitionId ? String(body.definitionId) : null;
  const note = body.note ? String(body.note).trim() : null;
  const method = body.method || "NAKIT";

  if (!patientId || !doctorId) {
    return NextResponse.json({ message: "Hasta ve doktor seçimi zorunlu" }, { status: 400 });
  }

  const [patient, doctor] = await Promise.all([
    prisma.patient.findFirst({ where: { id: patientId, institutionId: auth.user.institutionId }, select: { id: true } }),
    prisma.user.findFirst({ where: { id: doctorId, institutionId: auth.user.institutionId, isActive: true }, select: { id: true } }),
  ]);
  if (!patient) return NextResponse.json({ message: "Hasta bulunamadı" }, { status: 404 });
  if (!doctor) return NextResponse.json({ message: "Doktor bulunamadı" }, { status: 404 });

  let name: string;
  let sessionCount: number;
  let price: number;
  let validityDays: number;

  if (definitionId) {
    const definition = await prisma.packageDefinition.findFirst({
      where: { id: definitionId, institutionId: auth.user.institutionId, isActive: true },
    });
    if (!definition) return NextResponse.json({ message: "Paket şablonu bulunamadı" }, { status: 404 });
    name = definition.name;
    sessionCount = definition.sessionCount;
    price = Number(definition.price);
    validityDays = definition.validityDays;
  } else {
    name = String(body.name || "").trim();
    sessionCount = Number(body.sessionCount);
    price = Number(body.price);
    validityDays = body.validityDays != null ? Number(body.validityDays) : 365;
    if (!name) return NextResponse.json({ message: "Paket adı zorunlu" }, { status: 400 });
    if (!Number.isInteger(sessionCount) || sessionCount < 1) {
      return NextResponse.json({ message: "Seans sayısı en az 1 olmalıdır" }, { status: 400 });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ message: "Fiyat pozitif bir sayı olmalıdır" }, { status: 400 });
    }
  }

  const pesnat = body.pesnat != null ? Number(body.pesnat) : price;
  if (!Number.isFinite(pesnat) || pesnat < 0) {
    return NextResponse.json({ message: "Peşinat negatif olamaz" }, { status: 400 });
  }
  if (pesnat > price) {
    return NextResponse.json({ message: "Peşinat toplam fiyattan büyük olamaz" }, { status: 400 });
  }

  const purchasedAt = new Date();
  const expiresAt = new Date(purchasedAt.getTime() + validityDays * 24 * 60 * 60 * 1000);
  const remaining = Math.round((price - pesnat) * 100) / 100;

  const result = await prisma.$transaction(async (tx) => {
    let paymentId: string | null = null;
    let taksitPlanId: string | null = null;

    if (remaining <= 0) {
      const payment = await tx.payment.create({
        data: { patientId, doctorId, method, amount: price, description: `Paket satışı: ${name}` },
      });
      paymentId = payment.id;
    } else {
      const taksitSayisi = Number(body.taksitSayisi) || 1;
      const period = body.period || "AYLIK";
      const days = PERIOD_DAYS[period] ?? 30;
      const taksitTutar = Math.round((remaining / taksitSayisi) * 100) / 100;
      const taksitlerCreate = Array.from({ length: taksitSayisi }, (_, i) => {
        const vadeDate = new Date(purchasedAt);
        vadeDate.setDate(vadeDate.getDate() + days * (i + 1));
        const isLast = i === taksitSayisi - 1;
        const tutar = isLast ? Math.round((remaining - taksitTutar * (taksitSayisi - 1)) * 100) / 100 : taksitTutar;
        return { siraNo: i + 1, vadeDate, tutar, odenen: 0, kalan: tutar, status: "BEKLIYOR" as const };
      });

      const plan = await tx.taksitPlan.create({
        data: {
          patientId, doctorId, baslik: `Paket: ${name}`,
          toplamBorc: price, pesnat, taksitSayisi, period, startDate: purchasedAt,
          status: "AKTIF", taksitler: { create: taksitlerCreate },
        },
      });
      taksitPlanId = plan.id;

      if (pesnat > 0) {
        const payment = await tx.payment.create({
          data: { patientId, doctorId, method, amount: pesnat, description: `Paket peşinatı: ${name}` },
        });
        paymentId = payment.id;
      }
    }

    const pkg = await tx.patientPackage.create({
      data: {
        institutionId: auth.user.institutionId as string,
        patientId, doctorId, definitionId, name,
        sessionsTotal: sessionCount,
        totalPrice: price,
        purchasedAt, expiresAt, note,
        paymentId,
        taksitPlanId,
      },
    });

    return pkg;
  });

  await writeAudit(auth.user.id, "PATIENT_PACKAGE_SELL", `${name} paketi satıldı (${sessionCount} seans, ${price} TL)`);
  return NextResponse.json(result, { status: 201 });
}
