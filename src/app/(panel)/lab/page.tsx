"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LabInvoice = {
  id: string;
  item: string;
  amount: number;
  invoiceNo?: string;
  issuedAt: string;
  note?: string;
};

type LabTrip = {
  id: string;
  order: number;
  description: string;
  sentAt: string;
  receivedAt?: string;
  sentNote?: string;
  receivedNote?: string;
};

type LabOrder = {
  id: string;
  labName: string;
  labType: string;
  teeth?: string;
  notes?: string;
  status: string;
  patient: { id: string; fullName: string; phone?: string };
  doctor: { id: string; fullName: string };
  trips: LabTrip[];
  invoices: LabInvoice[];
};

type Patient = { id: string; fullName: string };
type Doctor = { id: string; fullName: string; role: string };

const LAB_CATEGORIES = [
  {
    group: "Sabit Restorasyon",
    items: [
      "Zirkonyum",
      "E-max",
      "Metal Destekli Porselen",
      "Full Metal",
      "Kuron Tamir",
    ],
  },
  {
    group: "Veneer",
    items: ["Veneer (Laminat)"],
  },
  {
    group: "Protez",
    items: [
      "Tam Protez",
      "Hareketli Kısmi Protez",
      "Hareketli Kısmi Protez (Metal Kroşe)",
      "Protez Tamir",
      "İmmediyat Protez",
    ],
  },
  {
    group: "İmplant Üstü Restorasyon",
    items: [
      "İmplant Üstü Sabit Restorasyon",
      "İmplant Üstü Hareketli Protez",
    ],
  },
  {
    group: "Aparey ve Plak",
    items: [
      "Gece Plağı",
      "Kas Gevşetici Splint (Michigan)",
      "Şeffaf Plak (Aligner)",
      "Braket Reteyner",
      "Bruksizm Plağı",
    ],
  },
  {
    group: "Estetik & Diğer",
    items: ["Beyazlatma Atel", "Zirkon Alt Yapı", "Braket", "Diğer"],
  },
];

// Flat list for backward-compat lookups
const LAB_TYPES = LAB_CATEGORIES.flatMap((c) => c.items);

// Workflow templates: iş türüne göre adım önerileri
const WORKFLOW_TEMPLATES: Record<string, { send: string; request: string }[]> = {
  Zirkonyum: [
    { send: "Ölçü", request: "Zirkonyum Alt Yapı" },
    { send: "Zirkonyum Alt Yapı", request: "Dentin Prova" },
    { send: "Dentin Prova", request: "Glazeli Bitim" },
  ],
  "E-max": [
    { send: "Ölçü", request: "E-max Prova" },
    { send: "E-max Prova", request: "Glazeli Bitim" },
  ],
  "Metal Destekli Porselen": [
    { send: "Ölçü", request: "Metal Alt Yapı Prova" },
    { send: "Metal Alt Yapı Prova", request: "Dentin Prova" },
    { send: "Dentin Prova", request: "Glazeli Bitim" },
  ],
  "Full Metal": [
    { send: "Ölçü", request: "Metal Prova" },
    { send: "Metal Prova", request: "Final Bitim" },
  ],
  "Kuron Tamir": [
    { send: "Kırık/Hasarlı Kronkopru", request: "Onarılmış Kronkopru" },
  ],
  "Veneer (Laminat)": [
    { send: "Ölçü", request: "Wax-up / Mock-up Prova" },
    { send: "Mock-up Onayı", request: "Laminat Prova" },
    { send: "Laminat Prova", request: "Glazeli Bitim" },
  ],
  "Zirkon Veneer": [
    { send: "Ölçü", request: "Zirkonyum Alt Yapı" },
    { send: "Zirkonyum Alt Yapı", request: "Dentin Prova" },
    { send: "Dentin Prova", request: "Glazeli Bitim" },
  ],
  "Tam Protez": [
    { send: "Primer Ölçü", request: "Bireysel Kaşık" },
    { send: "Fonksiyonel Ölçü", request: "Mum Prova" },
    { send: "Mum Prova", request: "Akrilik Prova" },
    { send: "Akrilik Prova", request: "Tam Protez Bitim" },
  ],
  "Hareketli Kısmi Protez": [
    { send: "Ölçü", request: "Altyapı Prova" },
    { send: "Altyapı Prova", request: "Diş Dizimi Mum Prova" },
    { send: "Diş Dizimi Mum Prova", request: "Final Protez" },
  ],
  "Hareketli Kısmi Protez (Metal Kroşe)": [
    { send: "Ölçü", request: "Kroşe Altyapı Prova" },
    { send: "Kroşe Altyapı Prova", request: "Diş Dizimi Mum Prova" },
    { send: "Diş Dizimi Mum Prova", request: "Final Protez" },
  ],
  "Protez Tamir": [
    { send: "Kırık Protez", request: "Tamir Edilmiş Protez" },
  ],
  "İmplant Üstü Sabit Restorasyon": [
    { send: "İmplant Ölçüsü (Scanbody / Transfer)", request: "Altyapı Prova" },
    { send: "Altyapı Prova", request: "Dentin Prova" },
    { send: "Dentin Prova", request: "Glazeli Bitim" },
  ],
  // Backward compatibility for legacy values
  "Zirkon Kronkopru": [
    { send: "Ölçü", request: "Zirkonyum Alt Yapı" },
    { send: "Zirkonyum Alt Yapı", request: "Dentin Prova" },
    { send: "Dentin Prova", request: "Glazeli Bitim" },
  ],
  "E-max Kronkopru": [
    { send: "Ölçü", request: "E-max Prova" },
    { send: "E-max Prova", request: "Glazeli Bitim" },
  ],
  "Metal Destekli Porselen Kronkopru": [
    { send: "Ölçü", request: "Metal Alt Yapı Prova" },
    { send: "Metal Alt Yapı Prova", request: "Dentin Prova" },
    { send: "Dentin Prova", request: "Glazeli Bitim" },
  ],
  "Full Metal Kronkopru": [
    { send: "Ölçü", request: "Metal Prova" },
    { send: "Metal Prova", request: "Final Bitim" },
  ],
  "İmplant Kronkopru (Tekli)": [
    { send: "İmplant Ölçüsü (Scanbody / Transfer)", request: "Altyapı Prova" },
    { send: "Altyapı Prova", request: "Dentin Prova" },
    { send: "Dentin Prova", request: "Glazeli Bitim" },
  ],
  "İmplant Köprü": [
    { send: "İmplant Ölçüsü (Scanbody / Transfer)", request: "Altyapı Prova" },
    { send: "Altyapı Prova", request: "Dentin Prova" },
    { send: "Dentin Prova", request: "Glazeli Bitim" },
  ],
  "İmplant Üstü Hareketli Protez": [
    { send: "Ölçü + Bar Ölçüsü", request: "Bar Prova" },
    { send: "Bar Prova", request: "Diş Dizimi Mum Prova" },
    { send: "Diş Dizimi Mum Prova", request: "Final Protez" },
  ],
  "Gece Plağı": [
    { send: "Ölçü", request: "Gece Plağı" },
  ],
  "Kas Gevşetici Splint (Michigan)": [
    { send: "Ölçü", request: "Michigan Splint" },
    { send: "Splint Prova", request: "Oklüzal Ayarlama" },
  ],
  "Şeffaf Plak (Aligner)": [
    { send: "Dijital Tarama / Ölçü", request: "Aligner Seti" },
  ],
  "Braket Reteyner": [
    { send: "Ölçü", request: "Reteyner" },
  ],
  "Bruksizm Plağı": [
    { send: "Ölçü", request: "Bruksizm Plağı" },
  ],
  "Beyazlatma Atel": [
    { send: "Ölçü", request: "Beyazlatma Atel" },
  ],
};

// FDI diş numaraları
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT  = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT  = [31, 32, 33, 34, 35, 36, 37, 38];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];

const CUR = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0 });
const NEW_LAB_VALUE = "__new_lab__";

/** Yeni format: "Ölçü → Metal Alt Yapı" → {sentItem, requestedItem} 
 *  Eski format: "Olcu gonderimi -TRIP" → {sentItem: aynen, requestedItem: ""} */
function parseDesc(description: string): { sentItem: string; requestedItem: string } {
  const idx = description.indexOf(" → ");
  if (idx === -1) return { sentItem: description, requestedItem: "" };
  return { sentItem: description.slice(0, idx), requestedItem: description.slice(idx + 3) };
}

function normalizeWorkflowText(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/\(final\)/g, "")
    .replace(/son duzeltme\s*\/\s*glaze/g, "glazeli bitim")
    .replace(/glaze/g, "glazeli bitim")
    .replace(/zirkon\s+alt\s*yapi/g, "zirkonyum alt yapi")
    .replace(/zirkon\s+altyapi/g, "zirkonyum alt yapi")
    .replace(/\s+/g, " ")
    .trim();
}

function isSameWorkflowValue(left: string, right: string) {
  return normalizeWorkflowText(left) === normalizeWorkflowText(right);
}

function getNextTemplateStepIndex(labType: string, trips: { description: string }[]) {
  const template = WORKFLOW_TEMPLATES[labType] ?? [];
  if (template.length === 0) return 0;

  let cursor = 0;
  for (const trip of trips) {
    if (cursor >= template.length) break;

    const { sentItem, requestedItem } = parseDesc(trip.description);
    const expected = template[cursor];
    const isMatch =
      isSameWorkflowValue(sentItem, expected.send) &&
      isSameWorkflowValue(requestedItem || "", expected.request || "");

    if (isMatch) cursor += 1;
  }

  // Legacy/serbest metin kayıtlarda tamamen eşleşme yoksa eski davranışa yakın kal.
  if (cursor === 0 && trips.length > 0) return Math.min(trips.length, template.length);
  return cursor;
}

const SPOON_REQUEST_OPTIONS = ["Açık Kaşık", "Kişisel Kaşık"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

type ImpressionMethod = "" | "KLASIK_OLCU" | "DIJITAL_TARAMA";

const IMPRESSION_METHOD_LABEL: Record<Exclude<ImpressionMethod, "">, string> = {
  KLASIK_OLCU: "Klasik Ölçü",
  DIJITAL_TARAMA: "Dijital Tarama",
};

function isMeasurementStep(sentItem: string) {
  return /(ölçü|olcu|tarama|scan)/i.test(sentItem);
}

function parseMeasurementFromSentNote(note?: string): { method: ImpressionMethod; cleanNote: string } {
  const raw = (note || "").trim();
  if (!raw) return { method: "", cleanNote: "" };

  const methodMatch = raw.match(/Ölçü\s*Yöntemi:\s*(Dijital Tarama|Klasik Ölçü)/i);
  const methodText = methodMatch?.[1]?.toLowerCase() || "";
  const method: ImpressionMethod =
    methodText === "dijital tarama"
      ? "DIJITAL_TARAMA"
      : methodText === "klasik ölçü"
      ? "KLASIK_OLCU"
      : "";

  const cleanNote = raw
    .replace(/\s*\|?\s*Ölçü\s*Yöntemi:\s*(Dijital Tarama|Klasik Ölçü)\s*\|?\s*/i, " ")
    .replace(/^\|+|\|+$/g, "")
    .trim();

  return { method, cleanNote };
}

function buildSentNote(baseNote: string, method: ImpressionMethod, sentItem: string) {
  const methodPart = method && isMeasurementStep(sentItem) ? `Ölçü Yöntemi: ${IMPRESSION_METHOD_LABEL[method]}` : "";
  return [methodPart, baseNote.trim()].filter(Boolean).join(" | ") || null;
}

function fmt(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function daysSince(iso?: string) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

const emptyOrderForm = {
  patientId: "",
  doctorId: "",
  labName: "",
  customLabName: "",
  labType: "",
  teeth: "",
  notes: "",
  // İlk gidiş adımı
  sentItem: "",
  requestedItem: "",
  impressionMethod: "" as ImpressionMethod,
};

const emptyTripForm = {
  sentItem: "",
  requestedItem: "",
  impressionMethod: "" as ImpressionMethod,
  sentAt: today(),
  sentNote: "",
};

const emptyReceiveForm = {
  receivedAt: today(),
  receivedNote: "",
  needsAppointment: true,
};

const emptyInvoiceForm = {
  item: "",
  amount: "",
  invoiceNo: "",
  issuedAt: today(),
  note: "",
};

const emptyEditTripForm = {
  sentItem: "",
  requestedItem: "",
  impressionMethod: "" as ImpressionMethod,
  sentAt: today(),
  sentNote: "",
  hasReceived: false,
  receivedAt: today(),
  receivedNote: "",
};

export default function LabPage() {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeLab, setActiveLab] = useState<string>("all");

  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  const [modal, setModal] = useState<"new" | "trip" | "receive" | "invoice" | "editTrip" | null>(null);
  const [activeOrder, setActiveOrder] = useState<LabOrder | null>(null);
  const [activeTrip, setActiveTrip] = useState<(LabTrip & { labOrder: LabOrder }) | null>(null);

  const [orderForm, setOrderForm] = useState(emptyOrderForm);
  const [tripForm, setTripForm] = useState(emptyTripForm);
  const [receiveForm, setReceiveForm] = useState(emptyReceiveForm);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoiceForm);
  const [editTripForm, setEditTripForm] = useState(emptyEditTripForm);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "fresh" | "atLab" | "returned" | "completed">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const response = await fetch("/api/lab-orders");
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : null) || "Laboratuvar verileri alınamadı.",
        );
      }

      setOrders(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Laboratuvar verileri alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/patients?limit=200")
      .then((r) => r.json())
      .then((d) => setPatients(Array.isArray(d) ? d : d.patients || []))
      .catch(() => {});

    fetch("/api/staff")
      .then((r) => r.json())
      .then((d) => setDoctors((Array.isArray(d) ? d : []).filter((u: Doctor) => u.role === "DOKTOR")))
      .catch(() => {});
  }, [load]);

  const searchedOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => o.status !== "IPTAL")
      .filter((o) => {
        if (!q) return true;
        return (
          o.patient.fullName.toLowerCase().includes(q) ||
          o.labName.toLowerCase().includes(q) ||
          o.labType.toLowerCase().includes(q)
        );
      });
  }, [orders, search]);

  const labOverview = useMemo(() => {
    const map = new Map<string, { name: string; total: number; waiting: number; overdue: number }>();

    for (const order of searchedOrders) {
      const key = order.labName.trim() || "Laboratuvar belirtilmedi";
      const pendingTrip = order.trips.find((trip) => !trip.receivedAt);
      const current = map.get(key) || { name: key, total: 0, waiting: 0, overdue: 0 };
      current.total += 1;
      if (pendingTrip) {
        current.waiting += 1;
        if (daysSince(pendingTrip.sentAt) >= 4) current.overdue += 1;
      }
      map.set(key, current);
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.waiting !== a.waiting) return b.waiting - a.waiting;
      if (b.total !== a.total) return b.total - a.total;
      return a.name.localeCompare(b.name, "tr");
    });
  }, [searchedOrders]);

  const knownLabs = useMemo(() => labOverview.map((item) => item.name), [labOverview]);
  const resolvedLabName = useMemo(() => {
    if (orderForm.labName === NEW_LAB_VALUE) return orderForm.customLabName.trim();
    return orderForm.labName.trim();
  }, [orderForm.customLabName, orderForm.labName]);

  const visibleOrders = useMemo(() => {
    if (activeLab === "all") return searchedOrders;
    return searchedOrders.filter((order) => order.labName === activeLab);
  }, [activeLab, searchedOrders]);

  const allPendingTrips = useMemo(() => {
    const pending: (LabTrip & { labOrder: LabOrder })[] = [];
    for (const order of visibleOrders) {
      if (order.status === "HASTAYA_TAKILDI") continue;
      for (const trip of order.trips) {
        if (!trip.receivedAt) pending.push({ ...trip, labOrder: order });
      }
    }
    return pending.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
  }, [visibleOrders]);

  const stats = useMemo(() => {
    const done = visibleOrders.filter(
      (order) => order.status === "HASTAYA_TAKILDI" && !order.trips.some((trip) => !trip.receivedAt),
    ).length;
    const active = visibleOrders.length - done;
    return { active, waiting: allPendingTrips.length, done };
  }, [visibleOrders, allPendingTrips.length]);

  const workflowBoard = useMemo(() => {
    const fresh: LabOrder[] = [];
    const atLab: LabOrder[] = [];
    const returned: LabOrder[] = [];
    const completed: LabOrder[] = [];

    const sortValue = (order: LabOrder) => {
      const dates = [
        ...order.trips.map((trip) => trip.receivedAt || trip.sentAt),
        ...order.invoices.map((invoice) => invoice.issuedAt),
      ].filter(Boolean) as string[];

      if (dates.length === 0) return 0;
      return Math.max(...dates.map((value) => new Date(value).getTime()));
    };

    for (const order of visibleOrders) {
      const hasPendingTrip = order.trips.some((trip) => !trip.receivedAt);

      if (order.trips.length === 0) {
        fresh.push(order);
      } else if (hasPendingTrip) {
        atLab.push(order);
      } else if (order.status === "HASTAYA_TAKILDI") {
        completed.push(order);
      } else {
        returned.push(order);
      }
    }

    const sorter = (a: LabOrder, b: LabOrder) => sortValue(b) - sortValue(a);

    return {
      fresh: fresh.sort(sorter),
      atLab: atLab.sort(sorter),
      returned: returned.sort(sorter),
      completed: completed.sort(sorter),
    };
  }, [visibleOrders]);

  const orderedVisibleOrders = useMemo(
    () => [...workflowBoard.fresh, ...workflowBoard.atLab, ...workflowBoard.returned, ...workflowBoard.completed],
    [workflowBoard],
  );

  const filteredOrders = useMemo(() => {
    if (activeFilter === "fresh") return workflowBoard.fresh;
    if (activeFilter === "atLab") return workflowBoard.atLab;
    if (activeFilter === "returned") return workflowBoard.returned;
    if (activeFilter === "completed") return workflowBoard.completed;
    return orderedVisibleOrders;
  }, [activeFilter, orderedVisibleOrders, workflowBoard]);

  const closeModal = () => {
    setModal(null);
    setActiveOrder(null);
    setActiveTrip(null);
  };

  async function createOrder() {
    if (!orderForm.patientId || !orderForm.doctorId || !resolvedLabName || !orderForm.labType || !orderForm.sentItem) return;
    setSaving(true);
    const res = await fetch("/api/lab-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: orderForm.patientId,
        doctorId: orderForm.doctorId,
        labName: resolvedLabName,
        labType: orderForm.labType,
        teeth: orderForm.teeth || null,
        notes: orderForm.notes || null,
      }),
    });
    if (res.ok) {
      const newOrder = await res.json().catch(() => null);
      if (newOrder?.id && orderForm.sentItem) {
        const description = orderForm.requestedItem
          ? `${orderForm.sentItem} → ${orderForm.requestedItem}`
          : orderForm.sentItem;
        await fetch(`/api/lab-orders/${newOrder.id}/trips`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description,
            sentNote: buildSentNote("", orderForm.impressionMethod, orderForm.sentItem),
          }),
        });
      }
      setOrderForm({ ...emptyOrderForm });
      closeModal();
      load();
    }
    setSaving(false);
  }

  async function createTrip() {
    if (!activeOrder || !tripForm.sentItem) return;
    setSaving(true);
    const description = tripForm.requestedItem
      ? `${tripForm.sentItem} → ${tripForm.requestedItem}`
      : tripForm.sentItem;
    await fetch(`/api/lab-orders/${activeOrder.id}/trips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        sentAt: tripForm.sentAt,
        sentNote: buildSentNote(tripForm.sentNote, tripForm.impressionMethod, tripForm.sentItem),
      }),
    });
    setSaving(false);
    setTripForm({ ...emptyTripForm, sentAt: today() });
    closeModal();
    load();
  }

  async function markTripReceived() {
    if (!activeTrip) return;
    setSaving(true);
    const notePrefix = receiveForm.needsAppointment ? "RANDEVU_PROVA_GEREKLI" : "";
    const finalNote = [notePrefix, receiveForm.receivedNote].filter(Boolean).join(" | ");

    await fetch(`/api/lab-orders/${activeTrip.labOrder.id}/trips/${activeTrip.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receivedAt: receiveForm.receivedAt,
        receivedNote: finalNote || null,
      }),
    });

    setSaving(false);
    setReceiveForm({ ...emptyReceiveForm, receivedAt: today() });
    closeModal();
    load();
  }

  async function addInvoice() {
    if (!activeOrder || !invoiceForm.item || !invoiceForm.amount) return;
    setSaving(true);
    await fetch(`/api/lab-orders/${activeOrder.id}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item: invoiceForm.item,
        amount: Number(invoiceForm.amount),
        invoiceNo: invoiceForm.invoiceNo || null,
        issuedAt: invoiceForm.issuedAt,
        note: invoiceForm.note || null,
      }),
    });
    setSaving(false);
    setInvoiceForm({ ...emptyInvoiceForm, issuedAt: today() });
    closeModal();
    load();
  }

  async function updateTrip() {
    if (!activeTrip || !editTripForm.sentItem) return;

    const description = editTripForm.requestedItem
      ? `${editTripForm.sentItem} → ${editTripForm.requestedItem}`
      : editTripForm.sentItem;

    setSaving(true);
    await fetch(`/api/lab-orders/${activeTrip.labOrder.id}/trips/${activeTrip.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        sentAt: editTripForm.sentAt,
        sentNote: buildSentNote(editTripForm.sentNote, editTripForm.impressionMethod, editTripForm.sentItem),
        receivedAt: editTripForm.hasReceived ? editTripForm.receivedAt : null,
        receivedNote: editTripForm.hasReceived ? editTripForm.receivedNote || null : null,
      }),
    });
    setSaving(false);

    setEditTripForm({ ...emptyEditTripForm, sentAt: today(), receivedAt: today() });
    closeModal();
    load();
  }

  async function markCompleted(orderId: string) {
    await fetch(`/api/lab-orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "HASTAYA_TAKILDI" }),
    });
    load();
  }

  const renderRow = (order: LabOrder) => (
    <OrderRow
      key={order.id}
      order={order}
      expanded={expandedOrderId === order.id}
      onToggleExpand={() => setExpandedOrderId((cur) => (cur === order.id ? null : order.id))}
      onAddTrip={(o) => { setActiveOrder(o); setTripForm({ ...emptyTripForm, sentAt: today() }); setModal("trip"); }}
      onAddInvoice={(o) => { setActiveOrder(o); setInvoiceForm({ ...emptyInvoiceForm, item: o.labType, issuedAt: today() }); setModal("invoice"); }}
      onReceive={(o, t) => { setActiveTrip({ ...t, labOrder: o }); setReceiveForm({ ...emptyReceiveForm, receivedAt: today() }); setModal("receive"); }}
      onEditTrip={(o, t) => {
        setActiveTrip({ ...t, labOrder: o });
        const { sentItem, requestedItem } = parseDesc(t.description);
        const parsedSent = parseMeasurementFromSentNote(t.sentNote);
        setEditTripForm({
          sentItem,
          requestedItem,
          impressionMethod: parsedSent.method,
          sentAt: t.sentAt ? new Date(t.sentAt).toISOString().slice(0, 10) : today(),
          sentNote: parsedSent.cleanNote,
          hasReceived: Boolean(t.receivedAt),
          receivedAt: t.receivedAt ? new Date(t.receivedAt).toISOString().slice(0, 10) : today(),
          receivedNote: t.receivedNote || "",
        });
        setModal("editTrip");
      }}
      onComplete={markCompleted}
    />
  );

  return (
    <div className="mx-auto max-w-5xl space-y-0 pb-10">
      {/* ── Top Bar ── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Laboratuvar</h1>
          <p className="mt-0.5 text-sm text-slate-500">İşleri izle, süreci yönet, geçmişi gör.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Hasta veya lab ara…"
              className="h-8 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
            />
          </div>
          <button
            onClick={() => {
              setOrderForm({
                ...emptyOrderForm,
                labName: activeLab !== "all" ? activeLab : knownLabs[0] || "",
              });
              setModal("new");
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-slate-700 active:scale-95"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Yeni İş
          </button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          { label: "Aktif İş", value: stats.active, color: "text-blue-700", bg: "bg-blue-50 border-blue-100" },
          { label: "Labda Bekleyen", value: stats.waiting, color: "text-amber-700", bg: "bg-amber-50 border-amber-100" },
          { label: "Tamamlanan", value: stats.done, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100" },
        ].map((s) => (
          <div key={s.label} className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${s.bg}`}>
            <p className="text-[12px] font-medium text-slate-500">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Lab filter bar ── */}
      <div className="mb-3 flex items-center gap-2">
        <label className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Laboratuvar</label>
        <select
          value={activeLab}
          onChange={(e) => setActiveLab(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
        >
          <option value="all">Tümü ({searchedOrders.length} iş)</option>
          {labOverview.map((lab) => (
            <option key={lab.name} value={lab.name}>
              {lab.name} — {lab.total} iş{lab.overdue > 0 ? `, ${lab.overdue} geciken` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* ── Filter Tabs ── */}
      <div className="mb-2 flex items-center gap-1 overflow-x-auto">
        {([
          { key: "all" as const, label: "Tümü", count: orderedVisibleOrders.length },
          { key: "atLab" as const, label: "Labda", count: workflowBoard.atLab.length },
          { key: "returned" as const, label: "Klinikte", count: workflowBoard.returned.length },
          { key: "completed" as const, label: "Tamamlandı", count: workflowBoard.completed.length },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
              activeFilter === tab.key
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`min-w-[18px] rounded-full px-1 py-0.5 text-center text-[11px] leading-none ${activeFilter === tab.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            Yükleniyor…
          </div>
        ) : loadError ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <div className="rounded-full bg-red-50 p-2 text-red-600">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Laboratuvar verileri yüklenemedi</p>
              <p className="mt-1 text-sm text-slate-500">{loadError}</p>
            </div>
            <button
              onClick={() => void load()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Tekrar dene
            </button>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-slate-400">
            <svg className="h-8 w-8 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Kayıt bulunamadı
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activeFilter === "all" ? (
              <>
                {([
                  { key: "fresh", label: "Yeni", dot: "bg-slate-400", orders: workflowBoard.fresh },
                  { key: "atLab", label: "Labda", dot: "bg-amber-400", orders: workflowBoard.atLab },
                  { key: "returned", label: "Klinikte", dot: "bg-blue-500", orders: workflowBoard.returned },
                  { key: "completed", label: "Tamamlandı", dot: "bg-emerald-500", orders: workflowBoard.completed },
                ]).map(({ key, label, dot, orders: groupOrders }) =>
                  groupOrders.length > 0 ? (
                    <div key={key}>
                      <div className="flex items-center gap-2 bg-slate-50/80 px-5 py-2">
                        <span className={`h-2 w-2 rounded-full ${dot}`} />
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{label}</span>
                        <span className="text-[11px] text-slate-400">{groupOrders.length}</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {groupOrders.map((order) => renderRow(order))}
                      </div>
                    </div>
                  ) : null
                )}
              </>
            ) : (
              filteredOrders.map((order) => renderRow(order))
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {modal === "new" && (
        <Modal title="Yeni Laboratuvar İşi" onClose={closeModal} wide>
          <div className="space-y-3">
            <Field label="Hasta *">
              <select value={orderForm.patientId} onChange={(e) => setOrderForm((p) => ({ ...p, patientId: e.target.value }))} className="field">
                <option value="">Seçiniz</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </Field>
            <Field label="Doktor *">
              <select value={orderForm.doctorId} onChange={(e) => setOrderForm((p) => ({ ...p, doctorId: e.target.value }))} className="field">
                <option value="">Seçiniz</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
              </select>
            </Field>
            <Field label="Laboratuvar Adı *">
              <select
                value={orderForm.labName}
                onChange={(e) =>
                  setOrderForm((p) => ({
                    ...p,
                    labName: e.target.value,
                    customLabName: e.target.value === NEW_LAB_VALUE ? p.customLabName : "",
                  }))
                }
                className="field"
              >
                <option value="">Laboratuvar seçiniz</option>
                {knownLabs.map((lab) => <option key={lab} value={lab}>{lab}</option>)}
                <option value={NEW_LAB_VALUE}>+ Yeni laboratuvar ekle</option>
              </select>
              {orderForm.labName === NEW_LAB_VALUE && (
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                  <p className="mb-2 text-[11px] font-medium text-slate-500">Listede yoksa yeni laboratuvar adını gir.</p>
                  <input
                    value={orderForm.customLabName}
                    onChange={(e) => setOrderForm((p) => ({ ...p, customLabName: e.target.value }))}
                    className="field"
                    placeholder="Örn. Özel Teknik Laboratuvar"
                    autoFocus
                  />
                </div>
              )}
            </Field>
            <Field label="İş Türü *">
              <select
                value={orderForm.labType}
                onChange={(e) => {
                  const newType = e.target.value;
                  const tpl = WORKFLOW_TEMPLATES[newType]?.[0];
                  setOrderForm((p) => ({
                    ...p,
                    labType: newType,
                    sentItem: tpl ? tpl.send : p.sentItem,
                    requestedItem: tpl ? tpl.request : p.requestedItem,
                  }));
                }}
                className="field"
              >
                <option value="">Seçiniz</option>
                {LAB_CATEGORIES.map((cat) => (
                  <optgroup key={cat.group} label={cat.group}>
                    {cat.items.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Diş Seçimi">
              <DentalChart
                selected={orderForm.teeth ? orderForm.teeth.split(",").map((t) => Number(t.trim())).filter(Boolean) : []}
                onChange={(nums) => setOrderForm((p) => ({ ...p, teeth: nums.join(", ") }))}
              />
            </Field>
            {/* ── İlk Adım ── */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">İlk Gidiş Adımı</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Gönderilen *">
                  <input
                    value={orderForm.sentItem}
                    onChange={(e) =>
                      setOrderForm((p) => {
                        const nextSentItem = e.target.value;
                        return {
                          ...p,
                          sentItem: nextSentItem,
                          impressionMethod: isMeasurementStep(nextSentItem) ? p.impressionMethod : "",
                        };
                      })
                    }
                    className="field"
                    placeholder="Ölçü, kaşık…"
                  />
                  <SpoonRequestQuickPicks
                    selected={orderForm.requestedItem}
                    onPick={(item) =>
                      setOrderForm((p) => ({
                        ...p,
                        sentItem: "Ölçü",
                        requestedItem: item,
                      }))
                    }
                  />
                </Field>
                <Field label="İstenen (Labdan)">
                  <input
                    value={orderForm.requestedItem}
                    onChange={(e) => setOrderForm((p) => ({ ...p, requestedItem: e.target.value }))}
                    className="field"
                    placeholder="Metal alt yapı, prova…"
                  />
                </Field>
              </div>
              {isMeasurementStep(orderForm.sentItem) && (
                <Field label="Ölçü Yöntemi">
                  <select
                    value={orderForm.impressionMethod}
                    onChange={(e) =>
                      setOrderForm((p) => ({
                        ...p,
                        impressionMethod: e.target.value as ImpressionMethod,
                      }))
                    }
                    className="field"
                  >
                    <option value="">Seçiniz</option>
                    <option value="KLASIK_OLCU">Klasik Ölçü</option>
                    <option value="DIJITAL_TARAMA">Dijital Tarama</option>
                  </select>
                </Field>
              )}
            </div>
            <Field label="Not">
              <input value={orderForm.notes} onChange={(e) => setOrderForm((p) => ({ ...p, notes: e.target.value }))} className="field" placeholder="Renk, açıklama…" />
            </Field>
          </div>
          <ModalActions onClose={closeModal} onSave={createOrder} saving={saving} saveText="Oluştur" disabled={!orderForm.patientId || !orderForm.doctorId || !resolvedLabName || !orderForm.labType || !orderForm.sentItem} />
        </Modal>
      )}

      {modal === "trip" && activeOrder && (
        <Modal title="Gidiş Kaydı Ekle" subtitle={`${activeOrder.patient.fullName} · ${activeOrder.labName} · ${activeOrder.labType}`} onClose={closeModal}>
          <TripFormContent
            order={activeOrder}
            tripForm={tripForm}
            setTripForm={setTripForm}
          />
          <ModalActions onClose={closeModal} onSave={createTrip} saving={saving} saveText="Gidişi Kaydet" disabled={!tripForm.sentItem} />
        </Modal>
      )}

      {modal === "receive" && activeTrip && (
        <Modal title="Geri Geldi Olarak İşaretle" subtitle={`${activeTrip.labOrder.patient.fullName} · ${parseDesc(activeTrip.description).sentItem}${parseDesc(activeTrip.description).requestedItem ? " → " + parseDesc(activeTrip.description).requestedItem : ""}`} onClose={closeModal}>
          <div className="space-y-3">
            <Field label="Geliş Tarihi">
              <input type="date" value={receiveForm.receivedAt} onChange={(e) => setReceiveForm((p) => ({ ...p, receivedAt: e.target.value }))} className="field" />
            </Field>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-xs text-slate-700 transition hover:bg-slate-50">
              <input type="checkbox" checked={receiveForm.needsAppointment} onChange={(e) => setReceiveForm((p) => ({ ...p, needsAppointment: e.target.checked }))} className="accent-slate-800" />
              Hastaya prova / randevu planlanacak
            </label>
            <Field label="Geliş Notu">
              <input value={receiveForm.receivedNote} onChange={(e) => setReceiveForm((p) => ({ ...p, receivedNote: e.target.value }))} className="field" placeholder="Prova hazır, küçük düzeltme gerekli…" />
            </Field>
          </div>
          <ModalActions onClose={closeModal} onSave={markTripReceived} saving={saving} saveText="Geldi Olarak İşaretle" />
        </Modal>
      )}

      {modal === "invoice" && activeOrder && (
        <Modal title="Fatura Kalemi" subtitle={`${activeOrder.patient.fullName} · ${activeOrder.labName}`} onClose={closeModal}>
          <div className="space-y-3">
            <Field label="Kalem *">
              <input value={invoiceForm.item} onChange={(e) => setInvoiceForm((p) => ({ ...p, item: e.target.value }))} className="field" placeholder="Zirkon alt yapı, glaze…" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tutar (TRY) *">
                <input type="number" value={invoiceForm.amount} onChange={(e) => setInvoiceForm((p) => ({ ...p, amount: e.target.value }))} className="field" placeholder="0" />
              </Field>
              <Field label="Fatura No">
                <input value={invoiceForm.invoiceNo} onChange={(e) => setInvoiceForm((p) => ({ ...p, invoiceNo: e.target.value }))} className="field" placeholder="FAT-001" />
              </Field>
            </div>
            <Field label="Fatura Tarihi">
              <input type="date" value={invoiceForm.issuedAt} onChange={(e) => setInvoiceForm((p) => ({ ...p, issuedAt: e.target.value }))} className="field" />
            </Field>
            <Field label="Not">
              <input value={invoiceForm.note} onChange={(e) => setInvoiceForm((p) => ({ ...p, note: e.target.value }))} className="field" />
            </Field>
          </div>
          <ModalActions onClose={closeModal} onSave={addInvoice} saving={saving} saveText="Ekle" disabled={!invoiceForm.item || !invoiceForm.amount} />
        </Modal>
      )}

      {modal === "editTrip" && activeTrip && (
        <Modal title="Adımı Düzenle" subtitle={`${activeTrip.labOrder.patient.fullName} · ${activeTrip.labOrder.labType} · Adım #${activeTrip.order}`} onClose={closeModal}>
          <div className="space-y-3">
            <Field label="Gönderilen *">
              <input
                value={editTripForm.sentItem}
                onChange={(e) => setEditTripForm((p) => ({ ...p, sentItem: e.target.value }))}
                className="field"
                placeholder="Ölçü, zirkon alt yapı, prova…"
                autoFocus
              />
              <SpoonRequestQuickPicks
                selected={editTripForm.requestedItem}
                onPick={(item) =>
                  setEditTripForm((p) => ({
                    ...p,
                    sentItem: "Ölçü",
                    requestedItem: item,
                  }))
                }
              />
            </Field>
            <Field label="İstenen (Labdan Beklenen)">
              <input value={editTripForm.requestedItem} onChange={(e) => setEditTripForm((p) => ({ ...p, requestedItem: e.target.value }))} className="field" placeholder="Metal alt yapı, dentin prova, glaze…" />
            </Field>
            {isMeasurementStep(editTripForm.sentItem) && (
              <Field label="Ölçü Yöntemi">
                <select
                  value={editTripForm.impressionMethod}
                  onChange={(e) => setEditTripForm((p) => ({ ...p, impressionMethod: e.target.value as ImpressionMethod }))}
                  className="field"
                >
                  <option value="">Seçiniz</option>
                  <option value="KLASIK_OLCU">Klasik Ölçü</option>
                  <option value="DIJITAL_TARAMA">Dijital Tarama</option>
                </select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Gidiş Tarihi *">
                <input type="date" value={editTripForm.sentAt} onChange={(e) => setEditTripForm((p) => ({ ...p, sentAt: e.target.value }))} className="field" />
              </Field>
              <Field label="Gidiş Notu">
                <input value={editTripForm.sentNote} onChange={(e) => setEditTripForm((p) => ({ ...p, sentNote: e.target.value }))} className="field" placeholder="Teknik not…" />
              </Field>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-xs text-slate-700 transition hover:bg-slate-50">
              <input type="checkbox" checked={editTripForm.hasReceived} onChange={(e) => setEditTripForm((p) => ({ ...p, hasReceived: e.target.checked }))} className="accent-slate-800" />
              Bu adım laboratuvara gidip geri döndü
            </label>
            {editTripForm.hasReceived && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Geliş Tarihi">
                  <input type="date" value={editTripForm.receivedAt} onChange={(e) => setEditTripForm((p) => ({ ...p, receivedAt: e.target.value }))} className="field" />
                </Field>
                <Field label="Geliş Notu">
                  <input value={editTripForm.receivedNote} onChange={(e) => setEditTripForm((p) => ({ ...p, receivedNote: e.target.value }))} className="field" />
                </Field>
              </div>
            )}
          </div>
          <ModalActions onClose={closeModal} onSave={updateTrip} saving={saving} saveText="Güncelle" disabled={!editTripForm.sentItem} />
        </Modal>
      )}

      <style jsx global>{`
        .field {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgb(226 232 240);
          padding: 0.45rem 0.75rem;
          font-size: 0.8125rem;
          color: rgb(15 23 42);
          outline: none;
          background: white;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .field:focus {
          border-color: rgb(100 116 139);
          box-shadow: 0 0 0 3px rgb(148 163 184 / 0.2);
        }
        select.field { cursor: pointer; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// OrderRow — professional list row w/ expandable timeline
// ─────────────────────────────────────────────
function OrderRow({
  order,
  expanded,
  onToggleExpand,
  onAddTrip,
  onAddInvoice,
  onReceive,
  onEditTrip,
  onComplete,
}: {
  order: LabOrder;
  expanded: boolean;
  onToggleExpand: () => void;
  onAddTrip: (order: LabOrder) => void;
  onAddInvoice: (order: LabOrder) => void;
  onReceive: (order: LabOrder, trip: LabTrip) => void;
  onEditTrip: (order: LabOrder, trip: LabTrip) => void;
  onComplete: (orderId: string) => void;
}) {
  const sortedTrips = useMemo(() => [...order.trips].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()), [order.trips]);
  const pendingTrip = sortedTrips.slice().reverse().find((t) => !t.receivedAt);
  const doneCount = sortedTrips.filter((t) => t.receivedAt).length;
  const totalCount = sortedTrips.length;
  const isDone = order.status === "HASTAYA_TAKILDI" && !pendingTrip;
  const firstTrip = sortedTrips[0];
  const totalAmount = order.invoices.reduce((s, i) => s + Number(i.amount || 0), 0);
  const pendingDays = pendingTrip ? daysSince(pendingTrip.sentAt) : 0;

  // status renk sistemi — her durum için sol kenar + arka plan + pill
  const statusConfig = isDone
    ? { label: "Tamamlandı", border: "border-l-emerald-400", bg: "bg-emerald-50/40 hover:bg-emerald-50/70", pill: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-400" }
    : pendingTrip
      ? pendingDays >= 4
        ? { label: "Gecikiyor", border: "border-l-red-400", bg: "bg-red-50/40 hover:bg-red-50/60", pill: "bg-red-100 text-red-700", dot: "bg-red-400" }
        : { label: "Labda", border: "border-l-amber-400", bg: "bg-amber-50/40 hover:bg-amber-50/60", pill: "bg-amber-100 text-amber-700", dot: "bg-amber-400" }
      : firstTrip
      ? { label: "Klinikte", border: "border-l-blue-400", bg: "bg-blue-50/40 hover:bg-blue-50/60", pill: "bg-blue-100 text-blue-700", dot: "bg-blue-400" }
      : { label: "Beklemede", border: "border-l-slate-300", bg: "bg-white hover:bg-slate-50/80", pill: "bg-slate-100 text-slate-600", dot: "bg-slate-300" };

  const teethLabel = order.teeth
    ? `${order.teeth.split(",").map((s) => s.trim()).filter(Boolean).length} üye ${order.labType}`
    : order.labType;

  return (
    <div>
      {/* ── Row ── */}
      <div
        onClick={onToggleExpand}
        className={`group flex cursor-pointer items-center gap-3 border-l-4 px-4 py-2.5 transition-colors ${statusConfig.border} ${statusConfig.bg} ${isDone ? "opacity-70 hover:opacity-100" : ""}`}
      >
        {/* Patient + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-semibold text-slate-900">{order.patient.fullName}</span>
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusConfig.pill}`}>
              {statusConfig.label}
            </span>
            {pendingDays >= 4 && !isDone && (
              <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                {pendingDays}g bekledi
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11.5px] text-slate-500">
            <span className="font-medium text-slate-700">{teethLabel}</span>
            <span className="mx-1 text-slate-300">·</span>
            {order.labName}
            <span className="mx-1 text-slate-300">·</span>
            <span className="text-slate-400">{order.doctor.fullName}</span>
          </p>
        </div>

        {/* Step progress dots */}
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          {totalCount === 0 ? (
            <span className="text-[11px] text-slate-300">—</span>
          ) : (
            <>
              {sortedTrips.map((t) => (
                <span key={t.id} title={t.description}
                  className={`h-2.5 w-2.5 rounded-full ${t.receivedAt ? "bg-emerald-400" : "bg-amber-300"}`}
                />
              ))}
              <span className="ml-1 text-[11px] font-medium text-slate-400">{doneCount}/{totalCount}</span>
            </>
          )}
        </div>

        {/* Date */}
        <div className="hidden w-24 shrink-0 text-right md:block">
          <span className="text-[11px] text-slate-400">{firstTrip ? fmt(firstTrip.sentAt) : "—"}</span>
        </div>

        {/* Invoice amount */}
        {totalAmount > 0 && (
          <span className="hidden shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 md:inline">
            {CUR.format(totalAmount)}
          </span>
        )}

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {!isDone && (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onAddTrip(order); }} title="Gidiş Ekle">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </ActionBtn>
          )}
          {!isDone && pendingTrip && (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onReceive(order, pendingTrip); }} title="Geldi" accent="emerald">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </ActionBtn>
          )}
          <ActionBtn onClick={(e) => { e.stopPropagation(); onAddInvoice(order); }} title="Fatura ekle">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="12" y2="15"/>
            </svg>
          </ActionBtn>
          {!isDone && (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onComplete(order.id); }} title={pendingTrip ? "Bekleyen adım var" : "Tamamla"} disabled={Boolean(pendingTrip)} accent={pendingTrip ? undefined : "slate"}>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </ActionBtn>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
            title={expanded ? "Kapat" : "Süreci aç"}
            className="ml-0.5 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <svg className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
          <div className="grid gap-5 lg:grid-cols-[1fr_260px]">

            {/* Timeline */}
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Süreç Zaman Çizelgesi</p>
              {sortedTrips.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white py-6 text-center text-sm text-slate-400">
                  Henüz adım eklenmedi. <button onClick={() => onAddTrip(order)} className="underline hover:text-slate-700">Gidiş ekle →</button>
                </div>
              ) : (
                <ol className="relative ml-3 border-l border-slate-200">
                  {sortedTrips.map((trip, idx) => {
                    const done = Boolean(trip.receivedAt);
                    return (
                      <li key={trip.id} className="group/step mb-4 ml-5 last:mb-0">
                        <span className={`absolute -left-[7px] mt-1 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-white ${done ? "bg-emerald-500" : "bg-amber-400"}`}>
                          {done ? (
                            <svg className="h-2 w-2 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12"/></svg>
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-white/80"/>
                          )}
                        </span>
                        <div className="rounded-lg border border-slate-100 bg-white px-3 py-2.5 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              {(() => {
                                const { sentItem, requestedItem } = parseDesc(trip.description);
                                return (
                                  <>
                                    <div className="flex flex-wrap items-baseline gap-x-1.5">
                                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">#{idx + 1}</span>
                                      <p className="text-[13px] font-semibold text-slate-800">{sentItem}</p>
                                    </div>
                                    {requestedItem && (
                                      <div className="mt-0.5 flex items-center gap-1">
                                        <svg className="h-2.5 w-2.5 shrink-0 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                                        </svg>
                                        <span className="text-[11.5px] font-medium text-slate-600">{requestedItem}</span>
                                        {!trip.receivedAt && (
                                          <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] font-semibold text-amber-600">bekleniyor</span>
                                        )}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                              <p className="mt-1 text-[11px] text-slate-500">
                                <span className="font-medium">Gidiş:</span> {fmt(trip.sentAt)}
                                {trip.receivedAt ? (
                                  <> · <span className="font-medium">Geliş:</span> {fmt(trip.receivedAt)}</>
                                ) : null}
                              </p>
                              {trip.sentNote && <p className="mt-0.5 text-[11px] text-slate-500">↑ {trip.sentNote}</p>}
                              {trip.receivedNote && (
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                  ↓ {trip.receivedNote.replace("RANDEVU_PROVA_GEREKLI | ", "").replace("RANDEVU_PROVA_GEREKLI", "Randevu/prova gerekli")}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 gap-1">
                              {!done && (
                                <button onClick={() => onReceive(order, trip)} className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-100">
                                  Geldi
                                </button>
                              )}
                              <button onClick={() => onEditTrip(order, trip)} className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50">
                                Düzenle
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {/* Info panel */}
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Özet</p>
                <dl className="space-y-1.5">
                  {([
                    ["Laboratuvar", order.labName],
                    ["İş türü", order.labType],
                    ["Diş", order.teeth || "—"],
                    ["Doktor", order.doctor.fullName],
                    order.notes ? ["Not", order.notes] : null,
                    ["Adım", `${doneCount} / ${totalCount} tamamlandı`],
                    ["Bekleyen", pendingTrip
                      ? `#${pendingTrip.order} · ${parseDesc(pendingTrip.description).sentItem}${parseDesc(pendingTrip.description).requestedItem ? " → " + parseDesc(pendingTrip.description).requestedItem : ""}${pendingDays >= 1 ? ` (${pendingDays}g)` : ""}`
                      : "Yok"],
                    ["Fatura", order.invoices.length ? `${order.invoices.length} kalem · ${CUR.format(totalAmount)}` : "Yok"],
                  ].filter(Boolean) as [string, string][]).map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-2 text-[12px]">
                      <dt className="shrink-0 text-slate-500">{k}</dt>
                      <dd className="text-right font-medium text-slate-800">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {order.invoices.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Faturalar</p>
                  <div className="space-y-2">
                    {order.invoices.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="truncate text-slate-700">{inv.item}</span>
                        <span className="shrink-0 font-medium text-slate-900">{CUR.format(inv.amount)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 text-[12px]">
                      <span className="text-slate-500">Toplam</span>
                      <span className="font-bold text-slate-900">{CUR.format(totalAmount)}</span>
                    </div>
                  </div>
                </div>
              )}

              {!isDone && (
                <button
                  onClick={() => onComplete(order.id)}
                  disabled={Boolean(pendingTrip)}
                  className="w-full rounded-lg border border-slate-300 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pendingTrip ? "Bekleyen adım var — tamamlanamaz" : "✓ İşi Tamamla"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  title,
  disabled,
  accent,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  disabled?: boolean;
  accent?: "emerald" | "slate";
}) {
  const base = "rounded-md p-1.5 transition disabled:cursor-not-allowed disabled:opacity-40";
  const colors =
    accent === "emerald"
      ? "text-emerald-600 hover:bg-emerald-50"
      : accent === "slate"
      ? "text-slate-800 hover:bg-slate-200"
      : "text-slate-500 hover:bg-slate-100 hover:text-slate-700";
  return (
    <button onClick={onClick} title={title} disabled={disabled} className={`${base} ${colors}`}>
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function SpoonRequestQuickPicks({
  selected,
  onPick,
}: {
  selected: string;
  onPick: (item: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {SPOON_REQUEST_OPTIONS.map((item) => {
        const active = isSameWorkflowValue(selected, item);
        return (
          <button
            key={item}
            type="button"
            onClick={() => onPick(item)}
            className={`rounded-full border px-2 py-1 text-[11px] font-medium transition ${
              active
                ? "border-slate-700 bg-slate-800 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

function ModalActions({
  onClose, onSave, saving, saveText, disabled,
}: {
  onClose: () => void; onSave: () => void; saving: boolean; saveText: string; disabled?: boolean;
}) {
  return (
    <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
      <button onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50">
        Vazgeç
      </button>
      <button
        onClick={onSave}
        disabled={saving || disabled}
        className="flex-1 rounded-lg bg-slate-900 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-40"
      >
        {saving ? "Kaydediliyor…" : saveText}
      </button>
    </div>
  );
}

function Modal({
  title, subtitle, onClose, children, wide,
}: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={ref} className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DentalChart — FDI görsel diş şeması seçici
// ─────────────────────────────────────────────
function DentalChart({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (nums: number[]) => void;
}) {
  const toggle = (num: number) => {
    if (selected.includes(num)) {
      onChange(selected.filter((n) => n !== num));
    } else {
      onChange([...selected, num].sort((a, b) => a - b));
    }
  };

  const selectGroup = (group: number[]) => {
    const allSelected = group.every((n) => selected.includes(n));
    if (allSelected) {
      onChange(selected.filter((n) => !group.includes(n)));
    } else {
      const merged = Array.from(new Set([...selected, ...group])).sort((a, b) => a - b);
      onChange(merged);
    }
  };

  const ToothBtn = ({ num }: { num: number }) => {
    const active = selected.includes(num);
    // Sınıflara göre diş tipi rengi
    const lastDigit = num % 10;
    const isIncisor = lastDigit === 1 || lastDigit === 2;
    const isCanine = lastDigit === 3;
    const isPremolar = lastDigit === 4 || lastDigit === 5;
    const ringColor = isIncisor
      ? "ring-blue-400"
      : isCanine
      ? "ring-amber-400"
      : isPremolar
      ? "ring-violet-400"
      : "ring-slate-400";
    return (
      <button
        type="button"
        onClick={() => toggle(num)}
        className={`flex h-8 w-8 flex-col items-center justify-center rounded-lg border text-[10px] font-semibold transition-all
          ${active
            ? `border-transparent bg-slate-800 text-white shadow-sm`
            : `border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50`
          }`}
        title={`Diş ${num}`}
      >
        {num}
      </button>
    );
  };

  const upperSelected = [...UPPER_RIGHT, ...UPPER_LEFT].every((n) => selected.includes(n));
  const lowerSelected = [...LOWER_LEFT, ...LOWER_RIGHT].every((n) => selected.includes(n));

  return (
    <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
      {/* Hızlı seçim butonları */}
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {[
          { label: "Üst Çene", group: [...UPPER_RIGHT, ...UPPER_LEFT] },
          { label: "Alt Çene", group: [...LOWER_LEFT, ...LOWER_RIGHT] },
          { label: "Tüm Çene", group: [...UPPER_RIGHT, ...UPPER_LEFT, ...LOWER_LEFT, ...LOWER_RIGHT] },
        ].map(({ label, group }) => (
          <button
            key={label}
            type="button"
            onClick={() => selectGroup(group)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100 hover:border-slate-300"
          >
            {label}
          </button>
        ))}
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-md border border-red-100 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-500 transition hover:bg-red-100"
          >
            Temizle
          </button>
        )}
      </div>

      {/* Üst çene */}
      <div className="mb-1.5">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Üst Çene</p>
        <div className="flex gap-1">
          {UPPER_RIGHT.map((n) => <ToothBtn key={n} num={n} />)}
          <div className="mx-1 border-l border-dashed border-slate-300" />
          {UPPER_LEFT.map((n) => <ToothBtn key={n} num={n} />)}
        </div>
      </div>

      {/* Alt çene */}
      <div className="mt-1.5">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Alt Çene</p>
        <div className="flex gap-1">
          {LOWER_RIGHT.map((n) => <ToothBtn key={n} num={n} />)}
          <div className="mx-1 border-l border-dashed border-slate-300" />
          {LOWER_LEFT.map((n) => <ToothBtn key={n} num={n} />)}
        </div>
      </div>

      {/* Seçili dişler özeti */}
      {selected.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-700">{selected.length} diş</span> seçili: {selected.join(", ")}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// TripFormContent — iş türüne göre akıllı öneri ile gidiş formu
// ─────────────────────────────────────────────
function TripFormContent({
  order,
  tripForm,
  setTripForm,
}: {
  order: { labType: string; trips: { description: string }[] };
  tripForm: { sentItem: string; requestedItem: string; impressionMethod: ImpressionMethod; sentAt: string; sentNote: string };
  setTripForm: React.Dispatch<React.SetStateAction<typeof tripForm>>;
}) {
  const template = WORKFLOW_TEMPLATES[order.labType] ?? [];
  const stepIndex = getNextTemplateStepIndex(order.labType, order.trips);
  const suggestion = template[stepIndex] ?? null;

  // Öneri henüz uygulanmadıysa auto-fill yap
  const [suggested, setSuggested] = useState(false);
  useEffect(() => {
    if (!suggested && suggestion && !tripForm.sentItem) {
      setTripForm((p) => ({
        ...p,
        sentItem: suggestion.send,
        requestedItem: suggestion.request,
      }));
      setSuggested(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      {/* Workflow ilerleme şeridi */}
      {template.length > 0 && (
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {order.labType} · Adım {Math.min(stepIndex + 1, template.length)}/{template.length}
          </p>
          <div className="flex gap-1">
            {template.map((step, i) => (
              <div
                key={i}
                className={`flex-1 rounded px-1 py-1 text-center text-[10px] leading-tight ${
                  i < stepIndex
                    ? "bg-emerald-100 text-emerald-700"
                    : i === stepIndex
                    ? "bg-slate-800 text-white font-semibold"
                    : "bg-slate-200 text-slate-400"
                }`}
                title={`${step.send} → ${step.request}`}
              >
                {i + 1}
              </div>
            ))}
          </div>
          {suggestion && (
            <p className="mt-1.5 text-[10px] text-slate-500">
              Öneri: <span className="font-medium text-slate-700">{suggestion.send}</span> gönder →{" "}
              <span className="font-medium text-slate-700">{suggestion.request}</span> iste
            </p>
          )}
        </div>
      )}

      <Field label="Gönderilen *">
        <input
          value={tripForm.sentItem}
          onChange={(e) =>
            setTripForm((p) => {
              const nextSentItem = e.target.value;
              return {
                ...p,
                sentItem: nextSentItem,
                impressionMethod: isMeasurementStep(nextSentItem) ? p.impressionMethod : "",
              };
            })
          }
          className="field"
          placeholder="Ölçü, zirkon alt yapı, prova…"
          autoFocus
        />
        <SpoonRequestQuickPicks
          selected={tripForm.requestedItem}
          onPick={(item) =>
            setTripForm((p) => ({
              ...p,
              sentItem: "Ölçü",
              requestedItem: item,
            }))
          }
        />
      </Field>
      <Field label="İstenen (Labdan Beklenen)">
        <input
          value={tripForm.requestedItem}
          onChange={(e) => setTripForm((p) => ({ ...p, requestedItem: e.target.value }))}
          className="field"
          placeholder="Zirkon alt yapı, dentin prova, glaze…"
        />
      </Field>
      {isMeasurementStep(tripForm.sentItem) && (
        <Field label="Ölçü Yöntemi">
          <select
            value={tripForm.impressionMethod}
            onChange={(e) => setTripForm((p) => ({ ...p, impressionMethod: e.target.value as ImpressionMethod }))}
            className="field"
          >
            <option value="">Seçiniz</option>
            <option value="KLASIK_OLCU">Klasik Ölçü</option>
            <option value="DIJITAL_TARAMA">Dijital Tarama</option>
          </select>
        </Field>
      )}
      <Field label="Gidiş Tarihi *">
        <input
          type="date"
          value={tripForm.sentAt}
          onChange={(e) => setTripForm((p) => ({ ...p, sentAt: e.target.value }))}
          className="field"
        />
      </Field>
      <Field label="Teknik Not">
        <input
          value={tripForm.sentNote}
          onChange={(e) => setTripForm((p) => ({ ...p, sentNote: e.target.value }))}
          className="field"
          placeholder="Renk kodu, özel ölçü notu…"
        />
      </Field>
    </div>
  );
}

