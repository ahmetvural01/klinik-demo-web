"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Section } from "@/components/ui/Section";
import { Input } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Switch } from "@/components/ui/Switch";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { FormSkeleton } from "@/components/ui/PageSkeleton";
import { showToastSafe } from "@/lib/toast-client";
import { errorMessage, saGet, saSend } from "@/components/superadmin/sa-fetch";

type SmtpConfig = {
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string;
  fromName?: string;
  fromEmail?: string;
  isActive?: boolean;
  message?: string;
};

const EMPTY = { host: "", port: "587", secure: false, username: "", password: "", fromName: "", fromEmail: "", isActive: false };

/**
 * Sistem Ayarları › E-posta (SMTP). Önceden ayrı bir menü öğesiydi; şimdi
 * diğer platform ayarlarıyla aynı sayfada. Şifre sunucudan maskeli gelir;
 * maskeli değer gönderilirse kayıtlı şifre korunur (bkz. smtp API).
 */
export default function EpostaTab() {
  const [form, setForm] = useState(EMPTY);
  const [testTo, setTestTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  // Sunucudaki (kaydedilmiş) açık/kapalı durumu: uyarı yalnız kayıtlı ayara göre gösterilir.
  const [savedActive, setSavedActive] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    saGet<SmtpConfig>("/api/superadmin/smtp", "E-posta ayarları yüklenemedi.", controller.signal)
      .then((data) => {
        if (!data) throw new Error("E-posta ayarları yüklenemedi.");
        setSavedActive(data.isActive ?? false);
        setForm({
          host: data.host ?? "",
          port: String(data.port ?? 587),
          secure: data.secure ?? false,
          username: data.username ?? "",
          password: data.password ?? "",
          fromName: data.fromName ?? "",
          fromEmail: data.fromEmail ?? "",
          isActive: data.isActive ?? false,
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(error, "E-posta ayarları yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saSend("/api/superadmin/smtp", "PUT", { ...form, port: Number.parseInt(form.port, 10) }, "E-posta ayarları kaydedilemedi.");
      setSavedActive(form.isActive);
      showToastSafe({ type: "success", message: "E-posta ayarları kaydedildi.", icon: "settings" });
    } catch (error) {
      setSaveError(errorMessage(error, "E-posta ayarları kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!/^\S+@\S+\.\S+$/.test(testTo.trim())) {
      setTestResult({ ok: false, message: "Deneme e-postasının gideceği geçerli bir adres yazın." });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const data = await saSend<{ message?: string }>("/api/superadmin/smtp", "POST", { action: "test", ...form, port: Number.parseInt(form.port, 10), testTo: testTo.trim() }, "Deneme e-postası gönderilemedi.");
      setTestResult({ ok: true, message: data?.message ?? "Deneme e-postası gönderildi." });
    } catch (error) {
      setTestResult({ ok: false, message: errorMessage(error, "Deneme e-postası gönderilemedi.") });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <FormSkeleton fields={7} columns={2} />;
  if (loadError) return <LoadErrorState message={loadError} onRetry={() => setReloadKey((value) => value + 1)} />;

  return (
    <Section title="E-posta gönderimi (SMTP)" description="Fatura hatırlatmaları ve sistem e-postaları bu sunucu üzerinden gönderilir." className="max-w-3xl">
      <div className="space-y-5">
      {!savedActive && (
        <Callout tone="warning" title="E-posta gönderimi kapalı">
          Fatura hatırlatmaları e-postayla gitmiyor; ayarları girip “E-postalar bu sunucuyla gönderilsin”i açın.
        </Callout>
      )}
      <FormErrorBanner message={saveError} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormField label="SMTP sunucusu" htmlFor="smtp-host" hint="Ör. smtp.gmail.com">
            <Input id="smtp-host" value={form.host} onChange={(event) => set("host", event.target.value)} />
          </FormField>
        </div>
        <FormField label="Port" htmlFor="smtp-port" hint="Genellikle 587 (TLS) veya 465 (SSL)">
          <Input id="smtp-port" type="number" inputMode="numeric" value={form.port} onChange={(event) => set("port", event.target.value)} />
        </FormField>
        <div className="flex items-end pb-2">
          <Switch checked={form.secure} onChange={(checked) => set("secure", checked)} label="Güvenli bağlantı (SSL)" description="465 numaralı portta açın" className="w-full" />
        </div>
        <FormField label="Kullanıcı adı" htmlFor="smtp-user">
          <Input id="smtp-user" autoComplete="off" value={form.username} onChange={(event) => set("username", event.target.value)} />
        </FormField>
        <FormField label="Şifre" htmlFor="smtp-pass" hint="Değiştirmeyecekseniz olduğu gibi bırakın">
          <Input id="smtp-pass" type="password" autoComplete="new-password" value={form.password} onChange={(event) => set("password", event.target.value)} />
        </FormField>
        <FormField label="Gönderen adı" htmlFor="smtp-from-name">
          <Input id="smtp-from-name" value={form.fromName} onChange={(event) => set("fromName", event.target.value)} placeholder="CepKlinik" />
        </FormField>
        <FormField label="Gönderen e-postası" htmlFor="smtp-from-email">
          <Input id="smtp-from-email" type="email" value={form.fromEmail} onChange={(event) => set("fromEmail", event.target.value)} placeholder="noreply@ornek.com" />
        </FormField>
        <div className="sm:col-span-2">
          <Switch checked={form.isActive} onChange={(checked) => set("isActive", checked)} label="E-postalar bu sunucuyla gönderilsin" description="Kapalıyken platform e-posta göndermez." />
        </div>
      </div>
      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button loading={saving} onClick={() => void save()}>Kaydet</Button>
      </div>

      <div className="space-y-3 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-bold text-slate-900">Deneme e-postası</h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <FormField label="Gönderilecek adres" htmlFor="smtp-test-to">
              <Input id="smtp-test-to" type="email" value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="ornek@eposta.com" />
            </FormField>
          </div>
          <Button variant="secondary" icon={Send} loading={testing} onClick={() => void test()}>Deneme gönder</Button>
        </div>
        {testResult && (
          <Callout tone={testResult.ok ? "success" : "critical"} role={testResult.ok ? "status" : "alert"} compact>
            {testResult.message}
          </Callout>
        )}
      </div>
      </div>
    </Section>
  );
}
