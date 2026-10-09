"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Route, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { FormSection } from "@/components/ui/FormField";
import { Switch } from "@/components/ui/Switch";
import { SaveBar } from "@/components/ui/SaveBar";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import PanelLoading from "@/components/ui/PanelLoading";
import { WhatsappWebConnect } from "@/components/whatsapp/WhatsappWebConnect";
import type { CommunicationStatus } from "@/components/sms/communication-status";
import { formatCount } from "@/components/sms/communication-labels";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";

type ChannelMode = "WHATSAPP_FALLBACK" | "WHATSAPP" | "SMS";

type SettingsTabProps = {
  status: CommunicationStatus | null;
  /** SMS açık/kapalı: SMS yazma + ayar okuma/yazma. */
  canManageSettings: boolean;
  /** Gönderim kanalı: yukarıdakine ek olarak WhatsApp yazma yetkisi (modül açık). */
  canManageChannel: boolean;
  canManageWhatsappConnection: boolean;
  onChanged: () => void;
};

/**
 * İletişim ayarları üç soruya cevap verir: WhatsApp numaramız bağlı mı,
 * mesajlar hangi kanaldan gitsin, SMS açık mı ve ne kadar kredi kaldı.
 * Değişiklik yapılınca altta Vazgeç/Kaydet çubuğu çıkar; yalnız bu ekranın
 * alanları kaydedilir.
 */
export default function SettingsTab({ status, canManageSettings, canManageChannel, canManageWhatsappConnection, onChanged }: SettingsTabProps) {
  const whatsappConnected = Boolean(status?.whatsapp?.connected);
  const [smsEnabled, setSmsEnabled] = useState<boolean | null>(null);
  const [savedSmsEnabled, setSavedSmsEnabled] = useState<boolean | null>(null);
  const [mode, setMode] = useState<ChannelMode | null>(null);
  const [savedMode, setSavedMode] = useState<ChannelMode | null>(null);
  const [loading, setLoading] = useState(canManageSettings);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!canManageSettings) return;
    setLoading(true);
    setLoadError("");
    try {
      const [settingsResponse, providerResponse] = await Promise.all([
        fetch("/api/settings", { cache: "no-store" }),
        canManageChannel ? fetch("/api/whatsapp/provider", { cache: "no-store" }) : Promise.resolve(null),
      ]);
      const settingsData = await settingsResponse.json().catch(() => null);
      if (!settingsResponse.ok || !settingsData || typeof settingsData !== "object") throw new Error(settingsData?.message || "İletişim ayarları yüklenemedi.");
      const nextSms = settingsData.smsEnabled !== false;
      setSmsEnabled(nextSms);
      setSavedSmsEnabled(nextSms);
      if (providerResponse) {
        const providerData = await providerResponse.json().catch(() => null);
        const preferenceMode = providerResponse.ok ? providerData?.preferences?.mode : null;
        const nextMode: ChannelMode = preferenceMode === "WHATSAPP" ? "WHATSAPP" : preferenceMode === "WHATSAPP_FALLBACK" ? "WHATSAPP_FALLBACK" : "SMS";
        setMode(nextMode);
        setSavedMode(nextMode);
      }
    } catch (error) {
      setSmsEnabled(null);
      setSavedSmsEnabled(null);
      setLoadError(error instanceof Error ? error.message : "İletişim ayarları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [canManageChannel, canManageSettings]);

  useEffect(() => { void load(); }, [load]);

  const smsDirty = smsEnabled !== null && smsEnabled !== savedSmsEnabled;
  const modeDirty = mode !== null && mode !== savedMode;
  const dirty = smsDirty || modeDirty;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const save = async () => {
    if (smsDirty && savedSmsEnabled && smsEnabled === false) {
      const ok = await confirmDialog({
        title: "SMS gönderimi kapatılsın mı?",
        message: "Kapatınca hatırlatmalar, kutlamalar ve yeni hastalara giden izin SMS'i dahil hiçbir SMS gönderilmez.",
        confirmText: "SMS'i kapat",
        cancelText: "Vazgeç",
        danger: true,
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      if (smsDirty) {
        const response = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ smsEnabled }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || "Ayarlar kaydedilemedi.");
        setSavedSmsEnabled(smsEnabled);
      }
      if (modeDirty && mode) {
        // Mesaj türü bazında ayrı WhatsApp anahtarı yok: seçilen kanal bütün
        // otomatik ve toplu mesajlar için geçerlidir.
        const response = await fetch("/api/whatsapp/provider", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, appointment: true, payment: true, info: true }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || "Gönderim kanalı kaydedilemedi.");
        setSavedMode(mode);
      }
      showToastSafe({ message: "İletişim ayarları kaydedildi.", type: "success" });
      onChanged();
    } catch (error) {
      showToastSafe({ title: "Kaydedilemedi", message: error instanceof Error ? error.message : "Ayarlar kaydedilemedi.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setSmsEnabled(savedSmsEnabled);
    setMode(savedMode);
  };

  const balance = status?.sms?.balance;
  const lowBalance = typeof balance === "number" && status?.sms ? balance < status.sms.lowBalanceThreshold : false;
  const whatsappReason = "Önce WhatsApp numaranızı bağlayın.";

  return (
    <div className="space-y-4">
      {canManageWhatsappConnection && (
        <div id="whatsapp-baglanti" className="scroll-mt-4">
          <FormSection icon={MessageCircle} title="WhatsApp numarası" description="Kliniğinizin WhatsApp numarasını QR kod ile bağlayın; mesajlar bu numaradan gider.">
            <WhatsappWebConnect onChanged={() => { onChanged(); void load(); }} />
          </FormSection>
        </div>
      )}

      {canManageSettings && loading && <PanelLoading />}
      {canManageSettings && !loading && loadError && <LoadErrorState message={loadError} onRetry={() => void load()} />}

      {canManageSettings && canManageChannel && mode && (
        <FormSection icon={Route} title="Mesajlar hangi kanaldan gitsin?" description="Otomatik ve toplu mesajların tamamı için geçerlidir.">
          <ChoiceCards<ChannelMode>
            label="Gönderim kanalı"
            columns={3}
            value={mode}
            onChange={setMode}
            options={[
              {
                value: "WHATSAPP_FALLBACK",
                label: "Önce WhatsApp, olmazsa SMS",
                description: "Önerilen. Mesaj WhatsApp'tan gider; gidemezse SMS ile gider.",
                disabled: !whatsappConnected && savedMode !== "WHATSAPP_FALLBACK",
                disabledReason: whatsappReason,
              },
              {
                value: "WHATSAPP",
                label: "Yalnız WhatsApp",
                description: "SMS kredisi harcanmaz; WhatsApp'tan gidemeyen mesaj gönderilmez.",
                disabled: !whatsappConnected && savedMode !== "WHATSAPP",
                disabledReason: whatsappReason,
              },
              { value: "SMS", label: "Yalnız SMS", description: "Bütün mesajlar SMS ile gider." },
            ]}
          />
          {!whatsappConnected && mode !== "SMS" && (
            <p className="mt-3 text-xs font-semibold text-amber-700">WhatsApp numarası bağlı değil; bağlanana kadar WhatsApp mesajları gönderilemez.</p>
          )}
        </FormSection>
      )}

      {canManageSettings && smsEnabled !== null && (
        <FormSection icon={Smartphone} title="SMS" description="SMS yalnız izin veren hastalara gider ve SMS kredisinden düşer.">
          <div className="space-y-3">
            <Switch
              checked={smsEnabled}
              onChange={setSmsEnabled}
              label="SMS gönderimi açık"
              description={smsEnabled ? "İzni olan hastalara SMS gider." : "Kapalı: hiçbir SMS gönderilmez."}
            />
            {typeof balance === "number" && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <p className={`text-sm ${lowBalance ? "font-semibold text-red-700" : "text-slate-700"}`}>
                  Kalan SMS kredisi: <span className="tabular-nums font-bold">{formatCount(balance)}</span>
                  {lowBalance ? " — azaldı. Kredi bitince SMS gönderilemez." : ""}
                </p>
                <Button variant="secondary" size="sm" href="/destek">Kredi iste</Button>
              </div>
            )}
          </div>
        </FormSection>
      )}

      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onDiscard={discard} message="İletişim ayarlarında kaydedilmemiş değişiklik var" />
    </div>
  );
}
