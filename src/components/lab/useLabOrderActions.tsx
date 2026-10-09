"use client";

import { useRef, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { LabToothPicker } from "@/components/lab/LabToothPicker";
import {
  fetchJson,
  newRequestKey,
  normalizeLabOrder,
  type LabInvoiceView,
  type LabOrderView,
  type LabTripView,
} from "@/components/lab/lab-order-model";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { turkeyDateKey } from "@/lib/tz";
import {
  LAB_CATEGORIES,
  LAB_CURRENCY,
  LAB_LABELS,
  LAB_LATE_DAYS,
  SPOON_REQUEST_OPTIONS,
  WORKFLOW_TEMPLATES,
  buildDescription,
  buildReceivedNote,
  buildSentNote,
  canRequestSpoonForStep,
  cleanReceivedNote,
  formatShortLabDate,
  getOrderSummary,
  getReceivedItemFromNote,
  isMeasurementStep,
  isSameWorkflowValue,
  needsProvaAppointment,
  parseDesc,
  splitOrderNotes,
  splitSentNote,
  suggestNextTrip,
  type ImpressionMethod,
} from "@/lib/lab-workflow";

type Action =
  | { kind: "send"; order: LabOrderView }
  | { kind: "receive"; order: LabOrderView; trip: LabTripView }
  | { kind: "invoice"; order: LabOrderView; invoice: LabInvoiceView | null }
  | { kind: "editTrip"; order: LabOrderView; trip: LabTripView }
  | { kind: "complete"; order: LabOrderView }
  | { kind: "rework"; order: LabOrderView }
  | { kind: "editOrder"; order: LabOrderView }
  | { kind: "cancel"; order: LabOrderView };

type SendForm = { sentItem: string; requestedItem: string; impressionMethod: ImpressionMethod; sentAt: string; expectedAt: string; note: string };
type ReceiveForm = { receivedAt: string; receivedItem: string; note: string; needsAppointment: boolean };
type InvoiceForm = { item: string; amount: string; invoiceNo: string; issuedAt: string; note: string };
type TripEditForm = {
  sentItem: string;
  requestedItem: string;
  impressionMethod: ImpressionMethod;
  sentAt: string;
  expectedAt: string;
  sentNote: string;
  rptMarker: boolean;
  hasReceived: boolean;
  receivedAt: string;
  receivedItem: string;
  receivedNote: string;
  needsAppointment: boolean;
};
type OrderEditForm = { doctorId: string; labName: string; labType: string; teeth: string; notes: string };

const JSON_HEADERS = { "Content-Type": "application/json" };

export function addDaysToDateKey(dateKey: string, days: number) {
  const base = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return "";
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function dateKeyOf(iso?: string | null) {
  return iso ? turkeyDateKey(new Date(iso)) : "";
}

function emptyInvoice(item = ""): InvoiceForm {
  return { item, amount: "", invoiceNo: "", issuedAt: turkeyDateKey(), note: "" };
}

function parseAmount(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : NaN;
}

function validateInvoice(form: InvoiceForm) {
  const errors: Record<string, string> = {};
  if (!form.item.trim()) errors.item = "Faturadaki iş/kalem adını yazın.";
  const amount = parseAmount(form.amount);
  if (!form.amount.trim() || !Number.isFinite(amount) || amount <= 0) errors.amount = "Tutarı 0'dan büyük bir sayı olarak girin.";
  if (!form.issuedAt) errors.issuedAt = "Fatura tarihini seçin.";
  return errors;
}

function invoicePayload(form: InvoiceForm) {
  return {
    item: form.item.trim(),
    amount: parseAmount(form.amount),
    invoiceNo: form.invoiceNo.trim() || null,
    issuedAt: form.issuedAt,
    note: form.note.trim() || null,
  };
}

function orderLine(order: LabOrderView) {
  return `${order.patient.fullName} · ${order.labType} · ${order.labName}`;
}

export type LabOrderActions = ReturnType<typeof useLabOrderActions>;

/**
 * Laboratuvar işi üzerindeki bütün eylemler (gönder, geldi, fatura, adım
 * düzenle, hastaya takıldı, yeniden yapım, bilgileri düzenle, iptal) ve
 * pencereleri. Laboratuvar sayfası ve hasta dosyası aynı kancayı kullanır;
 * böylece aynı eylem her ekranda aynı ad, aynı alanlar ve aynı kurallarla
 * çalışır. Her başarılı işlemden sonra iş sunucudan taze okunur ve
 * `onChanged` ile bildirilir.
 */
export function useLabOrderActions({
  onChanged,
  labNames = [],
}: {
  onChanged: (order: LabOrderView) => void;
  /** "Bilgileri düzenle" penceresinde seçilebilecek laboratuvarlar. */
  labNames?: string[];
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sendForm, setSendForm] = useState<SendForm>({ sentItem: "", requestedItem: "", impressionMethod: "", sentAt: "", expectedAt: "", note: "" });
  const [receiveForm, setReceiveForm] = useState<ReceiveForm>({ receivedAt: "", receivedItem: "", note: "", needsAppointment: true });
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(emptyInvoice());
  const [tripForm, setTripForm] = useState<TripEditForm | null>(null);
  const [reworkReason, setReworkReason] = useState("");
  const [keepInvoices, setKeepInvoices] = useState(true);
  const [orderForm, setOrderForm] = useState<OrderEditForm>({ doctorId: "", labName: "", labType: "", teeth: "", notes: "" });
  const [cancelReason, setCancelReason] = useState("");
  const invoiceKeyRef = useRef("");

  const start = (next: Action) => {
    setError("");
    setFieldErrors({});
    setSaving(false);
    setAction(next);
  };

  const close = () => {
    if (saving) return;
    setAction(null);
    invoiceKeyRef.current = "";
  };

  /**
   * Sunucunun döndürdüğü güncel iş ekrana yazılır; yanıt işin kendisi değilse
   * (ör. tekrar gönderilen fatura isteği yalnız faturayı döndürür) iş ayrıca okunur.
   */
  const refresh = async (orderId: string, payload?: unknown) => {
    let fresh = payload === undefined ? null : normalizeLabOrder(payload);
    if (!fresh || fresh.id !== orderId) {
      const loaded = await fetchJson(`/api/lab-orders/${orderId}`, undefined, "İş güncellendi ama ekran yenilenemedi. Sayfayı yenileyin.");
      fresh = normalizeLabOrder(loaded);
    }
    if (fresh) onChanged(fresh);
    window.dispatchEvent(new CustomEvent("ks:realtime-sync", { detail: { scope: "lab-orders" } }));
    return fresh;
  };

  const run = async (orderId: string, work: () => Promise<unknown>, success: { title: string; message: string }) => {
    if (saving) return;
    setSaving(true);
    setError("");
    let payload: unknown;
    try {
      payload = await work();
    } catch (runError) {
      // Hata pencerede kalır (kısa süreli bildirim gibi kaybolmaz); kısmen
      // kaydedilmiş bir değişiklik varsa ekran yine de güncellensin.
      setError(runError instanceof Error ? runError.message : "İşlem yapılamadı. Lütfen tekrar deneyin.");
      setSaving(false);
      void refresh(orderId).catch(() => undefined);
      return;
    }
    // İşlem kaydedildi: pencere kapanır. Ekran yenilemesi başarısız olsa bile
    // pencereyi açık tutmak, kullanıcının aynı kaydı ikinci kez göndermesine
    // yol açardı.
    setAction(null);
    invoiceKeyRef.current = "";
    setSaving(false);
    showToastSafe({ title: success.title, message: success.message, type: "success", icon: "flask" });
    try {
      await refresh(orderId, payload);
    } catch (refreshError) {
      showToastSafe({
        title: "Ekran yenilenemedi",
        message: refreshError instanceof Error ? refreshError.message : "İşlem kaydedildi; sayfayı yenileyin.",
        type: "info",
      });
    }
  };

  // ── Açıcılar ──────────────────────────────────────────────────────────────
  const openSend = (order: LabOrderView) => {
    const suggestion = suggestNextTrip(order.labType, order.trips);
    const sentAt = turkeyDateKey();
    setSendForm({
      sentItem: suggestion.sendValue,
      requestedItem: suggestion.requestValue,
      impressionMethod: "",
      sentAt,
      expectedAt: addDaysToDateKey(sentAt, LAB_LATE_DAYS),
      note: "",
    });
    start({ kind: "send", order });
  };

  const openReceive = (order: LabOrderView, trip?: LabTripView) => {
    const target = trip || getOrderSummary(order).pendingTrip;
    if (!target) return;
    const parts = parseDesc(target.description);
    setReceiveForm({
      receivedAt: turkeyDateKey(),
      receivedItem: getReceivedItemFromNote(target.receivedNote, parts.requestedItem || parts.sentItem),
      note: cleanReceivedNote(target.receivedNote),
      needsAppointment: true,
    });
    start({ kind: "receive", order, trip: target });
  };

  const openInvoice = (order: LabOrderView, invoice: LabInvoiceView | null = null) => {
    invoiceKeyRef.current = "";
    setInvoiceForm(invoice
      ? { item: invoice.item, amount: String(invoice.amount), invoiceNo: invoice.invoiceNo || "", issuedAt: dateKeyOf(invoice.issuedAt) || turkeyDateKey(), note: invoice.note || "" }
      : emptyInvoice(order.labType));
    start({ kind: "invoice", order, invoice });
  };

  const openEditTrip = (order: LabOrderView, trip: LabTripView) => {
    const { sentItem, requestedItem } = parseDesc(trip.description);
    const sent = splitSentNote(trip.sentNote);
    const sentAt = dateKeyOf(trip.sentAt) || turkeyDateKey();
    setTripForm({
      sentItem,
      requestedItem,
      impressionMethod: sent.method,
      sentAt,
      expectedAt: dateKeyOf(trip.expectedAt) || addDaysToDateKey(sentAt, LAB_LATE_DAYS),
      sentNote: sent.note,
      rptMarker: sent.rptMarker,
      hasReceived: Boolean(trip.receivedAt),
      receivedAt: dateKeyOf(trip.receivedAt) || turkeyDateKey(),
      receivedItem: getReceivedItemFromNote(trip.receivedNote, requestedItem || sentItem),
      receivedNote: cleanReceivedNote(trip.receivedNote),
      needsAppointment: needsProvaAppointment(trip.receivedNote),
    });
    start({ kind: "editTrip", order, trip });
  };

  const openComplete = (order: LabOrderView) => {
    invoiceKeyRef.current = "";
    setInvoiceForm(emptyInvoice(order.labType));
    start({ kind: "complete", order });
  };

  const openRework = (order: LabOrderView) => {
    setReworkReason("");
    setKeepInvoices(true);
    start({ kind: "rework", order });
  };

  const openEditOrder = (order: LabOrderView) => {
    setOrderForm({
      doctorId: order.doctor.id || "",
      labName: order.labName,
      labType: order.labType,
      teeth: order.teeth || "",
      notes: splitOrderNotes(order.notes).userNotes,
    });
    start({ kind: "editOrder", order });
  };

  const openCancel = (order: LabOrderView) => {
    setCancelReason("");
    start({ kind: "cancel", order });
  };

  const cancelInvoice = async (order: LabOrderView, invoice: LabInvoiceView) => {
    const approved = await confirmDialog({
      title: LAB_LABELS.cancelInvoice,
      message: `${invoice.item} (${LAB_CURRENCY.format(invoice.amount)}) faturası iptal edilsin mi? Tutar ${order.labName} firmasının borcundan ve hekim hakedişinden düşülür.`,
      danger: true,
      confirmText: "Faturayı iptal et",
      cancelText: "Vazgeç",
    });
    if (!approved) return;
    try {
      const payload = await fetchJson(`/api/lab-orders/${order.id}/invoices/${invoice.id}`, { method: "DELETE" }, "Fatura iptal edilemedi.");
      await refresh(order.id, payload);
      showToastSafe({ title: "Lab faturası iptal edildi", message: "Firma borcu ve iş toplamı düzeltildi.", type: "success" });
    } catch (cancelError) {
      showToastSafe({
        title: "Fatura iptal edilemedi",
        message: cancelError instanceof Error ? cancelError.message : "Lütfen tekrar deneyin.",
        type: "error",
        duration: 8000,
      });
    }
  };

  // ── Kaydediciler ──────────────────────────────────────────────────────────
  const submit = async () => {
    if (!action) return;
    const { order } = action;

    if (action.kind === "send") {
      const errors: Record<string, string> = {};
      if (!sendForm.sentItem.trim()) errors.sentItem = "Laboratuvara ne gönderildiğini yazın.";
      if (!sendForm.sentAt) errors.sentAt = "Gönderim tarihini seçin.";
      if (sendForm.expectedAt && sendForm.sentAt && sendForm.expectedAt < sendForm.sentAt) errors.expectedAt = "Dönüş tarihi gönderimden önce olamaz.";
      setFieldErrors(errors);
      if (Object.keys(errors).length) return;
      const what = sendForm.requestedItem.trim() || sendForm.sentItem.trim();
      await run(order.id, async () => {
        return fetchJson(`/api/lab-orders/${order.id}/trips`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            description: buildDescription(sendForm.sentItem, sendForm.requestedItem),
            sentAt: sendForm.sentAt,
            expectedAt: sendForm.expectedAt || null,
            sentNote: buildSentNote(sendForm.note, sendForm.impressionMethod, sendForm.sentItem),
          }),
        }, "Gönderim kaydedilemedi.");
      }, {
        title: "Laboratuvara gönderildi",
        message: sendForm.expectedAt ? `${what} ${formatShortLabDate(`${sendForm.expectedAt}T12:00:00`)} tarihinde bekleniyor.` : `${what} bekleniyor.`,
      });
      return;
    }

    if (action.kind === "receive") {
      if (!receiveForm.receivedAt) {
        setFieldErrors({ receivedAt: "Geliş tarihini seçin." });
        return;
      }
      setFieldErrors({});
      await run(order.id, async () => {
        return fetchJson(`/api/lab-orders/${order.id}/trips/${action.trip.id}`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            receivedAt: receiveForm.receivedAt,
            receivedNote: buildReceivedNote(receiveForm.note, receiveForm.receivedItem, receiveForm.needsAppointment),
          }),
        }, "Geliş kaydedilemedi.");
      }, {
        title: "Laboratuvardan geldi",
        message: receiveForm.needsAppointment
          ? "Hasta Takip'e prova randevusu için arama kaydı açıldı."
          : "İş klinik aşamasına alındı.",
      });
      return;
    }

    if (action.kind === "invoice") {
      const errors = validateInvoice(invoiceForm);
      setFieldErrors(errors);
      if (Object.keys(errors).length) return;
      const editing = action.invoice;
      if (!editing && !invoiceKeyRef.current) invoiceKeyRef.current = newRequestKey();
      await run(order.id, async () => {
        return fetchJson(
          editing ? `/api/lab-orders/${order.id}/invoices/${editing.id}` : `/api/lab-orders/${order.id}/invoices`,
          {
            method: editing ? "PATCH" : "POST",
            headers: editing ? JSON_HEADERS : { ...JSON_HEADERS, "Idempotency-Key": invoiceKeyRef.current },
            body: JSON.stringify(invoicePayload(invoiceForm)),
          },
          editing ? "Fatura güncellenemedi." : "Fatura eklenemedi.",
        );
      }, {
        title: editing ? "Lab faturası güncellendi" : "Lab faturası eklendi",
        message: `Tutar ${order.labName} firmasının hesabına işlendi.`,
      });
      return;
    }

    if (action.kind === "editTrip" && tripForm) {
      const errors: Record<string, string> = {};
      if (!tripForm.sentItem.trim()) errors.sentItem = "Laboratuvara ne gönderildiğini yazın.";
      if (!tripForm.sentAt) errors.sentAt = "Gönderim tarihini seçin.";
      if (tripForm.hasReceived && !tripForm.receivedAt) errors.receivedAt = "Geliş tarihini seçin.";
      if (tripForm.hasReceived && tripForm.receivedAt && tripForm.receivedAt < tripForm.sentAt) errors.receivedAt = "Geliş tarihi gönderimden önce olamaz.";
      setFieldErrors(errors);
      if (Object.keys(errors).length) return;
      await run(order.id, async () => {
        return fetchJson(`/api/lab-orders/${order.id}/trips/${action.trip.id}`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            description: buildDescription(tripForm.sentItem, tripForm.requestedItem),
            sentAt: tripForm.sentAt,
            expectedAt: tripForm.hasReceived ? undefined : tripForm.expectedAt || null,
            sentNote: buildSentNote(tripForm.sentNote, tripForm.impressionMethod, tripForm.sentItem, tripForm.rptMarker),
            receivedAt: tripForm.hasReceived ? tripForm.receivedAt : null,
            receivedNote: tripForm.hasReceived ? buildReceivedNote(tripForm.receivedNote, tripForm.receivedItem, tripForm.needsAppointment) : null,
          }),
        }, "Adım güncellenemedi.");
      }, { title: "Adım güncellendi", message: "İşin adımları yenilendi." });
      return;
    }

    if (action.kind === "complete") {
      const summary = getOrderSummary(order);
      const needsInvoice = summary.needsInvoiceToComplete;
      if (needsInvoice) {
        const errors = validateInvoice(invoiceForm);
        setFieldErrors(errors);
        if (Object.keys(errors).length) return;
        if (!invoiceKeyRef.current) invoiceKeyRef.current = newRequestKey();
      }
      await run(order.id, async () => {
        if (needsInvoice) {
          // Aynı işlem anahtarı: pencere hatayla açık kalıp yeniden basılırsa fatura ikinci kez yazılmaz.
          await fetchJson(`/api/lab-orders/${order.id}/invoices`, {
            method: "POST",
            headers: { ...JSON_HEADERS, "Idempotency-Key": invoiceKeyRef.current },
            body: JSON.stringify(invoicePayload(invoiceForm)),
          }, "Lab faturası kaydedilemedi; iş kapatılmadı.");
        }
        try {
          return await fetchJson(`/api/lab-orders/${order.id}`, {
            method: "PATCH",
            headers: JSON_HEADERS,
            body: JSON.stringify({ status: "HASTAYA_TAKILDI" }),
          }, "İş kapatılamadı.");
        } catch (closeError) {
          const reason = closeError instanceof Error ? closeError.message : "İş kapatılamadı.";
          throw new Error(needsInvoice ? `Lab faturası kaydedildi ama iş kapatılamadı: ${reason}` : reason);
        }
      }, {
        title: "Hastaya takıldı",
        message: "İş tamamlananlara taşındı; açık prova takipleri kapatıldı.",
      });
      return;
    }

    if (action.kind === "rework") {
      if (reworkReason.trim().length < 3) {
        setFieldErrors({ reason: "Yeniden yapım nedenini kısaca yazın (en az 3 harf)." });
        return;
      }
      setFieldErrors({});
      const first = (WORKFLOW_TEMPLATES[order.labType] || [])[0];
      await run(order.id, async () => {
        return fetchJson(`/api/lab-orders/${order.id}`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            action: "RPT_REOPEN",
            reason: reworkReason.trim(),
            restartDescription: first ? buildDescription(first.send, first.request) : "Ölçü",
            keepInvoices,
          }),
        }, "Yeniden yapım başlatılamadı.");
      }, { title: "Yeniden yapım başladı", message: "İş yeniden açıldı; ilk adım laboratuvara gönderildi olarak kaydedildi." });
      return;
    }

    if (action.kind === "editOrder") {
      const errors: Record<string, string> = {};
      if (!orderForm.doctorId) errors.doctorId = "Hekimi seçin.";
      if (!orderForm.labName) errors.labName = "Laboratuvarı seçin.";
      if (!orderForm.labType.trim()) errors.labType = "İş türünü seçin.";
      setFieldErrors(errors);
      if (Object.keys(errors).length) return;
      const body: Record<string, unknown> = {
        labType: orderForm.labType.trim(),
        teeth: orderForm.teeth.trim() || null,
        notes: orderForm.notes.trim() || null,
      };
      if (orderForm.doctorId !== (order.doctor.id || "")) body.doctorId = orderForm.doctorId;
      if (orderForm.labName !== order.labName) body.labName = orderForm.labName;
      await run(order.id, async () => {
        return fetchJson(`/api/lab-orders/${order.id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) }, "Bilgiler kaydedilemedi.");
      }, { title: "Lab işi güncellendi", message: "Değişiklikler kaydedildi." });
      return;
    }

    if (action.kind === "cancel") {
      if (cancelReason.trim().length < 3) {
        setFieldErrors({ reason: "İptal nedenini kısaca yazın (en az 3 harf)." });
        return;
      }
      setFieldErrors({});
      await run(order.id, async () => {
        return fetchJson(`/api/lab-orders/${order.id}`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ status: "IPTAL", reason: cancelReason.trim() }),
        }, "İş iptal edilemedi.");
      }, { title: "Lab işi iptal edildi", message: "Faturaları ve açık takipleri kapatıldı." });
    }
  };

  // ── Pencere içerikleri ─────────────────────────────────────────────────────
  const spoonPicks = (selected: string, onPick: (item: string) => void) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-slate-500">Laboratuvar kaşık isteyecekse:</span>
      {SPOON_REQUEST_OPTIONS.map((item) => (
        <Button key={item} size="sm" variant={isSameWorkflowValue(selected, item) ? "primary" : "secondary"} onClick={() => onPick(item)}>
          {item}
        </Button>
      ))}
    </div>
  );

  const methodField = (value: ImpressionMethod, onChange: (value: ImpressionMethod) => void) => (
    <FormField label="Ölçü yöntemi" htmlFor="lab-impression-method">
      <Select id="lab-impression-method" value={value} onChange={(event) => onChange(event.target.value as ImpressionMethod)}>
        <option value="">Belirtilmedi</option>
        <option value="KLASIK_OLCU">Klasik ölçü</option>
        <option value="DIJITAL_TARAMA">Dijital tarama</option>
      </Select>
    </FormField>
  );

  const invoiceFields = (form: InvoiceForm, setForm: (updater: (current: InvoiceForm) => InvoiceForm) => void) => (
    <div className="space-y-3">
      <FormField label="Faturadaki iş" htmlFor="lab-invoice-item" required error={fieldErrors.item}>
        <Input id="lab-invoice-item" value={form.item} maxLength={180} onChange={(event) => setForm((current) => ({ ...current, item: event.target.value }))} placeholder="Zirkonyum kron, prova…" />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Tutar (₺)" htmlFor="lab-invoice-amount" required error={fieldErrors.amount}>
          <Input id="lab-invoice-amount" inputMode="decimal" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Örn. 3500" />
        </FormField>
        <FormField label="Fatura no" htmlFor="lab-invoice-no" hint="Varsa">
          <Input id="lab-invoice-no" value={form.invoiceNo} maxLength={80} onChange={(event) => setForm((current) => ({ ...current, invoiceNo: event.target.value }))} />
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Fatura tarihi" htmlFor="lab-invoice-date" required error={fieldErrors.issuedAt}>
          <Input id="lab-invoice-date" type="date" value={form.issuedAt} onChange={(event) => setForm((current) => ({ ...current, issuedAt: event.target.value }))} />
        </FormField>
        <FormField label="Not" htmlFor="lab-invoice-note">
          <Input id="lab-invoice-note" value={form.note} maxLength={500} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
        </FormField>
      </div>
    </div>
  );

  let title = "";
  let description = "";
  let body: ReactNode = null;
  let primaryText = "Kaydet";
  let danger = false;

  if (action) {
    const { order } = action;
    description = orderLine(order);

    if (action.kind === "send") {
      title = LAB_LABELS.send;
      const suggestion = suggestNextTrip(order.labType, order.trips);
      const showSpoon = canRequestSpoonForStep(order.labType, sendForm.sentItem, sendForm.requestedItem, order.trips);
      body = (
        <div className="space-y-3">
          {suggestion.suggestion && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {order.labType} için sıradaki adım ({Math.min(suggestion.stepIndex + 1, suggestion.template.length)}/{suggestion.template.length}) dolduruldu; farklıysa değiştirin.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Gönderilen" htmlFor="lab-send-item" required error={fieldErrors.sentItem}>
              <Input
                id="lab-send-item"
                value={sendForm.sentItem}
                maxLength={80}
                onChange={(event) => {
                  const value = event.target.value;
                  setSendForm((current) => ({ ...current, sentItem: value, impressionMethod: isMeasurementStep(value) ? current.impressionMethod : "" }));
                }}
                placeholder="Ölçü, alt yapı, prova…"
              />
            </FormField>
            <FormField label="Laboratuvardan beklenen" htmlFor="lab-send-request">
              <Input id="lab-send-request" value={sendForm.requestedItem} maxLength={80} onChange={(event) => setSendForm((current) => ({ ...current, requestedItem: event.target.value }))} placeholder="Dentin prova, bitim…" />
            </FormField>
          </div>
          {showSpoon && spoonPicks(sendForm.requestedItem, (item) => setSendForm((current) => ({ ...current, sentItem: "Ölçü", requestedItem: item })))}
          {isMeasurementStep(sendForm.sentItem) && methodField(sendForm.impressionMethod, (value) => setSendForm((current) => ({ ...current, impressionMethod: value })))}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Gönderim tarihi" htmlFor="lab-send-date" required error={fieldErrors.sentAt}>
              <Input
                id="lab-send-date"
                type="date"
                value={sendForm.sentAt}
                onChange={(event) => {
                  const value = event.target.value;
                  setSendForm((current) => ({ ...current, sentAt: value, expectedAt: value ? addDaysToDateKey(value, LAB_LATE_DAYS) : current.expectedAt }));
                }}
              />
            </FormField>
            <FormField label="Beklenen dönüş" htmlFor="lab-send-expected" error={fieldErrors.expectedAt} hint="Bu tarih geçerse iş “Gecikiyor” görünür.">
              <Input id="lab-send-expected" type="date" value={sendForm.expectedAt} min={sendForm.sentAt || undefined} onChange={(event) => setSendForm((current) => ({ ...current, expectedAt: event.target.value }))} />
            </FormField>
          </div>
          <FormField label="Not" htmlFor="lab-send-note">
            <Input id="lab-send-note" value={sendForm.note} maxLength={500} onChange={(event) => setSendForm((current) => ({ ...current, note: event.target.value }))} placeholder="Renk, özel istek…" />
          </FormField>
        </div>
      );
    }

    if (action.kind === "receive") {
      title = LAB_LABELS.receive;
      const parts = parseDesc(action.trip.description);
      const expected = parts.requestedItem;
      const differs = Boolean(expected && receiveForm.receivedItem && !isSameWorkflowValue(receiveForm.receivedItem, expected));
      body = (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {`${parts.sentItem} ${formatShortLabDate(action.trip.sentAt)} tarihinde gönderilmişti`}
            {expected ? `; beklenen: ${expected}.` : "."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label="Laboratuvardan gelen"
              htmlFor="lab-receive-item"
              hint={differs ? `Beklenen “${expected}” idi; sıradaki adım önerisi buna göre değişir.` : "Beklenenden farklı geldiyse değiştirin."}
            >
              <Input id="lab-receive-item" value={receiveForm.receivedItem} maxLength={80} onChange={(event) => setReceiveForm((current) => ({ ...current, receivedItem: event.target.value }))} />
            </FormField>
            <FormField label="Geliş tarihi" htmlFor="lab-receive-date" required error={fieldErrors.receivedAt}>
              <Input id="lab-receive-date" type="date" value={receiveForm.receivedAt} onChange={(event) => setReceiveForm((current) => ({ ...current, receivedAt: event.target.value }))} />
            </FormField>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Switch
              checked={receiveForm.needsAppointment}
              onChange={(needsAppointment) => setReceiveForm((current) => ({ ...current, needsAppointment }))}
              label="Hasta prova/takma randevusu için aransın"
              description="Hasta Takip'te “Lab prova randevusu” olarak görünür. İş hastaya takılınca kendiliğinden kapanır."
            />
          </div>
          <FormField label="Not" htmlFor="lab-receive-note">
            <Input id="lab-receive-note" value={receiveForm.note} maxLength={500} onChange={(event) => setReceiveForm((current) => ({ ...current, note: event.target.value }))} placeholder="Prova hazır, renk düzeltmesi gerekli…" />
          </FormField>
        </div>
      );
    }

    if (action.kind === "invoice") {
      title = action.invoice ? LAB_LABELS.editInvoice : LAB_LABELS.addInvoice;
      body = (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Kaydedilen tutar <span className="font-semibold text-slate-800">{order.labName}</span> firmasının hesabına borç olarak yazılır ve hekim hakedişinde lab gideri olarak düşülür.
          </p>
          {invoiceFields(invoiceForm, (updater) => setInvoiceForm(updater))}
        </div>
      );
    }

    if (action.kind === "editTrip" && tripForm) {
      title = LAB_LABELS.editStep;
      const setTrip = (patch: Partial<TripEditForm>) => setTripForm((current) => (current ? { ...current, ...patch } : current));
      const showSpoon = canRequestSpoonForStep(order.labType, tripForm.sentItem, tripForm.requestedItem, order.trips);
      body = (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Gönderilen" htmlFor="lab-trip-item" required error={fieldErrors.sentItem}>
              <Input
                id="lab-trip-item"
                value={tripForm.sentItem}
                maxLength={80}
                onChange={(event) => {
                  const value = event.target.value;
                  setTrip({ sentItem: value, impressionMethod: isMeasurementStep(value) ? tripForm.impressionMethod : "" });
                }}
              />
            </FormField>
            <FormField label="Laboratuvardan beklenen" htmlFor="lab-trip-request">
              <Input id="lab-trip-request" value={tripForm.requestedItem} maxLength={80} onChange={(event) => setTrip({ requestedItem: event.target.value })} />
            </FormField>
          </div>
          {showSpoon && spoonPicks(tripForm.requestedItem, (item) => setTrip({ sentItem: "Ölçü", requestedItem: item }))}
          {isMeasurementStep(tripForm.sentItem) && methodField(tripForm.impressionMethod, (value) => setTrip({ impressionMethod: value }))}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Gönderim tarihi" htmlFor="lab-trip-date" required error={fieldErrors.sentAt}>
              <Input id="lab-trip-date" type="date" value={tripForm.sentAt} onChange={(event) => setTrip({ sentAt: event.target.value })} />
            </FormField>
            {!tripForm.hasReceived && (
              <FormField label="Beklenen dönüş" htmlFor="lab-trip-expected">
                <Input id="lab-trip-expected" type="date" value={tripForm.expectedAt} min={tripForm.sentAt || undefined} onChange={(event) => setTrip({ expectedAt: event.target.value })} />
              </FormField>
            )}
          </div>
          <FormField label="Gönderim notu" htmlFor="lab-trip-note">
            <Input id="lab-trip-note" value={tripForm.sentNote} maxLength={500} onChange={(event) => setTrip({ sentNote: event.target.value })} />
          </FormField>
          <div className="rounded-lg border border-slate-200 px-3 py-2.5">
            <Switch checked={tripForm.hasReceived} onChange={(hasReceived) => setTrip({ hasReceived })} label="Bu adım laboratuvardan geldi" />
          </div>
          {tripForm.hasReceived && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Laboratuvardan gelen" htmlFor="lab-trip-received-item">
                  <Input id="lab-trip-received-item" value={tripForm.receivedItem} maxLength={80} onChange={(event) => setTrip({ receivedItem: event.target.value })} />
                </FormField>
                <FormField label="Geliş tarihi" htmlFor="lab-trip-received-date" required error={fieldErrors.receivedAt}>
                  <Input id="lab-trip-received-date" type="date" value={tripForm.receivedAt} onChange={(event) => setTrip({ receivedAt: event.target.value })} />
                </FormField>
              </div>
              <FormField label="Geliş notu" htmlFor="lab-trip-received-note">
                <Input id="lab-trip-received-note" value={tripForm.receivedNote} maxLength={500} onChange={(event) => setTrip({ receivedNote: event.target.value })} />
              </FormField>
              <Switch
                checked={tripForm.needsAppointment}
                onChange={(needsAppointment) => setTrip({ needsAppointment })}
                label="Hasta prova/takma randevusu için aransın"
                description="Kapatırsanız bu adım için Hasta Takip'teki arama da kapanır."
              />
            </div>
          )}
        </div>
      );
    }

    if (action.kind === "complete") {
      title = LAB_LABELS.complete;
      const summary = getOrderSummary(order);
      body = (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{order.labType}</span> işi hastaya takıldı olarak kapatılır. Bu işe ait açık “prova randevusu” aramaları Hasta Takip listesinden kalkar.
          </p>
          {summary.needsInvoiceToComplete ? (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-sm font-semibold text-amber-900">Bu işin lab faturası henüz girilmedi</p>
              <p className="text-xs text-amber-800">Lab gideri hekim hakedişine bu faturayla yansır; fatura girilmeden iş kapatılamaz. Tutar {order.labName} firmasının hesabına borç olarak yazılır.</p>
              {invoiceFields(invoiceForm, (updater) => setInvoiceForm(updater))}
            </div>
          ) : summary.rework && order.invoices.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">Yeniden yapım ücretsiz olduğu için fatura gerekmez.</p>
          ) : (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Girilmiş lab faturası: {LAB_CURRENCY.format(summary.totalAmount)}
            </p>
          )}
        </div>
      );
    }

    if (action.kind === "rework") {
      title = LAB_LABELS.rework;
      primaryText = "Yeniden yapımı başlat";
      const first = (WORKFLOW_TEMPLATES[order.labType] || [])[0];
      const invoiceTotal = order.invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
      body = (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Hastaya takılan iş sorun çıkardıysa laboratuvar işi ücretsiz yeniden yapar. İş yeniden açılır ve ilk adım
            {" "}<span className="font-semibold text-slate-800">{first ? buildDescription(first.send, first.request) : "Ölçü"}</span> bugün laboratuvara gönderilmiş olarak kaydedilir. Yeniden yapıma fatura eklenmez.
          </p>
          <FormField label="Yeniden yapım nedeni" htmlFor="lab-rework-reason" required error={fieldErrors.reason}>
            <Textarea id="lab-rework-reason" rows={2} maxLength={500} value={reworkReason} onChange={(event) => setReworkReason(event.target.value)} placeholder="Örn. kron kırıldı, renk uyumsuz" />
          </FormField>
          {order.invoices.length > 0 && (
            <ChoiceCards
              label={`Mevcut lab faturası (${LAB_CURRENCY.format(invoiceTotal)}) ne olsun?`}
              value={keepInvoices ? "keep" : "void"}
              onChange={(value) => setKeepInvoices(value === "keep")}
              columns={1}
              options={[
                { value: "keep", label: "Kalsın", description: "Laboratuvar ilk işi faturaladı; firma borcu ve hakediş gideri değişmez." },
                { value: "void", label: "İptal edilsin", description: "Laboratuvar ücreti geri aldı; tutar firma borcundan ve hakediş giderinden düşülür." },
              ]}
            />
          )}
        </div>
      );
    }

    if (action.kind === "editOrder") {
      title = LAB_LABELS.editOrder;
      const hasInvoices = order.invoices.length > 0;
      const lockedHint = "Faturası girilmiş işte değiştirilemez; önce faturayı iptal edin.";
      const labOptions = Array.from(new Set([order.labName, ...labNames])).filter(Boolean);
      const typeKnown = LAB_CATEGORIES.some((category) => category.items.includes(orderForm.labType));
      body = (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={LAB_LABELS.doctor} htmlFor="lab-edit-doctor" required error={fieldErrors.doctorId} hint={hasInvoices ? lockedHint : "Lab gideri bu hekimin hakedişinden düşülür."}>
              <DoctorSelect id="lab-edit-doctor" value={orderForm.doctorId} disabled={hasInvoices} onChange={(doctorId) => setOrderForm((current) => ({ ...current, doctorId }))} />
            </FormField>
            <FormField label={LAB_LABELS.lab} htmlFor="lab-edit-lab" required error={fieldErrors.labName} hint={hasInvoices ? lockedHint : undefined}>
              <Select id="lab-edit-lab" value={orderForm.labName} disabled={hasInvoices} onChange={(event) => setOrderForm((current) => ({ ...current, labName: event.target.value }))}>
                {labOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </Select>
            </FormField>
          </div>
          <FormField label="İş türü" htmlFor="lab-edit-type" required error={fieldErrors.labType}>
            <Select id="lab-edit-type" value={orderForm.labType} onChange={(event) => setOrderForm((current) => ({ ...current, labType: event.target.value }))}>
              {!typeKnown && orderForm.labType && <option value={orderForm.labType}>{orderForm.labType}</option>}
              {LAB_CATEGORIES.map((category) => (
                <optgroup key={category.group} label={category.group}>
                  {category.items.map((item) => <option key={item} value={item}>{item}</option>)}
                </optgroup>
              ))}
            </Select>
          </FormField>
          <FormField label="Dişler" hint="İsteğe bağlı">
            <LabToothPicker value={orderForm.teeth} onChange={(teeth) => setOrderForm((current) => ({ ...current, teeth }))} />
          </FormField>
          <FormField label="Not" htmlFor="lab-edit-notes">
            <Textarea id="lab-edit-notes" rows={2} maxLength={1500} value={orderForm.notes} onChange={(event) => setOrderForm((current) => ({ ...current, notes: event.target.value }))} />
          </FormField>
        </div>
      );
    }

    if (action.kind === "cancel") {
      title = LAB_LABELS.cancelOrder;
      primaryText = "İşi iptal et";
      danger = true;
      body = (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            İş iptal edilir ve açık işler listesinden kalkar. Girilmiş lab faturaları ({LAB_CURRENCY.format(order.invoices.reduce((sum, invoice) => sum + invoice.amount, 0))}) iptal edilip firma borcundan düşülür; açık Hasta Takip kayıtları kapanır. Bu işlem geri alınamaz.
          </p>
          <FormField label="İptal nedeni" htmlFor="lab-cancel-reason" required error={fieldErrors.reason}>
            <Textarea id="lab-cancel-reason" rows={2} maxLength={500} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Örn. hasta tedaviden vazgeçti, yanlış hastaya açıldı" />
          </FormField>
        </div>
      );
    }
  }

  const modals = (
    <Modal
      open={Boolean(action)}
      onClose={close}
      title={title}
      description={description}
      size={action?.kind === "editOrder" ? "lg" : "md"}
      module="flask"
      footer={(
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>Vazgeç</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => void submit()} loading={saving}>{primaryText}</Button>
        </>
      )}
    >
      <div className="space-y-3">
        <FormErrorBanner message={error} />
        {body}
      </div>
    </Modal>
  );

  return {
    openSend,
    openReceive,
    openInvoice,
    cancelInvoice,
    openEditTrip,
    openComplete,
    openRework,
    openEditOrder,
    openCancel,
    busy: saving,
    isOpen: Boolean(action),
    modals,
  };
}
