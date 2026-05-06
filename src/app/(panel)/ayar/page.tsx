"use client";

import { useEffect, useState } from "react";

type PosDevice = { id: string; name: string; isActive: boolean; createdAt: string };

type DaySchedule = {
  day: string;
  isHoliday: boolean;
  open: string;
  close: string;
  lunchStart: string;
  lunchEnd: string;
};

const DAYS = ["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"];

const DEFAULT_SCHEDULES: DaySchedule[] = DAYS.map(day => ({
  day,
  isHoliday: day === "Pazar",
  open: "08:30",
  close: day === "Cumartesi" ? "15:00" : "18:00",
  lunchStart: "",
  lunchEnd: "",
}));

export default function AyarPage() {
  const [activeTab, setActiveTab] = useState<"genel" | "calisma" | "sms" | "pos">("genel");
  const [settings, setSettings] = useState({
    institutionName: "Adana White Dental Clinic",
    institutionAddress: "Çukurova/Adana",
    institutionPhone: "",
    openingTime: "08:30",
    closingTime: "23:59",
    appointmentDuration: 15,
    institutionWebsite: "",
    lunchStart: "",
    lunchEnd: "",
    dailySchedules: DEFAULT_SCHEDULES as DaySchedule[],
    smsEnabled: true,
    smsDefaultInfo: true,
    smsDefaultReminder: false,
    smsDefaultSurvey: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text }); setTimeout(() => setToast(null), 3500);
  };

  // POS cihazları
  const [posDevices, setPosDevices] = useState<PosDevice[]>([]);
  const [posLoading, setPosLoading] = useState(false);
  const [newPosName, setNewPosName] = useState("");
  const [addingPos, setAddingPos] = useState(false);

  useEffect(() => { void fetchSettings(); void fetchPos(); }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data) {
      setSettings({
          institutionName:      data.institutionName      || "Adana White Dental Clinic",
          institutionAddress:   data.institutionAddress   || "",
          institutionPhone:     data.institutionPhone     || "",
          openingTime:          data.openingTime          || "08:30",
          closingTime:          data.closingTime          || "23:59",
          appointmentDuration:  data.appointmentDuration  || 15,
          institutionWebsite:   data.institutionWebsite   || "",
          lunchStart: data.lunchStart || "",
          lunchEnd: data.lunchEnd || "",
          dailySchedules: (() => {
              const raw = data.dailySchedules;
              const parsed: DaySchedule[] = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : [];
              return parsed.length > 0 ? parsed : DEFAULT_SCHEDULES;
            })(),
          smsEnabled:         data.smsEnabled         !== undefined ? data.smsEnabled         : true,
          smsDefaultInfo:     data.smsDefaultInfo     !== undefined ? data.smsDefaultInfo     : true,
          smsDefaultReminder: data.smsDefaultReminder !== undefined ? data.smsDefaultReminder : false,
          smsDefaultSurvey:   data.smsDefaultSurvey   !== undefined ? data.smsDefaultSurvey   : false,
        });
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchPos = async () => {
    setPosLoading(true);
    try {
      const res = await fetch("/api/pos-devices");
      if (res.ok) setPosDevices(await res.json());
    } catch { /* ignore */ }
    finally { setPosLoading(false); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          dailySchedules: JSON.stringify(settings.dailySchedules),
        })
      });
      showToast("success", "Ayarlar kaydedildi");
    } catch (e) { console.error(e); showToast("error", "Hata oluştu"); }
    finally { setSaving(false); }
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
    if (res.ok) { setNewPosName(""); void fetchPos(); }
  };

  const togglePos = async (id: string, isActive: boolean) => {
    await fetch(`/api/pos-devices/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    void fetchPos();
  };

  const deletePos = async (id: string, name: string) => {
    if (!confirm(`"${name}" cihazını silmek istediğinize emin misiniz?`)) return;
    await fetch(`/api/pos-devices/${id}`, { method: "DELETE" });
    void fetchPos();
  };

  if (loading) return <p className="p-6 text-slate-500">Yükleniyor…</p>;

  const TABS = [
    { id: "genel"   as const, label: "Genel Ayarlar" },
    { id: "calisma" as const, label: "Çalışma Saatleri" },
    { id: "sms"     as const, label: "SMS Ayarları" },
    { id: "pos"     as const, label: "POS Cihazları" },
  ];

  return (
    <section className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-5 top-5 z-[100] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
          toast.type === "success" ? "bg-emerald-500" : "bg-red-500"
        }`}>
          {toast.type === "success" ? "✓" : "✕"} {toast.text}
        </div>
      )}
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-black text-slate-900">Sistem Ayarları</h1>
        <p className="mt-0.5 text-xs text-slate-500">Klinik ayarları · SMS · POS cihaz yönetimi</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-100 bg-white p-1 shadow-sm">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab === t.id ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── GENEL AYARLAR ──────────────────────────────────────────────── */}
      {activeTab === "genel" && (
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-6">
          <div>
            <h3 className="mb-3 text-sm font-bold text-slate-800">Firma Bilgileri</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Firma Adı",      key: "institutionName"    as const },
                { label: "Adres",          key: "institutionAddress" as const },
                { label: "Telefon",        key: "institutionPhone"   as const },
                { label: "Web Sitesi",     key: "institutionWebsite" as const, placeholder: "https://..." },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{f.label}</label>
                  <input value={(settings as any)[f.key]} placeholder={f.placeholder}
                    onChange={e => setSettings({ ...settings, [f.key]: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-bold text-slate-800">Randevu Ayarı</h3>
            <div className="grid gap-3 sm:grid-cols-1 max-w-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Randevu Süresi (dakika)</label>
                <input type="number" value={settings.appointmentDuration}
                  onChange={e => setSettings({ ...settings, appointmentDuration: parseInt(e.target.value) })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button onClick={saveSettings} disabled={saving}
              className="rounded-lg bg-primary px-6 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50">
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button onClick={fetchSettings}
              className="rounded-lg border border-slate-200 px-6 py-2 text-sm text-slate-600 hover:bg-slate-50">
              Sıfırla
            </button>
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
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Öğle Başlangıcı</label>
                <input type="time" value={settings.lunchStart}
                  onChange={e => setSettings({ ...settings, lunchStart: e.target.value })}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Öğle Bitişi</label>
                <input type="time" value={settings.lunchEnd}
                  onChange={e => setSettings({ ...settings, lunchEnd: e.target.value })}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
          </div>

          {/* Gün bazlı saatler */}
          <div>
            <h3 className="mb-1 text-sm font-bold text-slate-800">Gün Bazlı Çalışma Saatleri</h3>
            <p className="mb-3 text-xs text-slate-500">Her gün için açılış/kapanış ve öğle arası ayrı tanımlanabilir. Tatil olarak işaretlenen günler kapalı görünür.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500 font-semibold">
                    <th className="text-left p-2 pl-3 rounded-tl-lg">Gün</th>
                    <th className="text-left p-2">Tatil</th>
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
            <button onClick={saveSettings} disabled={saving}
              className="rounded-lg bg-primary px-6 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50">
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button onClick={fetchSettings}
              className="rounded-lg border border-slate-200 px-6 py-2 text-sm text-slate-600 hover:bg-slate-50">
              Sıfırla
            </button>
          </div>
        </div>
      )}

      {/* ── SMS AYARLARI ───────────────────────────────────────────────── */}
      {activeTab === "sms" && (
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800">SMS Gönderim Tercihleri</h3>
          <div className="space-y-3 rounded-lg bg-slate-50 p-4 border border-slate-100">
            {[
              { key: "smsEnabled"         as const, label: "SMS gönderimi aktif mi?" },
              { key: "smsDefaultInfo"     as const, label: "Randevu bilgilendirme SMS'i varsayılan aktif?" },
              { key: "smsDefaultReminder" as const, label: "Hatırlatma SMS'i varsayılan aktif?" },
              { key: "smsDefaultSurvey"   as const, label: "Değerlendirme SMS'i varsayılan aktif?" },
            ].map(item => (
              <label key={item.key} className="flex items-center gap-3 cursor-pointer text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary"
                  checked={settings[item.key]}
                  onChange={e => setSettings({ ...settings, [item.key]: e.target.checked })} />
                {item.label}
              </label>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button onClick={saveSettings} disabled={saving}
              className="rounded-lg bg-primary px-6 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50">
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </div>
      )}

      {/* ── POS CİHAZLARI ──────────────────────────────────────────────── */}
      {activeTab === "pos" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-1 text-sm font-bold text-slate-800">Yeni POS Cihazı Ekle</h3>
            <p className="mb-4 text-xs text-slate-500">Kliniğinizde kullandığınız POS cihazlarını tanımlayın. Bu cihazlar ödeme ve taksit kayıtlarında seçilebilir.</p>
            <div className="flex gap-2">
              <input value={newPosName} onChange={e => setNewPosName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && void addPos()}
                placeholder="Cihaz adı (örn: İşbankası POS, Vakıfbank POS…)"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
              <button onClick={addPos} disabled={addingPos || !newPosName.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50">
                {addingPos ? "Ekleniyor…" : "+ Ekle"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Kayıtlı POS Cihazları</h3>
              <span className="text-xs text-slate-500">{posDevices.length} cihaz</span>
            </div>
            {posLoading ? (
              <p className="py-10 text-center text-sm text-slate-400">Yükleniyor…</p>
            ) : posDevices.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Henüz POS cihazı eklenmedi</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {posDevices.map(dev => (
                  <div key={dev.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${dev.isActive ? "bg-emerald-500" : "bg-slate-300"}`} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">{dev.name}</p>
                      <p className="text-[11px] text-slate-400">{dev.isActive ? "Aktif" : "Pasif"}</p>
                    </div>
                    <button onClick={() => togglePos(dev.id, !dev.isActive)}
                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${dev.isActive ? "border-amber-100 text-amber-700 hover:bg-amber-50" : "border-emerald-100 text-emerald-700 hover:bg-emerald-50"}`}>
                      {dev.isActive ? "Pasif Yap" : "Aktif Yap"}
                    </button>
                    <button onClick={() => deletePos(dev.id, dev.name)}
                      className="rounded-lg border border-red-100 px-3 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 transition">
                      Sil
                    </button>
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


