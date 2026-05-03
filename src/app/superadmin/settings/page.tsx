"use client";

import { useEffect, useState } from "react";

type Settings = Record<string, string>;

const SETTING_LABELS: Record<string, string> = {
  siteName: "Site Adı",
  supportEmail: "Destek E-postası",
  smsEnabled: "SMS Aktif",
  maintenanceMode: "Bakım Modu",
  maxInstitutions: "Maks. Klinik Sayısı",
  defaultSmsCredit: "Varsayılan SMS Kredisi",
  trialDays: "Deneme Süresi (Gün)",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/superadmin/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/superadmin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const update = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-3xl">⚙️</span>
        <h2 className="text-2xl font-bold text-gray-900">Sistem Ayarları</h2>
      </div>

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-4 max-w-lg">
            {Object.entries(settings).map(([key, value]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {SETTING_LABELS[key] ?? key}
                </label>
                {value === "true" || value === "false" ? (
                  <select
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={value}
                    onChange={(e) => update(key, e.target.value)}
                  >
                    <option value="true">Aktif</option>
                    <option value="false">Pasif</option>
                  </select>
                ) : (
                  <input
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={value}
                    onChange={(e) => update(key, e.target.value)}
                  />
                )}
              </div>
            ))}

            {Object.keys(settings).length === 0 && (
              <p className="text-sm text-gray-500">Sistem ayarı bulunamadı.</p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
              {saved && <span className="text-sm text-green-600 font-medium">✓ Kaydedildi</span>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
