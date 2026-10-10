"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { AlarmClock, BellRing, Cake, CalendarCheck, CalendarClock, CalendarX, Eye, Hourglass, PartyPopper, PenSquare, ShieldCheck, SlidersHorizontal, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { Modal } from "@/components/ui/Modal";
import { Section } from "@/components/ui/Section";
import { SettingsGroup, SettingsList, SettingsRow } from "@/components/ui/SettingsList";
import { Switch } from "@/components/ui/Switch";
import { ToggleChips } from "@/components/ui/ToggleChips";
import { MessageTextModal } from "@/components/sms/MessageTextModal";
import type {
  AutomationState,
  CelebrationDay,
  CommunicationStatus,
  MessageTemplate,
  MessageTemplatesState,
  PaymentSchedule,
} from "@/components/sms/communication-status";
import { EVENT_MESSAGES, type EventMessage } from "@/components/sms/message-catalog";
import { dayAndMonth } from "@/components/sms/communication-labels";
import { CelebrationManageModal } from "./CelebrationList";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { SMS_CONSENT_MESSAGE_TEMPLATE } from "@/lib/sms-consent-copy";

const DAY_CHOICES = [1, 2, 3, 5, 7, 14];
const OVERDUE_CHOICES = [1, 3, 7, 14, 30];
const NO_TIMING_MESSAGE = "En az bir zaman açık kalmalı. Hatırlatmaları tamamen kapatmak için “Ödeme hatırlatmaları” anahtarını kapatın.";

const EVENT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  BILGI: CalendarCheck,
  HATIRLATMA: BellRing,
  RANDEVU_DEGISIKLIK: CalendarClock,
  RANDEVU_IPTAL: CalendarX,
  ODEME_YAKLASIYOR: Hourglass,
  ODEME_VADE_GUNU: Wallet,
  ODEME_GECIKTI: AlarmClock,
  DOGUM_GUNU: Cake,
};

const eventOf = (code: string) => EVENT_MESSAGES.find((item) => item.code === code) as EventMessage;

function messageOf(data: unknown, fallback: string) {
  const message = data && typeof data === "object" ? (data as { message?: unknown }).message : undefined;
  return typeof message === "string" && message.trim() ? message : fallback;
}

/** "7 ve 3 gün önce", "3, 2 ve 1 gün önce". */
function daysText(days: number[]) {
  const sorted = [...days].sort((a, b) => b - a);
  if (sorted.length === 0) return "";
  const head = sorted.slice(0, -1).join(", ");
  return `${head ? `${head} ve ` : ""}${sorted[sorted.length - 1]} gün önce`;
}

function sameDays(a: number[], b: number[]) {
  return [...a].sort((x, y) => x - y).join(",") === [...b].sort((x, y) => x - y).join(",");
}

function hasAnyTiming(schedule: PaymentSchedule) {
  return schedule.daysBefore.length > 0 || schedule.onDueDate || schedule.overdueEnabled;
}

type CelebrationsState = {
  days: CelebrationDay[];
  loading: boolean;
  error: string;
  setDayEnabled: (code: string, enabled: boolean) => void;
};

type AutomationsTabProps = {
  status: CommunicationStatus | null;
  /** Sayfa düzeyinde bir kez yüklenen mesaj metinleri (Mesaj gönder ile ortak). */
  templates: MessageTemplatesState;
  /** Özel gün kataloğu (sayısız, hafif okuma) — özet satırı için. */
  celebrations: CelebrationsState;
  /** Anahtarlar ve zamanlama: SMS yazma + ayar okuma/yazma yetkisi. */
  canManageAutomations: boolean;
  canWriteSms: boolean;
  canWriteWhatsapp: boolean;
  /** "Hazır metne dön": SMS ve (WhatsApp açıksa) WhatsApp düzenleme yetkisi. */
  canResetTexts: boolean;
  /** Özel günleri açıp kapatmak toplu gönderim yetkisi ister (sms:bulk). */
  canToggleCelebrations: boolean;
  /** Kaydedilen otomasyon ayarı — sayfa durumu sunucuya yeniden sorulmadan güncellenir. */
  onAutomationsChange: (next: AutomationState) => void;
};

type OpenModal =
  | { kind: "text"; code: string }
  | { kind: "days" }
  | { kind: "overdue" }
  | { kind: "celebrations" }
  | { kind: "consent" }
  | null;

/**
 * Otomatik mesajlar — hastaya kendiliğinden giden her mesaj TEK kompakt
 * listede (Randevu · Ödeme · Kutlama · İzin). Satırda yalnız ad, ne zaman
 * gittiği ve anahtar; metin ve zamanlama satırdan açılan pencerede. Satır
 * anahtarı ANINDA kaydeder (hata olursa geri alınır); önceden aynı ekranda
 * üç ayrı kaydetme biçimi (SaveBar, anında, pencere) vardı ve sayfa ~2.700 px
 * uzunluğundaydı. Ayar okuma yetkisi olmayan roller gerçek değeri salt okunur
 * görür (api/sms/status → automations).
 */
export default function AutomationsTab({
  status,
  templates,
  celebrations,
  canManageAutomations,
  canWriteSms,
  canWriteWhatsapp,
  canResetTexts,
  canToggleCelebrations,
  onAutomationsChange,
}: AutomationsTabProps) {
  const remote = status?.automations ?? null;
  const [values, setValues] = useState<AutomationState | null>(remote);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [modal, setModal] = useState<OpenModal>(null);
  const [draftDays, setDraftDays] = useState<number[]>([]);
  const [draftOverdue, setDraftOverdue] = useState(3);

  // Sunucudaki (ya da sayfanın güncellediği) değer gelince yerel kopya eşitlenir.
  useEffect(() => { if (remote) setValues(remote); }, [remote]);

  const whatsappConnected = Boolean(status?.whatsapp?.connected);
  const templateByCode = useMemo(() => new Map(templates.templates.map((item) => [item.code, item])), [templates.templates]);
  const existingCodes = useMemo(() => new Set(templates.templates.map((item) => item.code)), [templates.templates]);
  const previewContext = useMemo(() => ({
    institutionName: status?.clinic.displayName || undefined,
    institutionPhone: status?.clinic.displayPhone || undefined,
  }), [status]);

  const putSettings = async (body: Record<string, unknown>) => {
    // Yalnız değişen alan gönderilir; klinik adı gibi başka ayarlar ezilmez
    // (api/settings PUT kısmi gövdeyi kabul eder ve denetim kaydı yazar).
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(messageOf(data, "Ayar kaydedilemedi."));
  };

  /** Satır anahtarı: iyimser güncelle, kaydet; hata olursa eski değere dön. */
  const persist = async (key: string, next: AutomationState, body: Record<string, unknown>, successMessage: string) => {
    if (!values) return;
    const previous = values;
    setValues(next);
    setSavingKey(key);
    try {
      await putSettings(body);
      onAutomationsChange(next);
      showToastSafe({ message: successMessage, type: "success" });
    } catch (error) {
      setValues(previous);
      showToastSafe({ title: "Kaydedilemedi", message: error instanceof Error ? error.message : "Ayar kaydedilemedi.", type: "error" });
    } finally {
      setSavingKey(null);
    }
  };

  const setSchedule = (key: string, patch: Partial<PaymentSchedule>, body: Record<string, unknown>, successMessage: string) => {
    if (!values) return;
    const schedule = { ...values.paymentSchedule, ...patch };
    if (values.paymentReminders && !hasAnyTiming(schedule)) {
      showToastSafe({ title: "Kaydedilmedi", message: NO_TIMING_MESSAGE, type: "error", duration: 6000 });
      return;
    }
    void persist(key, { ...values, paymentSchedule: schedule }, body, successMessage);
  };

  const togglePaymentReminders = async (on: boolean) => {
    if (!values) return;
    if (on) {
      const ok = await confirmDialog({
        title: "Ödeme hatırlatmaları açılsın mı?",
        message: "Bugünden itibaren ödenmemiş taksitler için hastalara mesaj gider. SMS ile gidenler kredi harcar.",
        confirmText: "Aç",
        cancelText: "Vazgeç",
      });
      if (!ok) return;
    }
    // Hiç zaman seçili değilken açılırsa "vadeden 3 gün önce" ile açılır
    // (açık ama hiç gitmeyen hatırlatma olmasın).
    const needsDefault = on && !hasAnyTiming(values.paymentSchedule);
    const schedule = needsDefault ? { ...values.paymentSchedule, daysBefore: [3] } : values.paymentSchedule;
    void persist(
      "payment",
      { ...values, paymentReminders: on, paymentSchedule: schedule },
      { paymentReminderSmsEnabled: on, ...(needsDefault ? { paymentReminderDaysBefore: [3] } : {}) },
      on ? "Ödeme hatırlatmaları açıldı." : "Ödeme hatırlatmaları kapatıldı.",
    );
  };

  const toggleBirthday = async (on: boolean) => {
    if (!values) return;
    if (on) {
      const ok = await confirmDialog({
        title: "Doğum günü mesajı açılsın mı?",
        message: "Doğum tarihi kayıtlı hastalara doğum gününde, yılda bir kez kutlama mesajı gider. SMS ile gidenler kredi harcar.",
        confirmText: "Aç",
        cancelText: "Vazgeç",
      });
      if (!ok) return;
    }
    void persist("birthday", { ...values, birthday: on }, { birthdaySmsEnabled: on }, on ? "Doğum günü mesajı açıldı." : "Doğum günü mesajı kapatıldı.");
  };

  const openText = (code: string) => setModal({ kind: "text", code });
  const openDays = () => {
    if (!values) return;
    setDraftDays(values.paymentSchedule.daysBefore);
    setModal({ kind: "days" });
  };
  const openOverdue = () => {
    if (!values) return;
    setDraftOverdue(values.paymentSchedule.overdueEveryDays);
    setModal({ kind: "overdue" });
  };
  const closeModal = () => setModal(null);

  const textAction = (code: string) => {
    const template = templateByCode.get(code);
    return (
      <Button
        variant="ghost"
        size="sm"
        icon={canWriteSms ? PenSquare : Eye}
        disabled={!template}
        title={!template && templates.loading ? "Metin yükleniyor" : undefined}
        onClick={() => openText(code)}
      >
        {canWriteSms ? "Metin" : "Metni gör"}
      </Button>
    );
  };

  // Zamanlaması olan satırın düğmesi: yönetici zamanı ve metni "Ayarla"r;
  // zamanı değiştiremeyen ama metni düzenleyebilen (BANKO) "Metin", hiçbirini
  // değiştiremeyen "Gör" görür (önceden BANKO'ya pasif günlerle "Ayarla" çıkıyordu).
  const scheduleAction = (code: string, open: () => void) => {
    const label = canManageAutomations ? "Ayarla" : canWriteSms ? "Metin" : "Gör";
    return (
      <Button
        variant="ghost"
        size="sm"
        icon={canManageAutomations ? SlidersHorizontal : canWriteSms ? PenSquare : Eye}
        disabled={!templateByCode.get(code)}
        title={!templateByCode.get(code) && templates.loading ? "Metin yükleniyor" : undefined}
        onClick={open}
      >
        {label}
      </Button>
    );
  };

  const customBadge = (code: string) => (templateByCode.get(code)?.isCustom ? <Badge tone="neutral">Özel metin</Badge> : undefined);

  const enabledCelebrations = celebrations.days.filter((day) => day.enabled);
  const nextCelebration = enabledCelebrations
    .filter((day) => day.nextDate)
    .sort((a, b) => (a.nextDate || "").localeCompare(b.nextDate || ""))[0];
  const celebrationSummary = celebrations.loading
    ? "Yükleniyor…"
    : celebrations.error && celebrations.days.length === 0
      ? "Liste yüklenemedi"
      : enabledCelebrations.length === 0
        ? "Hiçbiri açık değil"
        : `${enabledCelebrations.length} gün açık${nextCelebration?.nextDate ? ` · sıradaki ${dayAndMonth(nextCelebration.nextDate)}, ${nextCelebration.title}` : ""}`;

  const consentPreview = SMS_CONSENT_MESSAGE_TEMPLATE
    .replace("{{institutionName}}", status?.clinic.legalName || "Kliniğiniz")
    .replace("{{link}}", `${status?.consentLink.address || "https://…"}/sms-onay/xxxxxxxx`);

  const readOnly = !canManageAutomations;
  // Bir kayıt sürerken diğer anahtarlar da kısa süre beklenir: ardışık iki
  // kayıtta ilki hata verip geri alınırsa ikincisinin durumu bozulmasın.
  const busy = readOnly || !values || savingKey !== null;

  // ── Pencereler ──────────────────────────────────────────────────────────
  const modalEvent = modal?.kind === "text" ? eventOf(modal.code) : modal?.kind === "days" ? eventOf("ODEME_YAKLASIYOR") : modal?.kind === "overdue" ? eventOf("ODEME_GECIKTI") : null;
  const modalTemplate: MessageTemplate | null = modalEvent ? templateByCode.get(modalEvent.code) || null : null;

  const dayOptions = useMemo(() => {
    const extra = (values?.paymentSchedule.daysBefore || []).filter((day) => !DAY_CHOICES.includes(day));
    return [...DAY_CHOICES, ...extra].sort((a, b) => a - b).map((day) => ({ value: day, label: `${day} gün`, disabled: readOnly }));
  }, [readOnly, values?.paymentSchedule.daysBefore]);
  const overdueOptions = useMemo(() => {
    const current = values?.paymentSchedule.overdueEveryDays;
    const list = current && !OVERDUE_CHOICES.includes(current) ? [...OVERDUE_CHOICES, current].sort((a, b) => a - b) : OVERDUE_CHOICES;
    return list.map((day) => ({ value: String(day), label: day === 1 ? "Her gün" : `${day} günde bir`, disabled: readOnly }));
  }, [readOnly, values?.paymentSchedule.overdueEveryDays]);

  const daysError = values && values.paymentReminders && draftDays.length === 0 && !values.paymentSchedule.onDueDate && !values.paymentSchedule.overdueEnabled
    ? NO_TIMING_MESSAGE
    : null;

  const saveDays = async () => {
    if (!values) return;
    // Sunucu günleri büyükten küçüğe sıralar (api/settings); ekran da öyle tutar.
    const days = [...draftDays].sort((a, b) => b - a);
    await putSettings({ paymentReminderDaysBefore: days });
    const next = { ...values, paymentSchedule: { ...values.paymentSchedule, daysBefore: days } };
    setValues(next);
    onAutomationsChange(next);
  };

  const saveOverdue = async () => {
    if (!values) return;
    await putSettings({ paymentReminderOverdueEveryDays: draftOverdue });
    const next = { ...values, paymentSchedule: { ...values.paymentSchedule, overdueEveryDays: draftOverdue } };
    setValues(next);
    onAutomationsChange(next);
  };

  const modalSettings = modal?.kind === "days" ? (
    <ToggleChips<number>
      label="Vadeden kaç gün önce?"
      options={dayOptions}
      value={draftDays}
      onChange={setDraftDays}
      error={daysError || undefined}
      hint={draftDays.length === 0 ? "Gün seçmezseniz vadesi yaklaşan hatırlatma gitmez." : "Aynı taksit için günde en fazla bir mesaj gider."}
    />
  ) : modal?.kind === "overdue" ? (
    <ChoiceCards<string>
      label="Kaç günde bir tekrar gitsin?"
      variant="pills"
      options={overdueOptions}
      value={String(draftOverdue)}
      onChange={(value) => setDraftOverdue(Number(value))}
    />
  ) : undefined;

  if (!values) {
    return (
      <Section padding="none">
        <ListRowSkeleton variant="row" leading="icon" rows={10} />
      </Section>
    );
  }

  const schedule = values.paymentSchedule;
  const paymentOff = !values.paymentReminders;

  return (
    <div className="space-y-2">
      {readOnly ? (
        <p className="text-xs text-slate-500">Açıp kapatmayı klinik yöneticisi yapar.</p>
      ) : status?.branch.multiple ? (
        <p className="text-xs text-slate-500">Bu ayarlar tüm şubelerde geçerlidir.</p>
      ) : null}
      {templates.error && !templates.loaded && (
        <LoadErrorState compact message={templates.error} onRetry={() => void templates.reload()} />
      )}

      <Section padding="none">
        <SettingsList aria-label="Otomatik mesajlar">
          <SettingsGroup label="Randevu">
            <SettingsRow
              icon={EVENT_ICONS.BILGI}
              title="Randevu bilgilendirme"
              description={`${eventOf("BILGI").when} · ${values.smsDefaultInfo ? "yeni randevularda seçili gelir" : "randevuda elle seçilir"}`}
              status={customBadge("BILGI")}
              actions={textAction("BILGI")}
              toggle={{
                checked: values.smsDefaultInfo,
                disabled: busy,
                label: "Yeni randevularda bilgilendirme seçili gelsin",
                onChange: (on) => void persist("info", { ...values, smsDefaultInfo: on }, { smsDefaultInfo: on },
                  on ? "Yeni randevularda bilgilendirme seçili gelecek." : "Yeni randevularda bilgilendirme seçili gelmeyecek."),
              }}
            />
            <SettingsRow
              icon={EVENT_ICONS.HATIRLATMA}
              title="Randevu hatırlatma"
              description={`${eventOf("HATIRLATMA").when} · ${values.smsDefaultReminder ? "yeni randevularda seçili gelir" : "randevuda elle seçilir"}`}
              status={customBadge("HATIRLATMA")}
              actions={textAction("HATIRLATMA")}
              toggle={{
                checked: values.smsDefaultReminder,
                disabled: busy,
                label: "Yeni randevularda hatırlatma seçili gelsin",
                onChange: (on) => void persist("reminder", { ...values, smsDefaultReminder: on }, { smsDefaultReminder: on },
                  on ? "Yeni randevularda hatırlatma seçili gelecek." : "Yeni randevularda hatırlatma seçili gelmeyecek."),
              }}
            />
            <SettingsRow
              icon={EVENT_ICONS.RANDEVU_DEGISIKLIK}
              title="Randevu değişikliği"
              description={eventOf("RANDEVU_DEGISIKLIK").when}
              status={customBadge("RANDEVU_DEGISIKLIK")}
              actions={textAction("RANDEVU_DEGISIKLIK")}
              toggle={{
                checked: values.appointmentChange,
                disabled: busy,
                label: "Randevu değişince hastaya mesaj gönderilsin",
                onChange: (on) => void persist("change", { ...values, appointmentChange: on }, { appointmentChangeNotifyEnabled: on },
                  on ? "Randevu değişince hastaya mesaj gidecek." : "Randevu değişince mesaj gitmeyecek."),
              }}
            />
            <SettingsRow
              icon={EVENT_ICONS.RANDEVU_IPTAL}
              title="Randevu iptali"
              description={eventOf("RANDEVU_IPTAL").when}
              status={customBadge("RANDEVU_IPTAL")}
              actions={textAction("RANDEVU_IPTAL")}
              toggle={{
                checked: values.appointmentCancel,
                disabled: busy,
                label: "Randevu iptal edilince hastaya mesaj gönderilsin",
                onChange: (on) => void persist("cancel", { ...values, appointmentCancel: on }, { appointmentCancelNotifyEnabled: on },
                  on ? "Randevu iptal edilince hastaya mesaj gidecek." : "Randevu iptal edilince mesaj gitmeyecek."),
              }}
            />
          </SettingsGroup>

          <SettingsGroup
            label="Ödeme hatırlatmaları"
            action={(
              <Switch
                checked={values.paymentReminders}
                disabled={busy}
                onChange={(on) => void togglePaymentReminders(on)}
                label="Ödeme hatırlatmaları gönderilsin"
                labelHidden
              />
            )}
          >
            <SettingsRow
              icon={EVENT_ICONS.ODEME_YAKLASIYOR}
              title="Vadesi yaklaşan ödeme"
              description={schedule.daysBefore.length ? `Vadeden ${daysText(schedule.daysBefore)}` : "Kapalı — gün seçilmedi"}
              status={customBadge("ODEME_YAKLASIYOR")}
              muted={paymentOff}
              actions={scheduleAction("ODEME_YAKLASIYOR", openDays)}
              reserveToggleSpace
            />
            <SettingsRow
              icon={EVENT_ICONS.ODEME_VADE_GUNU}
              title="Vade günü"
              description={eventOf("ODEME_VADE_GUNU").when}
              status={customBadge("ODEME_VADE_GUNU")}
              muted={paymentOff}
              actions={textAction("ODEME_VADE_GUNU")}
              toggle={{
                checked: schedule.onDueDate,
                // Grup kapalıyken alt anahtar da kapalı (önceden soluk ama
                // tıklanabiliyordu ve "hatırlatma gidecek" diyordu).
                disabled: busy || paymentOff,
                label: "Vade gününde hatırlatma gönderilsin",
                onChange: (on) => setSchedule("due", { onDueDate: on }, { paymentReminderOnDueDate: on },
                  on ? "Vade gününde de hatırlatma gidecek." : "Vade gününde hatırlatma gitmeyecek."),
              }}
            />
            <SettingsRow
              icon={EVENT_ICONS.ODEME_GECIKTI}
              title="Geciken ödeme"
              description={schedule.overdueEveryDays === 1 ? "Ödenene kadar her gün" : `Ödenene kadar ${schedule.overdueEveryDays} günde bir`}
              status={customBadge("ODEME_GECIKTI")}
              muted={paymentOff}
              actions={scheduleAction("ODEME_GECIKTI", openOverdue)}
              toggle={{
                checked: schedule.overdueEnabled,
                disabled: busy || paymentOff,
                label: "Geciken ödeme hatırlatması gönderilsin",
                onChange: (on) => setSchedule("overdue", { overdueEnabled: on }, { paymentReminderOverdueEnabled: on },
                  on ? "Geciken ödemeler için hatırlatma gidecek." : "Geciken ödemeler için hatırlatma gitmeyecek."),
              }}
            />
          </SettingsGroup>

          <SettingsGroup label="Kutlama">
            <SettingsRow
              icon={EVENT_ICONS.DOGUM_GUNU}
              title="Doğum günü"
              description={eventOf("DOGUM_GUNU").when}
              status={customBadge("DOGUM_GUNU")}
              actions={textAction("DOGUM_GUNU")}
              toggle={{
                checked: values.birthday,
                disabled: busy,
                label: "Doğum günü mesajı gönderilsin",
                onChange: (on) => void toggleBirthday(on),
              }}
            />
            <SettingsRow
              icon={PartyPopper}
              title="Bayram ve özel günler"
              description={celebrationSummary}
              actions={(
                <Button variant="ghost" size="sm" icon={canToggleCelebrations ? SlidersHorizontal : Eye} onClick={() => setModal({ kind: "celebrations" })}>
                  {canToggleCelebrations ? "Yönet" : "Gör"}
                </Button>
              )}
              reserveToggleSpace
            />
          </SettingsGroup>

          <SettingsGroup label="İzin">
            <SettingsRow
              icon={ShieldCheck}
              title="SMS izni isteği"
              description="Yeni hasta kaydında bir kez gider · metni değiştirilemez"
              actions={<Button variant="ghost" size="sm" icon={Eye} onClick={() => setModal({ kind: "consent" })}>Metni gör</Button>}
              reserveToggleSpace
            />
          </SettingsGroup>
        </SettingsList>
      </Section>

      {modalEvent && modalTemplate && (
        <MessageTextModal
          open
          onClose={closeModal}
          mode="event"
          event={modalEvent}
          template={modalTemplate}
          existingCodes={existingCodes}
          canWriteSms={canWriteSms}
          canWriteWhatsapp={canWriteWhatsapp}
          whatsappConnected={whatsappConnected}
          previewContext={previewContext}
          readOnly={!canWriteSms}
          // Liste kayıt yanıtıyla yerelde güncellenir; ayrıca yeniden çekilmez
          // (art arda iki kayıtta eski yanıt yeni metni ezmesin).
          onSaved={(saved) => { if (saved) templates.upsert(saved); }}
          onReset={templates.upsert}
          canResetToDefault={canResetTexts}
          settings={modalSettings}
          settingsDirty={modal?.kind === "days"
            ? !readOnly && !sameDays(draftDays, schedule.daysBefore)
            : modal?.kind === "overdue" ? !readOnly && draftOverdue !== schedule.overdueEveryDays : false}
          settingsError={modal?.kind === "days" ? daysError : null}
          onSaveSettings={modal?.kind === "days" ? saveDays : modal?.kind === "overdue" ? saveOverdue : undefined}
        />
      )}

      <CelebrationManageModal
        open={modal?.kind === "celebrations"}
        onClose={closeModal}
        canToggle={canToggleCelebrations}
        clinicName={status?.clinic.legalName || ""}
        multipleBranches={Boolean(status?.branch.multiple)}
        // status.whatsapp yalnız WhatsApp okuma yetkisi + modül açıkken döner.
        showWhatsappText={whatsappConnected}
        onToggled={celebrations.setDayEnabled}
      />

      <Modal
        module="sms"
        open={modal?.kind === "consent"}
        onClose={closeModal}
        title="SMS izni isteği"
        description="Yeni hasta kaydedilince bir kez gider; hasta onaylayana kadar ona SMS gitmez. Metin yasal zorunluluk nedeniyle değiştirilemez."
        trackFormChanges={false}
        footer={<Button variant="secondary" onClick={closeModal}>Kapat</Button>}
      >
        <p className="whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-5 text-slate-800">{consentPreview}</p>
      </Modal>
    </div>
  );
}
