"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Cake, PartyPopper, PenSquare, ShieldCheck, Undo2, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField, FormSection } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { SaveBar } from "@/components/ui/SaveBar";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { MessageTextModal } from "@/components/sms/MessageTextModal";
import { useMessageTemplates, type CommunicationStatus, type MessageTemplate } from "@/components/sms/communication-status";
import { EVENT_MESSAGES, type EventMessage, type MessageGroup } from "@/components/sms/message-catalog";
import { CelebrationList } from "./CelebrationList";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { renderSmsPreview } from "@/lib/sms-template-placeholders";
import { SMS_CONSENT_MESSAGE_TEMPLATE } from "@/lib/sms-consent-copy";

type AutomationSettings = {
  paymentReminderSmsEnabled: boolean;
  paymentReminderDaysBefore: number[];
  paymentReminderOnDueDate: boolean;
  paymentReminderOverdueEnabled: boolean;
  paymentReminderOverdueEveryDays: number;
  birthdaySmsEnabled: boolean;
  appointmentChangeNotifyEnabled: boolean;
  appointmentCancelNotifyEnabled: boolean;
};

const DAY_CHOICES = [1, 2, 3, 5, 7, 14];

function parseAutomationSettings(data: Record<string, unknown>): AutomationSettings {
  const windowDays = Number(data.paymentReminderWindowDays) || 3;
  return {
    paymentReminderSmsEnabled: Boolean(data.paymentReminderSmsEnabled),
    paymentReminderDaysBefore: Array.isArray(data.paymentReminderDaysBefore)
      ? data.paymentReminderDaysBefore.map(Number).filter((day) => day >= 1 && day <= 30).sort((a, b) => a - b)
      : [windowDays],
    paymentReminderOnDueDate: data.paymentReminderOnDueDate !== false,
    paymentReminderOverdueEnabled: data.paymentReminderOverdueEnabled !== false,
    paymentReminderOverdueEveryDays: Number(data.paymentReminderOverdueEveryDays) || 3,
    birthdaySmsEnabled: Boolean(data.birthdaySmsEnabled),
    appointmentChangeNotifyEnabled: data.appointmentChangeNotifyEnabled !== false,
    appointmentCancelNotifyEnabled: data.appointmentCancelNotifyEnabled !== false,
  };
}

type AutomationsTabProps = {
  status: CommunicationStatus | null;
  /** Ödeme/doğum günü anahtarları: SMS yazma + ayar okuma/yazma yetkisi. */
  canManageAutomations: boolean;
  canWriteSms: boolean;
  /** WhatsApp modülü açık + okuma/yazma yetkisi. */
  canReadWhatsapp: boolean;
  canWriteWhatsapp: boolean;
  /** "Hazır metne dön": SMS ve (WhatsApp açıksa) WhatsApp düzenleme yetkisi. */
  canResetTexts: boolean;
  /** Özel günleri açıp kapatmak toplu gönderim yetkisi ister (sms:bulk). */
  canToggleCelebrations: boolean;
  onSettingsSaved: () => void;
};

/**
 * Otomatik Mesajlar — hastaya kendiliğinden giden her mesaj tek ekranda:
 * ne zaman gittiği (ya da şu an GİTMEDİĞİ), açık/kapalı anahtarı ve metni.
 * Önceden aynı iş Otomasyonlar, Şablonlar ve Kutlama Günleri sekmelerine
 * dağılmıştı. Her kontrol kendi yetkisine bakar.
 */
export default function AutomationsTab({
  status,
  canManageAutomations,
  canWriteSms,
  canReadWhatsapp,
  canWriteWhatsapp,
  canResetTexts,
  canToggleCelebrations,
  onSettingsSaved,
}: AutomationsTabProps) {
  const whatsappConnected = Boolean(status?.whatsapp?.connected);
  const { templates, loading: templatesLoading, error: templatesError, reload: reloadTemplates } = useMessageTemplates();
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<AutomationSettings | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ event: EventMessage; template: MessageTemplate } | null>(null);
  const [resettingCode, setResettingCode] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    if (!canManageAutomations) return;
    setSettingsError("");
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || typeof data !== "object" || Array.isArray(data)) throw new Error(data?.message || "Otomatik mesaj ayarları yüklenemedi.");
      const parsed = parseAutomationSettings(data as Record<string, unknown>);
      setSettings(parsed);
      setSavedSettings(parsed);
    } catch (error) {
      setSettings(null);
      setSavedSettings(null);
      setSettingsError(error instanceof Error ? error.message : "Otomatik mesaj ayarları yüklenemedi.");
    }
  }, [canManageAutomations]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  const dirty = Boolean(settings && savedSettings && JSON.stringify(settings) !== JSON.stringify(savedSettings));

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const paymentOn = settings ? settings.paymentReminderSmsEnabled : Boolean(status?.automations.paymentReminders);
  const birthdayOn = settings ? settings.birthdaySmsEnabled : Boolean(status?.automations.birthday);
  const paymentScheduleEmpty = Boolean(settings?.paymentReminderSmsEnabled
    && settings.paymentReminderDaysBefore.length === 0
    && !settings.paymentReminderOnDueDate
    && !settings.paymentReminderOverdueEnabled);

  const save = async () => {
    if (!settings) return;
    if (paymentScheduleEmpty) {
      showToastSafe({ title: "Kaydedilemedi", message: "Ödeme hatırlatması için en az bir zaman seçin (vadeden önce, vade günü ya da gecikmede).", type: "error" });
      return;
    }
    setSaving(true);
    try {
      // Yalnız bu ekrandaki alanlar gönderilir; klinik adı gibi başka ayarlar ezilmez.
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Ayarlar kaydedilemedi.");
      setSavedSettings(settings);
      showToastSafe({ message: "Otomatik mesaj ayarları kaydedildi.", type: "success" });
      onSettingsSaved();
    } catch (error) {
      showToastSafe({ title: "Kaydedilemedi", message: error instanceof Error ? error.message : "Ayarlar kaydedilemedi.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const templateByCode = useMemo(() => new Map(templates.map((item) => [item.code, item])), [templates]);
  const previewContext = useMemo(() => ({
    institutionName: status?.clinic.displayName || undefined,
    institutionPhone: status?.clinic.displayPhone || undefined,
    surveyLink: status?.clinic.reviewLink || undefined,
  }), [status]);
  const canEditTexts = canWriteSms || (canWriteWhatsapp && whatsappConnected);

  const resetText = async (template: MessageTemplate, event: EventMessage) => {
    const ok = await confirmDialog({
      title: "Hazır metne dönülsün mü?",
      message: `“${event.title}” için kliniğinize özel yazdığınız metin silinir; sistemin hazır metni kullanılır.`,
      confirmText: "Hazır metne dön",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    setResettingCode(template.code);
    try {
      const response = await fetch(`/api/sms/templates?code=${encodeURIComponent(template.code)}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Hazır metne dönülemedi.");
      showToastSafe({ message: "Hazır metne dönüldü.", type: "success" });
      void reloadTemplates();
    } catch (error) {
      showToastSafe({ message: error instanceof Error ? error.message : "Hazır metne dönülemedi.", type: "error" });
    } finally {
      setResettingCode(null);
    }
  };

  const sendState = (event: EventMessage): { label: string; tone: "success" | "neutral" | "info" } => {
    if (event.rule === "not-sent") return { label: "Gönderilmiyor", tone: "neutral" };
    if (event.rule === "appointment-flag") return { label: "Randevuda işaretlenirse", tone: "info" };
    if (event.rule === "birthday") return birthdayOn ? { label: "Gönderiliyor", tone: "success" } : { label: "Kapalı", tone: "neutral" };
    if (event.rule === "appointment-change") return !settings || settings.appointmentChangeNotifyEnabled ? { label: "Gönderiliyor", tone: "success" } : { label: "Kapalı", tone: "neutral" };
    if (event.rule === "appointment-cancel") return !settings || settings.appointmentCancelNotifyEnabled ? { label: "Gönderiliyor", tone: "success" } : { label: "Kapalı", tone: "neutral" };
    if (!paymentOn) return { label: "Kapalı", tone: "neutral" };
    if (event.code === "ODEME_VADE_GUNU" && settings && !settings.paymentReminderOnDueDate) return { label: "Kapalı", tone: "neutral" };
    if (event.code === "ODEME_GECIKTI" && settings && !settings.paymentReminderOverdueEnabled) return { label: "Kapalı", tone: "neutral" };
    if (event.code === "ODEME_YAKLASIYOR" && settings && settings.paymentReminderDaysBefore.length === 0) return { label: "Kapalı", tone: "neutral" };
    return { label: "Gönderiliyor", tone: "success" };
  };

  const renderRows = (group: MessageGroup) => (
    <div className="divide-y divide-slate-100">
      {EVENT_MESSAGES.filter((event) => event.group === group).map((event) => {
        const template = templateByCode.get(event.code);
        const state = sendState(event);
        const smsText = template ? renderSmsPreview(template.content, previewContext) : "";
        return (
          <div key={event.code} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                  {event.title}
                  <Badge tone={state.tone}>{state.label}</Badge>
                  {template?.isCustom && <Badge tone="neutral">Kliniğinize özel metin</Badge>}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">{event.when}</p>
              </div>
              {template && canEditTexts && (
                <div className="flex shrink-0 items-center gap-1">
                  {template.isCustom && canResetTexts && (
                    <Button variant="ghost" size="sm" icon={Undo2} loading={resettingCode === template.code} onClick={() => void resetText(template, event)}>Hazır metne dön</Button>
                  )}
                  <Button variant="secondary" size="sm" icon={PenSquare} onClick={() => setEditing({ event, template })}>Metni düzenle</Button>
                </div>
              )}
            </div>
            {templatesLoading && !template ? (
              <div className="ui-skeleton-shimmer mt-2 h-10 rounded-lg bg-slate-100" aria-hidden="true" />
            ) : template ? (
              <div className="mt-2 space-y-1.5">
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-700">{smsText}</p>
              </div>
            ) : !templatesError ? (
              <p className="mt-2 text-xs text-slate-500">Bu mesajın metni bulunamadı.</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  const consentPreview = SMS_CONSENT_MESSAGE_TEMPLATE
    .replace("{{institutionName}}", status?.clinic.legalName || "Kliniğiniz")
    .replace("{{link}}", `${status?.consentLink.address || "https://…"}/sms-onay/xxxxxxxx`);
  const smsOff = Boolean(status?.sms && !status.sms.enabled);
  const readOnlyHint = canManageAutomations ? undefined : "Yalnız klinik yöneticisi açıp kapatabilir.";

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Aşağıdaki mesajlar koşulu oluşunca hastaya kendiliğinden gider: WhatsApp bağlıysa WhatsApp&apos;tan, değilse SMS ile
        (her SMS 1 kredi). Kime gidip gitmediğini Gönderim Geçmişi&apos;nde görebilirsiniz.
      </p>
      {smsOff && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700" role="status">
          SMS gönderimi kapalı: aşağıdaki mesajların hiçbiri SMS ile gitmez. Açmak için Ayarlar bölümüne bakın.
        </p>
      )}
      {templatesError && <LoadErrorState message={templatesError} onRetry={() => void reloadTemplates()} />}
      {canManageAutomations && settingsError && <LoadErrorState message={settingsError} onRetry={() => void loadSettings()} />}

      <FormSection icon={CalendarClock} title="Randevu mesajları" description="Bilgilendirme ve hatırlatma her randevuda ayrı seçilir (randevu formundaki kutular). Değişiklik ve iptal mesajlarını buradan açıp kapatabilirsiniz.">
        <div className="space-y-4">
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <Switch
              checked={settings ? settings.appointmentChangeNotifyEnabled : true}
              disabled={!canManageAutomations || !settings}
              onChange={(checked) => settings && setSettings({ ...settings, appointmentChangeNotifyEnabled: checked })}
              label="Randevu değişince hastaya haber ver"
              description={readOnlyHint || "Tarih, saat veya doktor değişince yeni bilgi hastaya gider."}
            />
            <Switch
              checked={settings ? settings.appointmentCancelNotifyEnabled : true}
              disabled={!canManageAutomations || !settings}
              onChange={(checked) => settings && setSettings({ ...settings, appointmentCancelNotifyEnabled: checked })}
              label="Randevu iptal edilince hastaya haber ver"
              description={readOnlyHint || "İptal edilen gelecek randevular için hastaya bilgi gider."}
            />
          </div>
          {renderRows("randevu")}
        </div>
      </FormSection>

      <FormSection icon={Wallet} title="Ödeme hatırlatmaları" description="Taksit ve vadeli ödemeler için otomatik hatırlatma.">
        <div className="space-y-4">
          <Switch
            checked={paymentOn}
            disabled={!canManageAutomations || !settings}
            onChange={(checked) => settings && setSettings({ ...settings, paymentReminderSmsEnabled: checked })}
            label="Ödeme hatırlatmalarını otomatik gönder"
            description={readOnlyHint || (paymentOn ? "Açık: aşağıdaki zamanlarda hatırlatma gider." : "Kapalı: hastaya ödeme hatırlatması gitmez.")}
          />
          {paymentOn && settings && canManageAutomations && (
            <div className="space-y-3 rounded-lg border border-slate-200 p-3">
              <div>
                <p className="ui-form-label mb-1.5 text-xs font-bold text-slate-800">Vadeden kaç gün önce?</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Vadeden önce hatırlatma günleri">
                  {DAY_CHOICES.map((day) => {
                    const active = settings.paymentReminderDaysBefore.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSettings({
                          ...settings,
                          paymentReminderDaysBefore: active
                            ? settings.paymentReminderDaysBefore.filter((item) => item !== day)
                            : [...settings.paymentReminderDaysBefore, day].sort((a, b) => a - b),
                        })}
                        className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${active ? "border-primary bg-primary/10 text-primary" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                      >
                        {day} gün
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-slate-500">Birden fazla gün seçebilirsiniz. Aynı taksit için günde en fazla bir mesaj gider.</p>
              </div>
              <Switch
                checked={settings.paymentReminderOnDueDate}
                onChange={(checked) => setSettings({ ...settings, paymentReminderOnDueDate: checked })}
                label="Vade gününde de hatırlat"
              />
              <Switch
                checked={settings.paymentReminderOverdueEnabled}
                onChange={(checked) => setSettings({ ...settings, paymentReminderOverdueEnabled: checked })}
                label="Geciken ödemeyi tekrar hatırlat"
                description="Ödeme yapılana kadar seçtiğiniz aralıkla tekrar gider."
              />
              {settings.paymentReminderOverdueEnabled && (
                <FormField label="Gecikmede kaç günde bir?">
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    className="w-28"
                    value={settings.paymentReminderOverdueEveryDays}
                    onChange={(e) => setSettings({ ...settings, paymentReminderOverdueEveryDays: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })}
                  />
                </FormField>
              )}
              {paymentScheduleEmpty && <p className="text-xs font-semibold text-red-700">En az bir zaman seçin; yoksa hatırlatma hiç gitmez.</p>}
            </div>
          )}
          {renderRows("odeme")}
        </div>
      </FormSection>

      <FormSection icon={Cake} title="Doğum günü" description="Doğum tarihi kayıtlı hastalara yılda bir kez kutlama mesajı.">
        <div className="space-y-4">
          <Switch
            checked={birthdayOn}
            disabled={!canManageAutomations || !settings}
            onChange={(checked) => settings && setSettings({ ...settings, birthdaySmsEnabled: checked })}
            label="Doğum günü mesajını otomatik gönder"
            description={readOnlyHint}
          />
          {renderRows("dogum-gunu")}
        </div>
      </FormSection>

      <div id="ozel-gunler" className="scroll-mt-4">
      <FormSection icon={PartyPopper} title="Bayramlar ve özel günler" description="Açtığınız günlerde, kurumun TÜM şubelerindeki uygun hastalara her yıl otomatik gider. Mesleğe özel günler yalnız o meslekteki hastalara gider.">
        <CelebrationList
          canToggle={canToggleCelebrations}
          clinicName={status?.clinic.legalName || ""}
          showWhatsapp={canReadWhatsapp && whatsappConnected}
        />
      </FormSection>
      </div>

      <FormSection icon={ShieldCheck} title="SMS izni isteği" description="Yeni hasta kaydedilince hastaya bir kez izin SMS'i gider. Hasta onaylayana kadar ona SMS gönderilmez. Metin yasal gereklilik nedeniyle sabittir.">
        <div className="space-y-2">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-700">{consentPreview}</p>
          {status && (status.consentLink.ready ? (
            <Badge tone="success">Onay bağlantısı hastanın telefonunda açılır</Badge>
          ) : (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="status">
              Onay bağlantısı hastanın telefonunda açılmaz{status.consentLink.address ? ` (${status.consentLink.address})` : ""}. Hastalar izin veremez; sistem yöneticinize bildirin.
            </p>
          ))}
          {smsOff && <p className="text-xs font-semibold text-red-700">SMS gönderimi kapalı olduğu için izin SMS&apos;i de gitmez; yeni hastalar “İzin SMS&apos;i gitmedi” durumunda kalır.</p>}
        </div>
      </FormSection>

      {editing && (
        <MessageTextModal
          open
          onClose={() => setEditing(null)}
          mode="event"
          event={editing.event}
          template={editing.template}
          existingCodes={new Set(templates.map((item) => item.code))}
          canWriteSms={canWriteSms}
          canWriteWhatsapp={canWriteWhatsapp}
          whatsappConnected={whatsappConnected}
          previewContext={previewContext}
          onSaved={() => void reloadTemplates()}
        />
      )}

      {canManageAutomations && (
        <SaveBar
          dirty={dirty}
          saving={saving}
          onSave={() => void save()}
          onDiscard={() => savedSettings && setSettings(savedSettings)}
          message="Otomatik mesaj ayarlarında kaydedilmemiş değişiklik var"
        />
      )}
    </div>
  );
}
