import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { APPOINTMENT_VISITED_STATUSES } from "@/lib/appointment-status";
import { CHARGEABLE_EXAMINATION_WHERE } from "@/lib/examination-status";
import { effectiveDoctorWhere } from "@/lib/hakedis";
import { computePatientBalances, isDebtorBalance, moneyToNumber } from "@/lib/patient-balance";
import {
  REPORT_ROW_LIMIT,
  type ExpensesReport,
  type PatientReportRow,
  type PatientsReport,
  type ReportDoctor,
  type ReportPatientFilter,
  type SummaryDoctorRow,
  type SummaryReport,
  type TreatmentsReport,
} from "@/lib/report-center-types";

// Raporlar ekranının (/rapor) sunucu hesabı. Her sayı mevcut tek kaynaklardan:
//   • Yapılan tedavi: ücrete yansıyan tedaviler (CHARGEABLE_EXAMINATION_WHERE —
//     ön teşhis, planlanan ve iptal edilen hariç), tedavi tarihine (diagnosedAt)
//     göre. Tutar kayıtlı ücrettir (hekim hakedişi ve hasta dosyasındaki
//     "Yapılan tedaviler" gibi).
//   • Gelen hasta: dönemde Geldi/Tamamlandı randevusu (APPOINTMENT_VISITED_STATUSES)
//     ya da ücrete yansıyan tedavisi olan hasta.
//   • Tahsilat: aktif, hastaya bağlı tahsilatlar (Muhasebe defteriyle aynı);
//     doktor süzgecinde tahsilat formunda seçilen doktor (Payment.doctorId).
//   • Kalan borç (yalnız Hastalar): hastanın BUGÜNKÜ bakiyesi
//     (computePatientBalances — indirim, bütün dönemler ve doktorlar dahil).
//   • Doktorlar: dönemde kaydı olan herkes, sonradan ayrılan (pasife alınan ya da
//     şubeden çıkarılan) doktorlar dahil; "Tüm doktorlar"da doktora göre süzülmez.
//     Önceden yalnız bugün çalışan hekimler sayılıyordu: ayrılan doktorun geçmiş
//     tedavileri raporlardan düşüyordu.
// Para Prisma.Decimal ile toplanır; JSON'a yalnız en sonda kuruşa yuvarlanmış
// sayı olarak çıkar (moneyToNumber). Sorgular kurum + aktif şube ile süzülür.

export type ReportDb = Pick<
  PrismaClient,
  | "user"
  | "appointment"
  | "examination"
  | "payment"
  | "patient"
  | "taksit"
  | "expense"
  | "expenseCategory"
  | "firmaIslem"
  | "firma"
>;

export type ReportScope = {
  /** Oturumun kurumu; null yalnız SUPERADMIN'dir (şube süzgeci yine uygulanır). */
  institutionId: string | null;
  branchId: string;
  period: { gte: Date; lte: Date };
  /** İstenen doktor; bu kurumda yoksa süzgeç yok sayılır. */
  doctorId?: string | null;
};

const ZERO = new Prisma.Decimal(0);
const TOP_LIST_SIZE = 10;

function dec(value: Prisma.Decimal | number | string | null | undefined) {
  return value === null || value === undefined ? ZERO : new Prisma.Decimal(value);
}

function tenantWhere(scope: ReportScope) {
  return { ...(scope.institutionId ? { institutionId: scope.institutionId } : {}), branchId: scope.branchId };
}

/** Dönemin ortak süzgeçleri (doktor süzgeci hariç). */
function periodWheres(scope: ReportScope) {
  const tenant = tenantWhere(scope);
  const treatments: Prisma.ExaminationWhereInput = { ...tenant, diagnosedAt: scope.period, ...CHARGEABLE_EXAMINATION_WHERE };
  const visits: Prisma.AppointmentWhereInput = { ...tenant, startAt: scope.period, status: { in: [...APPOINTMENT_VISITED_STATUSES] } };
  const payments: Prisma.PaymentWhereInput = { ...tenant, status: "ACTIVE", createdAt: scope.period, patientId: { not: null } };
  return { treatments, visits, payments };
}

type DoctorContext = { doctors: ReportDoctor[]; doctorId: string | null };

/**
 * Doktor seçicisinin listesi ve uygulanacak süzgeç: şubede şu an hekim
 * sayılanlar (effectiveDoctorWhere) + dönemde tedavisi, ziyareti ya da
 * tahsilatı olanlar + seçili kişi (dönem değişince seçim kaybolmasın). Şu an
 * hekim sayılmayan ve şubede çalışmayan kişi `left` ("ayrıldı") işaretlenir.
 */
async function loadDoctorContext(scope: ReportScope, db: ReportDb): Promise<DoctorContext> {
  const where = periodWheres(scope);
  const [current, treated, visited, paid] = await Promise.all([
    db.user.findMany({ where: effectiveDoctorWhere(scope.institutionId, scope.branchId), select: { id: true, fullName: true } }),
    db.examination.groupBy({ by: ["doctorId"], where: where.treatments }),
    db.appointment.groupBy({ by: ["doctorId"], where: where.visits }),
    db.payment.groupBy({ by: ["doctorId"], where: { ...where.payments, doctorId: { not: null } } }),
  ]);

  const currentIds = new Set(current.map((user) => user.id));
  const otherIds = new Set<string>();
  for (const row of [...treated, ...visited, ...paid]) {
    if (row.doctorId && !currentIds.has(row.doctorId)) otherIds.add(row.doctorId);
  }
  if (scope.doctorId && !currentIds.has(scope.doctorId)) otherIds.add(scope.doctorId);

  const others = otherIds.size > 0
    ? await db.user.findMany({
        where: { id: { in: [...otherIds] }, ...(scope.institutionId ? { institutionId: scope.institutionId } : {}) },
        select: {
          id: true,
          fullName: true,
          isActive: true,
          branchMemberships: { where: { branchId: scope.branchId, isActive: true }, select: { id: true } },
        },
      })
    : [];

  const doctors: ReportDoctor[] = [
    ...current.map((user) => ({ id: user.id, fullName: user.fullName, left: false })),
    ...others.map((user) => ({ id: user.id, fullName: user.fullName, left: !user.isActive || user.branchMemberships.length === 0 })),
  ].sort((a, b) => a.fullName.localeCompare(b.fullName, "tr"));
  const doctorId = scope.doctorId && doctors.some((doctor) => doctor.id === scope.doctorId) ? scope.doctorId : null;
  return { doctors, doctorId };
}

/** Dönem süzgeçleri + (seçiliyse) doktor süzgeci. */
function reportWheres(scope: ReportScope, context: DoctorContext) {
  const where = periodWheres(scope);
  if (!context.doctorId) return where;
  const byDoctor = { doctorId: context.doctorId };
  return {
    treatments: { ...where.treatments, ...byDoctor },
    visits: { ...where.visits, ...byDoctor },
    payments: { ...where.payments, ...byDoctor },
  };
}

/** "11, 12," gibi kayıtlarda boş parça kalmasın. */
function splitTeeth(value: string | null | undefined) {
  return (value || "").split(",").map((part) => part.trim()).filter(Boolean);
}

// ── Özet ─────────────────────────────────────────────────────────────────────

export async function buildSummaryReport(scope: ReportScope, db: ReportDb = prisma): Promise<SummaryReport> {
  const context = await loadDoctorContext(scope, db);
  const where = reportWheres(scope, context);

  const [visitPairs, treatmentPairs, byTreatment, paidByDoctor] = await Promise.all([
    db.appointment.groupBy({ by: ["patientId", "doctorId"], where: where.visits }),
    db.examination.groupBy({ by: ["patientId", "doctorId"], where: where.treatments, _count: { _all: true }, _sum: { amount: true } }),
    db.examination.groupBy({ by: ["treatmentName"], where: where.treatments, _count: { _all: true } }),
    db.payment.groupBy({ by: ["doctorId"], where: where.payments, _sum: { amount: true } }),
  ]);

  const visited = new Set<string>();
  const patientsByDoctor = new Map<string, Set<string>>();
  const markVisit = (patientId: string, doctorId: string) => {
    visited.add(patientId);
    let patients = patientsByDoctor.get(doctorId);
    if (!patients) {
      patients = new Set<string>();
      patientsByDoctor.set(doctorId, patients);
    }
    patients.add(patientId);
  };
  for (const row of visitPairs) markVisit(row.patientId, row.doctorId);

  let treatmentCount = 0;
  let treatmentTotal = ZERO;
  const treatmentsByDoctor = new Map<string, { count: number; amount: Prisma.Decimal }>();
  for (const row of treatmentPairs) {
    markVisit(row.patientId, row.doctorId);
    const amount = dec(row._sum.amount);
    treatmentCount += row._count._all;
    treatmentTotal = treatmentTotal.plus(amount);
    const current = treatmentsByDoctor.get(row.doctorId);
    treatmentsByDoctor.set(row.doctorId, {
      count: (current?.count ?? 0) + row._count._all,
      amount: (current?.amount ?? ZERO).plus(amount),
    });
  }

  let collected = ZERO;
  let collectedWithoutDoctor = ZERO;
  const collectedByDoctor = new Map<string, Prisma.Decimal>();
  for (const row of paidByDoctor) {
    const amount = dec(row._sum.amount);
    collected = collected.plus(amount);
    if (row.doctorId) collectedByDoctor.set(row.doctorId, amount);
    else collectedWithoutDoctor = collectedWithoutDoctor.plus(amount);
  }

  // Doktorlara göre (doktor seçili değilken). Dönemde kaydı olan her doktor
  // listededir; satırların toplamı şeritteki sayılara eşittir.
  let byDoctor: SummaryDoctorRow[] = [];
  if (!context.doctorId) {
    byDoctor = context.doctors
      .map((doctor) => ({
        doctorId: doctor.id as string | null,
        fullName: doctor.fullName,
        patients: patientsByDoctor.get(doctor.id)?.size ?? 0,
        treatments: treatmentsByDoctor.get(doctor.id)?.count ?? 0,
        treatmentTotal: treatmentsByDoctor.get(doctor.id)?.amount ?? ZERO,
        collected: collectedByDoctor.get(doctor.id) ?? ZERO,
      }))
      .filter((row) => row.patients > 0 || row.treatments > 0 || !row.collected.isZero())
      .sort((a, b) => b.treatmentTotal.comparedTo(a.treatmentTotal) || b.collected.comparedTo(a.collected) || a.fullName.localeCompare(b.fullName, "tr"))
      .map((row) => ({ ...row, treatmentTotal: moneyToNumber(row.treatmentTotal), collected: moneyToNumber(row.collected) }));
    if (!collectedWithoutDoctor.isZero()) {
      byDoctor.push({ doctorId: null, fullName: "Doktor seçilmemiş", patients: 0, treatments: 0, treatmentTotal: 0, collected: moneyToNumber(collectedWithoutDoctor) });
    }
  }

  const treatmentCounts = new Map<string, number>();
  for (const row of byTreatment) {
    const name = row.treatmentName?.trim() || "Adı yazılmamış";
    treatmentCounts.set(name, (treatmentCounts.get(name) ?? 0) + row._count._all);
  }

  return {
    type: "ozet",
    doctors: context.doctors,
    doctorId: context.doctorId,
    visitedPatients: visited.size,
    treatmentCount,
    treatmentTotal: moneyToNumber(treatmentTotal),
    collected: moneyToNumber(collected),
    byDoctor,
    topTreatments: [...treatmentCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"))
      .slice(0, TOP_LIST_SIZE)
      .map(([name, count]) => ({ name, count })),
  };
}

// ── Hastalar ─────────────────────────────────────────────────────────────────

type PatientAccumulator = { doctorIds: Set<string>; treatmentTotal: Prisma.Decimal; lastVisitAt: number };

export async function buildPatientsReport(scope: ReportScope, filter: ReportPatientFilter, db: ReportDb = prisma): Promise<PatientsReport> {
  const context = await loadDoctorContext(scope, db);
  const where = reportWheres(scope, context);

  const [visitGroups, treatmentGroups, paidByPatient, registered] = await Promise.all([
    db.appointment.groupBy({ by: ["patientId", "doctorId"], where: where.visits, _max: { startAt: true } }),
    db.examination.groupBy({ by: ["patientId", "doctorId"], where: where.treatments, _sum: { amount: true }, _max: { diagnosedAt: true } }),
    db.payment.groupBy({ by: ["patientId"], where: where.payments, _sum: { amount: true } }),
    // Hastanın tedavi ve randevuları kayıtlı olduğu şubededir (veritabanı ilişkisi);
    // dönemde kaydı açılanlar aynı şubeden okunur.
    db.patient.findMany({
      where: { ...(scope.institutionId ? { institutionId: scope.institutionId } : {}), homeBranchId: scope.branchId, createdAt: scope.period },
      select: { id: true },
    }),
  ]);

  const patients = new Map<string, PatientAccumulator>();
  const touch = (patientId: string, doctorId: string, at: Date | null) => {
    let entry = patients.get(patientId);
    if (!entry) {
      entry = { doctorIds: new Set<string>(), treatmentTotal: ZERO, lastVisitAt: 0 };
      patients.set(patientId, entry);
    }
    entry.doctorIds.add(doctorId);
    if (at) entry.lastVisitAt = Math.max(entry.lastVisitAt, at.getTime());
    return entry;
  };
  for (const row of visitGroups) touch(row.patientId, row.doctorId, row._max.startAt);
  for (const row of treatmentGroups) {
    const entry = touch(row.patientId, row.doctorId, row._max.diagnosedAt);
    entry.treatmentTotal = entry.treatmentTotal.plus(dec(row._sum.amount));
  }

  const ids = [...patients.keys()];
  const balances = await computePatientBalances({ institutionId: scope.institutionId, branchId: scope.branchId, patientIds: ids }, db);
  const registeredIds = new Set(registered.map((patient) => patient.id));
  const paid = new Map<string, Prisma.Decimal>();
  for (const row of paidByPatient) if (row.patientId) paid.set(row.patientId, dec(row._sum.amount));

  const all = ids.map((id) => ({
    id,
    entry: patients.get(id) as PatientAccumulator,
    isNew: registeredIds.has(id),
    collected: paid.get(id) ?? ZERO,
    balance: balances.get(id)?.bakiye ?? ZERO,
  }));
  const counts = {
    all: all.length,
    new: all.filter((row) => row.isNew).length,
    debtors: all.filter((row) => isDebtorBalance(row.balance)).length,
  };
  const filtered = filter === "yeni"
    ? all.filter((row) => row.isNew)
    : filter === "borclu"
      ? all.filter((row) => isDebtorBalance(row.balance))
      : all;

  let treatmentTotal = ZERO;
  let collected = ZERO;
  let debt = ZERO;
  for (const row of filtered) {
    treatmentTotal = treatmentTotal.plus(row.entry.treatmentTotal);
    collected = collected.plus(row.collected);
    if (isDebtorBalance(row.balance)) debt = debt.plus(row.balance);
  }

  // Liste sınırı aşılırsa en son gelenler (borçlularda en çok borcu olanlar) gösterilir.
  const sorted = [...filtered].sort((a, b) => (filter === "borclu" ? b.balance.comparedTo(a.balance) : 0)
    || b.entry.lastVisitAt - a.entry.lastVisitAt
    || a.id.localeCompare(b.id));
  const shown = sorted.slice(0, REPORT_ROW_LIMIT);
  const names = shown.length > 0
    ? await db.patient.findMany({
        where: { id: { in: shown.map((row) => row.id) }, ...(scope.institutionId ? { institutionId: scope.institutionId } : {}) },
        select: { id: true, fullName: true },
      })
    : [];
  const nameById = new Map(names.map((patient) => [patient.id, patient.fullName]));

  const rows: PatientReportRow[] = shown.map((row) => ({
    id: row.id,
    fullName: nameById.get(row.id) || "Hasta",
    isNew: row.isNew,
    doctorIds: [...row.entry.doctorIds],
    treatmentTotal: moneyToNumber(row.entry.treatmentTotal),
    collected: moneyToNumber(row.collected),
    balance: moneyToNumber(row.balance),
  }));

  return {
    type: "hastalar",
    doctors: context.doctors,
    doctorId: context.doctorId,
    filter,
    counts,
    totals: { treatmentTotal: moneyToNumber(treatmentTotal), collected: moneyToNumber(collected), debt: moneyToNumber(debt) },
    rows,
    truncated: sorted.length > REPORT_ROW_LIMIT,
    limit: REPORT_ROW_LIMIT,
  };
}

// ── Tedaviler ────────────────────────────────────────────────────────────────

export async function buildTreatmentsReport(scope: ReportScope, db: ReportDb = prisma): Promise<TreatmentsReport> {
  const context = await loadDoctorContext(scope, db);
  const where = reportWheres(scope, context);

  const [rows, aggregate] = await Promise.all([
    db.examination.findMany({
      where: where.treatments,
      select: {
        id: true, diagnosedAt: true, treatmentName: true, toothNo: true, amount: true, doctorId: true, patientId: true,
        patient: { select: { fullName: true } },
      },
      orderBy: [{ diagnosedAt: "desc" }, { id: "desc" }],
      take: REPORT_ROW_LIMIT + 1,
    }),
    db.examination.aggregate({ where: where.treatments, _count: { _all: true }, _sum: { amount: true } }),
  ]);

  return {
    type: "tedaviler",
    doctors: context.doctors,
    doctorId: context.doctorId,
    totals: { count: aggregate._count._all, amount: moneyToNumber(aggregate._sum.amount) },
    rows: rows.slice(0, REPORT_ROW_LIMIT).map((row) => ({
      id: row.id,
      date: row.diagnosedAt.toISOString(),
      patientId: row.patientId,
      patientName: row.patient?.fullName || "Hasta",
      doctorId: row.doctorId,
      treatmentName: row.treatmentName?.trim() || "Adı yazılmamış",
      tooth: splitTeeth(row.toothNo).join(", "),
      amount: moneyToNumber(row.amount),
    })),
    truncated: rows.length > REPORT_ROW_LIMIT,
    limit: REPORT_ROW_LIMIT,
  };
}

// ── Giderler ─────────────────────────────────────────────────────────────────

/** Giderler kliniğin geneli içindir (doktora göre süzülmez); doktor listesi yine döner ki seçim korunsun. */
export async function buildExpensesReport(scope: ReportScope, db: ReportDb = prisma): Promise<ExpensesReport> {
  const tenant = tenantWhere(scope);
  const [context, expenseGroups, purchaseGroups] = await Promise.all([
    loadDoctorContext(scope, db),
    db.expense.groupBy({ by: ["categoryId", "category"], where: { ...tenant, tarih: scope.period, status: "AKTIF" }, _sum: { tutar: true } }),
    // Laboratuvar ücreti tedarikçiye HIZMET olarak işlenir (src/lib/lab-firma-integration.ts);
    // tedarikçi listesinde laboratuvarın adıyla görünür, ayrıca eklenmez.
    db.firmaIslem.groupBy({
      by: ["firmaId"],
      where: { ...tenant, tarih: scope.period, status: "AKTIF", islemTipi: { in: ["ALIM", "HIZMET"] } },
      _sum: { tutar: true },
    }),
  ]);

  const categoryIds = [...new Set(expenseGroups.map((group) => group.categoryId).filter((id): id is string => Boolean(id)))];
  const firmaIds = purchaseGroups.map((group) => group.firmaId);
  const [categories, firmas] = await Promise.all([
    categoryIds.length > 0
      ? db.expenseCategory.findMany({ where: { id: { in: categoryIds }, ...(scope.institutionId ? { institutionId: scope.institutionId } : {}) }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    firmaIds.length > 0
      ? db.firma.findMany({ where: { id: { in: firmaIds }, ...tenant }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ]);
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const firmaName = new Map(firmas.map((firma) => [firma.id, firma.name]));

  let expenseTotal = ZERO;
  const expenseByName = new Map<string, Prisma.Decimal>();
  for (const group of expenseGroups) {
    const amount = dec(group._sum.tutar);
    expenseTotal = expenseTotal.plus(amount);
    const name = (group.categoryId && categoryName.get(group.categoryId)) || group.category?.trim() || "Diğer";
    expenseByName.set(name, (expenseByName.get(name) ?? ZERO).plus(amount));
  }
  let purchaseTotal = ZERO;
  const purchaseByName = new Map<string, Prisma.Decimal>();
  for (const group of purchaseGroups) {
    const amount = dec(group._sum.tutar);
    purchaseTotal = purchaseTotal.plus(amount);
    const name = firmaName.get(group.firmaId) || "Tedarikçi";
    purchaseByName.set(name, (purchaseByName.get(name) ?? ZERO).plus(amount));
  }
  const toList = (map: Map<string, Prisma.Decimal>) => [...map.entries()]
    .filter(([, amount]) => !amount.isZero())
    .sort((a, b) => b[1].comparedTo(a[1]) || a[0].localeCompare(b[0], "tr"))
    .map(([name, amount]) => ({ name, amount: moneyToNumber(amount) }));

  return {
    type: "giderler",
    doctors: context.doctors,
    doctorId: null,
    expenseTotal: moneyToNumber(expenseTotal),
    expenseByCategory: toList(expenseByName),
    purchaseTotal: moneyToNumber(purchaseTotal),
    purchasesBySupplier: toList(purchaseByName),
  };
}
