"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BookmarkPlus, CheckCircle2, FileText, ListChecks, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards, type ChoiceOption } from "@/components/ui/ChoiceCards";
import { Disclosure } from "@/components/ui/Disclosure";
import { FormField } from "@/components/ui/FormField";
import { Select } from "@/components/ui/Input";
import { Section } from "@/components/ui/Section";
import { Switch } from "@/components/ui/Switch";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { SmsMessageEditor } from "@/components/sms/SmsMessageEditor";
import { MessageTextModal } from "@/components/sms/MessageTextModal";
import { SmsConsentBadge, WhatsappConsentBadge } from "@/components/sms/CommunicationBadges";
import type { CelebrationDay, CommunicationStatus, MessageTemplatesState } from "@/components/sms/communication-status";
import {
  CELEBRATION_PLACEHOLDER_TOKENS,
  MANUAL_PLACEHOLDER_TOKENS,
  NON_MANUAL_TEMPLATE_CODES,
  placeholdersFor,
  unsupportedPlaceholderError,
} from "@/components/sms/message-catalog";
import { formatCount, shortReason, smsConsentOf } from "@/components/sms/communication-labels";
import { computeBulkReach, computeSingleReach, type SingleCheckCounts } from "@/components/sms/send-reach";
import { SendRecipientList, type Recipient } from "./SendRecipientList";
import { SavedTextsModal } from "./SavedTextsModal";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { toReadableText, toStoredText } from "@/lib/sms-template-placeholders";

type Mode = "single" | "selected" | "all";
type SendChannel = "WHATSAPP" | "SMS";

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

type SingleCheck = SingleCheckCounts;

type ConsentSummary = { ENABLED: number; PENDING: number; DISABLED: number; EXPIRED: number; SEND_FAILED: number; NONE: number };

type BulkResult = {
  sent: number;
  notSent: number;
  failed: number;
  uncertain: number;
  skippedNoPhone: number;
  notSentReasons: { reason: string; count: number }[];
  batchId: string;
};

const SMS_MAX = 1600;

function newRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `istek-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function messageOf(data: unknown, fallback: string) {
  const message = data && typeof data === "object" ? (data as { message?: unknown }).message : undefined;
  return typeof message === "string" && message.trim() ? message : fallback;
}

type CelebrationsState = { days: CelebrationDay[]; error: string; reload: () => Promise<void> };

type SendTabProps = {
  status: CommunicationStatus | null;
  /** Sayfa düzeyinde bir kez yüklenen mesaj metinleri (Otomatik mesajlar ile ortak). */
  templates: MessageTemplatesState;
  /** Özel gün metinleri (hazır metin listesi). */
  celebrations: CelebrationsState;
  canSingle: boolean;
  canBulk: boolean;
  canReadSms: boolean;
  /** WhatsApp modülü açık + yazma yetkisi. */
  canWriteWhatsapp: boolean;
  /** Kayıtlı metin silme: SMS ve (WhatsApp açıksa) WhatsApp düzenleme yetkisi. */
  canDeleteTexts: boolean;
  /** İzin SMS'ini yeniden gönderme (patients:write). */
  canResendConsent: boolean;
  initialPatient: PickedPatient | null;
  onSent: () => void;
};

/**
 * Mesaj gönder — tek hastaya ya da bir gruba SMS/WhatsApp. Solda kime,
 * sağda (masaüstünde yapışkan) mesaj ve gönderim özeti: kaç hastaya GERÇEKTEN
 * gideceği (kurumun kanal ayarı ve SMS yedeği dahil), kaçına neden gitmeyeceği
 * ve en fazla kaç kredi harcanacağı. Tek hasta: api/sms/send (sms:write);
 * grup: api/sms/bulk (sms:bulk).
 */
export default function SendTab({
  status,
  templates,
  celebrations,
  canSingle,
  canBulk,
  canReadSms,
  canWriteWhatsapp,
  canDeleteTexts,
  canResendConsent,
  initialPatient,
  onSent,
}: SendTabProps) {
  const whatsappConnected = Boolean(status?.whatsapp?.connected);
  // WhatsApp seçeneği yalnız modül + yazma yetkisi + bağlı numara varken.
  const whatsappUsable = canWriteWhatsapp && whatsappConnected;
  const institutionPrefersWhatsapp = status?.defaultChannel === "WHATSAPP";
  const smsFallback = status?.whatsappSmsFallback ?? true;
  const smsOn = status?.sms ? status.sms.enabled : true;
  const branchName = status?.branch.name || "";
  const clinicPreview = useMemo(() => ({
    institutionName: status?.clinic.displayName || undefined,
    institutionPhone: status?.clinic.displayPhone || undefined,
  }), [status]);

  const [mode, setMode] = useState<Mode>(canSingle ? "single" : "selected");
  const [patient, setPatient] = useState<PickedPatient | null>(initialPatient && canSingle ? initialPatient : null);
  const [singleCheck, setSingleCheck] = useState<SingleCheck | null>(null);
  const [singleCheckError, setSingleCheckError] = useState("");
  const [selected, setSelected] = useState<Map<string, Recipient>>(new Map());
  const [channel, setChannel] = useState<SendChannel>("SMS");
  const [message, setMessage] = useState("");
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [preset, setPreset] = useState("");
  const [restrictToProfessions, setRestrictToProfessions] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [consentSummary, setConsentSummary] = useState<(ConsentSummary & { total: number }) | null>(null);
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [textError, setTextError] = useState("");
  const [saveTextOpen, setSaveTextOpen] = useState(false);
  const [savedTextsOpen, setSavedTextsOpen] = useState(false);
  const requestIdRef = useRef<string | null>(null);

  // Hasta dosyasından "Mesaj gönder" ile gelindiyse hasta seçili açılır.
  // (initialPatient sayfada adres parametreleriyle sabitlenir; her çizimde yeni nesne gelmez.)
  useEffect(() => {
    if (initialPatient && canSingle) {
      setMode("single");
      setPatient(initialPatient);
    }
  }, [canSingle, initialPatient]);

  // Varsayılan kanal kurumun ayarıdır (Kanal ve kredi); bu gönderim için değiştirilebilir.
  useEffect(() => {
    setChannel(whatsappUsable && institutionPrefersWhatsapp ? "WHATSAPP" : "SMS");
  }, [institutionPrefersWhatsapp, whatsappUsable]);
  const viaWhatsapp = whatsappUsable && channel === "WHATSAPP";

  // İzin özeti yalnız grup gönderiminde gerekir (tek hastada istek atılmaz).
  const groupMode = mode !== "single";
  useEffect(() => {
    if (!groupMode || !canReadSms || !canBulk || consentSummary) return;
    const controller = new AbortController();
    fetch("/api/sms/consent-summary", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.summary && typeof data.summary === "object") setConsentSummary({ ...data.summary, total: Number(data.total) || 0 });
      })
      .catch(() => null);
    return () => controller.abort();
  }, [canBulk, canReadSms, consentSummary, groupMode]);

  // Kayıtlı metinler: kliniğin kendi metinleri + "Genel bilgilendirme". Otomatik
  // olay metinleri ve değerlendirme isteği (bağlantısı elle doldurulamaz) çıkmaz.
  const savedTexts = useMemo(() => templates.templates.filter((item) => !NON_MANUAL_TEMPLATE_CODES.has(item.code)), [templates.templates]);
  const allCodes = useMemo(() => new Set(templates.templates.map((item) => item.code)), [templates.templates]);
  const selectedCelebration = preset.startsWith("gun:") ? celebrations.days.find((item) => `gun:${item.code}` === preset) || null : null;
  const professionLimited = Boolean(selectedCelebration?.targetProfessions.length) && groupMode;
  const placeholderTokens = selectedCelebration && groupMode ? CELEBRATION_PLACEHOLDER_TOKENS : MANUAL_PLACEHOLDER_TOKENS;

  // Tek hasta: göndermeden önce telefon/izin kontrolü (hiçbir şey göndermez).
  const patientId = patient?.id || "";
  const loadSingleCheck = useCallback(async (id: string, signal?: AbortSignal) => {
    setSingleCheckError("");
    try {
      const response = await fetch(`/api/sms/send?patientId=${encodeURIComponent(id)}`, { cache: "no-store", signal });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || typeof data !== "object" || !("hasPhone" in data)) throw new Error(messageOf(data, "Hastanın izin durumu okunamadı."));
      setSingleCheck(data as SingleCheck);
    } catch (error) {
      if (signal?.aborted) return;
      setSingleCheckError(error instanceof Error ? error.message : "Hastanın izin durumu okunamadı.");
    }
  }, []);
  useEffect(() => {
    setSingleCheck(null);
    setSingleCheckError("");
    if (mode !== "single" || !patientId) return;
    const controller = new AbortController();
    void loadSingleCheck(patientId, controller.signal);
    return () => controller.abort();
  }, [loadSingleCheck, mode, patientId]);

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
      if (!response.ok) throw new Error(messageOf(data, "Alıcı özeti hesaplanamadı."));
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

  const presetText = useMemo(() => {
    if (preset.startsWith("metin:")) {
      const text = savedTexts.find((item) => `metin:${item.code}` === preset);
      return text ? toReadableText(text.content) : "";
    }
    return selectedCelebration ? toReadableText(selectedCelebration.messageTemplate) : "";
  }, [preset, savedTexts, selectedCelebration]);

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
    const day = celebrations.days.find((item) => `gun:${item.code}` === value);
    if (!day) return;
    setRestrictToProfessions(true);
    setMessage(toReadableText(day.messageTemplate));
    setWhatsappMessage(day.whatsappMessageTemplate && day.whatsappMessageTemplate !== day.messageTemplate ? toReadableText(day.whatsappMessageTemplate) : "");
  };

  // ── Gönderim özeti: merkezi gönderim kapısıyla (notification-dispatch) aynı kural ──
  const route = useMemo(() => ({ viaWhatsapp, smsFallback, smsOn }), [smsFallback, smsOn, viaWhatsapp]);
  const bulk = useMemo(() => (groupMode && preview ? computeBulkReach(preview, route) : null), [groupMode, preview, route]);
  const single = useMemo(
    () => (mode === "single" && patient && singleCheck ? computeSingleReach(singleCheck, route) : null),
    [mode, patient, route, singleCheck],
  );

  const canSendNow = !sending
    && message.trim().length > 0
    && (mode === "single"
      ? Boolean(patient) && (single ? single.ok : Boolean(singleCheckError))
      : (mode === "all" || selected.size > 0) && Boolean(bulk && bulk.deliverable > 0));

  const resetAfterSuccess = () => {
    setMessage("");
    setWhatsappMessage("");
    setPreset("");
    setSelected(new Map());
    if (mode === "single") setPatient(null);
  };

  const resendConsent = async () => {
    if (!patient) return;
    const ok = await confirmDialog({
      title: "İzin SMS'i gönderilsin mi?",
      message: `${patient.fullName} hastasına SMS izni isteyen mesaj gider (1 kredi). Hasta onaylayınca mesaj gönderebilirsiniz.`,
      confirmText: "Gönder",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    setResending(true);
    try {
      const response = await fetch(`/api/patients/${encodeURIComponent(patient.id)}/sms-consent/resend`, { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(data, "İzin SMS'i gönderilemedi."));
      showToastSafe({ message: "İzin SMS'i gönderildi. Hastanın onayı bekleniyor.", type: "success" });
      void loadSingleCheck(patient.id);
    } catch (error) {
      showToastSafe({ message: error instanceof Error ? error.message : "İzin SMS'i gönderilemedi.", type: "error" });
    } finally {
      setResending(false);
    }
  };

  const send = async () => {
    const error = !message.trim()
      ? "Mesaj metni boş olamaz."
      : unsupportedPlaceholderError(message, placeholderTokens) || unsupportedPlaceholderError(whatsappMessage, placeholderTokens) || "";
    setTextError(error);
    if (error || !canSendNow) return;

    const ok = await confirmDialog(mode === "single" && patient
      ? {
          title: "Mesaj gönderilsin mi?",
          message: [
            `${patient.fullName} hastasına mesaj gönderilecek.`,
            single?.ok && single.channel === "WHATSAPP"
              ? `WhatsApp ile gider${single.backupCredit ? "; gidemezse SMS ile (1 kredi)" : ""}.`
              : "SMS ile gider (1 kredi).",
          ].join(" "),
          confirmText: "Gönder",
          cancelText: "Vazgeç",
        }
      : {
          title: `${formatCount(bulk?.deliverable ?? 0)} hastaya mesaj gönderilsin mi?`,
          message: [
            bulk && bulk.maxCredits > 0 ? `En fazla ${formatCount(bulk.maxCredits)} SMS kredisi harcanır.` : "SMS kredisi harcanmaz.",
            viaWhatsapp && smsFallback && smsOn ? "WhatsApp'tan gidemeyenlere SMS gider." : "",
          ].filter(Boolean).join(" "),
          confirmText: "Gönder",
          cancelText: "Vazgeç",
        });
    if (!ok) return;

    const channelPreference: SendChannel = viaWhatsapp ? "WHATSAPP" : "SMS";
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
            whatsappContent: viaWhatsapp && whatsappMessage.trim() ? toStoredText(whatsappMessage.trim()) : undefined,
            channelPreference,
            requestId: requestIdRef.current,
          }),
        });
        responseReceived = true;
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(messageOf(data, "Mesaj gönderilemedi."));
        const outcome = String(data?.outcome || "");
        const reason = typeof data?.reason === "string" ? data.reason : "";
        showToastSafe({
          title: outcome === "sent" ? "Gönderildi" : "Mesaj gitmedi",
          // Başlık sonucu söyler; metin yalnız nedeni (tekrar yok).
          message: outcome === "sent" ? String(data?.message || "") : outcome === "uncertain" ? String(data?.message || "") : reason || String(data?.message || ""),
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
            whatsappContent: viaWhatsapp && whatsappMessage.trim() ? toStoredText(whatsappMessage.trim()) : undefined,
            channelPreference,
            templateCode: selectedCelebration ? `KUTLAMA_${selectedCelebration.code}` : preset.startsWith("metin:") ? preset.slice(6) : "TOPLU",
            celebrationCode: selectedCelebration?.code,
            restrictToProfessions,
            requestId: requestIdRef.current,
          }),
        });
        responseReceived = true;
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(messageOf(data, "Toplu mesaj gönderilemedi."));
        const next: BulkResult = {
          sent: Number(data?.sent) || 0,
          notSent: Number(data?.notSent) || 0,
          failed: Number(data?.failed) || 0,
          uncertain: Number(data?.uncertain) || 0,
          skippedNoPhone: Number(data?.skippedNoPhone) || 0,
          notSentReasons: Array.isArray(data?.notSentReasons) ? data.notSentReasons : [],
          batchId: String(data?.batchId || ""),
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
        // Ayrıntı özet kartında; bildirim tek satır.
        showToastSafe({
          message: next.sent > 0 ? "Gönderim tamamlandı." : "Mesaj gitmedi.",
          type: next.sent > 0 && next.failed === 0 && next.uncertain === 0 ? "success" : "error",
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
      { value: "all" as const, label: "Tüm hastalar" },
    ] : []),
  ];

  const channelOptions: ChoiceOption<SendChannel>[] = [
    { value: "WHATSAPP", label: smsFallback ? "Önce WhatsApp, olmazsa SMS" : "Yalnız WhatsApp" },
    { value: "SMS", label: "Yalnız SMS" },
  ];

  const singleProblem = single && !single.ok ? single.problem : null;
  // SMS kapalı / kredi bitti kurum geneli durumdur ve sayfanın üstündeki
  // uyarıda zaten yazar; burada ikinci bir kutu yerine nedeni düğme söyler.
  const globalBlock = singleProblem === "sms-off" ? "SMS gönderimi kapalı" : singleProblem === "credit" ? "SMS krediniz bitti" : "";
  const patientProblem = globalBlock ? null : singleProblem;
  const singleConsentLabel = singleCheck ? smsConsentOf(singleCheck.smsConsent).label : "";
  const noPermissionLabel = viaWhatsapp ? (smsFallback ? "izni yok" : "WhatsApp mesajı almıyor") : "SMS izni yok";
  const notReached = bulk ? [
    bulk.noPermission ? `${formatCount(bulk.noPermission)} ${noPermissionLabel}` : "",
    bulk.noPhone ? `${formatCount(bulk.noPhone)} telefonu yok` : "",
    bulk.smsBlocked ? `${formatCount(bulk.smsBlocked)} SMS kapalı` : "",
  ].filter(Boolean) : [];
  const creditsShort = bulk ? bulk.maxCredits > bulk.balance : false;

  return (
    <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" aria-label="Mesaj gönder">
      <Section title="Kime">
        <div className="space-y-3">
          {modeOptions.length > 1 && (
            <ChoiceCards<Mode>
              label="Alıcı"
              labelHidden
              variant="pills"
              options={modeOptions}
              value={mode}
              onChange={(value) => { setMode(value); setResult(null); }}
              hint={mode === "all" && status?.branch.multiple
                ? `Yalnız ${branchName || "bu şubenin"} hastaları; diğer şubeler dahil değil.`
                : undefined}
            />
          )}

          {mode === "single" && (
            <div className="space-y-2">
              <FormField label="Hasta" as="div" required>
                <PatientPicker required value={patient} onChange={(value) => { setPatient(value); setResult(null); }} />
              </FormField>
              {patient && singleCheck && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {singleCheck.hasPhone ? <SmsConsentBadge status={singleCheck.smsConsent} /> : <span className="text-xs font-semibold text-red-700">Telefon yok</span>}
                  {viaWhatsapp && singleCheck.hasPhone && <WhatsappConsentBadge granted={singleCheck.whatsappConsent} />}
                  <Button variant="ghost" size="sm" icon={FileText} href={`/hasta-detay?id=${encodeURIComponent(patient.id)}`}>Hasta dosyası</Button>
                </div>
              )}
              {patient && singleCheckError && (
                <LoadErrorState compact message={singleCheckError} onRetry={() => void loadSingleCheck(patient.id)} />
              )}
            </div>
          )}

          {mode === "selected" && (
            <SendRecipientList selected={selected} onChange={setSelected} showWhatsapp={viaWhatsapp} />
          )}

          {groupMode && consentSummary && (
            <p className="text-xs leading-5 text-slate-500">
              SMS izni: <span className="font-semibold text-slate-700">{formatCount(consentSummary.ENABLED)} / {formatCount(consentSummary.total)}</span> hastada var
              {/* Her sayı, tıklanınca açılan Hastalar süzgeciyle aynı kümeyi sayar
                  (PENDING ve EXPIRED ayrı süzgeçler; toplamı tek bağlantıya yazmak
                  listede daha az hasta gösteriyordu). */}
              {consentSummary.PENDING > 0 && (
                <>
                  {" · "}
                  <Link className="font-semibold text-amber-700 hover:underline" href="/hasta?smsConsent=PENDING">{formatCount(consentSummary.PENDING)} onay bekliyor</Link>
                </>
              )}
              {consentSummary.EXPIRED > 0 && (
                <>
                  {" · "}
                  <Link className="font-semibold text-amber-700 hover:underline" href="/hasta?smsConsent=EXPIRED">{formatCount(consentSummary.EXPIRED)} onay süresi doldu</Link>
                </>
              )}
              {consentSummary.SEND_FAILED > 0 && (
                <>
                  {" · "}
                  <Link className="font-semibold text-red-700 hover:underline" href="/hasta?smsConsent=SEND_FAILED">{formatCount(consentSummary.SEND_FAILED)} izin SMS&apos;i gitmedi</Link>
                </>
              )}
            </p>
          )}
        </div>
      </Section>

      <div className="lg:sticky lg:top-4">
        <Section
          title="Mesaj"
          actions={<Button variant="ghost" size="sm" icon={ListChecks} onClick={() => setSavedTextsOpen(true)}>Kayıtlı metinler</Button>}
        >
          <div className="space-y-3">
            <FormField label="Hazır metin">
              <Select value={preset} onChange={(e) => applyPreset(e.target.value)}>
                <option value="">Metni kendim yazacağım</option>
                {savedTexts.length > 0 && (
                  <optgroup label="Kayıtlı metinler">
                    {savedTexts.map((text) => <option key={text.code} value={`metin:${text.code}`}>{text.title}</option>)}
                  </optgroup>
                )}
                {celebrations.days.length > 0 && (
                  <optgroup label="Bayram ve özel gün metinleri">
                    {celebrations.days.map((day) => (
                      <option key={day.code} value={`gun:${day.code}`}>
                        {day.title}{day.targetProfessions.length ? ` (${day.targetProfessions.join(", ")})` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </FormField>
            {templates.error && !templates.loaded && <LoadErrorState compact message={templates.error} onRetry={() => void templates.reload()} />}

            {professionLimited && selectedCelebration && (
              <Switch
                checked={restrictToProfessions}
                onChange={setRestrictToProfessions}
                label={`Yalnız ${selectedCelebration.targetProfessions.join(", ")} mesleğindeki hastalara gönder`}
              />
            )}

            <SmsMessageEditor
              value={message}
              onChange={(value) => { setMessage(value); setTextError(""); }}
              placeholders={placeholdersFor(placeholderTokens)}
              previewContext={{ ...clinicPreview, title: selectedCelebration?.title }}
              previewMode="auto"
              label="Mesaj metni"
              error={textError || undefined}
              maxLength={SMS_MAX}
              rows={5}
            />
            {viaWhatsapp && (
              <Disclosure title="WhatsApp için farklı metin" summary="isteğe bağlı" defaultOpen={Boolean(whatsappMessage)}>
                <SmsMessageEditor
                  value={whatsappMessage}
                  onChange={setWhatsappMessage}
                  placeholders={placeholdersFor(placeholderTokens)}
                  previewContext={{ ...clinicPreview, title: selectedCelebration?.title }}
                  previewMode="auto"
                  label="WhatsApp metni"
                  hint="Boş bırakırsanız WhatsApp'ta da yukarıdaki metin gider."
                  required={false}
                  maxLength={4096}
                  rows={4}
                />
              </Disclosure>
            )}
            {canSingle && message.trim() && message.trim() !== presetText.trim() && (
              <Button variant="ghost" size="sm" icon={BookmarkPlus} className="-ml-2" onClick={() => setSaveTextOpen(true)}>Bu metni kaydet</Button>
            )}

            {/* Gönderim özeti — kanal, kime gidip gitmeyeceği, kredi, tek birincil düğme. */}
            <div className="space-y-2 border-t border-slate-100 pt-3">
              {whatsappUsable && (
                <ChoiceCards<SendChannel> label="Kanal" variant="pills" options={channelOptions} value={channel} onChange={setChannel} />
              )}

              {mode === "single" && patient && single?.ok && (
                <p className="text-sm text-slate-700">
                  {single.channel === "WHATSAPP"
                    ? <>WhatsApp ile gider{single.backupCredit ? <span className="text-slate-500"> · gidemezse SMS ile (1 kredi)</span> : ""}</>
                    : <>SMS ile gider <span className="text-slate-500">· 1 kredi</span></>}
                </p>
              )}
              {patientProblem && (
                <Callout
                  tone="warning"
                  title={patientProblem === "phone" ? "Hastanın kayıtlı telefonu yok"
                    : patientProblem === "whatsapp" ? "Hasta WhatsApp mesajı almıyor"
                      : `SMS izni yok (${singleConsentLabel})`}
                  action={patientProblem === "consent" && canResendConsent && patient ? (
                    <Button variant="secondary" size="sm" icon={RotateCcw} loading={resending} onClick={() => void resendConsent()}>
                      {singleCheck?.smsConsent === "NONE" ? "İzin SMS'ini gönder" : "İzin SMS'ini yeniden gönder"}
                    </Button>
                  ) : undefined}
                >
                  {patientProblem === "phone" ? "Önce hasta dosyasına telefon ekleyin."
                    : patientProblem === "whatsapp" ? "SMS yedeği kapalı; “Yalnız SMS” seçebilirsiniz."
                      : "Hasta onaylayana kadar SMS gitmez."}
                </Callout>
              )}

              {groupMode && previewLoading && !bulk && <p className="text-sm text-slate-500">Alıcılar hesaplanıyor…</p>}
              {groupMode && previewError && <LoadErrorState compact message={previewError} onRetry={() => void loadPreview()} />}
              {bulk && (
                <ul className={`space-y-1 text-sm ${previewLoading ? "opacity-60" : ""}`} aria-busy={previewLoading || undefined}>
                  <li className="flex items-center gap-2 font-semibold text-slate-900">
                    {bulk.deliverable > 0
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                      : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />}
                    {formatCount(bulk.deliverable)} hastaya gidecek
                    <span className="font-normal text-slate-500">({formatCount(bulk.total)} hastadan)</span>
                  </li>
                  {viaWhatsapp && bulk.deliverable > 0 && (
                    <li className="pl-6 text-slate-600">{formatCount(bulk.whatsapp)} WhatsApp · {formatCount(bulk.sms)} SMS</li>
                  )}
                  {notReached.length > 0 && <li className="pl-6 text-slate-600">Gitmeyecek: {notReached.join(" · ")}</li>}
                  {bulk.professionExcluded > 0 && <li className="pl-6 text-slate-600">{formatCount(bulk.professionExcluded)} hasta mesleği uymadığı için dahil değil</li>}
                  <li className="pl-6 text-slate-600">{bulk.maxCredits > 0 ? `En fazla ${formatCount(bulk.maxCredits)} SMS kredisi harcanır` : "SMS kredisi harcanmaz"}</li>
                </ul>
              )}
              {bulk && creditsShort && (
                <Callout tone="warning" compact>
                  Krediniz yetmeyebilir: {formatCount(bulk.balance)} kredi kaldı. Kredi bitince SMS&apos;ler gitmez.
                </Callout>
              )}

              <Button icon={Send} fullWidth loading={sending} disabled={!canSendNow} onClick={() => void send()}>
                {mode === "single"
                  ? patient ? globalBlock || "Gönder" : "Önce hasta seçin"
                  : bulk && bulk.deliverable > 0 ? `${formatCount(bulk.deliverable)} hastaya gönder` : mode === "selected" && selected.size === 0 ? "Önce hasta seçin" : "Gönder"}
              </Button>

              {result && (
                <Callout
                  tone={result.failed || result.uncertain || result.sent === 0 ? "warning" : "success"}
                  title="Son gönderim"
                  action={result.batchId ? (
                    <Button variant="ghost" size="sm" href={`/sms?tab=gecmis&paket=${encodeURIComponent(result.batchId)}`}>Geçmişte gör</Button>
                  ) : undefined}
                >
                  <p>
                    {[
                      `${formatCount(result.sent)} gönderildi`,
                      result.notSent ? `${formatCount(result.notSent)} gitmedi` : "",
                      result.failed ? `${formatCount(result.failed)} hata` : "",
                      result.uncertain ? `${formatCount(result.uncertain)} sonucu belirsiz` : "",
                      result.skippedNoPhone ? `${formatCount(result.skippedNoPhone)} telefonu yok` : "",
                    ].filter(Boolean).join(" · ")}
                  </p>
                  {result.notSentReasons.length > 0 && (
                    <p className="text-xs">Gitmeme nedeni: {result.notSentReasons.map((item) => `${shortReason(item.reason) || item.reason} (${formatCount(item.count)})`).join(", ")}</p>
                  )}
                  {result.failed > 0 && <p className="text-xs font-semibold">Hata alan {formatCount(result.failed)} hasta seçili bırakıldı; tekrar deneyebilirsiniz.</p>}
                  {result.uncertain > 0 && <p className="text-xs font-semibold">Sonucu belirsiz olanlara tekrar göndermeyin: mesaj ulaşmış olabilir.</p>}
                </Callout>
              )}
            </div>
          </div>
        </Section>
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
        onSaved={(saved) => {
          if (!saved) return;
          templates.upsert(saved);
          setPreset(`metin:${saved.code}`);
        }}
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
        onSaved={templates.upsert}
        onRemoved={templates.remove}
      />
    </section>
  );
}
