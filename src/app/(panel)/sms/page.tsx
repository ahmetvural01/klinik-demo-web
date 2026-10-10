"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Callout, type CalloutTone } from "@/components/ui/Callout";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { PageHeader, type PageHeaderStat } from "@/components/ui/PageHeader";
import { PageSkeleton, Skeleton } from "@/components/ui/PageSkeleton";
import { Section } from "@/components/ui/Section";
import { Tabs, useTabParam, type TabItem } from "@/components/ui/Tabs";
import { usePermissions } from "@/components/auth/PermissionProvider";
import {
  useCelebrationDays,
  useCommunicationStatus,
  useMessageTemplates,
  type AutomationState,
} from "@/components/sms/communication-status";
import { SMS_CREDIT_REQUEST_HREF, formatCount } from "@/components/sms/communication-labels";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import SendTab from "./_tabs/SendTab";

// En sık açılan bölüm (Mesaj gönder) sayfayla gelir; diğerleri yalnız
// açılınca indirilir (sayfa paketinden ~4 sekmenin hepsi ilk açılışta iniyordu).
const listSkeleton = (rows: number) => (
  <Section padding="none"><ListRowSkeleton variant="row" leading="icon" rows={rows} /></Section>
);
const AutomationsTab = dynamic(() => import("./_tabs/AutomationsTab"), { loading: () => listSkeleton(10) });
const HistoryTab = dynamic(() => import("./_tabs/HistoryTab"), { loading: () => <PageSkeleton header={false} toolbar body="table" rows={8} /> });
const SettingsTab = dynamic(() => import("./_tabs/SettingsTab"), { loading: () => listSkeleton(3) });

type CommunicationTab = "gonder" | "gecmis" | "otomatik" | "ayarlar";

const TAB_LABELS: Record<CommunicationTab, string> = {
  gonder: "Mesaj gönder",
  gecmis: "Gönderim geçmişi",
  otomatik: "Otomatik mesajlar",
  // Genel "Ayarlar" sayfasıyla karışmasın; sekme kanal seçimini ve krediyi yönetir.
  ayarlar: "Kanal ve kredi",
};

// Telefonda (<640 px) dört sekme ekrana sığsın: uzun adlar kısalır
// ("Gönderim geçmişi" ve "Kanal ve kredi" ekran dışında kalıyordu). Kısa ad
// CSS ile seçilir (Tabs shortLabel): ilk karede uzun ad görünüp kısalmaz.
const TAB_SHORT_LABELS: Partial<Record<CommunicationTab, string>> = {
  otomatik: "Otomatik",
  gecmis: "Geçmiş",
  ayarlar: "Kanal",
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
  "kutlama-gunleri": { tab: "otomatik" },
  baglanti: { tab: "ayarlar", anchor: "whatsapp-baglanti" },
  whatsapp: { tab: "ayarlar", anchor: "whatsapp-baglanti" },
};

// aboutCredit: şerit kredi durumunu söylüyor (başlıktaki "Kalan kredi" o sırada yazılmaz).
type PageNotice = { tone: CalloutTone; title: string; text: string; action?: ReactNode; aboutCredit?: boolean };

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
  const canResendConsent = can("patients:write");
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

  const { status, loaded: statusLoaded, error: statusError, reload: reloadStatus, patch: patchStatus } = useCommunicationStatus();
  // Metinler ve özel gün kataloğu sayfada BİR kez yüklenir (Mesaj gönder ve
  // Otomatik mesajlar ortak kullanır); yalnız bu sekmelerden biri açılınca.
  const needsTexts = mountedTabs.has("gonder") || mountedTabs.has("otomatik");
  const templates = useMessageTemplates(needsTexts);
  const celebrations = useCelebrationDays(needsTexts);

  // Hasta dosyasından gelen bağlantı: nesne yalnız adres değişince yenilenir.
  const patientIdParam = searchParams.get("patientId") || "";
  const patientNameParam = searchParams.get("patientName") || "";
  const initialPatient = useMemo<PickedPatient | null>(() => (
    patientIdParam ? { id: patientIdParam, fullName: patientNameParam || "Seçilen hasta" } : null
  ), [patientIdParam, patientNameParam]);

  const sms = status?.sms ?? null;
  const lowCredit = Boolean(sms && sms.balance > 0 && sms.balance < sms.lowBalanceThreshold);
  const noCredit = Boolean(sms && sms.balance <= 0);

  // İstisnai durum TEK şeritte (öncelik sırasıyla); "her şey yolunda"yken hiçbir şey görünmez.
  // "Kanal ve kredi" sekmesi bu durumları kendi satırlarında gösterir; orada şerit çıkmaz.
  const goToSettings = canManageSettings && tab !== "ayarlar" && visibleTabs.includes("ayarlar")
    ? <Button variant="secondary" size="sm" onClick={() => setTab("ayarlar")}>Kanal ve kredi</Button>
    : undefined;
  const notice: PageNotice | null = (() => {
    if (!status || tab === "ayarlar") return null;
    if (sms && !sms.enabled) {
      return { tone: "critical", title: "SMS gönderimi kapalı", text: canManageSettings ? "Hatırlatmalar dahil hiçbir SMS gitmez." : "Hatırlatmalar dahil hiçbir SMS gitmez. Açmayı klinik yöneticisi yapar.", action: goToSettings };
    }
    if (noCredit) {
      return { tone: "critical", title: "SMS krediniz bitti", text: "Kredi yüklenene kadar SMS'ler gitmez.", action: canManageSettings ? <Button variant="secondary" size="sm" href={SMS_CREDIT_REQUEST_HREF}>Kredi iste</Button> : undefined, aboutCredit: true };
    }
    if (lowCredit && sms) {
      // Kalan sayı şeritte yazar; başlıkta ayrıca "Kalan kredi" tekrar etmez.
      return { tone: "warning", title: "SMS krediniz azaldı", text: `${formatCount(sms.balance)} kredi kaldı; bitince SMS'ler gitmez.`, action: canManageSettings ? <Button variant="secondary" size="sm" href={SMS_CREDIT_REQUEST_HREF}>Kredi iste</Button> : undefined, aboutCredit: true };
    }
    if (status.whatsapp && !status.whatsapp.connected && status.defaultChannel === "WHATSAPP") {
      return status.whatsappSmsFallback
        ? { tone: "warning", title: "WhatsApp bağlı değil", text: "Mesajlar SMS ile gidiyor.", action: goToSettings }
        : { tone: "critical", title: "WhatsApp bağlı değil", text: "Kanal “Yalnız WhatsApp” olduğu için mesajlar gitmiyor.", action: goToSettings };
    }
    if (!status.consentLink.ready && canManageSettings) {
      return { tone: "critical", title: "İzin bağlantısı hastanın telefonunda açılmıyor", text: "Yeni hastalar SMS izni veremez; sistem yöneticinize bildirin." };
    }
    return null;
  })();

  // Durum bilgisi tek yerde: kredi ve WhatsApp başlıkta; "Kanal ve kredi"
  // sekmesinde ayrıntısıyla durduğu için orada başlıkta tekrar yazılmaz.
  // Kredi bitti/azaldı şeridi görünürken başlıktaki "Kalan kredi" tekrar
  // etmez (sadelik K6: aynı bilgi iki yerde yazmaz).
  // Değer gelmeden önce yer tutucu: başlık sonradan kaymaz, "0" görünmez.
  const stats: PageHeaderStat[] = [];
  if (tab !== "ayarlar") {
    if (canReadSms && (sms || !statusLoaded) && !notice?.aboutCredit) {
      stats.push({
        label: "Kalan kredi",
        value: sms ? `${formatCount(sms.balance)}${noCredit ? " (bitti)" : lowCredit ? " (az)" : ""}` : <Skeleton className="inline-block h-3 w-10 align-middle" />,
        color: noCredit || lowCredit ? "text-red-700" : undefined,
      });
    }
    if (canReadWhatsapp && (status?.whatsapp || !statusLoaded)) {
      stats.push({
        label: "WhatsApp",
        value: status?.whatsapp ? (status.whatsapp.connected ? "Bağlı" : "Bağlı değil") : <Skeleton className="inline-block h-3 w-12 align-middle" />,
        color: status?.whatsapp?.connected ? "text-emerald-700" : status?.whatsapp ? "text-slate-600" : undefined,
      });
    }
  }

  const tabItems: TabItem<CommunicationTab>[] = visibleTabs.map((key) => ({ key, label: TAB_LABELS[key], shortLabel: TAB_SHORT_LABELS[key] }));

  const panel = (key: CommunicationTab, content: ReactNode) => (
    mountedTabs.has(key) && visibleTabs.includes(key) ? (
      <div key={key} id={`iletisim-${key}`} role="tabpanel" aria-label={TAB_LABELS[key]} hidden={tab !== key}>
        {content}
      </div>
    ) : null
  );

  const onAutomationsChange = (next: AutomationState) => patchStatus((current) => ({ ...current, automations: next }));

  return (
    <div className="space-y-4">
      <PageHeader icon="sms" title="İletişim" stats={stats} />

      {tabItems.length > 1 && (
        <Tabs ariaLabel="İletişim bölümleri" items={tabItems} value={tab} onChange={setTab} panelIdPrefix="iletisim" />
      )}

      {statusError && !status && (
        <LoadErrorState compact message={statusError} onRetry={() => void reloadStatus()} />
      )}
      {/* Tek satırlık şerit (sadelik K7): kalın kısa başlık + tek cümle, yanında eylem. */}
      {notice && (
        <Callout tone={notice.tone} compact inline action={notice.action}>
          <span className="font-semibold">{notice.title}.</span> {notice.text}
        </Callout>
      )}

      {panel("gonder", (
        <SendTab
          status={status}
          templates={templates}
          celebrations={celebrations}
          canSingle={canWriteSms}
          canBulk={canBulk}
          canReadSms={canReadSms}
          canWriteWhatsapp={canWriteWhatsapp}
          canDeleteTexts={canResetTexts}
          canResendConsent={canResendConsent}
          initialPatient={initialPatient}
          onSent={() => void reloadStatus()}
        />
      ))}
      {panel("gecmis", <HistoryTab showChannel={canReadWhatsapp} canResendConsent={canResendConsent} />)}
      {panel("otomatik", (
        <AutomationsTab
          status={status}
          templates={templates}
          celebrations={celebrations}
          canManageAutomations={canManageSettings}
          canWriteSms={canWriteSms}
          canWriteWhatsapp={canWriteWhatsapp}
          canResetTexts={canResetTexts}
          canToggleCelebrations={canBulk}
          onAutomationsChange={onAutomationsChange}
        />
      ))}
      {panel("ayarlar", (
        <SettingsTab
          status={status}
          canManageSettings={canManageSettings}
          canManageChannel={canManageChannel}
          canManageWhatsappConnection={canManageWhatsappConnection}
          onStatusChange={patchStatus}
          onConnectionChanged={() => void reloadStatus()}
        />
      ))}
    </div>
  );
}
