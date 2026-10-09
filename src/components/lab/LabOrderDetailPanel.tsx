"use client";

import Link from "next/link";
import { ArrowRight, Ban, Pencil, Phone, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { LabStatusBadge } from "@/components/lab/LabStatusBadge";
import { formatPhoneNumber } from "@/lib/format";
import {
  LAB_CURRENCY,
  LAB_LABELS,
  cleanReceivedNote,
  cleanSentNote,
  expectedReturnAt,
  formatLabDate,
  formatShortLabDate,
  getOrderSummary,
  getReceivedItemFromNote,
  hasRptMarker,
  isSameWorkflowValue,
  isTripLate,
  needsProvaAppointment,
  parseDesc,
  sentMethodLabel,
  splitOrderNotes,
  teethList,
} from "@/lib/lab-workflow";

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
  expectedAt?: string | null;
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
  firmaId?: string | null;
  createdAt?: string | null;
  patient: { id: string; fullName: string; phone?: string | null };
  doctor: { id?: string | null; fullName: string };
  trips: SharedLabTrip[];
  invoices: SharedLabInvoice[];
};

type Props = {
  order: SharedLabOrder;
  onAddTrip?: (order: SharedLabOrder) => void;
  onAddInvoice?: (order: SharedLabOrder) => void;
  onEditInvoice?: (order: SharedLabOrder, invoice: SharedLabInvoice) => void;
  onDeleteInvoice?: (order: SharedLabOrder, invoice: SharedLabInvoice) => void;
  onReceive?: (order: SharedLabOrder, trip: SharedLabTrip) => void;
  onEditTrip?: (order: SharedLabOrder, trip: SharedLabTrip) => void;
  onComplete?: (order: SharedLabOrder) => void;
  onRpt?: (order: SharedLabOrder) => void;
  /** Hekim, laboratuvar, iş türü, dişler ve notu düzeltme. */
  onEditOrder?: (order: SharedLabOrder) => void;
  /** İşi iptal etme (lab:delete). */
  onCancel?: (order: SharedLabOrder) => void;
  /** Yalnız görüntüleme yetkisi olan kullanıcıda eylem düğmeleri gizlenir. */
  canWrite?: boolean;
  canComplete?: boolean;
  /** Hasta dosyası içinde açıldığında hasta bağlantısı gösterilmez. */
  showPatientLink?: boolean;
};

/**
 * Tek laboratuvar işinin ekranı — Laboratuvar sayfası ve hasta dosyası aynı
 * paneli kullanır. Üstte "şu an ne durumda, sıradaki adım ne" ve TEK birincil
 * eylem; altında adımlar (eskiden yeniye), lab faturası ve seyrek eylemler.
 * Bütün hesaplar src/lib/lab-workflow.ts'ten gelir; önceden bu panel 22 iş
 * türünün yalnız 7'sini bildiği için yeni açılmış bir işe "Süreç tamamlandı"
 * diyebiliyordu.
 */
export function LabOrderDetailPanel({
  order,
  onAddTrip,
  onAddInvoice,
  onEditInvoice,
  onDeleteInvoice,
  onReceive,
  onEditTrip,
  onComplete,
  onRpt,
  onEditOrder,
  onCancel,
  canWrite = true,
  canComplete = true,
  showPatientLink = true,
}: Props) {
  const summary = getOrderSummary(order);
  const { userNotes, reworkReasons, cancelReasons } = splitOrderNotes(order.notes);
  const teeth = teethList(order.teeth);
  const open = !summary.cancelled && !summary.isDone;
  const allTrips = [...order.trips].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime() || a.order - b.order);
  const cycleIds = new Set(summary.sortedTrips.map((trip) => trip.id));
  const previousTrips = allTrips.filter((trip) => !cycleIds.has(trip.id));
  const provaTrip = summary.lastReceivedTrip && !summary.pendingTrip && needsProvaAppointment(summary.lastReceivedTrip.receivedNote)
    ? summary.lastReceivedTrip
    : null;
  const phone = order.patient.phone && order.patient.phone !== "***" ? order.patient.phone : "";

  // ── Sıradaki adım: tek cümle + tek birincil eylem ──────────────────────────
  let nextTitle = "";
  let nextText = "";
  let primary: { label: string; onClick: () => void } | null = null;
  let secondary: { label: string; onClick: () => void } | null = null;
  if (summary.cancelled) {
    nextText = cancelReasons.length ? `İptal nedeni: ${cancelReasons[cancelReasons.length - 1]}` : "";
  } else if (summary.isDone) {
    nextText = summary.lastActivityAt ? `Son işlem ${formatLabDate(summary.lastActivityAt)}. Sorun çıkarsa “${LAB_LABELS.rework}” ile laboratuvara ücretsiz yeniden yaptırabilirsiniz.` : "";
  } else if (summary.pendingTrip) {
    const pending = summary.pendingTrip;
    const { sentItem, requestedItem } = parseDesc(pending.description);
    nextTitle = summary.late ? "Dönüş gecikti — laboratuvarı arayın" : "Laboratuvardan dönüş bekleniyor";
    nextText = `${requestedItem || sentItem} bekleniyor · ${formatShortLabDate(pending.sentAt)} gönderildi · dönüş ${formatShortLabDate(expectedReturnAt(pending))}${summary.late ? " idi" : ""}. Gelince “${LAB_LABELS.receive}” deyin.`;
    if (canWrite && onReceive) primary = { label: LAB_LABELS.receive, onClick: () => onReceive(order, pending) };
  } else if (summary.sortedTrips.length === 0) {
    nextTitle = "Sıradaki adım: laboratuvara gönderin";
    nextText = summary.nextStep ? `Sıradaki adım: ${summary.nextStep.send} gönderilecek, ${summary.nextStep.request} beklenecek.` : "Ölçüyü laboratuvara gönderdiğinizde kaydedin.";
    if (canWrite && onAddTrip) primary = { label: LAB_LABELS.send, onClick: () => onAddTrip(order) };
  } else {
    const received = summary.lastReceivedTrip;
    const parts = received ? parseDesc(received.description) : null;
    const receivedItem = received && parts ? getReceivedItemFromNote(received.receivedNote, parts.requestedItem || parts.sentItem) : "";
    const finished = summary.templateFinished || !summary.nextStep;
    nextTitle = finished ? "Sıradaki adım: hastaya takın" : "Sıradaki adım: prova, sonra gönderim";
    nextText = finished
      ? `${receivedItem || "Son adım"} geldi. Hastaya takıldıysa işi kapatın.`
      : `${receivedItem || "İş"} geldi. Hastada prova yapıldıktan sonra sıradaki adımı gönderin: ${summary.nextStep?.send} → ${summary.nextStep?.request}.`;
    const completeAction = canComplete && onComplete ? { label: LAB_LABELS.complete, onClick: () => onComplete(order) } : null;
    const sendAction = canWrite && onAddTrip ? { label: LAB_LABELS.send, onClick: () => onAddTrip(order) } : null;
    primary = finished ? completeAction || sendAction : sendAction || completeAction;
    secondary = finished ? (completeAction ? sendAction : null) : (sendAction ? completeAction : null);
  }

  const canAddInvoice = canWrite && open && !summary.rework && Boolean(onAddInvoice);
  // Takılmış işte fatura iptal edilmez (sunucu son faturayı engeller); yanlış tutar "Faturayı düzenle" ile düzeltilir.
  const canCancelInvoice = canWrite && !summary.cancelled && !summary.isDone && Boolean(onDeleteInvoice);

  const renderTrip = (trip: SharedLabTrip, index: number, muted = false) => {
    const parts = parseDesc(trip.description);
    const done = Boolean(trip.receivedAt);
    const receivedItem = getReceivedItemFromNote(trip.receivedNote, parts.requestedItem || parts.sentItem);
    const differs = done && parts.requestedItem && !isSameWorkflowValue(receivedItem, parts.requestedItem);
    const late = !done && isTripLate(trip);
    const sentNote = cleanSentNote(trip.sentNote);
    const receivedNote = cleanReceivedNote(trip.receivedNote);
    const method = sentMethodLabel(trip.sentNote);
    const isPrimaryPending = summary.pendingTrip?.id === trip.id;
    return (
      <li key={trip.id} className={`flex gap-3 px-3 py-2.5 ${muted ? "opacity-70" : ""}`}>
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
          done ? "bg-emerald-100 text-emerald-700" : late ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
        }`}>
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm font-semibold text-slate-900">
            <span>{parts.sentItem}</span>
            {parts.requestedItem && (
              <>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-label="karşılığında beklenen" />
                <span>{parts.requestedItem}</span>
              </>
            )}
            {hasRptMarker(trip.sentNote) && <Badge tone="neutral" size="sm">Yeniden yapım başlangıcı</Badge>}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Gönderildi {formatShortLabDate(trip.sentAt)}
            {done
              ? ` · Geldi ${formatShortLabDate(trip.receivedAt)}`
              : ` · Dönüş ${formatShortLabDate(expectedReturnAt(trip))}${late ? " (gecikti)" : ""}`}
            {method ? ` · ${method}` : ""}
          </p>
          {differs && <p className="mt-0.5 text-xs font-semibold text-amber-700">Gelen: {receivedItem}</p>}
          {sentNote && <p className="mt-0.5 text-xs text-slate-600">Not: {sentNote}</p>}
          {receivedNote && <p className="mt-0.5 text-xs text-slate-600">Geliş notu: {receivedNote}</p>}
        </div>
        {canWrite && !summary.cancelled && (
          <div className="flex shrink-0 items-start gap-1">
            {!done && !isPrimaryPending && onReceive && (
              <Button size="sm" variant="secondary" onClick={() => onReceive(order, trip)}>Geldi</Button>
            )}
            {onEditTrip && <IconButton icon={Pencil} size="sm" title={LAB_LABELS.editStep} onClick={() => onEditTrip(order, trip)} />}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      {/* Kim, ne, nerede — bir kez */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-xs text-slate-500">Hasta</dt>
          <dd className="truncate font-semibold text-slate-900">
            {showPatientLink && order.patient.id ? (
              <Link href={`/hasta-detay?id=${order.patient.id}&tab=lab`} className="text-primary hover:underline">{order.patient.fullName}</Link>
            ) : order.patient.fullName}
          </dd>
          {phone && (
            <dd>
              <a href={`tel:${phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-primary">
                <Phone className="h-3 w-3" aria-hidden="true" />
                {formatPhoneNumber(phone)}
              </a>
            </dd>
          )}
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-slate-500">{LAB_LABELS.doctor}</dt>
          <dd className="truncate font-semibold text-slate-900">{order.doctor.fullName}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-slate-500">{LAB_LABELS.lab}</dt>
          <dd className="truncate font-semibold text-slate-900">
            {order.firmaId ? (
              <Link href={`/firma-detay?id=${order.firmaId}`} className="text-primary hover:underline" title="Firma hesabını aç (borç ve ödemeler)">{order.labName}</Link>
            ) : order.labName}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-slate-500">Dişler</dt>
          <dd className="font-semibold text-slate-900">{teeth.length ? teeth.join(", ") : <span className="font-normal text-slate-400">—</span>}</dd>
        </div>
      </dl>
      {(userNotes || reworkReasons.length > 0) && (
        <div className="space-y-1 text-sm text-slate-700">
          {userNotes && <p className="whitespace-pre-line"><span className="text-xs text-slate-500">Not: </span>{userNotes}</p>}
          {reworkReasons.map((item, index) => (
            <p key={`${item.at}-${index}`} className="text-xs text-slate-600">
              Yeniden yapım{item.at ? ` (${formatLabDate(item.at)})` : ""}: {item.reason}
            </p>
          ))}
        </div>
      )}

      {/* Şu an + sıradaki adım */}
      <section className={`rounded-lg border px-4 py-3 ${summary.late ? "border-red-200 bg-red-50/60" : "border-slate-200 bg-slate-50/70"}`} aria-label="Durum ve sıradaki adım">
        <div className="flex flex-wrap items-center gap-2">
          <LabStatusBadge stage={summary.stage} size="md" />
          {summary.rework && <Badge tone="neutral">{LAB_LABELS.reworkBadge}</Badge>}
          {summary.templateLength > 0 && open && (
            <span className="text-xs text-slate-500">Adım {Math.min(summary.doneCount, summary.totalCount)}/{summary.totalCount}</span>
          )}
        </div>
        {nextTitle && <p className="mt-2 text-sm font-semibold text-slate-900">{nextTitle}</p>}
        {nextText && <p className={`${nextTitle ? "mt-0.5" : "mt-2"} text-sm text-slate-600`}>{nextText}</p>}
        {provaTrip && open && (
          <p className="mt-1.5 text-xs text-slate-600">
            Hasta prova randevusu için <Link href="/hasta-takip" className="font-semibold text-primary hover:underline">Hasta Takip</Link> listesinde aranacak.
            {order.patient.id && (
              <>
                {" "}Randevuyu şimdi vermek için{" "}
                <Link href={`/randevu?newPatientId=${encodeURIComponent(order.patient.id)}&newPatientName=${encodeURIComponent(order.patient.fullName)}`} className="font-semibold text-primary hover:underline">randevu oluşturun</Link>.
              </>
            )}
          </p>
        )}
        {(primary || secondary) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {primary && <Button size="sm" onClick={primary.onClick}>{primary.label}</Button>}
            {secondary && <Button size="sm" variant="secondary" onClick={secondary.onClick}>{secondary.label}</Button>}
          </div>
        )}
      </section>

      {/* Adımlar — eskiden yeniye */}
      <section aria-label="Laboratuvar adımları">
        <h3 className="mb-1.5 text-sm font-bold text-slate-900">Adımlar</h3>
        {summary.sortedTrips.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-4 text-center text-sm text-slate-500">Henüz gönderim yok.</p>
        ) : (
          <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {summary.sortedTrips.map((trip, index) => renderTrip(trip, index))}
          </ol>
        )}
        {previousTrips.length > 0 && (
          <details className="mt-2 rounded-lg border border-slate-200">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-600">Yeniden yapım öncesi adımlar ({previousTrips.length})</summary>
            <ol className="divide-y divide-slate-100 border-t border-slate-100">
              {previousTrips.map((trip, index) => renderTrip(trip, index, true))}
            </ol>
          </details>
        )}
      </section>

      {/* Lab faturası */}
      <section aria-label="Lab faturası">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">Lab faturası</h3>
          {canAddInvoice && <Button size="sm" variant="secondary" onClick={() => onAddInvoice?.(order)}>{LAB_LABELS.addInvoice}</Button>}
        </div>
        {order.invoices.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
            {summary.rework
              ? "Yeniden yapım ücretsizdir; fatura girilmez."
              : summary.cancelled
                ? "Fatura yok."
                : "Fatura henüz girilmedi. “Hastaya takıldı” derken de girebilirsiniz; tutar laboratuvarın hesabına borç olarak yazılır."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {order.invoices.map((invoice) => (
              <li key={invoice.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-800">{invoice.item}</p>
                  <p className="text-xs text-slate-500">
                    {formatLabDate(invoice.issuedAt)}{invoice.invoiceNo ? ` · Fatura no ${invoice.invoiceNo}` : ""}{invoice.note ? ` · ${invoice.note}` : ""}
                  </p>
                </div>
                <span className="shrink-0 font-bold tabular-nums text-slate-900">{LAB_CURRENCY.format(invoice.amount)}</span>
                {canWrite && !summary.cancelled && (onEditInvoice || onDeleteInvoice) && (
                  <div className="flex shrink-0 gap-1">
                    {onEditInvoice && <IconButton icon={Pencil} size="sm" title={LAB_LABELS.editInvoice} onClick={() => onEditInvoice(order, invoice)} />}
                    {canCancelInvoice && (
                      <IconButton icon={XCircle} size="sm" tone="danger" title={LAB_LABELS.cancelInvoice} onClick={() => onDeleteInvoice?.(order, invoice)} />
                    )}
                  </div>
                )}
              </li>
            ))}
            {order.invoices.length > 1 && (
              <li className="flex justify-between px-3 py-2 text-sm font-bold text-slate-900">
                <span>Toplam</span>
                <span className="tabular-nums">{LAB_CURRENCY.format(summary.totalAmount)}</span>
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Seyrek eylemler */}
      {canWrite && !summary.cancelled && (onEditOrder || onCancel || (summary.isDone && onRpt)) && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {onEditOrder && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEditOrder(order)}>{LAB_LABELS.editOrder}</Button>}
          {summary.isDone && onRpt && <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => onRpt(order)}>{LAB_LABELS.rework}</Button>}
          {onCancel && <Button size="sm" variant="ghost" icon={Ban} className="!text-red-600 hover:!bg-red-50" onClick={() => onCancel(order)}>{LAB_LABELS.cancelOrder}</Button>}
        </div>
      )}
    </div>
  );
}
