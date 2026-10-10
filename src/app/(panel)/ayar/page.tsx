"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";
import { cachedGet, invalidateCachedGet } from "@/lib/client-cache";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSkeleton } from "@/components/ui/PageSkeleton";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { SaveBar } from "@/components/ui/SaveBar";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { usePermissions } from "@/components/auth/PermissionProvider";
import KlinikTab from "./_tabs/KlinikTab";
import { IlgiliAyarlar } from "./_tabs/DigerAyarlar";
import {
  EMPTY_SETTINGS_FORM,
  normalizeSettingsForm,
  settingsFormError,
  settingsFormFromApi,
  settingsPayload,
  type ClinicSettingsForm,
  type ContactField,
} from "./_tabs/settings-form";

// Açılmayan sekmelerin kodu ilk açılışta indirilmez (sekme başına ayrı parça).
const RandevuAraligi = dynamic(() => import("./_tabs/RandevuAraligi"), { ssr: false });
const RandevuTurleri = dynamic(() => import("./_tabs/TedaviTurleriTab"), { ssr: false });
const KoltukOda = dynamic(() => import("./_tabs/UnitelerTab"), { ssr: false });
const PosTab = dynamic(() => import("./_tabs/PosTab"), { ssr: false });
const FiyatPage = dynamic(() => import("../fiyat/page"), { ssr: false });

// Üç sekme: kliniğin kendisi (bilgiler + çalışma saatleri, tek form), randevu
// formunu besleyen tanımlar, tahsilatı besleyen tanımlar. Önceden 7 düz sekme
// vardı; mobilde yatay kaydırma gerekiyordu.
const TABS = [
  { key: "klinik", label: "Klinik" },
  { key: "randevu", label: "Randevu" },
  { key: "fiyat", label: "Fiyat ve ödeme" },
] as const;

type SettingsTab = (typeof TABS)[number]["key"];
type PriceListTab = "fiyat" | "pos";

// Eski sekme adresleri (yer imleri, başka ekranların bağlantıları — ör. tahsilat
// formundaki "/ayar?tab=pos") yeni sekmeye/bölüme yönlenir.
const TAB_ALIASES: Record<string, { tab: SettingsTab; liste?: PriceListTab; anchor?: string }> = {
  genel: { tab: "klinik" },
  calisma: { tab: "klinik", anchor: "calisma-saatleri" },
  tedavi: { tab: "randevu" },
  uniteler: { tab: "randevu", anchor: "koltuk-oda" },
  pos: { tab: "fiyat", liste: "pos" },
  paket: { tab: "fiyat" },
  paketler: { tab: "fiyat" },
};

type BranchInfo = { activeName: string; branchCount: number };
type ServerFieldError = { field: ContactField; message: string } | null;

const CONTACT_FIELDS: ContactField[] = ["institutionName", "institutionPhone", "institutionAddress", "institutionWebsite", "reviewLink"];

function goTo(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusTarget = element.matches("input, textarea, select, [tabindex]") ? element : element.querySelector<HTMLElement>("input, textarea, select");
  focusTarget?.focus({ preventScroll: true });
}

export default function AyarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const canWriteSettings = can("settings:write");
  const canReadPrices = can("prices:read");
  const canReadUnits = can("appointments:read");

  const rawTab = searchParams.get("tab") || "";
  const alias = TAB_ALIASES[rawTab];
  const tabKeys = useMemo(() => TABS.map((tab) => tab.key), []);
  const [paramTab, setActiveTab] = useTabParam<SettingsTab>(tabKeys, "klinik");
  const activeTab: SettingsTab = alias ? alias.tab : paramTab;

  const priceListKeys = useMemo<PriceListTab[]>(() => (canReadPrices ? ["fiyat", "pos"] : ["pos"]), [canReadPrices]);
  const [paramList, setPriceList] = useTabParam<PriceListTab>(priceListKeys, priceListKeys[0], "liste");
  const priceList: PriceListTab = alias?.liste && priceListKeys.includes(alias.liste) ? alias.liste : paramList;

  // Şube erişimi Personel sayfasına taşındı; eski adres oraya gider.
  useEffect(() => {
    if (rawTab === "subeler") router.replace("/personel?tab=erisim");
  }, [rawTab, router]);

  // Eski sekme adı adres çubuğunda yeni adla değiştirilir ve ilgili bölüme gidilir.
  useEffect(() => {
    if (!alias) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", alias.tab);
    if (alias.liste) params.set("liste", alias.liste);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    if (alias.anchor) {
      const anchor = alias.anchor;
      window.setTimeout(() => goTo(anchor), 600);
    }
  }, [alias, searchParams]);

  // Bir kez açılan sekme yerinde kalır (geri dönünce yeniden yüklenmez);
  // açılmayan sekmenin verisi hiç istenmez.
  const [visited, setVisited] = useState<Set<SettingsTab>>(() => new Set([activeTab]));
  useEffect(() => {
    setVisited((current) => (current.has(activeTab) ? current : new Set(current).add(activeTab)));
  }, [activeTab]);

  const [branchInfo, setBranchInfo] = useState<BranchInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    cachedGet<{ branches?: unknown[]; activeBranch?: { name?: string } } | null>("/api/branches", 60_000)
      .then((data) => {
        if (cancelled || !data) return;
        setBranchInfo({ activeName: data.activeBranch?.name || "", branchCount: Array.isArray(data.branches) ? data.branches.length : 1 });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const multiBranch = Boolean(branchInfo && branchInfo.branchCount > 1);
  // Kapsam yalnız çok şubeli kurumda bölüm başlığında rozetle gösterilir.
  const allBranchesBadge = multiBranch ? <Badge tone="neutral">Tüm şubeler</Badge> : null;
  const branchBadge = multiBranch ? <Badge tone="info">Yalnız: {branchInfo?.activeName || "açık şube"}</Badge> : null;

  // ---- Klinik formu (tek kayıt, tek kaydet çubuğu) ----
  const [form, setForm] = useState<ClinicSettingsForm>(EMPTY_SETTINGS_FORM);
  const [savedForm, setSavedForm] = useState<ClinicSettingsForm>(EMPTY_SETTINGS_FORM);
  const [institutionSlug, setInstitutionSlug] = useState("");
  const [loginInstitutionName, setLoginInstitutionName] = useState("");
  const [bookingLink, setBookingLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<ServerFieldError>(null);

  const dirty = canWriteSettings && loaded && JSON.stringify(form) !== JSON.stringify(savedForm);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setLoadError(data?.message || "Ayarlar yüklenemedi.");
        return;
      }
      const next = settingsFormFromApi(data);
      setForm(next);
      setSavedForm(next);
      setLoaded(true);
      setInstitutionSlug(typeof data.institutionSlug === "string" ? data.institutionSlug : "");
      setLoginInstitutionName(typeof data.loginInstitutionName === "string" ? data.loginInstitutionName : "");
    } catch {
      setLoadError("Ayarlar yüklenemedi. Bağlantınızı kontrol edin.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Klinik bilgileri (logo dahil büyük yanıt) yalnız Klinik sekmesi açılınca okunur.
  const klinikVisited = visited.has("klinik");
  useEffect(() => {
    if (klinikVisited && !loaded && !loadError) void fetchSettings();
  }, [fetchSettings, klinikVisited, loaded, loadError]);

  useEffect(() => {
    if (!institutionSlug) return;
    setBookingLink(`${window.location.origin}/randevu-al/${encodeURIComponent(institutionSlug)}`);
  }, [institutionSlug]);

  // Kaydedilmemiş klinik bilgisiyle sayfadan çıkılırken (tarayıcıyı kapatma
  // ya da menüden başka sayfaya geçme) onay istenir. Önceden yalnız tarayıcı
  // uyarıyordu; menüden çıkınca değişiklikler sessizce kayboluyordu.
  useUnsavedChangesGuard(dirty, {
    message: "Klinik bilgileri ve çalışma saatlerinde kaydetmediğiniz değişiklikler kaybolur.",
  });

  const updateForm = (patch: Partial<ClinicSettingsForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    if (serverError && serverError.field in patch) setServerError(null);
  };

  const saveSettings = async (allowOutsideAppointments = false) => {
    const error = settingsFormError(form);
    if (error) {
      // Hata, sekme değiştirmeden ilgili alanın/günün yanında gösterilir.
      setShowErrors(true);
      goTo(error.targetId);
      showToastSafe({ title: "Kaydedilemedi", message: error.message, type: "error" });
      return;
    }
    const next = normalizeSettingsForm(form);
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settingsPayload(next), ...(allowOutsideAppointments ? { allowOutsideAppointments: true } : {}) }),
      });
      const result = await response.json().catch(() => null);
      if (response.status === 409 && result?.requiresConfirmation) {
        setSaving(false);
        if (await confirmDialog({
          title: "Bazı randevular kapalı saate düşüyor",
          message: `${result.message} Önce Randevular'dan bu randevuları taşımanız önerilir.`,
          confirmText: "Yine de kaydet",
          cancelText: "Vazgeç",
        })) await saveSettings(true);
        return;
      }
      if (!response.ok) {
        const field = typeof result?.field === "string" && (CONTACT_FIELDS as string[]).includes(result.field) ? (result.field as ContactField) : null;
        if (field) {
          setServerError({ field, message: result.message });
          goTo(`ayar-${field}`);
        }
        showToastSafe({ title: "Kaydedilemedi", message: result?.message || "Ayarlar kaydedilemedi.", type: "error" });
        return;
      }
      const brandChanged = next.institutionName !== savedForm.institutionName || next.logoUrl !== savedForm.logoUrl;
      setForm(next);
      setSavedForm(next);
      setShowErrors(false);
      setServerError(null);
      // Takvim bu ayarları önbellekten okur; yeni saatler hemen geçerli olsun.
      invalidateCachedGet("/api/appointments/calendar-settings");
      showToastSafe({ message: "Ayarlar kaydedildi.", type: "success" });
      // Menüdeki ad/logo yalnız değiştiyse yenilenir (her kayıtta logolu tam yanıt
      // çekilmesin). Yeni ad olayla birlikte gider: menü adı yeniden istemeden yazabilir.
      if (brandChanged) window.dispatchEvent(new CustomEvent("clinic-brand-change", { detail: { name: next.institutionName } }));
    } catch {
      showToastSafe({ title: "Kaydedilemedi", message: "Bağlantınızı kontrol edip tekrar deneyin.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = async () => {
    if (!(await confirmDialog({
      title: "Değişiklikler geri alınsın mı?",
      message: "Kaydetmediğiniz klinik bilgileri ve çalışma saati değişiklikleri son kaydedilen haline döner.",
      confirmText: "Geri al",
    }))) return;
    setForm(savedForm);
    setShowErrors(false);
    setServerError(null);
  };

  const panel = (key: SettingsTab, content: ReactNode) => (
    visited.has(key) ? (
      <div key={key} role="tabpanel" id={`ayar-panel-${key}`} aria-label={TABS.find((tab) => tab.key === key)?.label} hidden={activeTab !== key} className="space-y-4">
        {content}
      </div>
    ) : null
  );

  return (
    <section className="space-y-4">
      <PageHeader
        icon="settings"
        title="Ayarlar"
        description={canWriteSettings ? undefined : "Yalnız görüntüleme — değişiklik için klinik yöneticisine başvurun."}
      />

      <Tabs
        ariaLabel="Ayar bölümleri"
        // Kaydedilmemiş klinik formu sekme adının yanında işaretle gösterilir (SaveBar yalnız Klinik'te).
        items={TABS.map((tab) => ({ key: tab.key, label: tab.label, marker: tab.key === "klinik" && dirty ? "unsaved" as const : undefined }))}
        value={activeTab}
        onChange={setActiveTab}
        panelIdPrefix="ayar-panel"
      />

      {dirty && activeTab !== "klinik" && (
        <Callout
          tone="warning"
          compact
          action={<Button size="sm" variant="secondary" onClick={() => setActiveTab("klinik")}>Klinik&apos;e dön</Button>}
        >
          Klinik sekmesinde kaydedilmemiş değişiklik var.
        </Callout>
      )}

      {panel("klinik", loading && !loaded ? (
        <FormSkeleton fields={6} columns={2} footer={false} />
      ) : loadError && !loaded ? (
        <LoadErrorState message={loadError} onRetry={() => void fetchSettings()} />
      ) : (
        <KlinikTab
          form={form}
          onChange={updateForm}
          canWrite={canWriteSettings}
          bookingLink={bookingLink}
          loginInstitutionName={loginInstitutionName}
          showErrors={showErrors}
          serverError={serverError}
          scopeBadge={allBranchesBadge}
          footer={<IlgiliAyarlar />}
        />
      ))}

      {panel("randevu", (
        <>
          <RandevuAraligi canWrite={canWriteSettings} />
          <RandevuTurleri canWrite={canWriteSettings} scopeBadge={allBranchesBadge} />
          {canReadUnits && (
            <div id="koltuk-oda" className="scroll-mt-4">
              <KoltukOda canWrite={canWriteSettings} scopeBadge={branchBadge} />
            </div>
          )}
        </>
      ))}

      {panel("fiyat", (
        <>
          {priceListKeys.length > 1 && (
            <Tabs
              ariaLabel="Fiyat ve ödeme bölümleri"
              size="sm"
              items={[{ key: "fiyat" as const, label: "Fiyat listesi" }, { key: "pos" as const, label: "POS cihazları" }]}
              value={priceList}
              onChange={setPriceList}
            />
          )}
          {priceList === "fiyat" && canReadPrices ? <FiyatPage /> : <PosTab canWrite={canWriteSettings} scopeBadge={branchBadge} />}
        </>
      ))}

      {activeTab === "klinik" && (
        <SaveBar
          dirty={dirty}
          saving={saving}
          onSave={() => void saveSettings()}
          onDiscard={() => void discardChanges()}
        />
      )}
    </section>
  );
}
