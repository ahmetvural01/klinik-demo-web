import { prisma } from "@/lib/prisma";
import { computePatientBalances, moneyToNumber } from "@/lib/patient-balance";

// Hasta listesinde (GET /api/patients?extras=1) satır başına "son ziyaret",
// "sonraki randevu" ve "kalan bakiye". Yalnız ekrandaki sayfanın hasta
// kimlikleri için toplu sorgu yapılır (satır başına ayrı istek yok).
//
// Bakiye tek kaynaktan gelir (src/lib/patient-balance.ts): hasta dosyası,
// Muhasebe > Alacaklar ve Raporlar ile aynı kural — ücrete yansıyan tedavi
// toplamı (ön teşhis, planlanan ve iptal edilen tedaviler hariç), hastanın
// indirim oranı, aktif tahsilatlar; hepsi aktif şube içinde. Önceden iptal
// edilen ve planlanan tedaviler bu sütunda borç görünüyordu.

export type PatientListExtra = {
  lastVisitAt: string | null;
  nextAppointment: { startAt: string; doctorName: string | null } | null;
  balance: number | null;
};

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

  const [upcoming, visited, balances] = await Promise.all([
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
      ? computePatientBalances({
          institutionId,
          branchId,
          patientIds: ids,
          // Liste satırındaki indirim oranı zaten okundu; hasta tablosu yeniden okunmaz.
          discountRates: new Map(patients.map((patient) => [patient.id, patient.discountRate])),
        })
      : Promise.resolve(null),
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

  if (balances) {
    for (const [patientId, balance] of balances) {
      const entry = result.get(patientId);
      if (entry) entry.balance = moneyToNumber(balance.bakiye);
    }
  }

  return result;
}
