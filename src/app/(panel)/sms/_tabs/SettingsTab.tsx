"use client";

import { useState } from "react";
import { BadgeCheck, Coins, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { Section } from "@/components/ui/Section";
import { SettingsList, SettingsRow } from "@/components/ui/SettingsList";
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
  /** Kaydedilen ayarı sayfa durumuna yansıtır (sunucuya yeniden sormadan). */
  onStatusChange: (updater: (current: CommunicationStatus) => CommunicationStatus) => void;
  /** WhatsApp bağlantısı değişti — durum yeniden okunur. */
  onConnectionChanged: () => void;
  /** "SMS paketi al" penceresini açar (pencere sayfada; şeritteki düğmeyle aynı). */
  onBuyCredit: () => void;
};

function messageOf(data: unknown, fallback: string) {
  const message = data && typeof data === "object" ? (data as { message?: unknown }).message : undefined;
  return typeof message === "string" && message.trim() ? message : fallback;
}

/**
 * Kanal ve kredi — WhatsApp numarası bağlı mı, mesajlar hangi kanaldan
 * gitsin, SMS açık mı ve ne kadar kredi kaldı. Seçimler ANINDA kaydedilir
 * (SMS'i kapatmak onay ister); önceden iki alan için altta SaveBar vardı ve
 * WhatsApp durumu değişince kaydedilmemiş seçim eziliyordu. Değerler sayfanın
 * ortak durumundan (api/sms/status) gelir; ayrıca /api/settings okunmaz.
 */
export default function SettingsTab({ status, canManageSettings, canManageChannel, canManageWhatsappConnection, onStatusChange, onConnectionChanged, onBuyCredit }: SettingsTabProps) {
  const whatsappConnected = Boolean(status?.whatsapp?.connected);
  const [pendingMode, setPendingMode] = useState<ChannelMode | null>(null);
  const [savingSms, setSavingSms] = useState(false);

  const savedMode: ChannelMode = status?.defaultChannel === "WHATSAPP"
    ? (status.whatsappSmsFallback ? "WHATSAPP_FALLBACK" : "WHATSAPP")
    : "SMS";
  const mode = pendingMode ?? savedMode;

  const changeMode = async (next: ChannelMode) => {
    if (next === mode || pendingMode) return;
    setPendingMode(next);
    try {
      // Mesaj türü bazında ayrı WhatsApp anahtarı yok: seçilen kanal bütün
      // otomatik ve toplu mesajlar için geçerlidir.
      const response = await fetch("/api/whatsapp/provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next, appointment: true, payment: true, info: true }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(data, "Gönderim kanalı kaydedilemedi."));
      onStatusChange((current) => ({
        ...current,
        defaultChannel: next === "SMS" ? "SMS" : "WHATSAPP",
        whatsappSmsFallback: next === "WHATSAPP_FALLBACK",
      }));
      showToastSafe({ message: "Gönderim kanalı kaydedildi.", type: "success" });
    } catch (error) {
      showToastSafe({ title: "Kaydedilemedi", message: error instanceof Error ? error.message : "Gönderim kanalı kaydedilemedi.", type: "error" });
    } finally {
      setPendingMode(null);
    }
  };

  const toggleSms = async (on: boolean) => {
    if (!status?.sms || savingSms) return;
    if (!on) {
      const ok = await confirmDialog({
        title: "SMS gönderimi kapatılsın mı?",
        message: "Kapatınca hatırlatmalar, kutlamalar ve yeni hastalara giden izin SMS'i dahil hiçbir SMS gönderilmez.",
        confirmText: "SMS'i kapat",
        cancelText: "Vazgeç",
        danger: true,
      });
      if (!ok) return;
    }
    setSavingSms(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsEnabled: on }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(data, "Ayar kaydedilemedi."));
      onStatusChange((current) => (current.sms ? { ...current, sms: { ...current.sms, enabled: on } } : current));
      showToastSafe({ message: on ? "SMS gönderimi açıldı." : "SMS gönderimi kapatıldı.", type: "success" });
    } catch (error) {
      showToastSafe({ title: "Kaydedilemedi", message: error instanceof Error ? error.message : "Ayar kaydedilemedi.", type: "error" });
    } finally {
      setSavingSms(false);
    }
  };

  const balance = status?.sms?.balance;
  const creditBadge = typeof balance === "number" && status?.sms
    ? balance <= 0
      ? <Badge tone="critical">Bitti</Badge>
      : balance < status.sms.lowBalanceThreshold ? <Badge tone="warning">Azaldı</Badge> : undefined
    : undefined;
  const whatsappReason = "Önce WhatsApp numaranızı bağlayın.";

  return (
    <div className="space-y-4">
      {canManageWhatsappConnection && (
        <Section id="whatsapp-baglanti" title="WhatsApp">
          <WhatsappWebConnect onChanged={onConnectionChanged} />
        </Section>
      )}

      {canManageSettings && canManageChannel && status && (
        <Section title="Gönderim kanalı" description="Otomatik ve toplu mesajların tamamı için geçerlidir.">
          <div className="space-y-3">
            <ChoiceCards<ChannelMode>
              label="Gönderim kanalı"
              labelHidden
              columns={3}
              value={mode}
              onChange={(value) => void changeMode(value)}
              options={[
                {
                  value: "WHATSAPP_FALLBACK",
                  label: "Önce WhatsApp, olmazsa SMS",
                  description: "Önerilen. WhatsApp'tan gidemeyen mesaj SMS ile gider.",
                  disabled: Boolean(pendingMode) || (!whatsappConnected && savedMode !== "WHATSAPP_FALLBACK"),
                  disabledReason: whatsappConnected ? undefined : whatsappReason,
                },
                {
                  value: "WHATSAPP",
                  label: "Yalnız WhatsApp",
                  description: "SMS kredisi harcanmaz; WhatsApp'tan gidemeyen mesaj gitmez.",
                  disabled: Boolean(pendingMode) || (!whatsappConnected && savedMode !== "WHATSAPP"),
                  disabledReason: whatsappConnected ? undefined : whatsappReason,
                },
                { value: "SMS", label: "Yalnız SMS", description: "Bütün mesajlar SMS ile gider.", disabled: Boolean(pendingMode) },
              ]}
            />
            {!whatsappConnected && mode !== "SMS" && (
              <Callout tone="warning" compact>WhatsApp numarası bağlı değil; bağlanana kadar WhatsApp mesajları gönderilemez.</Callout>
            )}
          </div>
        </Section>
      )}

      {canManageSettings && (!status || status.sms) && (
        <Section title="SMS" padding="none">
          {status?.sms ? (
            <SettingsList aria-label="SMS ayarları">
              <SettingsRow
                icon={Smartphone}
                title="SMS gönderimi"
                description="İzni olan hastalara gider · her SMS 1 kredi"
                toggle={{
                  checked: status.sms.enabled,
                  disabled: savingSms,
                  label: "Hastalara SMS gönderilsin",
                  onChange: (on) => void toggleSms(on),
                }}
              />
              <SettingsRow
                icon={Coins}
                title="SMS kredisi"
                description={`Kalan ${formatCount(status.sms.balance)} kredi`}
                status={creditBadge}
                actions={<Button variant="secondary" size="sm" onClick={onBuyCredit}>SMS paketi al</Button>}
              />
              {status.sms.sender && (
                <SettingsRow
                  icon={BadgeCheck}
                  title="Gönderen adı"
                  description={status.sms.customSender
                    ? `SMS'ler “${status.sms.sender}” adıyla gider`
                    : `SMS'ler “${status.sms.sender}” adıyla gider · kendi adınızla göndermek için Destek'e yazın (ücretli)`}
                />
              )}
            </SettingsList>
          ) : (
            <ListRowSkeleton variant="row" leading="icon" rows={2} />
          )}
        </Section>
      )}
    </div>
  );
}
