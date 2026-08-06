import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiTiming } from "@/lib/api";
import { effectiveDoctorWhere } from "@/lib/hakedis";
import { stripSystemTags } from "@/lib/format-text";
import { isValidDateKey, turkeyDateKey, turkeyDayRangeUtc } from "@/lib/tz";

export const GET = withApiTiming("finance", async function GET(request: NextRequest) {
  const auth = await requireAuth("finance:read");
  if (auth.error) return auth.error;

  const institutionId = auth.user.institutionId;

  // DOKTOR rolü: sadece kendi verilerini görebilir, doctorId parametresi kendi ID'si ile değiştirilir
  const rawDoctorId = request.nextUrl.searchParams.get("doctorId") || undefined;
  const fromRaw = request.nextUrl.searchParams.get("from");
  const toRaw = request.nextUrl.searchParams.get("to");
  if ((fromRaw && !isValidDateKey(fromRaw)) || (toRaw && !isValidDateKey(toRaw))) {
    return NextResponse.json({ message: "Geçersiz tarih aralığı" }, { status: 400 });
  }
  if (fromRaw && toRaw && fromRaw > toRaw) {
    return NextResponse.json({ message: "Başlangıç tarihi bitiş tarihinden sonra olamaz" }, { status: 400 });
  }
  // from/to hiç verilmezse tüm geçmiş taranmasın diye içinde bulunulan yıl varsayılır.
  const currentYearStart = turkeyDayRangeUtc(`${turkeyDateKey().slice(0, 4)}-01-01`).start;
  const fromDate = fromRaw ? turkeyDayRangeUtc(fromRaw).start : (toRaw ? undefined : currentYearStart);
  const toDate = toRaw ? turkeyDayRangeUtc(toRaw).end : undefined;

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
        where: effectiveDoctorWhere(institutionId),
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

  const expenseDateFilter = fromDate || toDate ? {
    tarih: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) }
  } : {};

  const [examinations, doctorPayments, doctorPayoutExpenses, allPatientPayments, labInvoices] = await Promise.all([
    // Bu doktorun yaptığı ücretlendirilebilir tedaviler
    prisma.examination.findMany({
      where: hasScopedDoctors ? { doctorId: doctorIdFilter, ...dateFilter, ...treatmentOnlyWhere } : { ...dateFilter, ...treatmentOnlyWhere },
      select: { patientId: true, doctorId: true, treatmentName: true, toothNo: true, amount: true },
      orderBy: { diagnosedAt: "desc" }
    }),
    // Kurumun bu doktora yaptığı ödemeler — eski (Payment.doctorId) akış
    prisma.payment.findMany({
      where: {
        status: "ACTIVE",
        ...(institutionId ? { institutionId } : {}),
        ...(hasScopedDoctors ? { doctorId: doctorIdFilter } : {}),
        ...payDateFilter,
      },
      orderBy: { createdAt: "desc" }
    }),
    // Kurumun bu doktora yaptığı ödemeler — güncel (muhasebe > Hakediş sekmesi,
    // Expense.doctorId) akış. hakedis.ts'teki computeDoctorMonthlyOdenen ile aynı
    // kaynağı kullanıyor; burada eksik olması "earned" rakamının finans ekranında
    // muhasebe ekranındakinden düşük görünmesine yol açıyordu.
    prisma.expense.findMany({
      where: {
        status: "AKTIF",
        doctorId: hasScopedDoctors ? doctorIdFilter : { not: null },
        ...expenseDateFilter,
      },
      select: { id: true, tarih: true, tutar: true, description: true },
      orderBy: { tarih: "desc" },
    }),
    // Tüm hasta ödemeleri (patientId üzerinden)
    prisma.payment.findMany({
      where: {
        status: "ACTIVE",
        ...(institutionId ? { institutionId } : {}),
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
      include: { patient: { select: { fullName: true } } },
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
  const earned =
    doctorPayments.reduce((sum, p) => sum + Number(p.amount), 0) +
    doctorPayoutExpenses.reduce((sum, e) => sum + Number(e.tutar), 0);
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

  const mergedDoctorPayments = [
    ...doctorPayments.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      description: p.description,
      amount: Number(p.amount),
    })),
    ...doctorPayoutExpenses.map((e) => ({
      id: e.id,
      createdAt: e.tarih,
      description: stripSystemTags(e.description) || "Hakediş ödemesi",
      amount: Number(e.tutar),
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({
    receivable,
    received,
    toReceive,
    totalTreatments,
    labCost,
    earned,
    topExaminations,
    topTeeth,
    payments: mergedDoctorPayments,
    patientPayments: patientPayments.map(p => ({
      ...p,
      patientName: p.patient?.fullName || "-"
    }))
  });
});
