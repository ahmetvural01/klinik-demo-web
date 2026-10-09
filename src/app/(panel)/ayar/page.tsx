"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { invalidateCachedGet } from "@/lib/client-cache";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { SaveBar } from "@/components/ui/SaveBar";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import PanelLoading from "@/components/ui/PanelLoading";
import { usePermissions } from "@/components/auth/PermissionProvider";
import FiyatPage from "../fiyat/page";
import GenelTab from "./_tabs/GenelTab";
import CalismaTab from "./_tabs/CalismaTab";
import PosTab from "./_tabs/PosTab";
import TedaviTurleriTab from "./_tabs/TedaviTurleriTab";
import UnitelerTab from "./_tabs/UnitelerTab";
import SubelerTab from "./_tabs/SubelerTab";
import { DigerAyarlar } from "./_tabs/DigerAyarlar";
import {
  EMPTY_SETTINGS_FORM,
  settingsFormError,
  settingsFormFromApi,
  settingsPayload,
  type ClinicSettingsForm,
} from "./_tabs/settings-form";

// Sekme sırası kullanım sıklığına göre: önce kliniğin kendi bilgileri ve
// randevu saatleri, sonra randevu/tedavi listeleri, en sonda nadiren
// değişenler. Anahtarlar (?tab=...) eski bağlantılar bozulmasın diye korunur.
// `scope`: ayarın kurumun tüm şubelerinde mi yoksa yalnız açık şubede mi
// geçerli olduğu (yalnız birden çok şubesi olanlara gösterilir).
const TABS = [
  { key: "genel", label: "Klinik Bilgileri", scope: "all" },
  { key: "calisma", label: "Çalışma Saatleri", scope: "all" },
  { key: "tedavi", label: "Tedavi Türleri", scope: "all" },
  { key: "fiyat", label: "Fiyat Listesi", scope: "all" },
  { key: "uniteler", label: "Tedavi Alanları", scope: "branch" },
  { key: "pos", label: "POS Cihazları", scope: "branch" },
  { key: "subeler", label: "Şube Erişimi", scope: "branch" },
] as const;

type SettingsTab = (typeof TABS)[number]["key"];
type BranchInfo = { activeName: string; branchCount: number };

export default function AyarPage() {
  const { can } = usePermissions();
  const canWriteSettings = can("settings:write");
  const canAssignBranches = can("branches:assign");
  const [branchInfo, setBranchInfo] = useState<BranchInfo | null>(null);
  // Şube Erişimi yalnız başka şubede çalışan personel varsa anlamlıdır;
  // tek şubeli klinikte boş bir sekme olarak kafa karıştırıyordu.
  const [hasOtherBranches, setHasOtherBranches] = useState(false);

  const visibleTabs = useMemo(() => TABS.filter((tab) =>
    (tab.key !== "subeler" || (canAssignBranches && hasOtherBranches))
    && (tab.key !== "fiyat" || can("prices:read"))
    && (tab.key !== "pos" || canWriteSettings)
    && (tab.key !== "uniteler" || can("appointments:read"))
  ), [can, canAssignBranches, canWriteSettings, hasOtherBranches]);
  const tabKeys = useMemo(() => visibleTabs.map((tab) => tab.key), [visibleTabs]);
  const [activeTab, setActiveTab] = useTabParam<SettingsTab>(tabKeys, "genel");

  const [form, setForm] = useState<ClinicSettingsForm>(EMPTY_SETTINGS_FORM);
  const [savedForm, setSavedForm] = useState<ClinicSettingsForm>(EMPTY_SETTINGS_FORM);
  const [institutionSlug, setInstitutionSlug] = useState("");
  const [loginInstitutionName, setLoginInstitutionName] = useState("");
  const [bookingLink, setBookingLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = canWriteSettings && !loading && !loadError && JSON.stringify(form) !== JSON.stringify(savedForm);

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
      setInstitutionSlug(typeof data.institutionSlug === "string" ? data.institutionSlug : "");
      setLoginInstitutionName(typeof data.loginInstitutionName === "string" ? data.loginInstitutionName : "");
    } catch {
      setLoadError("Ayarlar yüklenemedi. Bağlantınızı kontrol edin.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSettings(); }, [fetchSettings]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/branches", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then(async (data) => {
        if (cancelled || !data) return;
        const branchCount = Array.isArray(data.branches) ? data.branches.length : 1;
        setBranchInfo({ activeName: data.activeBranch?.name || "", branchCount });
        if (!canAssignBranches) return;
        if (branchCount > 1) {
          setHasOtherBranches(true);
          return;
        }
        // Yönetici yalnız bir şubeye bağlı olsa da kurumda başka şube ve o
        // şubelerin personeli olabilir: erişim listesinden anlaşılır.
        const manage = await fetch("/api/branches?manage=1", { cache: "no-store" }).then((response) => (response.ok ? response.json() : null)).catch(() => null);
        if (cancelled || !Array.isArray(manage?.staff)) return;
        const branchId = manage.branch?.id;
        setHasOtherBranches(manage.staff.some((member: { homeBranch?: { id: string } | null }) => member.homeBranch && member.homeBranch.id !== branchId));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [canAssignBranches]);

  useEffect(() => {
    if (!institutionSlug) return;
    setBookingLink(`${window.location.origin}/randevu-al/${encodeURIComponent(institutionSlug)}`);
  }, [institutionSlug]);

  // Kaydedilmemiş değişiklikle sayfadan çıkılırken tarayıcı uyarsın.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const updateForm = (patch: Partial<ClinicSettingsForm>) => setForm((current) => ({ ...current, ...patch }));

  const saveSettings = async (allowOutsideAppointments = false) => {
    const error = settingsFormError(form);
    if (error) {
      // Randevu süresi ve gün saatleri aynı sekmede; hata satırda kırmızı görünür.
      setActiveTab("calisma");
      showToastSafe({ title: "Kaydedilemedi", message: error, type: "error" });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settingsPayload(form), ...(allowOutsideAppointments ? { allowOutsideAppointments: true } : {}) }),
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
        showToastSafe({ title: "Kaydedilemedi", message: result?.message || "Ayarlar kaydedilemedi.", type: "error" });
        return;
      }
      setSavedForm(form);
      // Takvim bu ayarları önbellekten okur; yeni saatler hemen geçerli olsun.
      invalidateCachedGet("/api/appointments/calendar-settings");
      showToastSafe({ message: "Ayarlar kaydedildi.", type: "success" });
      window.dispatchEvent(new Event("clinic-brand-change"));
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
  };

  const showsSettingsForm = activeTab === "genel" || activeTab === "calisma";
  const activeScope = TABS.find((tab) => tab.key === activeTab)?.scope;
  const scopeText = branchInfo && branchInfo.branchCount > 1
    ? activeScope === "branch"
      ? `Bu bölümdeki kayıtlar yalnız ${branchInfo.activeName || "açık şube"} için geçerlidir. Başka şube için üstten şubeyi değiştirin.`
      : "Bu bölümdeki ayarlar kurumunuzun tüm şubelerinde geçerlidir."
    : null;

  return (
    <section className="space-y-4">
      <PageHeader
        icon="settings"
        title="Ayarlar"
        description="Klinik bilgileri, çalışma saatleri, tedavi türleri, fiyatlar ve cihazlar."
      />

      <Tabs
        ariaLabel="Ayar bölümleri"
        items={visibleTabs.map((tab) => ({ key: tab.key, label: tab.label }))}
        value={activeTab}
        onChange={setActiveTab}
      />

      {scopeText && <p className="text-xs font-medium text-slate-500">{scopeText}</p>}

      {showsSettingsForm && !canWriteSettings && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          Bu bilgileri yalnız görüntüleyebilirsiniz. Değişiklik için klinik yöneticisine başvurun.
        </p>
      )}

      {showsSettingsForm && loading && <PanelLoading />}
      {showsSettingsForm && !loading && loadError && (
        <LoadErrorState message={loadError} onRetry={() => void fetchSettings()} />
      )}

      {activeTab === "genel" && !loading && !loadError && (
        <GenelTab form={form} onChange={updateForm} canWrite={canWriteSettings} bookingLink={bookingLink} loginInstitutionName={loginInstitutionName} />
      )}

      {activeTab === "calisma" && !loading && !loadError && (
        <CalismaTab form={form} onChange={updateForm} canWrite={canWriteSettings} />
      )}

      {activeTab === "tedavi" && <TedaviTurleriTab canWrite={canWriteSettings} />}

      {activeTab === "fiyat" && <FiyatPage />}

      {activeTab === "uniteler" && <UnitelerTab />}

      {activeTab === "pos" && <PosTab canWrite={canWriteSettings} />}

      {activeTab === "subeler" && canAssignBranches && <SubelerTab />}

      <DigerAyarlar />

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void saveSettings()}
        onDiscard={() => void discardChanges()}
        message={showsSettingsForm ? "Kaydedilmemiş değişiklik var" : "Klinik bilgileri veya çalışma saatlerinde kaydedilmemiş değişiklik var"}
      />
    </section>
  );
}
