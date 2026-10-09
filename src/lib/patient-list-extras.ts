import { prisma } from "@/lib/prisma";

// Hasta listesinde (GET /api/patients?extras=1) satır başına "son ziyaret",
// "sonraki randevu" ve "kalan bakiye". Yalnız ekrandaki sayfanın hasta
// kimlikleri için toplu sorgu yapılır (satır başına ayrı istek yok).
//
// Bakiye formülü hasta dosyasıyla (hasta-detay-content.tsx: indirimli
// ücretlenen tedavi − tahsilat) ve Muhasebe > Alacaklar ile
// (api/muhasebe/alacaklar) AYNIDIR: ön teşhis/diagnoz kayıtları hariç
// tedavi toplamı, hastanın indirim oranı uygulanır, aktif tahsilatlar
// düşülür; hepsi aktif şube içinde.

export type PatientListExtra = {
  lastVisitAt: string | null;
  nextAppointment: { startAt: string; doctorName: string | null } | null;
  balance: number | null;
};

const DIAGNOSIS_EXCLUDE = [
  { status: { contains: "diagnoz", mode: "insensitive" as const } },
  { status: { contains: "ön teşhis", mode: "insensitive" as const } },
  { status: { contains: "on teshis", mode: "insensitive" as const } },
];

const UPCOMING_STATUSES = ["BEKLIYOR", "GELDI", "ONAYLANDI"] as const;
const VISITED_STATUSES = ["GELDI", "TAMAMLANDI"] as const;

export async function loadPatientListExtras(options: {
  institutionId: string | null;
  branchId: string;
  patients: Array<{ id: string; discountRate?: number | null }>;
  includeVisits: boolean;
  includeBalance: boolean;
  now?: Date;
}): Promise<Map<string, PatientListExtra>> {
  const { institutionId, branchId, patients, includeVisits, includeBalance } = options;
  const now = options.now || new Date();
  const ids = patients.map((patient) => patient.id);
  const result = new Map<string, PatientListExtra>(
    ids.map((id) => [id, { lastVisitAt: null, nextAppointment: null, balance: includeBalance ? 0 : null }]),
  );
  if (ids.length === 0 || (!includeVisits && !includeBalance)) return result;

  const tenant = { ...(institutionId ? { institutionId } : {}), branchId };

  const [upcoming, visited, examSums, paymentSums] = await Promise.all([
    includeVisits
      ? prisma.appointment.findMany({
          where: { ...tenant, patientId: { in: ids }, startAt: { gte: now }, status: { in: [...UPCOMING_STATUSES] } },
          select: { patientId: true, startAt: true, doctor: { select: { fullName: true } } },
          orderBy: { startAt: "asc" },
          take: 2000,
        })
      : Promise.resolve([]),
    includeVisits
      ? prisma.appointment.groupBy({
          by: ["patientId"],
          where: { ...tenant, patientId: { in: ids }, startAt: { lt: now }, status: { in: [...VISITED_STATUSES] } },
          _max: { startAt: true },
        })
      : Promise.resolve([]),
    includeBalance
      ? prisma.examination.groupBy({
          by: ["patientId"],
          where: { ...tenant, patientId: { in: ids }, NOT: DIAGNOSIS_EXCLUDE },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
    includeBalance
      ? prisma.payment.groupBy({
          by: ["patientId"],
          where: { ...tenant, patientId: { in: ids }, status: "ACTIVE" },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
  ]);

  for (const appointment of upcoming) {
    const entry = result.get(appointment.patientId);
    if (!entry || entry.nextAppointment) continue;
    entry.nextAppointment = { startAt: appointment.startAt.toISOString(), doctorName: appointment.doctor?.fullName || null };
  }
  for (const row of visited) {
    const entry = result.get(row.patientId);
    if (entry && row._max.startAt) entry.lastVisitAt = row._max.startAt.toISOString();
  }

  if (includeBalance) {
    const charged = new Map(examSums.map((row) => [row.patientId, Number(row._sum.amount ?? 0)]));
    const paid = new Map(paymentSums.map((row) => [row.patientId as string, Number(row._sum.amount ?? 0)]));
    for (const patient of patients) {
      const entry = result.get(patient.id);
      if (!entry) continue;
      const gross = charged.get(patient.id) ?? 0;
      const net = gross * (1 - Number(patient.discountRate || 0) / 100);
      entry.balance = Math.round((net - (paid.get(patient.id) ?? 0)) * 100) / 100;
    }
  }

  return result;
}
