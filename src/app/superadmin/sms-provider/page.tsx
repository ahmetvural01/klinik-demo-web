"use client";

import { useEffect, useState } from "react";

type ProviderConfig = {
  provider: string;
  apiUrl: string;
  apiKey: string;
  sender: string;
  isActive: boolean;
};

export default function SmsProviderPage() {
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ provider: "", apiUrl: "", apiKey: "", sender: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    await fetch("/api/superadmin/sms-provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🔌</span>
        <h2 className="text-2xl font-bold text-gray-900">SMS API Tanımlamaları</h2>
      </div>

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SMS Sağlayıcısı</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
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
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API URL</label>
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                placeholder="https://api.provider.com/sms/send"
                value={form.apiUrl}
                onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Anahtarı</label>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                placeholder="••••••••••••••••"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gönderici Başlığı</label>
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="KlinikModern"
                value={form.sender}
                onChange={(e) => setForm({ ...form, sender: e.target.value })}
              />
            </div>

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

            {config?.isActive && (
              <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-3">
                <p className="text-sm text-green-700">
                  ✓ SMS API bağlantısı aktif — Sağlayıcı: <strong>{config.provider}</strong>
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
