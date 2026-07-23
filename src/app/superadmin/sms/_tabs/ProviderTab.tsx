"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, inputErrorClass } from "@/components/ui/FormField";
import { showToastSafe } from "@/lib/toast-client";

type ProviderConfig = {
  provider: string;
  apiUrl: string;
  apiKey: string;
  sender: string;
  isActive: boolean;
};

export default function ProviderTab() {
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ provider: "", apiUrl: "", apiKey: "", sender: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/superadmin/sms-provider")
      .then((r) => r.json())
      .then((d) => {
        setConfig(d);
        setForm({
          provider: d.provider ?? "",
          apiUrl: d.apiUrl ?? "",
          apiKey: d.apiKey ?? "",
          sender: d.sender ?? "",
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/superadmin/sms-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      showToastSafe({ title: "Kaydedildi", message: "SMS API ayarları güncellendi", type: "success" });
    } catch {
      showToastSafe({ title: "Hata", message: "Ayarlar kaydedilemedi", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="max-w-lg space-y-4">
            <FormField label="SMS Sağlayıcısı">
              <select
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${inputErrorClass(false)}`}
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
              >
                <option value="">Seçiniz...</option>
                <option value="NETGSM">NetGSM</option>
                <option value="ILETIMERKEZI">İleti Merkezi</option>
                <option value="VERIMOR">Verimor</option>
                <option value="MUTLUCELL">Mutlucell</option>
                <option value="CUSTOM">Özel</option>
              </select>
            </FormField>
            <FormField label="API URL">
              <input
                className={`w-full rounded-xl border px-3 py-2.5 text-sm font-mono outline-none ${inputErrorClass(false)}`}
                placeholder="https://api.provider.com/sms/send"
                value={form.apiUrl}
                onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
              />
            </FormField>
            <FormField label="API Anahtarı">
              <input
                type="password"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm font-mono outline-none ${inputErrorClass(false)}`}
                placeholder="••••••••••••••••"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              />
            </FormField>
            <FormField label="Gönderici Başlığı">
              <input
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${inputErrorClass(false)}`}
                placeholder="KlinikPanel"
                value={form.sender}
                onChange={(e) => setForm({ ...form, sender: e.target.value })}
              />
            </FormField>

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSave} loading={saving}>Kaydet</Button>
            </div>

            {config?.isActive && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <p className="text-sm text-emerald-700">
                  SMS API bağlantısı aktif — Sağlayıcı: <strong>{config.provider}</strong>
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
