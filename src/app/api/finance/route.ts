import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { paymentSchema } from "@/lib/validators";
import { requireAuth, writeAudit } from "@/lib/api";
import { createIntegratedPayment } from "@/lib/payment-ledger";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("finance:read");
  if (auth.error) return auth.error;

  const institutionId = auth.user.institutionId;

  // DOKTOR rolü: sadece kendi verilerini görebilir, doctorId parametresi kendi ID'si ile değiştirilir
  const rawDoctorId = request.nextUrl.searchParams.get("doctorId") || undefined;
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

  const institutionDoctors = institutionId
    ? await prisma.user.findMany({
        where: { institutionId, role: "DOKTOR", isActive: true },
        select: { id: true, fullName: true, kkYuzde: true, genelYuzde: true, maasYuzde: true },
      })
    : [];
  const institutionDoctorIds = institutionDoctors.map((doctor) => doctor.id);
  if (institutionId && institutionDoctorIds.length === 0) {
    return NextResponse.json({
      receivable: 0,
      received: 0,
      toReceive: 0,
      totalTreatments: 0,
      labCost: 0,
      earned: 0,
      topExaminations: [],
      topTeeth: [],
      payments: [],
      patientPayments: [],
    });
  }
  const doctorId = auth.user.role === "DOKTOR"
    ? auth.user.id
    : (rawDoctorId && institutionDoctorIds.includes(rawDoctorId) ? rawDoctorId : undefined);
  const scopedDoctorIds = institutionId ? (doctorId ? [doctorId] : institutionDoctorIds) : (doctorId ? [doctorId] : []);
  const hasScopedDoctors = scopedDoctorIds.length > 0;
  const doctorIdFilter = hasScopedDoctors ? { in: scopedDoctorIds } : undefined;

  const [examinations, doctorPayments, allPatientPayments, labInvoices] = await Promise.all([
    // Bu doktorun yaptığı ücretlendirilebilir tedaviler
    prisma.examination.findMany({
      where: hasScopedDoctors ? { doctorId: doctorIdFilter, ...dateFilter, ...treatmentOnlyWhere } : { ...dateFilter, ...treatmentOnlyWhere },
      include: { patient: true },
      orderBy: { diagnosedAt: "desc" }
    }),
    // Kurumun bu doktora yaptığı ödemeler (doctorId set olanlar)
    prisma.payment.findMany({
      where: hasScopedDoctors ? { doctorId: doctorIdFilter, ...payDateFilter } : { ...payDateFilter },
      orderBy: { createdAt: "desc" }
    }),
    // Tüm hasta ödemeleri (patientId üzerinden)
    prisma.payment.findMany({
      where: {
        doctorId: null,
        ...payDateFilter,
        ...(hasScopedDoctors
          ? {
              patient: {
                examinations: {
                  some: {
                    doctorId: { in: scopedDoctorIds },
                  },
                },
              },
            }
          : {}),
      },
      include: { patient: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.labOrderInvoice.findMany({
      where: {
        labOrder: {
          ...(hasScopedDoctors ? { doctorId: doctorIdFilter } : {}),
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

  if (auth.user.institutionId) {
    const institutionDoctors = await prisma.user.findMany({
      where: { institutionId: auth.user.institutionId, role: "DOKTOR", isActive: true },
      select: { id: true },
    });
    const doctorIds = institutionDoctors.map((doctor) => doctor.id);

    if (parsed.data.doctorId && !doctorIds.includes(parsed.data.doctorId)) {
      return NextResponse.json({ message: "Bu doktor kurum kapsamı disinda" }, { status: 403 });
    }

    if (parsed.data.patientId) {
      const relatedPatient = await prisma.patient.findFirst({
        where: {
          id: parsed.data.patientId,
          institutionId: auth.user.institutionId,
        },
        select: { id: true },
      });

      if (!relatedPatient) {
        return NextResponse.json({ message: "Hasta kurum kapsamı disinda" }, { status: 403 });
      }
    }
  }

  const { payment } = await prisma.$transaction((tx) =>
    createIntegratedPayment({
      tx,
      patientId: parsed.data.patientId,
      doctorId: parsed.data.doctorId,
      method: parsed.data.method,
      amount: Number(parsed.data.amount),
      description: parsed.data.description,
      posId: parsed.data.posId,
    })
  );

  await writeAudit(auth.user.id, "PAYMENT_CREATE", `${payment.amount.toString()} ödeme alindi`);
  return NextResponse.json(payment, { status: 201 });
}
