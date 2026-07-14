"use client";

import type React from "react";

export type SharedLabInvoice = {
  id: string;
  item: string;
  amount: number;
  invoiceNo?: string | null;
  issuedAt: string;
  note?: string | null;
};

export type SharedLabTrip = {
  id: string;
  order: number;
  description: string;
  sentAt: string;
  receivedAt?: string | null;
  sentNote?: string | null;
  receivedNote?: string | null;
};

export type SharedLabOrder = {
  id: string;
  labName: string;
  labType: string;
  teeth?: string | null;
  notes?: string | null;
  status: string;
  patient: { id: string; fullName: string; phone?: string | null };
  doctor: { id?: string | null; fullName: string };
  trips: SharedLabTrip[];
  invoices: SharedLabInvoice[];
};

type WorkflowStep = { send: string; request: string };

const CUR = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0 });
const PROVA_FOLLOW_UP_MARKER = "RANDEVU_PROVA_GEREKLI";
const RECEIVED_ITEM_MARKER = "LAB_GELEN_IS:";

const WORKFLOW_TEMPLATES: Record<string, WorkflowStep[]> = {
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
  "İmplant Üstü Sabit Restorasyon": [
    { send: "İmplant Ölçüsü (Scanbody / Transfer)", request: "Altyapı Prova" },
    { send: "Altyapı Prova", request: "Dentin Prova" },
    { send: "Dentin Prova", request: "Glazeli Bitim" },
  ],
  "Gece Plağı": [{ send: "Ölçü", request: "Gece Plağı" }],
};

function fmt(iso?: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function daysSince(iso?: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

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
    .replace(/\s+/g, " ")
    .trim();
}

function isSameWorkflowValue(left: string, right: string) {
  return normalizeWorkflowText(left) === normalizeWorkflowText(right);
}

function getCurrentCycleTrips(trips: SharedLabTrip[]) {
  const sorted = [...trips].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
  let startIndex = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    if ((sorted[i].sentNote || "").includes("RPT_RESET_START")) startIndex = i;
  }
  return sorted.slice(startIndex);
}

function getReceivedItemFromNote(note?: string | null, fallback = "") {
  const match = (note || "").match(/LAB_GELEN_IS:([^|]+)/);
  return (match?.[1] || fallback || "").trim();
}

function getNextTemplateStepIndex(labType: string, trips: SharedLabTrip[]) {
  const template = WORKFLOW_TEMPLATES[labType] ?? [];
  if (template.length === 0) return 0;

  let cursor = 0;
  for (const trip of trips) {
    if (cursor >= template.length) break;
    const { sentItem, requestedItem } = parseDesc(trip.description);
    const expected = template[cursor];
    if (isSameWorkflowValue(sentItem, expected.send) && isSameWorkflowValue(requestedItem, expected.request)) {
      const receivedItem = getReceivedItemFromNote(trip.receivedNote, requestedItem);
      if (trip.receivedAt && requestedItem && !isSameWorkflowValue(receivedItem, requestedItem)) break;
      cursor += 1;
    }
  }
  return cursor;
}

function cleanReceivedNote(note?: string | null) {
  return (note || "")
    .replace(`${PROVA_FOLLOW_UP_MARKER} | `, "")
    .replace(PROVA_FOLLOW_UP_MARKER, "")
    .replace(new RegExp(`\\s*\\|?\\s*${RECEIVED_ITEM_MARKER}[^|]*\\|?\\s*`, "g"), " ")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/^\s*\|\s*|\s*\|\s*$/g, "")
    .trim();
}

function needsProvaAppointment(note?: string | null) {
  return Boolean(note && note.includes(PROVA_FOLLOW_UP_MARKER));
}

function getLatestProvaFollowUpTrip(order: SharedLabOrder) {
  return getCurrentCycleTrips(order.trips)
    .filter((trip) => trip.receivedAt && needsProvaAppointment(trip.receivedNote))
    .sort((a, b) => new Date(b.receivedAt || b.sentAt).getTime() - new Date(a.receivedAt || a.sentAt).getTime())[0] || null;
}

function isRptOrder(order: Pick<SharedLabOrder, "notes">) {
  return /(^|\s|\[)RPT(\]|\s|$)/i.test(order.notes || "");
}

function getOrderSummary(order: SharedLabOrder) {
  const sortedTrips = getCurrentCycleTrips(order.trips);
  const pendingTrip = sortedTrips.slice().reverse().find((trip) => !trip.receivedAt) || null;
  const doneCount = sortedTrips.filter((trip) => trip.receivedAt).length;
  const isDone = order.status === "HASTAYA_TAKILDI" && !pendingTrip;
  const totalAmount = order.invoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
  const template = WORKFLOW_TEMPLATES[order.labType] ?? [];
  const stepIndex = getNextTemplateStepIndex(order.labType, sortedTrips);

  return {
    sortedTrips,
    pendingTrip,
    doneCount,
    totalCount: Math.max(template.length, sortedTrips.length),
    isDone,
    pendingDays: pendingTrip ? daysSince(pendingTrip.sentAt) : 0,
    totalAmount,
    nextStep: template[stepIndex] ?? null,
  };
}

export function LabOrderDetailPanel({
  order,
  onAddTrip,
  onAddInvoice,
  onReceive,
  onEditTrip,
  onComplete,
  onRpt,
}: {
  order: SharedLabOrder;
  onAddTrip?: (order: SharedLabOrder) => void;
  onAddInvoice?: (order: SharedLabOrder) => void;
  onReceive?: (order: SharedLabOrder, trip: SharedLabTrip) => void;
  onEditTrip?: (order: SharedLabOrder, trip: SharedLabTrip) => void;
  onComplete?: (order: SharedLabOrder) => void;
  onRpt?: (order: SharedLabOrder) => void;
}) {
  const summary = getOrderSummary(order);
  const pendingDesc = summary.pendingTrip ? parseDesc(summary.pendingTrip.description) : null;
  const rpt = isRptOrder(order);
  const latestProvaFollowUpTrip = getLatestProvaFollowUpTrip(order);
  const latestProvaParts = latestProvaFollowUpTrip ? parseDesc(latestProvaFollowUpTrip.description) : null;
  const canSendToLab = !summary.pendingTrip && !summary.isDone;
  const canReceiveFromLab = Boolean(summary.pendingTrip) && !summary.isDone;
  const canComplete = !summary.pendingTrip && !summary.isDone;
  const statusLabel = summary.isDone
    ? "Tamamlandı"
    : summary.pendingTrip
    ? summary.pendingDays >= 4
      ? "Gecikiyor"
      : "Laboratuvarda"
    : summary.totalCount > 0
    ? "Klinikte"
    : "Yeni";

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white px-2.5 py-1 font-bold text-slate-700">{statusLabel}</span>
            <span className="rounded-full bg-white px-2.5 py-1 font-bold text-slate-700">İlerleme {summary.doneCount}/{summary.totalCount}</span>
            <span className={`rounded-full px-2.5 py-1 font-bold ${summary.pendingTrip ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
              {summary.pendingTrip ? `${summary.pendingDays || 0}g bekliyor` : "Bekleyen yok"}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 font-bold text-slate-700">
              {summary.totalAmount > 0 ? CUR.format(summary.totalAmount) : "Fatura yok"}
            </span>
            {rpt && <span className="rounded-full bg-violet-100 px-2.5 py-1 font-bold text-violet-700">RPT ücretsiz tekrar</span>}
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs font-bold uppercase text-slate-400">Hasta</dt><dd className="font-semibold text-slate-900">{order.patient.fullName}</dd></div>
            <div><dt className="text-xs font-bold uppercase text-slate-400">Hekim</dt><dd className="font-semibold text-slate-900">{order.doctor.fullName}</dd></div>
            <div><dt className="text-xs font-bold uppercase text-slate-400">Laboratuvar</dt><dd className="font-semibold text-slate-900">{order.labName}</dd></div>
            <div><dt className="text-xs font-bold uppercase text-slate-400">Diş / Üye</dt><dd className="font-semibold text-slate-900">{order.teeth || "Belirtilmedi"}</dd></div>
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">Sıradaki İşlem</p>
          <p className="mt-2 text-sm font-bold text-slate-900">
            {summary.nextStep ? `${summary.nextStep.send} → ${summary.nextStep.request}` : "Süreç tamamlandı"}
          </p>
          {pendingDesc && (
            <p className="mt-2 text-xs font-semibold text-amber-700">
              Bekleyen: {pendingDesc.sentItem}{pendingDesc.requestedItem ? ` → ${pendingDesc.requestedItem}` : ""}
            </p>
          )}
        </div>
      </div>

      {latestProvaFollowUpTrip && latestProvaParts && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-wide text-violet-600">Hasta Takip Bağlantısı</p>
          <p className="mt-1 text-sm font-semibold text-violet-900">
            {latestProvaParts.requestedItem || latestProvaParts.sentItem} için hasta aranıp prova randevusu verilecek.
          </p>
          <p className="mt-1 text-xs text-violet-700">Hasta Takip ekranında en güncel lab prova aksiyonu olarak görünür.</p>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900">Süreç Zaman Çizelgesi</h3>
          {canSendToLab && onAddTrip && (
            <button onClick={() => onAddTrip(order)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700">Laboratuvara Gönder</button>
          )}
        </div>
        {summary.sortedTrips.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">Henüz laboratuvar gönderimi eklenmedi.</p>
        ) : (
          <div className="space-y-2">
            {summary.sortedTrips.slice().reverse().map((trip) => {
              const parts = parseDesc(trip.description);
              const done = Boolean(trip.receivedAt);
              const receivedItem = getReceivedItemFromNote(trip.receivedNote, parts.requestedItem || parts.sentItem);
              const receivedDiffers = done && parts.requestedItem && !isSameWorkflowValue(receivedItem, parts.requestedItem);
              const isCycleStart = (trip.sentNote || "").includes("RPT_RESET_START");
              return (
                <div key={trip.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-slate-900">{done ? "Laboratuvardan geldi" : "Laboratuvara gönderildi"}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {done ? "Geldi" : "Laboratuvarda"}
                        </span>
                        {isCycleStart && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">RPT başlangıcı</span>}
                      </div>
                      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                        <InfoBlock label="Gönderilen">{parts.sentItem || "-"}</InfoBlock>
                        <InfoBlock label={done ? "Gelen / Prova" : "Gelmesi Beklenen"}>
                          {done ? receivedItem || "-" : parts.requestedItem || "-"}
                          {receivedDiffers && (
                            <span className="mt-1 block text-xs font-bold text-amber-700">
                              Beklenen: {parts.requestedItem}
                            </span>
                          )}
                        </InfoBlock>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{fmt(trip.sentAt)}{trip.receivedAt ? ` · ${fmt(trip.receivedAt)}` : " · bekliyor"}</p>
                      {trip.sentNote && <p className="mt-1 text-xs text-slate-500">{trip.sentNote}</p>}
                      {cleanReceivedNote(trip.receivedNote) && <p className="mt-1 text-xs text-slate-500">{cleanReceivedNote(trip.receivedNote)}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {!done && onReceive && (
                        <button onClick={() => onReceive(order, trip)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100">Geliş Kaydet</button>
                      )}
                      {onEditTrip && (
                        <button onClick={() => onEditTrip(order, trip)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Düzenle</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-black text-slate-900">Fatura ve Firma Bağlantısı</h3>
            {onAddInvoice && (
              <button onClick={() => onAddInvoice(order)} disabled={rpt} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                {rpt ? "RPT Ücretsiz" : "Fatura Ekle"}
              </button>
            )}
          </div>
          {order.invoices.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Fatura eklenmedi; firma borcu oluşmadı.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {order.invoices.map((inv) => (
                <div key={inv.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_120px_120px]">
                  <span className="truncate font-semibold text-slate-800">{inv.item}</span>
                  <span className="text-slate-500">{inv.invoiceNo || "Fatura no yok"}</span>
                  <span className="text-right font-bold text-slate-900">{CUR.format(inv.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-3 text-sm font-black text-slate-900">
                <span>Toplam</span>
                <span>{CUR.format(summary.totalAmount)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">Kontrol</p>
          <div className="mt-2 space-y-2 text-xs font-semibold">
            <p className={order.invoices.length > 0 || rpt ? "text-emerald-700" : "text-amber-700"}>
              {order.invoices.length > 0 ? "Firma borcu işlendi" : rpt ? "RPT ücretsiz takipte" : "Fatura bekliyor"}
            </p>
            <p className="text-slate-600">Hasta: {order.patient.fullName}</p>
            <p className="text-slate-600">Hekim: {order.doctor.fullName}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        {canReceiveFromLab && summary.pendingTrip && onReceive && (
          <button onClick={() => onReceive(order, summary.pendingTrip!)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100">Laboratuvardan Geldi</button>
        )}
        {canComplete && onComplete && (
          <button onClick={() => onComplete(order)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">
            Tamamla
          </button>
        )}
        {summary.isDone && onRpt && (
          <button onClick={() => onRpt(order)} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100">RPT Olarak Yeniden Aç</button>
        )}
      </div>
    </div>
  );
}

function InfoBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-800">{children}</p>
    </div>
  );
}
