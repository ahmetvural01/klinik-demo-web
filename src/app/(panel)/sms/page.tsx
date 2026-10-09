"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader, type PageHeaderStat } from "@/components/ui/PageHeader";
import { Tabs, useTabParam, type TabItem } from "@/components/ui/Tabs";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { useCommunicationStatus } from "@/components/sms/communication-status";
import { formatCount } from "@/components/sms/communication-labels";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import SendTab from "./_tabs/SendTab";
import HistoryTab from "./_tabs/HistoryTab";
import AutomationsTab from "./_tabs/AutomationsTab";
import SettingsTab from "./_tabs/SettingsTab";

type CommunicationTab = "gonder" | "gecmis" | "otomatik" | "ayarlar";

const TAB_LABELS: Record<CommunicationTab, string> = {
  gonder: "Mesaj Gönder",
  gecmis: "Gönderim Geçmişi",
  otomatik: "Otomatik Mesajlar",
  ayarlar: "Ayarlar",
};

// Panelde WhatsApp sohbet ekranı yok (klinik sahibinin kararı): gelen mesajlar
// sisteme alınmaz; yalnız giden mesajların kaydı Gönderim Geçmişi'nde görünür.
const TAB_ORDER: CommunicationTab[] = ["gonder", "otomatik", "gecmis", "ayarlar"];

// Eski sekme adresleri (yer imleri, ana sayfa görevleri, başka modüllerin
// bağlantıları) yeni bölümlere yönlenir. Bazıları sayfada ilgili yere kaydırır.
const TAB_ALIASES: Record<string, { tab: CommunicationTab; anchor?: string }> = {
  kayitlar: { tab: "gecmis" },
  toplu: { tab: "gonder" },
  sablonlar: { tab: "otomatik" },
  "kutlama-gunleri": { tab: "otomatik", anchor: "ozel-gunler" },
  baglanti: { tab: "ayarlar", anchor: "whatsapp-baglanti" },
  whatsapp: { tab: "ayarlar", anchor: "whatsapp-baglanti" },
};

export default function SmsPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can, hasFeature, role } = usePermissions();
  const whatsappFeature = hasFeature("whatsapp");
  const canReadSms = can("sms:read");
  const canWriteSms = can("sms:write");
  const canBulk = can("sms:bulk");
  const canReadWhatsapp = whatsappFeature && can("whatsapp:read");
  const canWriteWhatsapp = whatsappFeature && can("whatsapp:write");
  const canManageWhatsappConnection = canWriteWhatsapp && (role === "YONETICI" || role === "SUPERADMIN");
  const canManageSettings = canWriteSms && can("settings:read") && can("settings:write");
  const canManageChannel = canManageSettings && canWriteWhatsapp;
  const canResetTexts = canWriteSms && (!whatsappFeature || canWriteWhatsapp);
  const canSend = canWriteSms || canBulk;

  const visibleTabs = useMemo(() => TAB_ORDER.filter((key) => (
    key === "gonder" ? canSend
      : key === "gecmis" ? canReadSms
        : key === "otomatik" ? canReadSms || canReadWhatsapp
          : canManageSettings || canManageWhatsappConnection
  )), [canManageSettings, canManageWhatsappConnection, canReadSms, canReadWhatsapp, canSend]);
  const fallback: CommunicationTab = visibleTabs[0] || "otomatik";
  const [paramTab, setTab] = useTabParam<CommunicationTab>(visibleTabs, fallback);
  const rawTab = searchParams.get("tab") || "";
  const alias = TAB_ALIASES[rawTab];
  const tab: CommunicationTab = alias && visibleTabs.includes(alias.tab) ? alias.tab : paramTab;

  // Eski adres → yeni adres (geri tuşu ve yenileme aynı bölümü açsın). Sunucuya
  // gitmeden yalnız adres çubuğu düzeltilir (Next useSearchParams ile uyumlu).
  useEffect(() => {
    if (!alias) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", visibleTabs.includes(alias.tab) ? alias.tab : fallback);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    if (alias.anchor) {
      const anchor = alias.anchor;
      window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }), 600);
    }
  }, [alias, fallback, pathname, searchParams, visibleTabs]);

  // Ziyaret edilen bölümler bağlı kalır (yazılmış mesaj, seçilmiş hastalar
  // başka bölüme bakıp dönünce kaybolmasın); yalnız seçili olan görünür.
  const [mountedTabs, setMountedTabs] = useState<Set<CommunicationTab>>(() => new Set([tab]));
  useEffect(() => {
    setMountedTabs((current) => (current.has(tab) ? current : new Set([...current, tab])));
  }, [tab]);

  const { status, reload: reloadStatus } = useCommunicationStatus();

  const initialPatient = useMemo<PickedPatient | null>(() => {
    const id = searchParams.get("patientId");
    if (!id) return null;
    return { id, fullName: searchParams.get("patientName") || "Seçilen hasta" };
  }, [searchParams]);

  const stats: PageHeaderStat[] = [];
  if (status?.sms) {
    const low = status.sms.balance < status.sms.lowBalanceThreshold;
    stats.push({ label: "SMS", value: status.sms.enabled ? "Açık" : "Kapalı", color: status.sms.enabled ? "text-emerald-700" : "text-red-700" });
    stats.push({ label: "Kalan kredi", value: formatCount(status.sms.balance), color: low ? "text-red-700" : undefined });
  }
  if (status?.whatsapp) {
    stats.push({ label: "WhatsApp", value: status.whatsapp.connected ? "Bağlı" : "Bağlı değil", color: status.whatsapp.connected ? "text-emerald-700" : "text-slate-600" });
  }

  const tabItems: TabItem<CommunicationTab>[] = visibleTabs.map((key) => ({ key, label: TAB_LABELS[key] }));

  const panel = (key: CommunicationTab, content: ReactNode) => (
    mountedTabs.has(key) && visibleTabs.includes(key) ? (
      <div key={key} id={`iletisim-${key}`} role="tabpanel" aria-label={TAB_LABELS[key]} hidden={tab !== key}>
        {content}
      </div>
    ) : null
  );

  return (
    <div className="space-y-4">
      <PageHeader
        icon="sms"
        title="İletişim"
        description="Hastalara WhatsApp veya SMS ile mesaj gönderin, otomatik mesajları yönetin."
        stats={stats}
        actions={canSend && tab !== "gonder" ? <Button icon={Send} onClick={() => setTab("gonder")}>Mesaj gönder</Button> : undefined}
      />

      {tabItems.length > 1 && (
        <Tabs ariaLabel="İletişim bölümleri" items={tabItems} value={tab} onChange={setTab} panelIdPrefix="iletisim" />
      )}

      {panel("gonder", (
        <SendTab
          status={status}
          canSingle={canWriteSms}
          canBulk={canBulk}
          canReadSms={canReadSms}
          canWriteWhatsapp={canWriteWhatsapp}
          canDeleteTexts={canResetTexts}
          initialPatient={initialPatient}
          onSent={() => void reloadStatus()}
        />
      ))}
      {panel("gecmis", <HistoryTab showChannel={canReadWhatsapp} canResendConsent={can("patients:write")} />)}
      {panel("otomatik", (
        <AutomationsTab
          status={status}
          canManageAutomations={canManageSettings}
          canWriteSms={canWriteSms}
          canReadWhatsapp={canReadWhatsapp}
          canWriteWhatsapp={canWriteWhatsapp}
          canResetTexts={canResetTexts}
          canToggleCelebrations={canBulk}
          onSettingsSaved={() => void reloadStatus()}
        />
      ))}
      {panel("ayarlar", (
        <SettingsTab
          status={status}
          canManageSettings={canManageSettings}
          canManageChannel={canManageChannel}
          canManageWhatsappConnection={canManageWhatsappConnection}
          onChanged={() => void reloadStatus()}
        />
      ))}
    </div>
  );
}
