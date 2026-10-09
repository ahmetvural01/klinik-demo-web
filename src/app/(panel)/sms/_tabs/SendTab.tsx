"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookmarkPlus, CheckCircle2, ListChecks, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ChoiceCards, type ChoiceOption } from "@/components/ui/ChoiceCards";
import { FormField } from "@/components/ui/FormField";
import { Select } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { SmsMessageEditor } from "@/components/sms/SmsMessageEditor";
import { MessageTextModal } from "@/components/sms/MessageTextModal";
import { SmsConsentBadge, WhatsappConsentBadge } from "@/components/sms/CommunicationBadges";
import { useMessageTemplates, type CommunicationStatus } from "@/components/sms/communication-status";
import {
  CELEBRATION_PLACEHOLDER_TOKENS,
  EVENT_CODES,
  MANUAL_PLACEHOLDER_TOKENS,
  placeholdersFor,
  unsupportedPlaceholderError,
} from "@/components/sms/message-catalog";
import { CHANNEL_LABELS, formatCount, shortReason, type ChannelPreference } from "@/components/sms/communication-labels";
import { SendRecipientList, type Recipient } from "./SendRecipientList";
import { SavedTextsModal } from "./SavedTextsModal";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { toReadableText, toStoredText } from "@/lib/sms-template-placeholders";

type Mode = "single" | "selected" | "all";

type Celebration = {
  code: string;
  title: string;
  targetProfessions: string[];
  messageTemplate: string;
  whatsappMessageTemplate: string | null;
};

type Preview = {
  total: number;
  professionExcluded: number;
  targetProfessions: string[];
  noPhone: number;
  smsConsent: number;
  whatsappConsent: number;
  eitherConsent: number;
  noConsent: number;
  smsBalance: number;
};

type SingleCheck = { hasPhone: boolean; smsConsent: string; whatsappConsent: boolean; smsBalance: number };

type ConsentSummary = { ENABLED: number; PENDING: number; DISABLED: number; EXPIRED: number; SEND_FAILED: number; NONE: number };

type BulkResult = {
  sent: number;
  notSent: number;
  failed: number;
  uncertain: number;
  skippedNoPhone: number;
  notSentReasons: { reason: string; count: number }[];
  batchId: string;
  remainingBalance: number | null;
};

const SMS_MAX = 1600;

function newRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `istek-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

type SendTabProps = {
  status: CommunicationStatus | null;
  canSingle: boolean;
  canBulk: boolean;
  canReadSms: boolean;
  /** WhatsApp modülü açık + yazma yetkisi. */
  canWriteWhatsapp: boolean;
  /** Kayıtlı metin silme: SMS ve (WhatsApp açıksa) WhatsApp düzenleme yetkisi. */
  canDeleteTexts: boolean;
  initialPatient: PickedPatient | null;
  onSent: () => void;
};

/**
 * Mesaj Gönder — tek hastaya ya da bir gruba SMS/WhatsApp. Önce kime
 * (izin durumları görünür), sonra ne (hazır ya da kayıtlı metin), en sonda
 * gönderim özeti: kaç hastaya GERÇEKTEN gideceği ve kaç kredi harcanacağı.
 * Tek hasta: api/sms/send (sms:write); grup: api/sms/bulk (sms:bulk).
 */
export default function SendTab({ status, canSingle, canBulk, canReadSms, canWriteWhatsapp, canDeleteTexts, initialPatient, onSent }: SendTabProps) {
  const whatsappConnected = Boolean(status?.whatsapp?.connected);
  const whatsappUsable = canWriteWhatsapp && whatsappConnected;
  const branchName = status?.branch.name || "Bu şube";
  const clinicPreview = useMemo(() => ({
    institutionName: status?.clinic.displayName || undefined,
    institutionPhone: status?.clinic.displayPhone || undefined,
  }), [status]);

  const [mode, setMode] = useState<Mode>(initialPatient && canSingle ? "single" : canSingle ? "single" : "selected");
  const [patient, setPatient] = useState<PickedPatient | null>(initialPatient && canSingle ? initialPatient : null);
  const [singleCheck, setSingleCheck] = useState<SingleCheck | null>(null);
  const [selected, setSelected] = useState<Map<string, Recipient>>(new Map());
  const [channel, setChannel] = useState<ChannelPreference>("SMS");
  const [message, setMessage] = useState("");
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [preset, setPreset] = useState("");
  const [restrictToProfessions, setRestrictToProfessions] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [consentSummary, setConsentSummary] = useState<ConsentSummary | null>(null);
  const [celebrations, setCelebrations] = useState<Celebration[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [textError, setTextError] = useState("");
  const [saveTextOpen, setSaveTextOpen] = useState(false);
  const [savedTextsOpen, setSavedTextsOpen] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const { templates, error: templatesError, reload: reloadTemplates } = useMessageTemplates();

  useEffect(() => {
    if (initialPatient && canSingle) {
      setMode("single");
      setPatient(initialPatient);
    }
  }, [canSingle, initialPatient]);

  useEffect(() => {
    if (!whatsappUsable) setChannel("SMS");
    else setChannel((current) => (current === "SMS" ? "AUTO" : current));
  }, [whatsappUsable]);

  useEffect(() => {
    fetch("/api/celebration-days", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setCelebrations(Array.isArray(data?.days) ? data.days : []))
      .catch(() => setCelebrations([]));
  }, []);

  useEffect(() => {
    if (!canReadSms || !canBulk) return;
    fetch("/api/sms/consent-summary", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setConsentSummary(data?.summary && typeof data.summary === "object" ? data.summary : null))
      .catch(() => setConsentSummary(null));
  }, [canBulk, canReadSms]);

  // Kayıtlı metinler: kliniğin kendi eklediği metinler + sistemin "Genel
  // Bilgilendirme" başlangıç metni. Otomatik olay metinleri burada çıkmaz.
  const savedTexts = useMemo(() => templates.filter((item) => !EVENT_CODES.has(item.code)), [templates]);
  const allCodes = useMemo(() => new Set(templates.map((item) => item.code)), [templates]);
  const selectedCelebration = preset.startsWith("gun:") ? celebrations.find((item) => `gun:${item.code}` === preset) || null : null;
  const professionLimited = Boolean(selectedCelebration?.targetProfessions.length) && mode !== "single";
  const placeholderTokens = selectedCelebration && mode !== "single" ? CELEBRATION_PLACEHOLDER_TOKENS : MANUAL_PLACEHOLDER_TOKENS;

  // Tek hasta: göndermeden önce telefon/izin kontrolü (hiçbir şey göndermez).
  useEffect(() => {
    setSingleCheck(null);
    if (mode !== "single" || !patient) return;
    const controller = new AbortController();
    fetch(`/api/sms/send?patientId=${encodeURIComponent(patient.id)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data && typeof data === "object" && "hasPhone" in data) setSingleCheck(data as SingleCheck); })
      .catch(() => null);
    return () => controller.abort();
  }, [mode, patient]);

  // Grup: kaç hastaya gerçekten gidebileceğinin özeti (gönderimle aynı sorgu).
  const selectedIdsKey = useMemo(() => [...selected.keys()].sort().join(","), [selected]);
  const loadPreview = useCallback(async () => {
    if (mode === "single") return;
    const ids = selectedIdsKey ? selectedIdsKey.split(",") : [];
    if (mode === "selected" && ids.length === 0) {
      setPreview(null);
      setPreviewError("");
      return;
    }
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const response = await fetch("/api/sms/bulk/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience: mode === "all" ? "ALL" : "SELECTED",
          patientIds: mode === "all" ? [] : ids,
          celebrationCode: selectedCelebration?.code,
          restrictToProfessions,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Alıcı özeti hesaplanamadı.");
      setPreview(data as Preview);
    } catch (error) {
      setPreview(null);
      setPreviewError(error instanceof Error ? error.message : "Alıcı özeti hesaplanamadı.");
    } finally {
      setPreviewLoading(false);
    }
  }, [mode, restrictToProfessions, selectedCelebration?.code, selectedIdsKey]);

  useEffect(() => {
    if (mode === "single") return;
    const timer = window.setTimeout(() => void loadPreview(), 350);
    return () => window.clearTimeout(timer);
  }, [loadPreview, mode]);

  const applyPreset = (value: string) => {
    setPreset(value);
    setTextError("");
    if (!value) return;
    if (value.startsWith("metin:")) {
      const text = savedTexts.find((item) => `metin:${item.code}` === value);
      if (!text) return;
      setMessage(toReadableText(text.content));
      setWhatsappMessage(text.whatsappContent && text.whatsappContent !== text.content ? toReadableText(text.whatsappContent) : "");
      return;
    }
    const day = celebrations.find((item) => `gun:${item.code}` === value);
    if (!day) return;
    setRestrictToProfessions(true);
    setMessage(toReadableText(day.messageTemplate));
    setWhatsappMessage(day.whatsappMessageTemplate && day.whatsappMessageTemplate !== day.messageTemplate ? toReadableText(day.whatsappMessageTemplate) : "");
  };

  // Gönderilebilecek hasta sayısı ve harcanabilecek en fazla kredi.
  const reach = useMemo(() => {
    if (mode === "single") {
      if (!singleCheck) return null;
      const smsOk = singleCheck.hasPhone && singleCheck.smsConsent === "ENABLED";
      const waOk = singleCheck.hasPhone && singleCheck.whatsappConsent;
      const deliverable = channel === "SMS" ? smsOk : channel === "WHATSAPP" ? waOk : smsOk || waOk;
      return { deliverable: deliverable ? 1 : 0, maxCredits: smsOk && channel !== "WHATSAPP" ? 1 : 0, balance: singleCheck.smsBalance };
    }
    if (!preview) return null;
    const deliverable = channel === "SMS" ? preview.smsConsent : channel === "WHATSAPP" ? preview.whatsappConsent : preview.eitherConsent;
    return { deliverable, maxCredits: channel === "WHATSAPP" ? 0 : preview.smsConsent, balance: preview.smsBalance };
  }, [channel, mode, preview, singleCheck]);

  const singleBlocker = useMemo(() => {
    if (mode !== "single" || !patient || !singleCheck) return "";
    if (!singleCheck.hasPhone) return "Hastanın kayıtlı telefonu yok. Önce hasta dosyasına telefon ekleyin.";
    if (reach && reach.deliverable === 0) {
      return channel === "WHATSAPP"
        ? "Hastanın WhatsApp izni yok; WhatsApp ile mesaj gönderilemez."
        : "Hastanın SMS izni yok; mesaj gönderilmez. Hasta izin SMS'ini onaylayınca gönderebilirsiniz.";
    }
    return "";
  }, [channel, mode, patient, reach, singleCheck]);

  const recipientCountLabel = mode === "single"
    ? patient ? patient.fullName : ""
    : mode === "all"
      ? preview ? `${formatCount(preview.total)} hasta` : ""
      : selected.size ? `${formatCount(selected.size)} hasta` : "";

  const smsSwitchedOff = Boolean(status?.sms && !status.sms.enabled);
  const canSendNow = !sending
    && !(smsSwitchedOff && channel === "SMS")
    && message.trim().length > 0
    && (mode === "single" ? Boolean(patient) && !singleBlocker : mode === "all" || selected.size > 0)
    && !(reach && reach.deliverable === 0);

  const resetAfterSuccess = () => {
    setMessage("");
    setWhatsappMessage("");
    setPreset("");
    setSelected(new Map());
    if (mode === "single") setPatient(null);
  };

  const send = async () => {
    const error = !message.trim()
      ? "Mesaj metni boş olamaz."
      : unsupportedPlaceholderError(message, placeholderTokens) || unsupportedPlaceholderError(whatsappMessage, placeholderTokens) || "";
    setTextError(error);
    if (error || !canSendNow) return;

    const channelText = channel === "AUTO" ? "uygun kanaldan (WhatsApp izni olana WhatsApp, diğerlerine SMS)" : CHANNEL_LABELS[channel];
    const credits = reach ? `En fazla ${formatCount(reach.maxCredits)} SMS kredisi harcanır.` : "";
    const ok = await confirmDialog(mode === "single" && patient
      ? {
          title: "Mesaj gönderilsin mi?",
          message: `${patient.fullName} hastasına ${channelText} mesaj gönderilecek. ${credits}`.trim(),
          confirmText: "Gönder",
          cancelText: "Vazgeç",
        }
      : {
          title: "Toplu mesaj gönderilsin mi?",
          message: [
            `${reach ? formatCount(reach.deliverable) : recipientCountLabel} hastaya ${channelText} mesaj gönderilecek.`,
            preview && preview.noConsent + preview.noPhone > 0 ? `İzni ya da telefonu olmayan ${formatCount(preview.noConsent + preview.noPhone)} hastaya gitmez.` : "",
            credits,
            channel === "WHATSAPP" && status?.whatsappSmsFallback ? "WhatsApp'ta gönderilemeyenlere SMS denenir ve kredi harcanır." : "",
          ].filter(Boolean).join(" "),
          confirmText: "Gönder",
          cancelText: "Vazgeç",
        });
    if (!ok) return;

    setSending(true);
    setResult(null);
    requestIdRef.current ??= newRequestId();
    let responseReceived = false;
    try {
      if (mode === "single" && patient) {
        const response = await fetch("/api/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId: patient.id,
            content: toStoredText(message.trim()),
            whatsappContent: whatsappMessage.trim() ? toStoredText(whatsappMessage.trim()) : undefined,
            channelPreference: channel,
            requestId: requestIdRef.current,
          }),
        });
        responseReceived = true;
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || "Mesaj gönderilemedi.");
        const outcome = String(data?.outcome || "");
        showToastSafe({
          title: outcome === "sent" ? "Gönderildi" : outcome === "failed" ? "Gönderilemedi" : "Gönderilmedi",
          message: [data?.message, typeof data?.remainingBalance === "number" ? `Kalan kredi: ${formatCount(data.remainingBalance)}.` : ""].filter(Boolean).join(" "),
          type: outcome === "sent" ? "success" : "error",
          duration: 6000,
        });
        if (outcome === "sent") resetAfterSuccess();
      } else {
        const response = await fetch("/api/sms/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audience: mode === "all" ? "ALL" : "SELECTED",
            patientIds: mode === "all" ? undefined : [...selected.keys()],
            content: toStoredText(message.trim()),
            whatsappContent: whatsappMessage.trim() ? toStoredText(whatsappMessage.trim()) : undefined,
            channelPreference: channel,
            templateCode: selectedCelebration ? `KUTLAMA_${selectedCelebration.code}` : preset.startsWith("metin:") ? preset.slice(6) : "TOPLU",
            celebrationCode: selectedCelebration?.code,
            restrictToProfessions,
            requestId: requestIdRef.current,
          }),
        });
        responseReceived = true;
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || "Toplu mesaj gönderilemedi.");
        const next: BulkResult = {
          sent: Number(data?.sent) || 0,
          notSent: Number(data?.notSent) || 0,
          failed: Number(data?.failed) || 0,
          uncertain: Number(data?.uncertain) || 0,
          skippedNoPhone: Number(data?.skippedNoPhone) || 0,
          notSentReasons: Array.isArray(data?.notSentReasons) ? data.notSentReasons : [],
          batchId: String(data?.batchId || ""),
          remainingBalance: typeof data?.remainingBalance === "number" ? data.remainingBalance : null,
        };
        setResult(next);
        const retryIds: string[] = Array.isArray(data?.failedRecipients)
          ? data.failedRecipients.filter((item: { outcome?: string }) => item.outcome === "failed").map((item: { patientId: string }) => item.patientId)
          : [];
        if (retryIds.length > 0) {
          // Yalnız sağlayıcının kesin olarak reddettikleri yeniden seçilir;
          // izni olmayanlar (tekrar denemek sonucu değiştirmez) ve sonucu
          // belirsiz olanlar (çift mesaj riski) seçilmez.
          setMode("selected");
          setSelected((current) => {
            const nextMap = new Map<string, Recipient>();
            for (const id of retryIds) {
              nextMap.set(id, current.get(id) || { id, fullName: "Önceki gönderimdeki hasta", birthYear: null, hasPhone: true, smsConsent: "ENABLED", whatsappConsent: false });
            }
            return nextMap;
          });
        } else {
          setMessage("");
          setWhatsappMessage("");
          setPreset("");
          setSelected(new Map());
        }
        showToastSafe({
          title: next.sent > 0 ? "Gönderim tamamlandı" : "Mesaj gitmedi",
          message: String(data?.message || ""),
          type: next.sent > 0 && next.failed === 0 && next.uncertain === 0 ? "success" : "error",
          duration: 6000,
        });
      }
      onSent();
    } catch (error) {
      showToastSafe({ title: "Gönderilemedi", message: error instanceof Error ? error.message : "Bilinmeyen hata", type: "error" });
    } finally {
      // Ağ cevabı hiç gelmediyse aynı anahtar korunur: kullanıcı tekrar
      // denediğinde sunucu aynı gönderimi ikinci kez yapmaz.
      if (responseReceived) requestIdRef.current = null;
      setSending(false);
    }
  };

  const modeOptions: ChoiceOption<Mode>[] = [
    ...(canSingle ? [{ value: "single" as const, label: "Tek hasta" }] : []),
    ...(canBulk ? [
      { value: "selected" as const, label: "Seçtiğim hastalar" },
      { value: "all" as const, label: `${branchName} — tüm hastalar` },
    ] : []),
  ];

  const channelOptions: ChoiceOption<ChannelPreference>[] = [
    { value: "AUTO", label: "Uygun kanal" },
    { value: "WHATSAPP", label: "Yalnız WhatsApp" },
    { value: "SMS", label: "Yalnız SMS" },
  ];

  const balanceShort = reach && reach.maxCredits > reach.balance;

  return (
    <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" aria-label="Mesaj gönder">
      {/* 1. Kime */}
      <div className="ui-surface space-y-3 p-4">
        <h2 className="text-base font-bold text-slate-900">1. Kime gönderilecek?</h2>
        {modeOptions.length > 1 && (
          <ChoiceCards<Mode> label="Alıcı" variant="pills" options={modeOptions} value={mode} onChange={(value) => { setMode(value); setResult(null); }} />
        )}

        {mode === "single" && (
          <div className="space-y-2">
            <FormField label="Hasta" required hint="Ad, TC veya telefon yazarak arayın.">
              <PatientPicker value={patient} onChange={(value) => { setPatient(value); setResult(null); }} />
            </FormField>
            {patient && singleCheck && (
              <div className="flex flex-wrap items-center gap-1.5">
                {singleCheck.hasPhone ? <SmsConsentBadge status={singleCheck.smsConsent} /> : <span className="text-xs font-semibold text-red-700">Telefon yok</span>}
                {whatsappUsable && singleCheck.hasPhone && <WhatsappConsentBadge granted={singleCheck.whatsappConsent} />}
                <Button variant="ghost" size="sm" href={`/hasta-detay?id=${encodeURIComponent(patient.id)}`}>Hasta dosyası</Button>
              </div>
            )}
          </div>
        )}

        {mode === "selected" && (
          <SendRecipientList selected={selected} onChange={setSelected} showWhatsapp={whatsappUsable} />
        )}

        {mode === "all" && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            {preview ? `${branchName}'deki ${formatCount(preview.total)} hastanın tamamı seçildi.` : `${branchName}'deki tüm hastalar seçildi.`}
            {status?.branch.multiple ? " Diğer şubelerin hastaları dahil değildir." : ""}
          </p>
        )}

        {mode !== "single" && consentSummary && (
          <p className="text-xs leading-5 text-slate-500">
            {branchName} hastalarının SMS izni:{" "}
            <a className="font-semibold text-emerald-700 hover:underline" href="/hasta?smsConsent=ENABLED">{formatCount(consentSummary.ENABLED)} onaylı</a>
            {" · "}
            <a className="font-semibold text-amber-700 hover:underline" href="/hasta?smsConsent=PENDING">{formatCount(consentSummary.PENDING)} onay bekliyor</a>
            {consentSummary.EXPIRED ? <>{" · "}<a className="font-semibold text-amber-700 hover:underline" href="/hasta?smsConsent=EXPIRED">{formatCount(consentSummary.EXPIRED)} süresi doldu</a></> : null}
            {consentSummary.SEND_FAILED ? <>{" · "}<a className="font-semibold text-red-700 hover:underline" href="/hasta?smsConsent=SEND_FAILED">{formatCount(consentSummary.SEND_FAILED)} izin SMS&apos;i gitmedi</a></> : null}
            {" · "}
            <a className="font-semibold text-slate-700 hover:underline" href="/hasta?smsConsent=DISABLED">{formatCount(consentSummary.DISABLED)} reddetti</a>
            {" · "}
            <span className="font-semibold text-slate-700">{formatCount(consentSummary.NONE)} izin istenmedi</span>
            . İzni olmayan hastaya mesaj gitmez; izin SMS&apos;i hasta dosyasından yeniden gönderilebilir.
          </p>
        )}
      </div>

      {/* 2. Ne */}
      <div className="ui-surface space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">2. Mesaj</h2>
          <Button variant="ghost" size="sm" icon={ListChecks} onClick={() => setSavedTextsOpen(true)}>Kayıtlı metinler</Button>
        </div>

        <FormField label="Hazır metin" hint="Seçerseniz metin kutusuna gelir; göndermeden önce değiştirebilirsiniz.">
            <Select value={preset} onChange={(e) => applyPreset(e.target.value)}>
              <option value="">Metni kendim yazacağım</option>
              {savedTexts.length > 0 && (
                <optgroup label="Kayıtlı metinler">
                  {savedTexts.map((text) => <option key={text.code} value={`metin:${text.code}`}>{text.title}</option>)}
                </optgroup>
              )}
              {celebrations.length > 0 && (
                <optgroup label="Bayram ve özel gün metinleri">
                  {celebrations.map((day) => (
                    <option key={day.code} value={`gun:${day.code}`}>
                      {day.title}{day.targetProfessions.length ? ` (${day.targetProfessions.join(", ")})` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
        </FormField>
        {templatesError && <LoadErrorState compact message={templatesError} onRetry={() => void reloadTemplates()} />}

        {professionLimited && selectedCelebration && (
          <Switch
            checked={restrictToProfessions}
            onChange={setRestrictToProfessions}
            label={`Yalnız ${selectedCelebration.targetProfessions.join(", ")} mesleğindeki hastalara gönder`}
            description={restrictToProfessions
              ? "Seçtiğiniz hastalardan mesleği uymayanlara gitmez."
              : "Kapalı: seçtiğiniz hastaların hepsine gider (meslek fark etmez)."}
          />
        )}

        {whatsappUsable && (
          <ChoiceCards<ChannelPreference> label="Kanal" variant="pills" options={channelOptions} value={channel} onChange={setChannel} />
        )}

        <SmsMessageEditor
          value={message}
          onChange={(value) => { setMessage(value); setTextError(""); }}
          placeholders={placeholdersFor(placeholderTokens)}
          previewContext={{ ...clinicPreview, title: selectedCelebration?.title }}
          label={whatsappUsable && channel !== "SMS" ? "Mesaj metni (SMS ve WhatsApp)" : "SMS metni"}
          error={textError || undefined}
          maxLength={SMS_MAX}
          rows={5}
        />
        {whatsappUsable && channel !== "SMS" && (
          <details className="rounded-lg border border-slate-200 px-3 py-2" open={Boolean(whatsappMessage)}>
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">WhatsApp için farklı metin yaz (isteğe bağlı)</summary>
            <div className="mt-3">
              <SmsMessageEditor
                value={whatsappMessage}
                onChange={setWhatsappMessage}
                placeholders={placeholdersFor(placeholderTokens)}
                previewContext={{ ...clinicPreview, title: selectedCelebration?.title }}
                label="WhatsApp metni"
                hint="Boş bırakırsanız WhatsApp'ta da yukarıdaki metin gider."
                required={false}
                maxLength={4096}
                rows={4}
              />
            </div>
          </details>
        )}
        {canSingle && message.trim() && (
          <Button variant="ghost" size="sm" icon={BookmarkPlus} onClick={() => setSaveTextOpen(true)}>Bu metni kaydet</Button>
        )}

        {/* 3. Özet ve gönder */}
        <div className="space-y-2 border-t border-slate-100 pt-3">
          {mode !== "single" && previewLoading && <p className="text-sm text-slate-500">Alıcılar hesaplanıyor…</p>}
          {mode !== "single" && previewError && <LoadErrorState compact message={previewError} onRetry={() => void loadPreview()} />}
          {mode !== "single" && preview && !previewLoading && (
            <ul className="space-y-1 text-sm">
              <li className="flex items-center gap-2 font-semibold text-slate-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                {formatCount(reach?.deliverable ?? 0)} hastaya gidebilir
                <span className="font-normal text-slate-500">({formatCount(preview.total)} hastadan)</span>
              </li>
              {preview.noConsent > 0 && <li className="text-slate-600">· {formatCount(preview.noConsent)} hastanın izni yok — gitmez</li>}
              {channel !== "SMS" && channel !== "WHATSAPP" && preview.whatsappConsent > 0 && <li className="text-slate-600">· {formatCount(preview.whatsappConsent)} hastaya WhatsApp&apos;tan gider (kredi harcamaz)</li>}
              {preview.noPhone > 0 && <li className="text-slate-600">· {formatCount(preview.noPhone)} hastanın telefonu yok — gitmez</li>}
              {preview.professionExcluded > 0 && <li className="text-slate-600">· {formatCount(preview.professionExcluded)} hasta mesleği uymadığı için listede yok</li>}
            </ul>
          )}
          {reach && (
            <p className={`text-sm ${balanceShort ? "font-semibold text-red-700" : "text-slate-600"}`}>
              En fazla {formatCount(reach.maxCredits)} SMS kredisi harcanır · Kalan kredi {formatCount(reach.balance)}
              {balanceShort ? ". Krediniz yetmez: kredi bitince kalan hastalara mesaj gitmez." : ""}
            </p>
          )}
          {singleBlocker && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {singleBlocker}
            </p>
          )}
          {mode !== "single" && reach && reach.deliverable === 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Seçilen hastaların hiçbirine mesaj gidemez{channel === "WHATSAPP" ? ": WhatsApp izni olan hasta yok." : ": SMS izni olan hasta yok."}
            </p>
          )}
          {smsSwitchedOff && channel !== "WHATSAPP" && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">SMS gönderimi kapalı; Ayarlar&apos;dan açılmadan SMS gitmez.</p>
          )}
          <Button icon={Send} fullWidth loading={sending} disabled={!canSendNow} onClick={() => void send()}>
            {mode === "single"
              ? patient ? `${patient.fullName} hastasına gönder` : "Önce hasta seçin"
              : reach ? `${formatCount(reach.deliverable)} hastaya gönder` : mode === "selected" && selected.size === 0 ? "Önce hasta seçin" : "Gönder"}
          </Button>
        </div>

        {result && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" role="status">
            <p className="font-semibold text-slate-900">Son gönderim</p>
            <p className="mt-1 text-slate-700">
              {formatCount(result.sent)} gönderildi
              {result.notSent ? ` · ${formatCount(result.notSent)} gönderilmedi` : ""}
              {result.failed ? ` · ${formatCount(result.failed)} gönderilemedi` : ""}
              {result.uncertain ? ` · ${formatCount(result.uncertain)} sonucu belirsiz` : ""}
              {result.skippedNoPhone ? ` · ${formatCount(result.skippedNoPhone)} telefonu yok` : ""}
              {result.remainingBalance !== null ? ` · Kalan kredi ${formatCount(result.remainingBalance)}` : ""}
            </p>
            {result.notSentReasons.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Gönderilmeme nedenleri: {result.notSentReasons.map((item) => `${shortReason(item.reason) || item.reason} (${formatCount(item.count)})`).join(", ")}
              </p>
            )}
            {result.failed > 0 && <p className="mt-1 text-xs font-semibold text-amber-700">Gönderilemeyen {formatCount(result.failed)} hasta seçili bırakıldı; tekrar deneyebilirsiniz.</p>}
            {result.uncertain > 0 && <p className="mt-1 text-xs font-semibold text-amber-700">Sonucu belirsiz olanlara tekrar göndermeyin: mesaj ulaşmış olabilir.</p>}
            {result.batchId && (
              <Button variant="ghost" size="sm" className="mt-1" href={`/sms?tab=gecmis&paket=${encodeURIComponent(result.batchId)}`}>Gönderim geçmişinde gör</Button>
            )}
          </div>
        )}
      </div>

      <MessageTextModal
        open={saveTextOpen}
        onClose={() => setSaveTextOpen(false)}
        mode="custom"
        template={null}
        initialContent={message}
        existingCodes={allCodes}
        canWriteSms={canSingle}
        canWriteWhatsapp={canWriteWhatsapp}
        whatsappConnected={whatsappConnected}
        previewContext={clinicPreview}
        onSaved={() => void reloadTemplates()}
      />
      <SavedTextsModal
        open={savedTextsOpen}
        onClose={() => setSavedTextsOpen(false)}
        texts={savedTexts}
        allCodes={allCodes}
        canWriteSms={canSingle}
        canWriteWhatsapp={canWriteWhatsapp}
        whatsappConnected={whatsappConnected}
        canDelete={canDeleteTexts}
        previewContext={clinicPreview}
        onChanged={() => void reloadTemplates()}
      />
    </section>
  );
}
