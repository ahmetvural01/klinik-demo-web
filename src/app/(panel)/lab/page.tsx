"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

const LAB_TYPES = ["Kronkopru", "Zirkon", "Veneer", "Protez", "Braket", "İmplant Üstü", "Beyazlatma", "Diğer"];
const CUR = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0 });

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

const emptyOrderForm = {
  patientId: "",
  doctorId: "",
  labName: "",
  labType: "",
  teeth: "",
  notes: "",
};

const emptyTripForm = {
  description: "",
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
  description: "",
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
  const [search, setSearch] = useState("");

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

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/lab-orders")
      .then((r) => r.json())
      .then((d) => setOrders(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
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

  const visibleOrders = useMemo(() => {
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

  const closeModal = () => {
    setModal(null);
    setActiveOrder(null);
    setActiveTrip(null);
  };

  async function createOrder() {
    if (!orderForm.patientId || !orderForm.doctorId || !orderForm.labName || !orderForm.labType) return;
    setSaving(true);
    const res = await fetch("/api/lab-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: orderForm.patientId,
        doctorId: orderForm.doctorId,
        labName: orderForm.labName,
        labType: orderForm.labType,
        teeth: orderForm.teeth || null,
        notes: orderForm.notes || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setOrderForm(emptyOrderForm);
      closeModal();
      load();
    }
  }

  async function createTrip() {
    if (!activeOrder || !tripForm.description) return;
    setSaving(true);
    await fetch(`/api/lab-orders/${activeOrder.id}/trips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: tripForm.description,
        sentAt: tripForm.sentAt,
        sentNote: tripForm.sentNote,
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
    if (!activeTrip || !editTripForm.description) return;

    setSaving(true);
    await fetch(`/api/lab-orders/${activeTrip.labOrder.id}/trips/${activeTrip.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: editTripForm.description,
        sentAt: editTripForm.sentAt,
        sentNote: editTripForm.sentNote || null,
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

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Laboratuvar</h1>
            <p className="mt-1 text-sm text-slate-500">Sadece gerekli kayıtlar, tek listede.</p>
          </div>
          <button
            onClick={() => {
              setOrderForm(emptyOrderForm);
              setModal("new");
            }}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            + Yeni İş
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hasta ara"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none ring-slate-200 transition focus:ring-2"
          />
          <p className="text-xs text-slate-500">{stats.active} aktif · {stats.done} tamamlanan</p>
        </div>
      </header>

      <main className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Yükleniyor...</div>
        ) : orderedVisibleOrders.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Kayıt bulunamadı.</div>
        ) : (
          orderedVisibleOrders.map((order) => (
            <SimpleOrderCard
              key={order.id}
              order={order}
              expanded={expandedOrderId === order.id}
              onToggleExpand={() => setExpandedOrderId((current) => (current === order.id ? null : order.id))}
              onAddTrip={(selectedOrder) => {
                setActiveOrder(selectedOrder);
                setTripForm({ ...emptyTripForm, sentAt: today() });
                setModal("trip");
              }}
              onAddInvoice={(selectedOrder) => {
                setActiveOrder(selectedOrder);
                setInvoiceForm({ ...emptyInvoiceForm, item: selectedOrder.labType, issuedAt: today() });
                setModal("invoice");
              }}
              onReceive={(selectedOrder, trip) => {
                setActiveTrip({ ...trip, labOrder: selectedOrder });
                setReceiveForm({ ...emptyReceiveForm, receivedAt: today() });
                setModal("receive");
              }}
              onEditTrip={(selectedOrder, trip) => {
                setActiveTrip({ ...trip, labOrder: selectedOrder });
                setEditTripForm({
                  description: trip.description,
                  sentAt: trip.sentAt ? new Date(trip.sentAt).toISOString().slice(0, 10) : today(),
                  sentNote: trip.sentNote || "",
                  hasReceived: Boolean(trip.receivedAt),
                  receivedAt: trip.receivedAt ? new Date(trip.receivedAt).toISOString().slice(0, 10) : today(),
                  receivedNote: trip.receivedNote || "",
                });
                setModal("editTrip");
              }}
              onComplete={markCompleted}
            />
          ))
        )}
      </main>

      {modal === "new" && (
        <Modal title="Yeni Laboratuvar İşi" onClose={closeModal}>
          <div className="space-y-3">
            <Field label="Hasta *">
              <select
                value={orderForm.patientId}
                onChange={(e) => setOrderForm((p) => ({ ...p, patientId: e.target.value }))}
                className="field"
              >
                <option value="">Seçiniz</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.fullName}</option>
                ))}
              </select>
            </Field>

            <Field label="Doktor *">
              <select
                value={orderForm.doctorId}
                onChange={(e) => setOrderForm((p) => ({ ...p, doctorId: e.target.value }))}
                className="field"
              >
                <option value="">Seçiniz</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.fullName}</option>
                ))}
              </select>
            </Field>

            <Field label="Laboratuvar Adı *">
              <input
                value={orderForm.labName}
                onChange={(e) => setOrderForm((p) => ({ ...p, labName: e.target.value }))}
                className="field"
              />
            </Field>

            <Field label="İş Türü *">
              <select
                value={orderForm.labType}
                onChange={(e) => setOrderForm((p) => ({ ...p, labType: e.target.value }))}
                className="field"
              >
                <option value="">Seçiniz</option>
                {LAB_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>

            <Field label="Diş No">
              <input
                value={orderForm.teeth}
                onChange={(e) => setOrderForm((p) => ({ ...p, teeth: e.target.value }))}
                className="field"
                placeholder="11, 12"
              />
            </Field>

            <Field label="Not">
              <input
                value={orderForm.notes}
                onChange={(e) => setOrderForm((p) => ({ ...p, notes: e.target.value }))}
                className="field"
                placeholder="Ölçü, renk, açıklama"
              />
            </Field>
          </div>
          <ModalActions
            onClose={closeModal}
            onSave={createOrder}
            saving={saving}
            saveText="Kaydet"
            disabled={!orderForm.patientId || !orderForm.doctorId || !orderForm.labName || !orderForm.labType}
          />
        </Modal>
      )}

      {modal === "trip" && activeOrder && (
        <Modal title="Gidiş Kaydı" subtitle={`${activeOrder.patient.fullName} · ${activeOrder.labName}`} onClose={closeModal}>
          <div className="space-y-3">
            <Field label="Ne için gitti? *">
              <input
                value={tripForm.description}
                onChange={(e) => setTripForm((p) => ({ ...p, description: e.target.value }))}
                className="field"
                placeholder="Açık kaşık ölçü, zirkon alt yapı, glaze..."
                autoFocus
              />
            </Field>

            <Field label="Gidiş Tarihi *">
              <input
                type="date"
                value={tripForm.sentAt}
                onChange={(e) => setTripForm((p) => ({ ...p, sentAt: e.target.value }))}
                className="field"
              />
            </Field>

            <Field label="Not">
              <input
                value={tripForm.sentNote}
                onChange={(e) => setTripForm((p) => ({ ...p, sentNote: e.target.value }))}
                className="field"
                placeholder="Teknik not"
              />
            </Field>
          </div>
          <ModalActions onClose={closeModal} onSave={createTrip} saving={saving} saveText="Gidişi Kaydet" disabled={!tripForm.description} />
        </Modal>
      )}

      {modal === "receive" && activeTrip && (
        <Modal title="Geliş İşaretle" subtitle={`${activeTrip.labOrder.patient.fullName} · ${activeTrip.description}`} onClose={closeModal}>
          <div className="space-y-3">
            <Field label="Geliş Tarihi">
              <input
                type="date"
                value={receiveForm.receivedAt}
                onChange={(e) => setReceiveForm((p) => ({ ...p, receivedAt: e.target.value }))}
                className="field"
              />
            </Field>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={receiveForm.needsAppointment}
                onChange={(e) => setReceiveForm((p) => ({ ...p, needsAppointment: e.target.checked }))}
              />
              Hastaya prova/randevu planlanacak
            </label>

            <Field label="Geliş Notu">
              <input
                value={receiveForm.receivedNote}
                onChange={(e) => setReceiveForm((p) => ({ ...p, receivedNote: e.target.value }))}
                className="field"
                placeholder="Prova hazır, küçük düzeltme gerekli..."
              />
            </Field>
          </div>
          <ModalActions onClose={closeModal} onSave={markTripReceived} saving={saving} saveText="Geldi Olarak İşaretle" />
        </Modal>
      )}

      {modal === "invoice" && activeOrder && (
        <Modal title="Fatura Kalemi Ekle" subtitle={`${activeOrder.patient.fullName} · ${activeOrder.labName}`} onClose={closeModal}>
          <div className="space-y-3">
            <Field label="Kalem *">
              <input
                value={invoiceForm.item}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, item: e.target.value }))}
                className="field"
                placeholder="Açık kaşık, zirkon alt yapı, glaze..."
              />
            </Field>

            <Field label="Tutar (TRY) *">
              <input
                type="number"
                value={invoiceForm.amount}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, amount: e.target.value }))}
                className="field"
                placeholder="0"
              />
            </Field>

            <Field label="Fatura No">
              <input
                value={invoiceForm.invoiceNo}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, invoiceNo: e.target.value }))}
                className="field"
                placeholder="FAT-2026-001"
              />
            </Field>

            <Field label="Fatura Tarihi">
              <input
                type="date"
                value={invoiceForm.issuedAt}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, issuedAt: e.target.value }))}
                className="field"
              />
            </Field>

            <Field label="Not">
              <input
                value={invoiceForm.note}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, note: e.target.value }))}
                className="field"
              />
            </Field>
          </div>
          <ModalActions onClose={closeModal} onSave={addInvoice} saving={saving} saveText="Faturayı Ekle" disabled={!invoiceForm.item || !invoiceForm.amount} />
        </Modal>
      )}

      {modal === "editTrip" && activeTrip && (
        <Modal title="Süreç Adımını Düzenle" subtitle={`${activeTrip.labOrder.patient.fullName} · #${activeTrip.order}`} onClose={closeModal}>
          <div className="space-y-3">
            <Field label="Açıklama *">
              <input
                value={editTripForm.description}
                onChange={(e) => setEditTripForm((p) => ({ ...p, description: e.target.value }))}
                className="field"
              />
            </Field>

            <Field label="Gidiş Tarihi *">
              <input
                type="date"
                value={editTripForm.sentAt}
                onChange={(e) => setEditTripForm((p) => ({ ...p, sentAt: e.target.value }))}
                className="field"
              />
            </Field>

            <Field label="Gidiş Notu">
              <input
                value={editTripForm.sentNote}
                onChange={(e) => setEditTripForm((p) => ({ ...p, sentNote: e.target.value }))}
                className="field"
              />
            </Field>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={editTripForm.hasReceived}
                onChange={(e) => setEditTripForm((p) => ({ ...p, hasReceived: e.target.checked }))}
              />
              Bu adım geldi olarak işaretli
            </label>

            {editTripForm.hasReceived && (
              <>
                <Field label="Geliş Tarihi">
                  <input
                    type="date"
                    value={editTripForm.receivedAt}
                    onChange={(e) => setEditTripForm((p) => ({ ...p, receivedAt: e.target.value }))}
                    className="field"
                  />
                </Field>

                <Field label="Geliş Notu">
                  <input
                    value={editTripForm.receivedNote}
                    onChange={(e) => setEditTripForm((p) => ({ ...p, receivedNote: e.target.value }))}
                    className="field"
                  />
                </Field>
              </>
            )}
          </div>
          <ModalActions
            onClose={closeModal}
            onSave={updateTrip}
            saving={saving}
            saveText="Adımı Güncelle"
            disabled={!editTripForm.description}
          />
        </Modal>
      )}

      <style jsx global>{`
        .field {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgb(226 232 240);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(30 41 59);
          outline: none;
        }

        .field:focus {
          box-shadow: 0 0 0 2px rgb(148 163 184 / 0.25);
          border-color: rgb(148 163 184);
        }
      `}</style>
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: "blue" | "amber" | "emerald" }) {
  const tones: Record<typeof tone, string> = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
  };

  return (
    <div className={`rounded-lg border px-3 py-2 ${tones[tone]}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
    </div>
  );
}

function SimpleOrderCard({
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
  const firstTrip = [...order.trips].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())[0];
  const pendingTrip = [...order.trips].reverse().find((trip) => !trip.receivedAt);
  const latestTrip = [...order.trips].reverse()[0];
  const currentTask = pendingTrip?.description || order.labType;
  const firstDate = firstTrip?.sentAt;
  const isDone = order.status === "HASTAYA_TAKILDI" && !pendingTrip;
  const totalInvoices = order.invoices.length;
  const totalAmount = order.invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const statusLabel = isDone ? "Tamamlandı" : pendingTrip ? "Labda" : firstTrip ? "Klinikte" : "Yeni";

  return (
    <article className={`rounded-2xl border px-4 py-3 ${isDone ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-slate-900">{order.patient.fullName}</h2>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${isDone ? "bg-slate-200 text-slate-600" : pendingTrip ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{statusLabel}</span>
          </div>
          <p className="text-sm text-slate-700">{currentTask}</p>
          <p className="text-sm text-slate-500">İlk işlem tarihi: {firstDate ? fmt(firstDate) : "Henüz girilmedi"}</p>
          <p className="text-xs text-slate-400">{order.labName} · {order.trips.length} süreç adımı · {totalInvoices} fatura</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!isDone && (
            <button
              onClick={() => onAddTrip(order)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Gidiş Ekle
            </button>
          )}

          {!isDone && pendingTrip && (
            <button
              onClick={() => onReceive(order, pendingTrip)}
              className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
            >
              Geldi
            </button>
          )}

          <button
            onClick={() => onAddInvoice(order)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Fatura
          </button>

          {!isDone && (
            <button
              onClick={() => onComplete(order.id)}
              disabled={Boolean(pendingTrip)}
              className="rounded-lg border border-slate-900 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Tamamla
            </button>
          )}

          <button
            onClick={onToggleExpand}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {expanded ? "Süreci Gizle" : "Süreci Gör"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">Süreç Akışı</p>
              {latestTrip && <p className="text-[11px] text-slate-400">Son işlem: {fmt(latestTrip.receivedAt || latestTrip.sentAt)}</p>}
            </div>

            {order.trips.length === 0 ? (
              <div className="rounded-xl bg-white px-3 py-4 text-sm text-slate-400">Henüz süreç adımı eklenmedi.</div>
            ) : (
              <div className="space-y-2">
                {order.trips.map((trip) => {
                  const waiting = !trip.receivedAt;

                  return (
                    <div key={trip.id} className="rounded-xl bg-white px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">#{trip.order} · {trip.description}</p>
                          <p className="mt-1 text-xs text-slate-500">Gidiş: {fmt(trip.sentAt)}{trip.receivedAt ? ` · Geliş: ${fmt(trip.receivedAt)}` : " · Bekleniyor"}</p>
                          {trip.sentNote && <p className="mt-1 text-xs text-slate-500">Gidiş notu: {trip.sentNote}</p>}
                          {trip.receivedNote && <p className="mt-1 text-xs text-slate-500">Geliş notu: {trip.receivedNote}</p>}
                        </div>

                        {waiting ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              onClick={() => onReceive(order, trip)}
                              className="rounded-lg border border-emerald-300 px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
                            >
                              Geldi
                            </button>
                            <button
                              onClick={() => onEditTrip(order, trip)}
                              className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Düzenle
                            </button>
                          </div>
                        ) : (
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] text-emerald-700">Tamam</span>
                            <button
                              onClick={() => onEditTrip(order, trip)}
                              className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Düzenle
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-xl bg-white px-3 py-3">
              <p className="text-xs font-semibold text-slate-700">Özet</p>
              <div className="mt-2 space-y-2 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Lab</span>
                  <span className="font-medium text-slate-800">{order.labName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>İş türü</span>
                  <span className="font-medium text-slate-800">{order.labType}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Toplam gidiş</span>
                  <span className="font-medium text-slate-800">{order.trips.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Bekleyen adım</span>
                  <span className="font-medium text-slate-800">{pendingTrip ? `#${pendingTrip.order}` : "Yok"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Fatura adedi</span>
                  <span className="font-medium text-slate-800">{totalInvoices}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Fatura toplamı</span>
                  <span className="font-medium text-slate-800">{totalAmount ? CUR.format(totalAmount) : "—"}</span>
                </div>
              </div>
            </div>

            {order.invoices.length > 0 && (
              <div className="rounded-xl bg-white px-3 py-3">
                <p className="text-xs font-semibold text-slate-700">Fatura Geçmişi</p>
                <div className="mt-2 space-y-2">
                  {order.invoices.map((invoice) => (
                    <div key={invoice.id} className="border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
                      <p className="text-sm font-medium text-slate-800">{invoice.item}</p>
                      <p className="mt-1 text-xs text-slate-500">{fmt(invoice.issuedAt)}{invoice.invoiceNo ? ` · ${invoice.invoiceNo}` : ""}</p>
                      <p className="mt-1 text-xs text-slate-700">{CUR.format(invoice.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function ModalActions({ onClose, onSave, saving, saveText, disabled }: { onClose: () => void; onSave: () => void; saving: boolean; saveText: string; disabled?: boolean }) {
  return (
    <div className="mt-4 flex gap-2 border-t border-slate-200 pt-4">
      <button onClick={onClose} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
        Vazgeç
      </button>
      <button
        onClick={onSave}
        disabled={saving || disabled}
        className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {saving ? "Kaydediliyor..." : saveText}
      </button>
    </div>
  );
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
