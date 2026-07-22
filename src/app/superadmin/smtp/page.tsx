"use client";

import { useEffect, useState } from "react";
import { Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, FormSection } from "@/components/ui/FormField";
import { Badge } from "@/components/ui/Badge";
import { showToastSafe } from "@/lib/toast-client";

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  isActive: boolean;
};

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

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
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

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
    try {
      const res = await fetch("/api/superadmin/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, port: parseInt(form.port) }),
      });
      if (!res.ok) throw new Error("Kaydedilemedi");
      setSaved(true);
      showToastSafe({ title: "Kaydedildi", message: "SMTP ayarları güncellendi", type: "success" });
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/superadmin/smtp/test", { method: "POST" });
      const d = await res.json();
      setTestResult(
        res.ok
          ? { ok: true, message: "Test maili başarıyla gönderildi" }
          : { ok: false, message: d.message ?? "Hata" }
      );
    } catch {
      setTestResult({ ok: false, message: "Bağlantı hatası" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <h1 className="text-lg font-black text-slate-900">SMTP Ayarları</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-100 bg-white py-16 shadow-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <FormSection icon={Mail} title="Sunucu Bilgileri" description="Mail gönderimi için SMTP sunucu ayarları">
          <div className="max-w-lg space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <FormField label="SMTP Sunucu">
                  <input
                    className={inputClass}
                    placeholder="smtp.gmail.com"
                    value={form.host}
                    onChange={(e) => setForm({ ...form, host: e.target.value })}
                  />
                </FormField>
              </div>
              <FormField label="Port">
                <input
                  type="number"
                  className={inputClass}
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: e.target.value })}
                />
              </FormField>
              <div className="flex items-end pb-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.secure}
                    onChange={(e) => setForm({ ...form, secure: e.target.checked })}
                    className="rounded border-slate-300 text-primary focus:ring-primary/30"
                  />
                  <span className="text-sm text-slate-700">SSL/TLS</span>
                </label>
              </div>
              <FormField label="Kullanıcı Adı">
                <input
                  className={inputClass}
                  placeholder="info@example.com"
                  value={form.user}
                  onChange={(e) => setForm({ ...form, user: e.target.value })}
                />
              </FormField>
              <FormField label="Şifre">
                <input
                  type="password"
                  className={inputClass}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </FormField>
              <FormField label="Gönderici Adı">
                <input
                  className={inputClass}
                  placeholder="Klinik Yönetim Paneli"
                  value={form.fromName}
                  onChange={(e) => setForm({ ...form, fromName: e.target.value })}
                />
              </FormField>
              <FormField label="Gönderici E-posta">
                <input
                  className={inputClass}
                  placeholder="noreply@example.com"
                  value={form.fromEmail}
                  onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
                />
              </FormField>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button onClick={handleSave} loading={saving}>
                Kaydet
              </Button>
              <Button variant="secondary" onClick={handleTest} loading={testing}>
                Test Gönder
              </Button>
              {saved && (
                <Badge tone="success" icon={CheckCircle2}>Kaydedildi</Badge>
              )}
            </div>

            {testResult && (
              <div
                className={`rounded-lg border p-3 text-sm font-medium ${
                  testResult.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {testResult.message}
              </div>
            )}
          </div>
        </FormSection>
      )}
    </section>
  );
}
