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

export default function LabPage() {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  const [modal, setModal] = useState<"new" | "trip" | "receive" | "invoice" | null>(null);
  const [activeOrder, setActiveOrder] = useState<LabOrder | null>(null);
  const [activeTrip, setActiveTrip] = useState<(LabTrip & { labOrder: LabOrder }) | null>(null);

  const [orderForm, setOrderForm] = useState(emptyOrderForm);
  const [tripForm, setTripForm] = useState(emptyTripForm);
  const [receiveForm, setReceiveForm] = useState(emptyReceiveForm);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoiceForm);

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
    const active = orders.filter((o) => o.status !== "HASTAYA_TAKILDI" && o.status !== "IPTAL").length;
    const done = orders.filter((o) => o.status === "HASTAYA_TAKILDI").length;
    return { active, waiting: allPendingTrips.length, done };
  }, [orders, allPendingTrips.length]);

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

  async function markCompleted(orderId: string) {
    await fetch(`/api/lab-orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "HASTAYA_TAKILDI" }),
    });
    load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-8">
      <header className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Laboratuvar Süreci</h1>
            <p className="mt-1 text-xs text-slate-500">Gidiş notu al, geldiğinde işaretle, prova-randevu akışını kaçırma.</p>
          </div>
          <button
            onClick={() => {
              setOrderForm(emptyOrderForm);
              setModal("new");
            }}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-700"
          >
            + Yeni İş
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatBox label="Aktif İş" value={stats.active} tone="blue" />
          <StatBox label="Labda Bekleyen" value={stats.waiting} tone="amber" />
          <StatBox label="Tamamlanan" value={stats.done} tone="emerald" />
        </div>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Hasta, lab veya iş türü ara"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none ring-slate-200 transition focus:ring-2"
        />
      </section>

      {allPendingTrips.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <h2 className="text-xs font-semibold text-amber-700">Bugün takip edilecek gelişler</h2>
          <div className="mt-2 space-y-2">
            {allPendingTrips.slice(0, 6).map((trip) => (
              <div key={trip.id} className="flex items-center justify-between rounded-lg border border-amber-100 bg-white px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">{trip.labOrder.patient.fullName}</p>
                  <p className="text-xs text-slate-500">{trip.description} · {fmt(trip.sentAt)}</p>
                </div>
                <button
                  onClick={() => {
                    setActiveTrip(trip);
                    setReceiveForm({ ...emptyReceiveForm, receivedAt: today() });
                    setModal("receive");
                  }}
                  className="rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  Geldi
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Yükleniyor...</div>
        ) : visibleOrders.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Kayıt bulunamadı.</div>
        ) : (
          visibleOrders.map((order) => {
            const pending = order.trips.filter((t) => !t.receivedAt);
            const completedSteps = order.trips.filter((t) => !!t.receivedAt).length;
            const totalInvoice = order.invoices.reduce((sum, i) => sum + Number(i.amount || 0), 0);
            const isDone = order.status === "HASTAYA_TAKILDI";

            return (
              <article key={order.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{order.patient.fullName}</h3>
                    <p className="text-xs text-slate-500">{order.labName} · {order.labType} · {order.doctor.fullName}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {order.teeth && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">Diş {order.teeth}</span>}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">Aşama {completedSteps}/{order.trips.length || 0}</span>
                    {totalInvoice > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">{CUR.format(totalInvoice)}</span>}
                    {isDone && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">Tamamlandı</span>}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Gidiş - Geliş</p>
                    <div className="mt-2 space-y-2">
                      {order.trips.length === 0 ? (
                        <p className="text-xs text-slate-400">Henüz gidiş kaydı yok.</p>
                      ) : (
                        order.trips.map((trip) => (
                          <div key={trip.id} className="rounded-md border border-slate-100 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-slate-700">#{trip.order} · {trip.description}</p>
                              {trip.receivedAt ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Geldi - Prova/Randevu</span>
                              ) : (
                                <button
                                  onClick={() => {
                                    setActiveTrip({ ...trip, labOrder: order });
                                    setReceiveForm({ ...emptyReceiveForm, receivedAt: today() });
                                    setModal("receive");
                                  }}
                                  className="rounded-md border border-emerald-300 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50"
                                >
                                  Geldi
                                </button>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">Gidiş: {fmt(trip.sentAt)}</p>
                            {trip.sentNote && <p className="mt-1 text-[11px] text-slate-500">Not: {trip.sentNote}</p>}
                            {trip.receivedNote && <p className="mt-1 text-[11px] text-amber-700">Geliş notu: {trip.receivedNote}</p>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fatura Kalemleri</p>
                    <div className="mt-2 space-y-2">
                      {order.invoices.length === 0 ? (
                        <p className="text-xs text-slate-400">Henüz fatura girilmedi.</p>
                      ) : (
                        order.invoices.map((inv) => (
                          <div key={inv.id} className="rounded-md border border-slate-100 p-2">
                            <p className="text-xs font-medium text-slate-700">{inv.item}</p>
                            <p className="text-[11px] text-slate-500">{CUR.format(inv.amount)} · {fmt(inv.issuedAt)} {inv.invoiceNo ? `· ${inv.invoiceNo}` : ""}</p>
                            {inv.note && <p className="mt-1 text-[11px] text-slate-500">{inv.note}</p>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {!isDone && (
                    <button
                      onClick={() => {
                        setActiveOrder(order);
                        setTripForm({ ...emptyTripForm, sentAt: today() });
                        setModal("trip");
                      }}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      + Gidiş Ekle
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setActiveOrder(order);
                      setInvoiceForm({ ...emptyInvoiceForm, item: order.labType, issuedAt: today() });
                      setModal("invoice");
                    }}
                    className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    + Fatura Kalemi
                  </button>
                  {!isDone && (
                    <button
                      onClick={() => markCompleted(order.id)}
                      className="rounded-md border border-emerald-300 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                    >
                      Simante edildi
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>

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
