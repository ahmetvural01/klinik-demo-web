"use client";

import { useRef, useState, type ReactNode } from "react";
import { FormModal } from "@/components/ui/FormModal";
import { FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Switch } from "@/components/ui/Switch";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Callout } from "@/components/ui/Callout";
import { Disclosure } from "@/components/ui/Disclosure";
import { QuickDatePicker, type QuickDateOption } from "@/components/ui/QuickDatePicker";
import { formatCurrency } from "@/lib/format";
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
import { moneyInputError, parseTurkishMoney, toMoneyValue } from "@/lib/money-input";
import { showToastSafe } from "@/lib/toast-client";
import { turkeyDateKey } from "@/lib/tz";
import {
  LAB_CATEGORIES,
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
/** amount: MoneyInput değeri ("3500.00" ya da kullanıcının çözülemeyen yazısı). */
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

const RETURN_OPTIONS: QuickDateOption[] = [
  { label: `${LAB_LATE_DAYS} gün sonra`, days: LAB_LATE_DAYS },
  { label: "1 hafta sonra", days: 7 },
  { label: "2 hafta sonra", days: 14 },
];

const METHOD_OPTIONS: { value: "none" | Exclude<ImpressionMethod, "">; label: string }[] = [
  { value: "none", label: "Belirtilmedi" },
  { value: "KLASIK_OLCU", label: "Klasik ölçü" },
  { value: "DIJITAL_TARAMA", label: "Dijital tarama" },
];

export function addDaysToDateKey(dateKey: string, days: number) {
  const base = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return "";
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * Bu gidiş gelince işte laboratuvarda kalan diğer açık gidişler. Önceden iki
 * açık gidişli işte yalnız ilki kapandığı halde bildirim "geldi" diyordu; iş
 * "Laboratuvarda" kaldığı için kullanıcı karışıyordu.
 */
function stillAtLabNote(order: LabOrderView, tripId: string) {
  const remaining = order.trips.filter((trip) => !trip.receivedAt && trip.id !== tripId).length;
  return remaining > 0 ? ` ${remaining} gidiş daha laboratuvarda; iş “Laboratuvarda” kalır.` : "";
}

function dateKeyOf(iso?: string | null) {
  return iso ? turkeyDateKey(new Date(iso)) : "";
}

function shortDateKey(dateKey: string) {
  return dateKey ? formatShortLabDate(`${dateKey}T12:00:00`) : "";
}

function emptyInvoice(item = ""): InvoiceForm {
  return { item, amount: "", invoiceNo: "", issuedAt: turkeyDateKey(), note: "" };
}

function validateInvoice(form: InvoiceForm) {
  const errors: Record<string, string> = {};
  if (form.item.trim().length < 2) errors.item = "Faturadaki iş/kalem adını yazın.";
  // Türkçe tutar: "3.500" = 3.500 TL, "1.250,50" = 1.250,50 TL (lib/money-input).
  // Önceden "3.500" 3,50 TL olarak firma borcuna ve hakedişe yazılıyordu.
  const amountError = moneyInputError(form.amount, { required: true });
  if (amountError) errors.amount = amountError;
  if (!form.issuedAt) errors.issuedAt = "Fatura tarihini seçin.";
  return errors;
}

function invoicePayload(form: InvoiceForm) {
  return {
    item: form.item.trim(),
    // Normalize metin ("3500.00"); sunucu z.coerce.number ile okur, number'a çevirmeyiz.
    amount: parseTurkishMoney(form.amount),
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
 * çalışır. Pencereler ortak FormModal'dır: Enter ile kaydedilir, kayıt
 * sürerken kapanmaz (işlem anahtarı korunur). Her başarılı işlemden sonra iş
 * sunucudan taze okunur ve `onChanged` ile bildirilir. Diğer ekranlar
 * (menü rozeti, ana sayfa) sunucunun gerçek zamanlı olayıyla yenilenir;
 * önceden ayrıca yerel olay yayılıyor ve aynı işlem 2–3 kez yenileme
 * dalgası üretiyordu.
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
  const [sendDetailsOpen, setSendDetailsOpen] = useState(false);
  const [receiveForm, setReceiveForm] = useState<ReceiveForm>({ receivedAt: "", receivedItem: "", note: "", needsAppointment: true });
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(emptyInvoice());
  const [tripForm, setTripForm] = useState<TripEditForm | null>(null);
  const [reworkReason, setReworkReason] = useState("");
  const [keepInvoices, setKeepInvoices] = useState(true);
  const [orderForm, setOrderForm] = useState<OrderEditForm>({ doctorId: "", labName: "", labType: "", teeth: "", notes: "" });
  const [cancelReason, setCancelReason] = useState("");
  const [quickBusyId, setQuickBusyId] = useState<string | null>(null);
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

  // ── Tek tıkla güncelleme (listedeki satır düğmesi) ─────────────────────────
  // "Laboratuvardan geldi" pencere açmadan, bilinen varsayılanlarla kaydedilir
  // (bugün, beklenen iş geldi, hasta prova için aranır); yanlışsa "Adımı
  // düzenle" ile geri alınır ("Bu adım laboratuvardan geldi" kapatılınca geliş
  // ve prova araması kalkar). "Laboratuvara gönder" ise tek tıkla KAYDEDİLMEZ:
  // gönderim adımı sonradan silinemez ve beklenen dönüş işe göre değişir;
  // satır düğmesi şablondan dolu pencereyi açar, Enter ile kaydedilir (bkz.
  // quickSend). Geri alınamayan "Hastaya takıldı" ve iptal de pencerelidir.
  const quick = async (order: LabOrderView, work: () => Promise<unknown>, success: { title: string; message: string }) => {
    if (saving || quickBusyId) return;
    setQuickBusyId(order.id);
    try {
      const payload = await work();
      showToastSafe({ title: success.title, message: success.message, type: "success", icon: "flask" });
      await refresh(order.id, payload).catch(() => undefined);
    } catch (quickError) {
      showToastSafe({
        title: "Kaydedilemedi",
        message: quickError instanceof Error ? quickError.message : "Lütfen tekrar deneyin.",
        type: "error",
        duration: 8000,
      });
      void refresh(order.id).catch(() => undefined);
    } finally {
      setQuickBusyId(null);
    }
  };

  const quickReceive = (order: LabOrderView) => {
    const trip = getOrderSummary(order).pendingTrip;
    if (!trip) return;
    const parts = parseDesc(trip.description);
    const receivedItem = parts.requestedItem || parts.sentItem;
    void quick(order, () => fetchJson(`/api/lab-orders/${order.id}/trips/${trip.id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ receivedAt: turkeyDateKey(), receivedNote: buildReceivedNote("", receivedItem, true) }),
    }, "Geliş kaydedilemedi."), {
      title: `${receivedItem} geldi`,
      message: `${order.patient.fullName} prova/takma randevusu için Hasta aramaları listesine eklendi.${stillAtLabNote(order, trip.id)}`,
    });
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
    // Şablonda sıradaki adım biliniyorsa yalnız "Kaydet" yeter; bilinmiyorsa alanlar açık gelir.
    setSendDetailsOpen(!suggestion.sendValue);
    start({ kind: "send", order });
  };

  /**
   * Satırdaki "Laboratuvara gönder": şablondaki sıradaki adım, bugün ve dönüş
   * +4 gün dolu gelen pencere (Enter ya da Kaydet — 2 adım). Önceden tek
   * tıkla kaydediliyordu; yanlış satıra basılınca silinemeyen bir gönderim
   * adımı oluşuyor, iş "Laboratuvarda" listesine geçip 4 gün sonra yanlışlıkla
   * "Gecikiyor" görünüyordu. Ad, hasta dosyası (LabTab) da kullandığı için korunur.
   */
  const quickSend = (order: LabOrderView) => openSend(order);

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
      ? { item: invoice.item, amount: toMoneyValue(invoice.amount) ?? "", invoiceNo: invoice.invoiceNo || "", issuedAt: dateKeyOf(invoice.issuedAt) || turkeyDateKey(), note: invoice.note || "" }
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
      message: `${invoice.item} (${formatCurrency(invoice.amount)}) faturası iptal edilsin mi? Tutar ${order.labName} firmasının borcundan ve hekim hakedişinden düşülür.`,
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
      if (errors.sentItem || errors.sentAt) setSendDetailsOpen(true);
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
        message: sendForm.expectedAt ? `${what} ${shortDateKey(sendForm.expectedAt)} tarihinde bekleniyor.` : `${what} bekleniyor.`,
      });
      return;
    }

    if (action.kind === "receive") {
      if (!receiveForm.receivedAt) {
        setFieldErrors({ receivedAt: "Geliş tarihini seçin." });
        return;
      }
      const sentKey = dateKeyOf(action.trip.sentAt);
      if (sentKey && receiveForm.receivedAt < sentKey) {
        setFieldErrors({ receivedAt: "Geliş tarihi gönderimden önce olamaz." });
        return;
      }
      setFieldErrors({});
      const atLabNote = stillAtLabNote(order, action.trip.id);
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
          ? `Hasta, prova/takma randevusu için Hasta aramaları listesine eklendi.${atLabNote}`
          : atLabNote ? `Geliş kaydedildi.${atLabNote}` : "İş klinik aşamasına alındı.",
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
        message: `${formatCurrency(Number(parseTurkishMoney(invoiceForm.amount) || 0))} ${order.labName} hesabına işlendi.`,
      });
      return;
    }

    if (action.kind === "editTrip" && tripForm) {
      const errors: Record<string, string> = {};
      if (!tripForm.sentItem.trim()) errors.sentItem = "Laboratuvara ne gönderildiğini yazın.";
      if (!tripForm.sentAt) errors.sentAt = "Gönderim tarihini seçin.";
      if (!tripForm.hasReceived && tripForm.expectedAt && tripForm.sentAt && tripForm.expectedAt < tripForm.sentAt) errors.expectedAt = "Dönüş tarihi gönderimden önce olamaz.";
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
        message: "İş kapandı; açık prova aramaları kapatıldı.",
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
      }, { title: "Lab işi iptal edildi", message: "Faturaları ve açık aramaları kapatıldı." });
    }
  };

  // ── Pencere içerikleri ─────────────────────────────────────────────────────
  // Kaşık seçimi tek seçimli hap düğmeler (önceden seçili kaşık pencerede ikinci "birincil" düğmeydi).
  const spoonOptions: { value: string; label: string }[] = SPOON_REQUEST_OPTIONS.map((item) => ({ value: item, label: item }));
  const spoonPicks = (selected: string, onPick: (item: string) => void) => (
    <ChoiceCards
      label="Laboratuvar kaşık isteyecekse"
      variant="pills"
      value={SPOON_REQUEST_OPTIONS.find((item) => isSameWorkflowValue(selected, item)) || ""}
      onChange={(item) => { if (item) onPick(item); }}
      options={spoonOptions}
    />
  );

  const methodField = (value: ImpressionMethod, onChange: (value: ImpressionMethod) => void) => (
    <ChoiceCards
      label="Ölçü yöntemi"
      variant="pills"
      value={value || "none"}
      onChange={(next) => onChange(next === "none" ? "" : next)}
      options={METHOD_OPTIONS}
    />
  );

  const invoiceFields = (form: InvoiceForm, setForm: (updater: (current: InvoiceForm) => InvoiceForm) => void, orderLabName: string) => (
    <div className="space-y-3">
      <FormField label="Faturadaki iş" htmlFor="lab-invoice-item" required error={fieldErrors.item}>
        <Input id="lab-invoice-item" value={form.item} maxLength={180} onChange={(event) => setForm((current) => ({ ...current, item: event.target.value }))} placeholder="Zirkonyum kron, prova…" />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Tutar"
          htmlFor="lab-invoice-amount"
          required
          error={fieldErrors.amount}
          hint={`${orderLabName} hesabına borç yazılır; hekim hakedişinden düşülür.`}
        >
          <MoneyInput id="lab-invoice-amount" value={form.amount} onChange={(amount) => setForm((current) => ({ ...current, amount }))} />
        </FormField>
        <FormField label="Fatura tarihi" htmlFor="lab-invoice-date" required error={fieldErrors.issuedAt}>
          <Input id="lab-invoice-date" type="date" value={form.issuedAt} max={turkeyDateKey()} onChange={(event) => setForm((current) => ({ ...current, issuedAt: event.target.value }))} />
        </FormField>
      </div>
      <Disclosure title="Diğer bilgiler" summary="Fatura no, not" defaultOpen={Boolean(form.invoiceNo || form.note)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Fatura no" htmlFor="lab-invoice-no">
            <Input id="lab-invoice-no" value={form.invoiceNo} maxLength={80} onChange={(event) => setForm((current) => ({ ...current, invoiceNo: event.target.value }))} />
          </FormField>
          <FormField label="Not" htmlFor="lab-invoice-note">
            <Input id="lab-invoice-note" value={form.note} maxLength={500} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
          </FormField>
        </div>
      </Disclosure>
    </div>
  );

  let title = "";
  let description = "";
  let body: ReactNode = null;
  let submitLabel = "Kaydet";
  let submitVariant: "primary" | "danger" = "primary";

  if (action) {
    const { order } = action;
    description = orderLine(order);

    if (action.kind === "send") {
      title = LAB_LABELS.send;
      const suggestion = suggestNextTrip(order.labType, order.trips);
      const showSpoon = canRequestSpoonForStep(order.labType, sendForm.sentItem, sendForm.requestedItem, order.trips);
      const stepNo = suggestion.suggestion ? `adım ${Math.min(suggestion.stepIndex + 1, suggestion.template.length)}/${suggestion.template.length}` : "";
      const summaryText = [
        buildDescription(sendForm.sentItem, sendForm.requestedItem) || "Gönderilen yazılmadı",
        stepNo,
        sendForm.sentAt === turkeyDateKey() ? "bugün" : shortDateKey(sendForm.sentAt),
      ].filter(Boolean).join(" · ");
      body = (
        <>
          <QuickDatePicker
            label="Beklenen dönüş"
            value={sendForm.expectedAt}
            onChange={(expectedAt) => setSendForm((current) => ({ ...current, expectedAt }))}
            options={RETURN_OPTIONS}
            min={sendForm.sentAt || undefined}
            error={fieldErrors.expectedAt}
            hint="Bu tarih geçerse iş “Gecikiyor” görünür."
          />
          <Disclosure title="Gönderilen ve tarih" summary={summaryText} open={sendDetailsOpen} onOpenChange={setSendDetailsOpen}>
            <div className="space-y-3">
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
              <FormField label="Gönderim tarihi" htmlFor="lab-send-date" required error={fieldErrors.sentAt} className="sm:max-w-[50%]">
                <Input
                  id="lab-send-date"
                  type="date"
                  value={sendForm.sentAt}
                  max={turkeyDateKey()}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSendForm((current) => ({ ...current, sentAt: value, expectedAt: value ? addDaysToDateKey(value, LAB_LATE_DAYS) : current.expectedAt }));
                  }}
                />
              </FormField>
            </div>
          </Disclosure>
          <FormField label="Not" htmlFor="lab-send-note">
            <Input id="lab-send-note" value={sendForm.note} maxLength={500} onChange={(event) => setSendForm((current) => ({ ...current, note: event.target.value }))} placeholder="Renk, özel istek…" />
          </FormField>
        </>
      );
    }

    if (action.kind === "receive") {
      title = LAB_LABELS.receive;
      const parts = parseDesc(action.trip.description);
      const expected = parts.requestedItem;
      const differs = Boolean(expected && receiveForm.receivedItem && !isSameWorkflowValue(receiveForm.receivedItem, expected));
      body = (
        <>
          <p className="text-sm text-slate-600">
            {`${parts.sentItem} ${formatShortLabDate(action.trip.sentAt)} tarihinde gönderilmişti`}
            {expected ? `; beklenen: ${expected}.` : "."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label="Laboratuvardan gelen"
              htmlFor="lab-receive-item"
              hint={differs ? `Beklenen “${expected}” idi; sıradaki adım önerisi buna göre değişir.` : "Beklenenden farklı geldiyse değiştirin."}
              hintTone={differs ? "warning" : "neutral"}
            >
              <Input id="lab-receive-item" value={receiveForm.receivedItem} maxLength={80} onChange={(event) => setReceiveForm((current) => ({ ...current, receivedItem: event.target.value }))} />
            </FormField>
            <FormField label="Geliş tarihi" htmlFor="lab-receive-date" required error={fieldErrors.receivedAt}>
              <Input id="lab-receive-date" type="date" value={receiveForm.receivedAt} max={turkeyDateKey()} onChange={(event) => setReceiveForm((current) => ({ ...current, receivedAt: event.target.value }))} />
            </FormField>
          </div>
          <Switch
            checked={receiveForm.needsAppointment}
            onChange={(needsAppointment) => setReceiveForm((current) => ({ ...current, needsAppointment }))}
            label="Hasta prova/takma randevusu için aransın"
            description="Yapılacaklar > Hasta aramaları listesine düşer; iş kapanınca kendiliğinden kapanır."
          />
          <FormField label="Not" htmlFor="lab-receive-note">
            <Input id="lab-receive-note" value={receiveForm.note} maxLength={500} onChange={(event) => setReceiveForm((current) => ({ ...current, note: event.target.value }))} placeholder="Prova hazır, renk düzeltmesi gerekli…" />
          </FormField>
        </>
      );
    }

    if (action.kind === "invoice") {
      title = action.invoice ? LAB_LABELS.editInvoice : LAB_LABELS.addInvoice;
      body = invoiceFields(invoiceForm, (updater) => setInvoiceForm(updater), order.labName);
    }

    if (action.kind === "editTrip" && tripForm) {
      title = LAB_LABELS.editStep;
      const setTrip = (patch: Partial<TripEditForm>) => setTripForm((current) => (current ? { ...current, ...patch } : current));
      const showSpoon = canRequestSpoonForStep(order.labType, tripForm.sentItem, tripForm.requestedItem, order.trips);
      body = (
        <>
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
              <Input id="lab-trip-date" type="date" value={tripForm.sentAt} max={turkeyDateKey()} onChange={(event) => setTrip({ sentAt: event.target.value })} />
            </FormField>
            {!tripForm.hasReceived && (
              <FormField label="Beklenen dönüş" htmlFor="lab-trip-expected" error={fieldErrors.expectedAt}>
                <Input id="lab-trip-expected" type="date" value={tripForm.expectedAt} min={tripForm.sentAt || undefined} onChange={(event) => setTrip({ expectedAt: event.target.value })} />
              </FormField>
            )}
          </div>
          <FormField label="Gönderim notu" htmlFor="lab-trip-note">
            <Input id="lab-trip-note" value={tripForm.sentNote} maxLength={500} onChange={(event) => setTrip({ sentNote: event.target.value })} />
          </FormField>
          <Switch checked={tripForm.hasReceived} onChange={(hasReceived) => setTrip({ hasReceived })} label="Bu adım laboratuvardan geldi" />
          {tripForm.hasReceived && (
            <div className="space-y-3 border-l-2 border-slate-200 pl-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Laboratuvardan gelen" htmlFor="lab-trip-received-item">
                  <Input id="lab-trip-received-item" value={tripForm.receivedItem} maxLength={80} onChange={(event) => setTrip({ receivedItem: event.target.value })} />
                </FormField>
                <FormField label="Geliş tarihi" htmlFor="lab-trip-received-date" required error={fieldErrors.receivedAt}>
                  <Input id="lab-trip-received-date" type="date" value={tripForm.receivedAt} max={turkeyDateKey()} onChange={(event) => setTrip({ receivedAt: event.target.value })} />
                </FormField>
              </div>
              <FormField label="Geliş notu" htmlFor="lab-trip-received-note">
                <Input id="lab-trip-received-note" value={tripForm.receivedNote} maxLength={500} onChange={(event) => setTrip({ receivedNote: event.target.value })} />
              </FormField>
              <Switch
                checked={tripForm.needsAppointment}
                onChange={(needsAppointment) => setTrip({ needsAppointment })}
                label="Hasta prova/takma randevusu için aransın"
                description="Kapatırsanız bu adımın Hasta aramaları kaydı da kapanır."
              />
            </div>
          )}
        </>
      );
    }

    if (action.kind === "complete") {
      title = LAB_LABELS.complete;
      submitLabel = "İşi kapat";
      const summary = getOrderSummary(order);
      body = (
        <>
          <p className="text-sm text-slate-600">İş hastaya takıldı olarak kapanır; bu işin açık prova aramaları listeden kalkar.</p>
          {summary.needsInvoiceToComplete ? (
            <>
              <Callout tone="warning" compact>Lab faturası girilmeden iş kapatılamaz (lab gideri hekim hakedişine faturayla yansır).</Callout>
              {invoiceFields(invoiceForm, (updater) => setInvoiceForm(updater), order.labName)}
            </>
          ) : summary.rework && order.invoices.length === 0 ? (
            <p className="text-sm text-slate-600">Yeniden yapım ücretsiz olduğu için fatura gerekmez.</p>
          ) : (
            <p className="text-sm text-slate-600">Girilmiş lab faturası: <span className="font-semibold tabular-nums text-slate-900">{formatCurrency(summary.totalAmount)}</span></p>
          )}
        </>
      );
    }

    if (action.kind === "rework") {
      title = LAB_LABELS.rework;
      submitLabel = "Yeniden yapımı başlat";
      const first = (WORKFLOW_TEMPLATES[order.labType] || [])[0];
      const invoiceTotal = order.invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
      body = (
        <>
          <p className="text-sm text-slate-600">
            Laboratuvar işi ücretsiz yeniden yapar. İş yeniden açılır ve <span className="font-semibold text-slate-800">{first ? buildDescription(first.send, first.request) : "Ölçü"}</span> bugün gönderildi olarak kaydedilir.
          </p>
          <FormField label="Yeniden yapım nedeni" htmlFor="lab-rework-reason" required error={fieldErrors.reason}>
            <Textarea id="lab-rework-reason" rows={2} maxLength={500} value={reworkReason} onChange={(event) => setReworkReason(event.target.value)} placeholder="Örn. kron kırıldı, renk uyumsuz" />
          </FormField>
          {order.invoices.length > 0 && (
            <ChoiceCards
              label={`Mevcut lab faturası (${formatCurrency(invoiceTotal)}) ne olsun?`}
              value={keepInvoices ? "keep" : "void"}
              onChange={(value) => setKeepInvoices(value === "keep")}
              columns={1}
              options={[
                { value: "keep", label: "Kalsın", description: "Laboratuvar ilk işi faturaladı; firma borcu ve hakediş gideri değişmez." },
                { value: "void", label: "İptal edilsin", description: "Laboratuvar ücreti geri aldı; tutar firma borcundan ve hakediş giderinden düşülür." },
              ]}
            />
          )}
        </>
      );
    }

    if (action.kind === "editOrder") {
      title = LAB_LABELS.editOrder;
      const hasInvoices = order.invoices.length > 0;
      const lockedHint = "Faturası girilmiş işte değiştirilemez; önce faturayı iptal edin.";
      const labOptions = Array.from(new Set([order.labName, ...labNames])).filter(Boolean);
      const typeKnown = LAB_CATEGORIES.some((category) => category.items.includes(orderForm.labType));
      body = (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={LAB_LABELS.doctor} htmlFor="lab-edit-doctor" required error={fieldErrors.doctorId} hint={hasInvoices ? lockedHint : "Lab gideri bu hekimin hakedişinden düşülür."}>
              <DoctorSelect id="lab-edit-doctor" value={orderForm.doctorId} disabled={hasInvoices} onChange={(doctorId) => setOrderForm((current) => ({ ...current, doctorId }))} aria-label={LAB_LABELS.doctor} />
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
          <FormField label="Dişler" as="div" hint="İsteğe bağlı">
            <LabToothPicker value={orderForm.teeth} onChange={(teeth) => setOrderForm((current) => ({ ...current, teeth }))} />
          </FormField>
          <FormField label="Not" htmlFor="lab-edit-notes">
            <Textarea id="lab-edit-notes" rows={2} maxLength={1500} value={orderForm.notes} onChange={(event) => setOrderForm((current) => ({ ...current, notes: event.target.value }))} />
          </FormField>
        </>
      );
    }

    if (action.kind === "cancel") {
      title = LAB_LABELS.cancelOrder;
      submitLabel = "İşi iptal et";
      submitVariant = "danger";
      const invoiceTotal = order.invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
      body = (
        <>
          <Callout tone="warning" compact>
            Geri alınamaz. {order.invoices.length > 0 ? `Lab faturaları (${formatCurrency(invoiceTotal)}) iptal edilip firma borcundan düşülür; ` : ""}açık aramalar kapanır.
          </Callout>
          <FormField label="İptal nedeni" htmlFor="lab-cancel-reason" required error={fieldErrors.reason}>
            <Textarea id="lab-cancel-reason" rows={2} maxLength={500} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Örn. hasta tedaviden vazgeçti, yanlış hastaya açıldı" />
          </FormField>
        </>
      );
    }
  }

  const modals = (
    <FormModal
      open={Boolean(action)}
      onClose={close}
      onSubmit={() => submit()}
      submitting={saving}
      error={error}
      title={title}
      description={description}
      size={action?.kind === "editOrder" ? "lg" : "md"}
      module="flask"
      submitLabel={submitLabel}
      submitVariant={submitVariant}
      formClassName="space-y-3"
    >
      {body}
    </FormModal>
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
    quickSend,
    quickReceive,
    /** Tek tıkla kaydedilmekte olan işin kimliği (satır düğmesi yükleniyor gösterir). */
    quickBusyId,
    busy: saving || Boolean(quickBusyId),
    isOpen: Boolean(action),
    modals,
  };
}
