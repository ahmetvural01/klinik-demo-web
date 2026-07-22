"use client";

import { useEffect, useState } from "react";
import { Settings as SettingsIcon, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, FormSection } from "@/components/ui/FormField";
import { Badge } from "@/components/ui/Badge";
import { showToastSafe } from "@/lib/toast-client";

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

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

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
    try {
      const res = await fetch("/api/superadmin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Kaydedilemedi");
      setSaved(true);
      showToastSafe({ title: "Kaydedildi", message: "Sistem ayarları güncellendi", type: "success" });
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <h1 className="text-lg font-black text-slate-900">Sistem Ayarları</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-100 bg-white py-16 shadow-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <FormSection icon={SettingsIcon} title="Genel Ayarlar" description="Platform genelinde geçerli sistem parametreleri">
          <div className="max-w-lg space-y-4">
            {Object.entries(settings).map(([key, value]) => (
              <FormField key={key} label={SETTING_LABELS[key] ?? key}>
                {value === "true" || value === "false" ? (
                  <select
                    className={inputClass}
                    value={value}
                    onChange={(e) => update(key, e.target.value)}
                  >
                    <option value="true">Aktif</option>
                    <option value="false">Pasif</option>
                  </select>
                ) : (
                  <input
                    className={inputClass}
                    value={value}
                    onChange={(e) => update(key, e.target.value)}
                  />
                )}
              </FormField>
            ))}

            {Object.keys(settings).length === 0 && (
              <p className="text-sm text-slate-500">Sistem ayarı bulunamadı.</p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSave} loading={saving}>
                Kaydet
              </Button>
              {saved && <Badge tone="success" icon={CheckCircle2}>Kaydedildi</Badge>}
            </div>
          </div>
        </FormSection>
      )}
    </section>
  );
}
