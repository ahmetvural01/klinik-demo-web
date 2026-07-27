"use client";

import { useEffect, useState } from "react";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import FiyatPage from "../fiyat/page";
import UnitelerTab from "./_tabs/UnitelerTab";

type PosDevice = { id: string; name: string; isActive: boolean; createdAt: string };
type TreatmentType = { id: string; value: string; label: string; color: string; order: number; isActive: boolean };

type DaySchedule = {
  day: string;
  isHoliday: boolean;
  open: string;
  close: string;
  lunchStart: string;
  lunchEnd: string;
};

const DAYS = ["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"];
const TABS = [
  { id: "genel", label: "Genel Ayarlar" },
  { id: "calisma", label: "Çalışma Saatleri" },
  { id: "fiyat", label: "Fiyat Listesi" },
  { id: "pos", label: "POS Cihazları" },
  { id: "tedavi", label: "Tedavi Türleri" },
  { id: "uniteler", label: "Klinik Üniteleri" },
] as const;

type SettingsTab = (typeof TABS)[number]["id"];

const DEFAULT_SCHEDULES: DaySchedule[] = DAYS.map(day => ({
  day,
  isHoliday: day === "Pazar",
  open: "08:30",
  close: day === "Cumartesi" ? "15:00" : "18:00",
  lunchStart: "",
  lunchEnd: "",
}));

export default function AyarPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("genel");
  const [settings, setSettings] = useState({
    institutionName: "Adana White Dental Clinic",
    institutionAddress: "Çukurova/Adana",
    institutionPhone: "",
    openingTime: "08:30",
    closingTime: "23:59",
    appointmentDuration: 15,
    institutionWebsite: "",
    logoUrl: "",
    lunchStart: "",
    lunchEnd: "",
    dailySchedules: DEFAULT_SCHEDULES as DaySchedule[],
    smsEnabled: true,
    smsDefaultInfo: true,
    smsDefaultReminder: false,
    smsDefaultSurvey: false,
    paymentReminderSmsEnabled: false,
    paymentReminderWindowDays: 3,
    reviewLink: "",
    birthdaySmsEnabled: false
  });
  const [institutionSlug, setInstitutionSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const showToast = (type: "success" | "error", text: string) => {
    showToastSafe({ message: text, type });
  };

  // POS cihazları
  const [posDevices, setPosDevices] = useState<PosDevice[]>([]);
  const [posLoading, setPosLoading] = useState(false);
  const [newPosName, setNewPosName] = useState("");
  const [addingPos, setAddingPos] = useState(false);
  const [editingPos, setEditingPos] = useState<{ id: string; name: string } | null>(null);
  const [savingPos, setSavingPos] = useState(false);

  // Tedavi türleri
  const [treatmentTypes, setTreatmentTypes] = useState<TreatmentType[]>([]);
  const [treatmentLoading, setTreatmentLoading] = useState(false);
  const [newTreatmentLabel, setNewTreatmentLabel] = useState("");
  const [newTreatmentColor, setNewTreatmentColor] = useState("#2563eb");
  const [addingTreatment, setAddingTreatment] = useState(false);
  const [editingTreatment, setEditingTreatment] = useState<{ id: string; label: string; color: string } | null>(null);
  const [savingTreatment, setSavingTreatment] = useState(false);

  // İlk açılışta kurum ayarlarının üç bağımsız veri kaynağını bir kez yükle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some((tab) => tab.id === requestedTab)) setActiveTab(requestedTab as SettingsTab);
    void fetchSettings();
    void fetchPos();
    void fetchTreatmentTypes();
  }, []);

  const changeTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === "genel") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (!res.ok) {
        showToast("error", data?.message || "Ayarlar yüklenemedi.");
        return;
      }
      if (data) {
      setInstitutionSlug(data.institutionSlug || "");
      setSettings({
          institutionName:      data.institutionName      || "Adana White Dental Clinic",
          institutionAddress:   data.institutionAddress   || "",
          institutionPhone:     data.institutionPhone     || "",
          openingTime:          data.openingTime          || "08:30",
          closingTime:          data.closingTime          || "23:59",
          appointmentDuration:  data.appointmentDuration  || 15,
          institutionWebsite:   data.institutionWebsite   || "",
          logoUrl:              data.logoUrl              || "",
          lunchStart: data.lunchStart || "",
          lunchEnd: data.lunchEnd || "",
          dailySchedules: (() => {
              const raw = data.dailySchedules;
              let parsed: DaySchedule[] = [];
              try {
                parsed = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : [];
              } catch {
                parsed = [];
              }
              return parsed.length > 0 ? parsed : DEFAULT_SCHEDULES;
            })(),
          smsEnabled:         data.smsEnabled         !== undefined ? data.smsEnabled         : true,
          smsDefaultInfo:     data.smsDefaultInfo     !== undefined ? data.smsDefaultInfo     : true,
          smsDefaultReminder: data.smsDefaultReminder !== undefined ? data.smsDefaultReminder : false,
          smsDefaultSurvey:   data.smsDefaultSurvey   !== undefined ? data.smsDefaultSurvey   : false,
          paymentReminderSmsEnabled: data.paymentReminderSmsEnabled !== undefined ? data.paymentReminderSmsEnabled : false,
          paymentReminderWindowDays: data.paymentReminderWindowDays || 3,
          reviewLink: data.reviewLink || "",
          birthdaySmsEnabled: data.birthdaySmsEnabled !== undefined ? data.birthdaySmsEnabled : false,
        });
      }
    } catch (e) { console.error(e); showToast("error", "Ayarlar yüklenemedi. Bağlantınızı kontrol edin."); }
    finally { setLoading(false); }
  };

  const fetchPos = async () => {
    setPosLoading(true);
    try {
      const res = await fetch("/api/pos-devices");
      const result = await res.json().catch(() => []);
      if (res.ok) setPosDevices(result);
      else showToast("error", result?.message || "POS cihazları yüklenemedi.");
    } catch { showToast("error", "POS cihazları yüklenemedi."); }
    finally { setPosLoading(false); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          dailySchedules: JSON.stringify(settings.dailySchedules),
        })
      });
      const result = await response.json().catch(() => ({ message: "Ayarlar kaydedilemedi." }));
      if (!response.ok) {
        showToast("error", result.message || "Ayarlar kaydedilemedi.");
        return;
      }
      showToast("success", "Ayarlar kaydedildi");
      window.dispatchEvent(new Event("clinic-brand-change"));
    } catch (e) { console.error(e); showToast("error", "Ayarlar kaydedilemedi. Bağlantınızı kontrol edin."); }
    finally { setSaving(false); }
  };

  const selectLogoFile = (file?: File) => {
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      showToast("error", "Logo PNG, JPG, WEBP veya GIF biçiminde olmalıdır.");
      return;
    }
    if (file.size > 400 * 1024) {
      showToast("error", "Logo dosyası en fazla 400 KB olabilir.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSettings((current) => ({ ...current, logoUrl: String(reader.result || "") }));
    reader.readAsDataURL(file);
  };

  const addPos = async () => {
    if (!newPosName.trim()) return;
    setAddingPos(true);
    const res = await fetch("/api/pos-devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPosName.trim() }),
    });
    setAddingPos(false);
    if (res.ok) {
      setNewPosName("");
      showToast("success", "POS cihazı eklendi.");
      void fetchPos();
    } else {
      const result = await res.json().catch(() => ({ message: "POS cihazı eklenemedi." }));
      showToast("error", result.message || "POS cihazı eklenemedi.");
    }
  };

  const togglePos = async (id: string, isActive: boolean) => {
    const res = await fetch(`/api/pos-devices/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    if (!res.ok) {
      const result = await res.json().catch(() => ({ message: "POS durumu güncellenemedi." }));
      showToast("error", result.message || "POS durumu güncellenemedi.");
      return;
    }
    void fetchPos();
  };

  const savePosName = async () => {
    if (!editingPos?.name.trim()) return;
    setSavingPos(true);
    const res = await fetch(`/api/pos-devices/${editingPos.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingPos.name.trim() }),
    });
    setSavingPos(false);
    if (res.ok) {
      setEditingPos(null);
      showToast("success", "POS cihazı güncellendi");
      void fetchPos();
    } else {
      const result = await res.json().catch(() => ({ message: "POS cihazı güncellenemedi." }));
      showToast("error", result.message || "POS cihazı güncellenemedi.");
    }
  };

  const deletePos = async (id: string, name: string) => {
    if (!(await confirmDialog({
      title: `"${name}" silinsin mi?`,
      message: "Bu işlem mevcut ödeme kayıtlarını silmez, sadece yeni kayıtlarda bu cihazın seçilmesini engeller. Devam etmek istiyor musunuz?",
      danger: true,
      confirmText: "Sil",
    }))) return;
    const res = await fetch(`/api/pos-devices/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const result = await res.json().catch(() => ({ message: "POS cihazı silinemedi." }));
      showToast("error", result.message || "POS cihazı silinemedi.");
      return;
    }
    showToast("success", "POS cihazı silindi.");
    void fetchPos();
  };

  const fetchTreatmentTypes = async () => {
    setTreatmentLoading(true);
    try {
      const res = await fetch("/api/treatment-types");
      const result = await res.json().catch(() => []);
      if (res.ok) setTreatmentTypes(result);
      else showToast("error", result?.message || "Tedavi türleri yüklenemedi.");
    } catch { showToast("error", "Tedavi türleri yüklenemedi."); }
    finally { setTreatmentLoading(false); }
  };

  const addTreatmentType = async () => {
    if (!newTreatmentLabel.trim()) return;
    setAddingTreatment(true);
    const res = await fetch("/api/treatment-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newTreatmentLabel.trim(), color: newTreatmentColor }),
    });
    setAddingTreatment(false);
    if (res.ok) {
      setNewTreatmentLabel("");
      setNewTreatmentColor("#2563eb");
      void fetchTreatmentTypes();
      showToast("success", "Tedavi türü eklendi");
    } else {
      const data = await res.json().catch(() => null);
      showToast("error", data?.message || "Tedavi türü eklenemedi");
    }
  };

  const saveTreatmentType = async () => {
    if (!editingTreatment?.label.trim()) return;
    setSavingTreatment(true);
    const res = await fetch(`/api/treatment-types/${editingTreatment.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editingTreatment.label.trim(), color: editingTreatment.color }),
    });
    setSavingTreatment(false);
    if (res.ok) {
      setEditingTreatment(null);
      showToast("success", "Tedavi türü güncellendi");
      void fetchTreatmentTypes();
    } else {
      const data = await res.json().catch(() => null);
      showToast("error", data?.message || "Tedavi türü güncellenemedi");
    }
  };

  const toggleTreatmentType = async (id: string, isActive: boolean) => {
    const res = await fetch(`/api/treatment-types/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    if (!res.ok) {
      const result = await res.json().catch(() => ({ message: "Tedavi türü durumu güncellenemedi." }));
      showToast("error", result.message || "Tedavi türü durumu güncellenemedi.");
      return;
    }
    void fetchTreatmentTypes();
  };

  const deleteTreatmentType = async (id: string, label: string) => {
    if (!(await confirmDialog({
      title: `"${label}" silinsin mi?`,
      message: "Bu tedavi türü randevu ekleme ekranındaki listeden kaldırılır. Bu tedaviyle oluşturulmuş mevcut randevular etkilenmez.",
      danger: true,
      confirmText: "Sil",
    }))) return;
    const res = await fetch(`/api/treatment-types/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const result = await res.json().catch(() => ({ message: "Tedavi türü silinemedi." }));
      showToast("error", result.message || "Tedavi türü silinemedi.");
      return;
    }
    showToast("success", "Tedavi türü silindi.");
    void fetchTreatmentTypes();
  };

  return (
    <section className="space-y-5" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black text-slate-900">Ayarlar</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{TABS.find(t => t.id === activeTab)?.label}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => changeTab(t.id)}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${activeTab === t.id ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── GENEL AYARLAR ──────────────────────────────────────────────── */}
      {activeTab === "genel" && (
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-6">
          <div>
            <h3 className="mb-1 text-base font-black text-slate-900">Klinik Bilgileri</h3>
            <p className="mb-3 text-sm text-slate-500">Bu bilgiler rapor, çıktı ve kurumsal görünümde kullanılır.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Klinik / Kurum Adı",      key: "institutionName"    as const },
                { label: "Adres",          key: "institutionAddress" as const },
                { label: "Telefon",        key: "institutionPhone"   as const },
                { label: "Web Sitesi",     key: "institutionWebsite" as const, placeholder: "https://..." },
              ].map(f => (
                <FormField key={f.key} label={f.label}>
                  <input value={(settings as any)[f.key]} placeholder={f.placeholder}
                    onChange={e => setSettings({ ...settings, [f.key]: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </FormField>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <h3 className="mb-1 text-base font-black text-slate-900">Kurum Logosu</h3>
            <p className="mb-3 text-sm text-slate-500">Sol menü, hasta belgeleri ve dışa aktarılan çıktılarda kullanılır.</p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {settings.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={settings.logoUrl} alt="Kurum logosu" className="h-full w-full object-contain p-1" />
                ) : (
                  <span className="text-xs font-bold text-slate-400">Logo</span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  value={settings.logoUrl}
                  onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                  placeholder="https://... veya dosya seçin"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
                    Dosya Seç
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => selectLogoFile(e.target.files?.[0])} />
                  </label>
                  {settings.logoUrl && <Button variant="ghost" size="sm" onClick={() => setSettings({ ...settings, logoUrl: "" })}>Logoyu Kaldır</Button>}
                </div>
                <p className="text-xs text-slate-500">PNG, JPG, WEBP veya GIF; en fazla 400 KB. Şeffaf PNG önerilir.</p>
              </div>
            </div>
          </div>

          {institutionSlug && (
            <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-4">
              <h3 className="mb-1 text-sm font-black text-slate-900">Online Randevu Talep Bağlantısı</h3>
              <p className="mb-2 text-xs text-slate-500">Bu bağlantıyı hastalarınızla paylaşın. Gönderilen başvurular Randevular sayfasındaki &quot;Online Randevu Talepleri&quot; bölümünde görünür.</p>
              <div className="flex items-center gap-2">
                <input readOnly value={typeof window !== "undefined" ? `${window.location.origin}/randevu-al/${encodeURIComponent(institutionSlug)}` : ""} className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600" />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/randevu-al/${encodeURIComponent(institutionSlug)}`);
                    showToast("success", "Bağlantı kopyalandı");
                  }}
                >
                  Kopyala
                </Button>
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-1 text-base font-black text-slate-900">Randevu Ayarı</h3>
            <p className="mb-3 text-sm text-slate-500">Takvimde varsayılan randevu aralığını belirler.</p>
            <div className="grid gap-3 sm:grid-cols-1 max-w-xs">
              <FormField label="Randevu Süresi (dakika)">
                <input type="number" min={5} max={240} step={5} value={settings.appointmentDuration}
                  onChange={e => setSettings({ ...settings, appointmentDuration: parseInt(e.target.value) })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </FormField>
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <Button variant="primary" onClick={() => void saveSettings()} loading={saving}>
              Ayarları Kaydet
            </Button>
            <Button variant="ghost" onClick={() => void fetchSettings()}>
              Değişiklikleri Geri Al
            </Button>
          </div>
        </div>
      )}

      {/* ── ÇALIŞMA SAATLERİ ───────────────────────────────────────────── */}
      {activeTab === "calisma" && (
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-6">
          {/* Genel öğle arası */}
          <div>
            <h3 className="mb-1 text-sm font-bold text-slate-800">Genel Öğle Arası</h3>
            <p className="mb-3 text-xs text-slate-500">Gün bazlı ayar yapılmamışsa bu saatler öğle arası olarak uygulanır. Boş bırakılırsa öğle arası uygulanmaz.</p>
            <div className="flex gap-4 flex-wrap">
              <FormField label="Öğle Başlangıcı">
                <input type="time" value={settings.lunchStart}
                  onChange={e => setSettings({ ...settings, lunchStart: e.target.value })}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </FormField>
              <FormField label="Öğle Bitişi">
                <input type="time" value={settings.lunchEnd}
                  onChange={e => setSettings({ ...settings, lunchEnd: e.target.value })}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </FormField>
            </div>
          </div>

          {/* Gün bazlı saatler */}
          <div>
            <h3 className="mb-1 text-sm font-bold text-slate-800">Gün Bazlı Çalışma Saatleri</h3>
            <p className="mb-3 text-xs text-slate-500">Her gün için açılış/kapanış ve öğle arası ayrı tanımlanabilir. Tatil olarak işaretlenen günler kapalı görünür.</p>
            <div className="space-y-3 md:hidden">
              {settings.dailySchedules.map((ds, idx) => (
                <div key={ds.day} className={`rounded-2xl border p-4 ${ds.isHoliday ? "border-red-100 bg-red-50" : "border-slate-100 bg-slate-50"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-slate-900">{ds.day}</p>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input type="checkbox" className="h-4 w-4 accent-red-500"
                        checked={ds.isHoliday}
                        onChange={e => {
                          const updated = [...settings.dailySchedules];
                          updated[idx] = { ...ds, isHoliday: e.target.checked };
                          setSettings({ ...settings, dailySchedules: updated });
                        }} />
                      Kapalı
                    </label>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {[
                      { label: "Açılış", key: "open" as const },
                      { label: "Kapanış", key: "close" as const },
                      { label: "Öğle Başlangıç", key: "lunchStart" as const },
                      { label: "Öğle Bitiş", key: "lunchEnd" as const },
                    ].map((field) => (
                      <label key={field.key} className="text-xs font-semibold text-slate-600">
                        {field.label}
                        <input type="time" value={ds[field.key]} disabled={ds.isHoliday}
                          onChange={e => {
                            const updated = [...settings.dailySchedules];
                            updated[idx] = { ...ds, [field.key]: e.target.value };
                            setSettings({ ...settings, dailySchedules: updated });
                          }}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:bg-slate-100 disabled:opacity-40" />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500 font-semibold">
                    <th className="text-left p-2 pl-3 rounded-tl-lg">Gün</th>
                    <th className="text-left p-2">Kapalı</th>
                    <th className="text-left p-2">Açılış</th>
                    <th className="text-left p-2">Kapanış</th>
                    <th className="text-left p-2">Öğle Başlangıç</th>
                    <th className="text-left p-2 rounded-tr-lg">Öğle Bitiş</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.dailySchedules.map((ds, idx) => (
                    <tr key={ds.day} className={`border-t border-slate-100 ${ds.isHoliday ? "bg-red-50/50" : ""}`}>
                      <td className="p-2 pl-3 font-semibold text-slate-700">{ds.day}</td>
                      <td className="p-2">
                        <input type="checkbox" className="h-4 w-4 accent-red-500"
                          checked={ds.isHoliday}
                          onChange={e => {
                            const updated = [...settings.dailySchedules];
                            updated[idx] = { ...ds, isHoliday: e.target.checked };
                            setSettings({ ...settings, dailySchedules: updated });
                          }} />
                      </td>
                      <td className="p-2">
                        <input type="time" value={ds.open} disabled={ds.isHoliday}
                          onChange={e => {
                            const updated = [...settings.dailySchedules];
                            updated[idx] = { ...ds, open: e.target.value };
                            setSettings({ ...settings, dailySchedules: updated });
                          }}
                          className="rounded border border-slate-200 px-2 py-1 text-xs focus:border-primary focus:outline-none disabled:opacity-40 disabled:bg-slate-100" />
                      </td>
                      <td className="p-2">
                        <input type="time" value={ds.close} disabled={ds.isHoliday}
                          onChange={e => {
                            const updated = [...settings.dailySchedules];
                            updated[idx] = { ...ds, close: e.target.value };
                            setSettings({ ...settings, dailySchedules: updated });
                          }}
                          className="rounded border border-slate-200 px-2 py-1 text-xs focus:border-primary focus:outline-none disabled:opacity-40 disabled:bg-slate-100" />
                      </td>
                      <td className="p-2">
                        <input type="time" value={ds.lunchStart} disabled={ds.isHoliday}
                          onChange={e => {
                            const updated = [...settings.dailySchedules];
                            updated[idx] = { ...ds, lunchStart: e.target.value };
                            setSettings({ ...settings, dailySchedules: updated });
                          }}
                          className="rounded border border-slate-200 px-2 py-1 text-xs focus:border-primary focus:outline-none disabled:opacity-40 disabled:bg-slate-100" />
                      </td>
                      <td className="p-2">
                        <input type="time" value={ds.lunchEnd} disabled={ds.isHoliday}
                          onChange={e => {
                            const updated = [...settings.dailySchedules];
                            updated[idx] = { ...ds, lunchEnd: e.target.value };
                            setSettings({ ...settings, dailySchedules: updated });
                          }}
                          className="rounded border border-slate-200 px-2 py-1 text-xs focus:border-primary focus:outline-none disabled:opacity-40 disabled:bg-slate-100" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <Button variant="primary" onClick={() => void saveSettings()} loading={saving}>
              Çalışma Saatlerini Kaydet
            </Button>
            <Button variant="ghost" onClick={() => void fetchSettings()}>
              Değişiklikleri Geri Al
            </Button>
          </div>
        </div>
      )}

      {activeTab === "fiyat" && (
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <FiyatPage />
        </div>
      )}

      {activeTab === "uniteler" && (
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <UnitelerTab />
        </div>
      )}

      {/* ── POS CİHAZLARI ──────────────────────────────────────────────── */}
      {activeTab === "pos" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-1 text-base font-black text-slate-900">Yeni POS Cihazı Ekle</h3>
            <p className="mb-4 text-xs text-slate-500">Kliniğinizde kullandığınız POS cihazlarını tanımlayın. Bu cihazlar ödeme ve taksit kayıtlarında seçilebilir.</p>
            <div className="flex gap-2">
              <input value={newPosName} onChange={e => setNewPosName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && void addPos()}
                placeholder="Cihaz adı (örn: İşbankası POS, Vakıfbank POS…)"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
              <Button variant="primary" onClick={() => void addPos()} disabled={!newPosName.trim()} loading={addingPos}>
                POS Ekle
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Kayıtlı POS Cihazları</h3>
              <span className="text-xs text-slate-500">{posDevices.length} cihaz</span>
            </div>
            {posDevices.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Henüz POS cihazı eklenmedi</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {posDevices.map(dev => (
                  <div key={dev.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${dev.isActive ? "bg-emerald-500" : "bg-slate-300"}`} />
                    <div className="min-w-0 flex-1">
                      {editingPos?.id === dev.id ? (
                        <input
                          value={editingPos.name}
                          onChange={(e) => setEditingPos({ id: dev.id, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void savePosName();
                            if (e.key === "Escape") setEditingPos(null);
                          }}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          autoFocus
                        />
                      ) : (
                        <p className="truncate text-sm font-semibold text-slate-800">{dev.name}</p>
                      )}
                      <p className="text-[11px] text-slate-400">{dev.isActive ? "Aktif" : "Pasif"}</p>
                    </div>
                    {editingPos?.id === dev.id ? (
                      <>
                        <Button variant="primary" size="sm" onClick={() => void savePosName()} disabled={!editingPos.name.trim()} loading={savingPos}>
                          Kaydet
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingPos(null)}>
                          Vazgeç
                        </Button>
                      </>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => setEditingPos({ id: dev.id, name: dev.name })}>
                        Düzenle
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => togglePos(dev.id, !dev.isActive)}>
                      {dev.isActive ? "Pasif Yap" : "Aktif Yap"}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => deletePos(dev.id, dev.name)}>
                      Sil
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TEDAVİ TÜRLERİ ─────────────────────────────────────────────── */}
      {activeTab === "tedavi" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-1 text-base font-black text-slate-900">Yeni Tedavi Türü Ekle</h3>
            <p className="mb-4 text-xs text-slate-500">Randevu ekleme ekranında seçilebilecek tedavi türlerini ve takvimde görünecek renklerini burada yönetin.</p>
            <div className="flex flex-wrap gap-2">
              <input value={newTreatmentLabel} onChange={e => setNewTreatmentLabel(e.target.value)}
                onKeyDown={e => e.key === "Enter" && void addTreatmentType()}
                placeholder="Tedavi adı (örn: Diş Beyazlatma)"
                className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
              <input type="color" value={newTreatmentColor} onChange={e => setNewTreatmentColor(e.target.value)}
                title="Renk seç"
                className="h-[38px] w-14 cursor-pointer rounded-lg border border-slate-200 p-1" />
              <Button variant="primary" onClick={() => void addTreatmentType()} disabled={!newTreatmentLabel.trim()} loading={addingTreatment}>
                Tedavi Ekle
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Kayıtlı Tedavi Türleri</h3>
              <span className="text-xs text-slate-500">{treatmentTypes.length} tedavi</span>
            </div>
            {treatmentLoading ? (
              <p className="py-10 text-center text-sm text-slate-400">Yükleniyor…</p>
            ) : treatmentTypes.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Henüz tedavi türü eklenmedi</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {treatmentTypes.map(t => (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                    {editingTreatment?.id === t.id ? (
                      <input type="color" value={editingTreatment.color}
                        onChange={e => setEditingTreatment({ ...editingTreatment, color: e.target.value })}
                        className="h-8 w-8 shrink-0 cursor-pointer rounded-full border border-slate-200 p-0" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: t.color }} />
                    )}
                    <div className="min-w-0 flex-1">
                      {editingTreatment?.id === t.id ? (
                        <input
                          value={editingTreatment.label}
                          onChange={(e) => setEditingTreatment({ ...editingTreatment, label: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveTreatmentType();
                            if (e.key === "Escape") setEditingTreatment(null);
                          }}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          autoFocus
                        />
                      ) : (
                        <p className="truncate text-sm font-semibold text-slate-800">{t.label}</p>
                      )}
                      <p className="text-[11px] text-slate-400">{t.isActive ? "Aktif" : "Pasif"}</p>
                    </div>
                    {editingTreatment?.id === t.id ? (
                      <>
                        <Button variant="primary" size="sm" onClick={() => void saveTreatmentType()} disabled={!editingTreatment.label.trim()} loading={savingTreatment}>
                          Kaydet
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingTreatment(null)}>
                          Vazgeç
                        </Button>
                      </>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => setEditingTreatment({ id: t.id, label: t.label, color: t.color })}>
                        Düzenle
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => toggleTreatmentType(t.id, !t.isActive)}>
                      {t.isActive ? "Pasif Yap" : "Aktif Yap"}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => deleteTreatmentType(t.id, t.label)}>
                      Sil
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
