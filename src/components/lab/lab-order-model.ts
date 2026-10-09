// Laboratuvar işinin istemci tarafındaki tek veri biçimi. API yanıtı eksik
// alan içerse de ekran bozulmasın diye burada güvenli biçime çevrilir.

export type LabInvoiceView = {
  id: string;
  item: string;
  amount: number;
  invoiceNo?: string | null;
  issuedAt: string;
  note?: string | null;
};

export type LabTripView = {
  id: string;
  order: number;
  description: string;
  sentAt: string;
  expectedAt?: string | null;
  receivedAt?: string | null;
  sentNote?: string | null;
  receivedNote?: string | null;
};

export type LabOrderView = {
  id: string;
  labName: string;
  labType: string;
  teeth?: string | null;
  notes?: string | null;
  status: string;
  firmaId?: string | null;
  createdAt?: string | null;
  patient: { id: string; fullName: string; phone?: string | null };
  doctor: { id?: string | null; fullName: string };
  trips: LabTripView[];
  invoices: LabInvoiceView[];
};

type Raw = Record<string, unknown>;

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function normalizeLabOrder(raw: unknown): LabOrderView | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Raw;
  const id = text(source.id);
  if (!id) return null;
  const patient = (source.patient && typeof source.patient === "object" ? source.patient : {}) as Raw;
  const doctor = (source.doctor && typeof source.doctor === "object" ? source.doctor : {}) as Raw;
  const trips = Array.isArray(source.trips) ? source.trips : [];
  const invoices = Array.isArray(source.invoices) ? source.invoices : [];
  return {
    id,
    labName: text(source.labName) || "Laboratuvar belirtilmedi",
    labType: text(source.labType) || "Laboratuvar işi",
    teeth: optionalText(source.teeth),
    notes: optionalText(source.notes),
    status: text(source.status) || "DEVAM_EDIYOR",
    firmaId: optionalText(source.firmaId),
    createdAt: optionalText(source.createdAt),
    patient: {
      id: text(patient.id) || text(source.patientId),
      fullName: text(patient.fullName) || "Hasta belirtilmedi",
      phone: optionalText(patient.phone),
    },
    doctor: {
      id: text(doctor.id) || text(source.doctorId) || null,
      fullName: text(doctor.fullName) || "Hekim belirtilmedi",
    },
    trips: trips
      .filter((trip): trip is Raw => Boolean(trip) && typeof trip === "object")
      .map((trip, index) => ({
        id: text(trip.id) || `${id}-trip-${index}`,
        order: Number(trip.order || index + 1),
        description: text(trip.description) || "Laboratuvar adımı",
        sentAt: text(trip.sentAt) || new Date().toISOString(),
        expectedAt: optionalText(trip.expectedAt),
        receivedAt: optionalText(trip.receivedAt),
        sentNote: optionalText(trip.sentNote),
        receivedNote: optionalText(trip.receivedNote),
      })),
    invoices: invoices
      .filter((invoice): invoice is Raw => Boolean(invoice) && typeof invoice === "object")
      .map((invoice, index) => ({
        id: text(invoice.id) || `${id}-invoice-${index}`,
        item: text(invoice.item) || "Laboratuvar ücreti",
        amount: Number(invoice.amount || 0),
        invoiceNo: optionalText(invoice.invoiceNo),
        issuedAt: text(invoice.issuedAt) || new Date().toISOString(),
        note: optionalText(invoice.note),
      })),
  };
}

export function normalizeLabOrders(raw: unknown): LabOrderView[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeLabOrder).filter((order): order is LabOrderView => Boolean(order));
}

/** API hata gövdesinden okunabilir mesaj çıkarır. */
export function apiErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Raw;
    if (typeof record.error === "string" && record.error) return record.error;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
}

export async function fetchJson(url: string, init: RequestInit | undefined, fallback: string) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(payload, fallback));
  return payload;
}

export function newRequestKey() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
