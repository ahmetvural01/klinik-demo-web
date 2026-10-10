"use client";

import Link from "next/link";
import { Ban, CalendarPlus, Pencil, Phone, RotateCcw, XCircle } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Disclosure } from "@/components/ui/Disclosure";
import { Money } from "@/components/ui/Money";
import { StepList, type StepItem } from "@/components/ui/StepList";
import { LabStatusBadge } from "@/components/lab/LabStatusBadge";
import { getLabRowAction } from "@/components/lab/lab-row-action";
import { formatPhoneNumber } from "@/lib/format";
import {
  LAB_LABELS,
  WORKFLOW_TEMPLATES,
  cleanReceivedNote,
  cleanSentNote,
  expectedReturnAt,
  formatLabDate,
  formatShortLabDate,
  getOrderSummary,
  getReceivedItemFromNote,
  hasRptMarker,
  isSameWorkflowValue,
  isSpoonRequestItem,
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
  /** Laboratuvarın telefonu (varsa) — gecikmede aramak için. */
  labPhone?: string | null;
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
  /** Yeniden yapım (lab:complete) — yalnız canComplete iken gösterilir. */
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
 * paneli kullanır. Üstte kim/ne/nerede bir kez; altında "şu an ne durumda"
 * tek satır ve TEK birincil eylem; sonra akış (gelen adımlar ✓, laboratuvardaki
 * ●, sıradakiler ○ — kaç adım kaldığı görünür), lab faturası ve seyrek
 * eylemler ("Diğer işlemler" menüsü). Bütün hesaplar src/lib/lab-workflow.ts'ten.
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
  const { can } = usePermissions();
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
  // Firma hesabı (/firma-detay) finans yetkisi ister; yetkisiz kullanıcı
  // bağlantıya basıp "yetkiniz yok" sayfasına düşmesin.
  const canOpenFirma = Boolean(order.firmaId) && can("finance:read");

  // ── Şu an + sıradaki adım: tek satır, tek birincil eylem ──────────────────
  let stateText = "";
  if (summary.cancelled) {
    stateText = cancelReasons.length ? `İptal nedeni: ${cancelReasons[cancelReasons.length - 1]}` : "İş iptal edildi.";
  } else if (summary.isDone) {
    stateText = summary.lastActivityAt ? `Son işlem ${formatLabDate(summary.lastActivityAt)}.` : "";
  } else if (summary.pendingTrip) {
    const { sentItem, requestedItem } = parseDesc(summary.pendingTrip.description);
    const due = formatShortLabDate(expectedReturnAt(summary.pendingTrip));
    stateText = summary.late
      ? `${requestedItem || sentItem} bekleniyor · dönüş ${due} idi — laboratuvarı arayın.`
      : `${requestedItem || sentItem} bekleniyor · dönüş ${due}.`;
  } else if (summary.sortedTrips.length === 0) {
    stateText = "Henüz laboratuvara gönderilmedi.";
  } else {
    const received = summary.lastReceivedTrip;
    const parts = received ? parseDesc(received.description) : null;
    const receivedItem = received && parts ? getReceivedItemFromNote(received.receivedNote, parts.requestedItem || parts.sentItem) : "";
    const finished = summary.templateFinished || !summary.nextStep;
    stateText = finished
      ? `${receivedItem || "Son adım"} geldi — hastaya takılmayı bekliyor.${canComplete ? "" : " Hekim takacak."}`
      : `${receivedItem || "İş"} geldi — provadan sonra sıradaki adım gönderilecek.`;
  }

  const rowAction = getLabRowAction(summary, { canWrite, canComplete });
  const runAction = (kind: string) => {
    if (kind === "send") onAddTrip?.(order);
    else if (kind === "receive" && summary.pendingTrip) onReceive?.(order, summary.pendingTrip);
    else if (kind === "complete") onComplete?.(order);
  };
  const primary = rowAction && rowAction.kind !== "awaitComplete" ? rowAction : null;
  // Klinikteki işte ikinci yol: hem gönderilebilir hem kapatılabilir.
  const clinicFinished = summary.stage === "clinic" && (summary.templateFinished || !summary.nextStep);
  const secondary = summary.stage === "clinic"
    ? clinicFinished
      ? (canWrite && onAddTrip ? { kind: "send", label: LAB_LABELS.send } : null)
      : (canComplete && onComplete ? { kind: "complete", label: LAB_LABELS.complete } : null)
    : null;

  const canAddInvoice = canWrite && open && !summary.rework && Boolean(onAddInvoice);
  // Takılmış işte fatura iptal edilmez (sunucu son faturayı engeller); yanlış tutar "Faturayı düzenle" ile düzeltilir.
  const canCancelInvoice = canWrite && !summary.cancelled && !summary.isDone && Boolean(onDeleteInvoice);

  const tripStep = (trip: SharedLabTrip, muted = false): StepItem => {
    const parts = parseDesc(trip.description);
    const done = Boolean(trip.receivedAt);
    const receivedItem = getReceivedItemFromNote(trip.receivedNote, parts.requestedItem || parts.sentItem);
    const differs = done && parts.requestedItem && !isSameWorkflowValue(receivedItem, parts.requestedItem);
    const late = !done && isTripLate(trip);
    const sentNote = cleanSentNote(trip.sentNote);
    const receivedNote = cleanReceivedNote(trip.receivedNote);
    const method = sentMethodLabel(trip.sentNote);
    const isPending = summary.pendingTrip?.id === trip.id;
    const dates = done
      ? `Gönderildi ${formatShortLabDate(trip.sentAt)} · geldi ${formatShortLabDate(trip.receivedAt)}`
      : `Gönderildi ${formatShortLabDate(trip.sentAt)} · dönüş ${formatShortLabDate(expectedReturnAt(trip))}${late ? " (gecikti)" : ""}`;
    return {
      key: trip.id,
      title: (
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
          {parts.requestedItem ? `${parts.sentItem} → ${parts.requestedItem}` : parts.sentItem}
          {hasRptMarker(trip.sentNote) && <Badge tone="neutral" size="sm">Yeniden yapım başlangıcı</Badge>}
        </span>
      ),
      description: (
        <>
          <span className="block">{[dates, method].filter(Boolean).join(" · ")}</span>
          {differs && <span className="block font-semibold text-amber-700">Gelen: {receivedItem}</span>}
          {sentNote && <span className="block">Not: {sentNote}</span>}
          {receivedNote && <span className="block">Geliş notu: {receivedNote}</span>}
        </>
      ),
      status: muted ? "done" : done ? "done" : late ? "error" : "current",
      actions: canWrite && !summary.cancelled && !muted ? (
        <>
          {!done && !isPending && onReceive && (
            <Button size="sm" variant="secondary" onClick={() => onReceive(order, trip)}>{LAB_LABELS.receive}</Button>
          )}
          {onEditTrip && <IconButton icon={Pencil} size="sm" title={LAB_LABELS.editStep} onClick={() => onEditTrip(order, trip)} />}
        </>
      ) : undefined,
    };
  };

  // Şablonda kalan adımlar (yalnız gönderimler şablonla birebir uyuşuyorsa —
  // elle yazılmış farklı adımlardan sonra yanıltıcı olmasın).
  const template = WORKFLOW_TEMPLATES[order.labType] ?? [];
  const templateTrips = summary.sortedTrips.filter((trip) => !isSpoonRequestItem(parseDesc(trip.description).requestedItem));
  const upcoming: StepItem[] = open && template.length > 0 && summary.stepIndex === templateTrips.length
    ? template.slice(summary.stepIndex).map((step, index) => ({
        key: `upcoming-${index}`,
        title: `${step.send} → ${step.request}`,
        description: index === 0 && !summary.pendingTrip ? "Sıradaki adım" : undefined,
        status: "upcoming" as const,
      }))
    : [];
  const steps = [...summary.sortedTrips.map((trip) => tripStep(trip)), ...upcoming];

  const rareActions: ActionMenuItem[] = canWrite && !summary.cancelled
    ? [
        ...(onEditOrder ? [{ key: "edit", label: LAB_LABELS.editOrder, icon: Pencil, onSelect: () => onEditOrder(order) }] : []),
        ...(summary.isDone && onRpt && canComplete ? [{ key: "rework", label: LAB_LABELS.rework, icon: RotateCcw, onSelect: () => onRpt(order) }] : []),
        ...(onCancel ? [{ key: "cancel", label: LAB_LABELS.cancelOrder, icon: Ban, danger: true, separatorBefore: true, onSelect: () => onCancel(order) }] : []),
      ]
    : [];

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
            {canOpenFirma ? (
              <Link href={`/firma-detay?id=${order.firmaId}`} className="text-primary hover:underline" title="Tedarikçi hesabını aç (borç ve ödemeler)">{order.labName}</Link>
            ) : order.labName}
          </dd>
          {order.labPhone && (
            <dd>
              <a href={`tel:${order.labPhone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-primary">
                <Phone className="h-3 w-3" aria-hidden="true" />
                {formatPhoneNumber(order.labPhone)}
              </a>
            </dd>
          )}
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
        </div>
        {stateText && <p className={`mt-2 text-sm ${summary.late ? "font-semibold text-red-800" : "text-slate-700"}`}>{stateText}</p>}
        {(primary || secondary || (provaTrip && open && order.patient.id)) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {primary && <Button size="sm" onClick={() => runAction(primary.kind)}>{primary.label}</Button>}
            {secondary && <Button size="sm" variant="secondary" onClick={() => runAction(secondary.kind)}>{secondary.label}</Button>}
            {provaTrip && open && order.patient.id && (
              // Geliş kaydı hastayı "Hasta aramaları"na ekler; randevu hemen de verilebilir.
              <Button
                size="sm"
                variant="secondary"
                icon={CalendarPlus}
                href={`/randevu?newPatientId=${encodeURIComponent(order.patient.id)}&newPatientName=${encodeURIComponent(order.patient.fullName)}`}
              >
                Prova randevusu ver
              </Button>
            )}
          </div>
        )}
      </section>

      {/* Akış — eskiden yeniye, sıradaki şablon adımlarıyla */}
      <section aria-label="Laboratuvar adımları">
        <h3 className="mb-2 text-sm font-bold text-slate-900">Adımlar</h3>
        {steps.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">Henüz gönderim yok.</p>
        ) : (
          <StepList aria-label={`${order.labType} adımları`} steps={steps} />
        )}
        {previousTrips.length > 0 && (
          <Disclosure title="Yeniden yapım öncesi adımlar" summary={`${previousTrips.length} adım`} className="mt-3">
            <StepList aria-label="Yeniden yapım öncesi adımlar" steps={previousTrips.map((trip) => tripStep(trip, true))} />
          </Disclosure>
        )}
      </section>

      {/* Lab faturası */}
      <section aria-label="Lab faturası">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">Lab faturası</h3>
          {canAddInvoice && <Button size="sm" variant="secondary" onClick={() => onAddInvoice?.(order)}>{LAB_LABELS.addInvoice}</Button>}
        </div>
        {order.invoices.length === 0 ? (
          <p className="text-sm text-slate-500">
            {summary.rework ? "Yeniden yapım ücretsizdir; fatura girilmez." : "Fatura girilmedi."}
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
                <Money value={invoice.amount} className="shrink-0 font-bold text-slate-900" />
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
                <Money value={summary.totalAmount} />
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Seyrek eylemler — tek menüde */}
      {rareActions.length > 0 && (
        <div className="flex justify-end border-t border-slate-100 pt-3">
          <ActionMenu trigger="button" label="Diğer işlemler" items={rareActions} />
        </div>
      )}
    </div>
  );
}
