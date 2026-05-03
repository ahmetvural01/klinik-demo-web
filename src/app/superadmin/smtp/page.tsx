"use client";

import { useEffect, useState } from "react";

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  isActive: boolean;
};

export default function SmtpPage() {
  const [form, setForm] = useState({
    host: "",
    port: "587",
    secure: false,
    user: "",
    password: "",
    fromName: "",
    fromEmail: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/superadmin/smtp")
      .then((r) => r.json())
      .then((d: SmtpConfig) => {
        if (d.host) {
          setForm((f) => ({
            ...f,
            host: d.host ?? "",
            port: String(d.port ?? 587),
            secure: d.secure ?? false,
            user: d.user ?? "",
            fromName: d.fromName ?? "",
            fromEmail: d.fromEmail ?? "",
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/superadmin/smtp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, port: parseInt(form.port) }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/superadmin/smtp/test", { method: "POST" });
      const d = await res.json();
      setTestResult(res.ok ? "✓ Test maili başarıyla gönderildi" : `✗ ${d.message ?? "Hata"}`);
    } catch {
      setTestResult("✗ Bağlantı hatası");
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-3xl">📧</span>
        <h2 className="text-2xl font-bold text-gray-900">SMTP Ayarları</h2>
      </div>

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-4 max-w-lg">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Sunucu</label>
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="smtp.gmail.com"
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: e.target.value })}
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.secure}
                    onChange={(e) => setForm({ ...form, secure: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">SSL/TLS</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı</label>
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="info@example.com"
                  value={form.user}
                  onChange={(e) => setForm({ ...form, user: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
                <input
                  type="password"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gönderici Adı</label>
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="KlinikModern"
                  value={form.fromName}
                  onChange={(e) => setForm({ ...form, fromName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gönderici E-posta</label>
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="noreply@example.com"
                  value={form.fromEmail}
                  onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
              <button
                onClick={handleTest}
                disabled={testing}
                className="rounded-lg border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {testing ? "Test ediliyor..." : "Test Gönder"}
              </button>
              {saved && <span className="text-sm text-green-600 font-medium">✓ Kaydedildi</span>}
            </div>

            {testResult && (
              <div
                className={`rounded-lg p-3 text-sm font-medium ${
                  testResult.startsWith("✓")
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {testResult}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
