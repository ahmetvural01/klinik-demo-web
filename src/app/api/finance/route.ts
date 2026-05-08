import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { paymentSchema } from "@/lib/validators";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("finance:read");
  if (auth.error) return auth.error;

  // DOKTOR rolü: sadece kendi verilerini görebilir, doctorId parametresi kendi ID'si ile değiştirilir
  const rawDoctorId = request.nextUrl.searchParams.get("doctorId") || undefined;
  const doctorId = auth.user.role === "DOKTOR" ? auth.user.id : rawDoctorId;
  const fromRaw = request.nextUrl.searchParams.get("from");
  const toRaw = request.nextUrl.searchParams.get("to");
  const fromDate = fromRaw ? new Date(fromRaw + "T00:00:00.000Z") : undefined;
  const toDate = toRaw ? new Date(toRaw + "T23:59:59.999Z") : undefined;

  const dateFilter = fromDate || toDate ? {
    diagnosedAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) }
  } : {};
  const payDateFilter = fromDate || toDate ? {
    createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) }
  } : {};

  const treatmentOnlyWhere = {
    NOT: [
      { status: { contains: "diagnoz", mode: "insensitive" as const } },
      { status: { contains: "ön teşhis", mode: "insensitive" as const } },
      { status: { contains: "on teshis", mode: "insensitive" as const } },
    ],
  };

  const [examinations, doctorPayments, allPatientPayments, labInvoices] = await Promise.all([
    // Bu doktorun yaptığı ücretlendirilebilir tedaviler
    prisma.examination.findMany({
      where: { doctorId, ...dateFilter, ...treatmentOnlyWhere },
      include: { patient: true },
      orderBy: { diagnosedAt: "desc" }
    }),
    // Kurumun bu doktora yaptığı ödemeler (doctorId set olanlar)
    prisma.payment.findMany({
      where: { doctorId, ...payDateFilter },
      orderBy: { createdAt: "desc" }
    }),
    // Tüm hasta ödemeleri (patientId üzerinden)
    prisma.payment.findMany({
      where: { doctorId: null, ...payDateFilter },
      include: { patient: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.labOrderInvoice.findMany({
      where: {
        labOrder: {
          doctorId,
        },
        ...(fromDate || toDate
          ? {
              issuedAt: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      select: {
        amount: true,
      },
    })
  ]);

  // Bu doktorun muayene ettiği hasta ID'leri
  const patientIds = [...new Set(examinations.map(e => e.patientId))];

  // Bu hastalara ait hasta ödemeleri
  const patientPayments = allPatientPayments.filter(p => p.patientId && patientIds.includes(p.patientId));

  const totalTreatments = examinations.reduce((sum, e) => sum + Number(e.amount), 0);
  const labCost = labInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const received = patientPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const earned = doctorPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const toReceive = Math.max(0, totalTreatments - received);
  const receivable = Math.max(0, totalTreatments - labCost - earned);

  // En çok yapılan muayene türleri
  const treatmentCounts: Record<string, number> = {};
  for (const e of examinations) {
    const key = e.treatmentName || "Bilinmiyor";
    treatmentCounts[key] = (treatmentCounts[key] || 0) + 1;
  }
  const topExaminations = Object.entries(treatmentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([type, count]) => ({ type, count }));

  // En çok muayene edilen dişler
  const toothCounts: Record<string, number> = {};
  for (const e of examinations) {
    if (!e.toothNo) continue;
    for (const t of e.toothNo.split(",").map(s => s.trim()).filter(Boolean)) {
      toothCounts[t] = (toothCounts[t] || 0) + 1;
    }
  }
  const topTeeth = Object.entries(toothCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tooth, count]) => ({ tooth, count }));

  return NextResponse.json({
    receivable,
    received,
    toReceive,
    totalTreatments,
    labCost,
    earned,
    topExaminations,
    topTeeth,
    payments: doctorPayments,
    patientPayments: patientPayments.map(p => ({
      ...p,
      patientName: p.patient?.fullName || "-"
    }))
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("finance:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const parsed = paymentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz ödeme verisi" }, { status: 400 });
  }

  const payment = await prisma.payment.create({
    data: parsed.data
  });

  await writeAudit(auth.user.id, "PAYMENT_CREATE", `${payment.amount.toString()} ödeme alindi`);
  return NextResponse.json(payment, { status: 201 });
}
