"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { showToastSafe } from "@/lib/toast-client";

type Provider = {
  id: string;
  name: string;
  isActive: boolean;
  sender: string | null;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  apiVersion: string;
  appointmentTemplateName: string | null;
  appointmentTemplateLanguage: string;
  hasApiKey: boolean;
  updatedAt: string;
};

const inputClass = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

const emptyForm = {
  sender: "",
  phoneNumberId: "",
  businessAccountId: "",
  apiKey: "",
  apiVersion: "v23.0",
  appointmentTemplateName: "",
  appointmentTemplateLanguage: "tr",
  isActive: true,
};

// Klinik kendi Meta WhatsApp Business bağlantısını buradan tanımlar — süperadmin
// yalnızca modülü açar (bkz. docs/ILETISIM-MIMARISI-RAPORU.md §3). Kliniğin
// numarası doğrudan Meta'dan gider, platform genelinde paylaşılan bir numara
// yoktur.
export default function WhatsappSettingsTab() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Merhaba, bu bir test mesajıdır.");
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settingsRes = await fetch("/api/settings");
      const settingsData = await settingsRes.json().catch(() => null);
      const isEnabled = Boolean(settingsData?.whatsappEnabled);
      setEnabled(isEnabled);

      if (isEnabled) {
        const res = await fetch("/api/whatsapp/provider");
        const data = await res.json().catch(() => null);
        if (data?.provider) {
          setProvider(data.provider);
          setForm({
            sender: data.provider.sender || "",
            phoneNumberId: data.provider.phoneNumberId || "",
            businessAccountId: data.provider.businessAccountId || "",
            apiKey: "",
            apiVersion: data.provider.apiVersion || "v23.0",
            appointmentTemplateName: data.provider.appointmentTemplateName || "",
            appointmentTemplateLanguage: data.provider.appointmentTemplateLanguage || "tr",
            isActive: data.provider.isActive,
          });
        }
      }
    } catch {
      showToastSafe({ message: "WhatsApp ayarları yüklenemedi", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!form.phoneNumberId.trim()) {
      showToastSafe({ message: "Telefon Numarası Kimliği zorunlu", type: "error" });
      return;
    }
    if (!provider && !form.apiKey.trim()) {
      showToastSafe({ message: "Erişim Token'ı zorunlu", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Kaydedilemedi");
      showToastSafe({ message: "WhatsApp bağlantısı kaydedildi", type: "success" });
      void load();
    } catch (e) {
      showToastSafe({ message: e instanceof Error ? e.message : "Kaydedilemedi", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const submitTest = async () => {
    if (!testPhone.trim() || !testMessage.trim()) return;
    setTesting(true);
    try {
      const res = await fetch("/api/whatsapp/provider/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone.trim(), message: testMessage.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        showToastSafe({ message: `Test mesajı gönderildi (${data.providerMessageId ?? "-"})`, type: "success" });
        setTestOpen(false);
      } else {
        showToastSafe({ message: data.error || data.message || "Gönderilemedi", type: "error" });
      }
    } catch {
      showToastSafe({ message: "Bağlantı hatası", type: "error" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-100 bg-white py-16 shadow-sm">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold text-slate-700">WhatsApp modülü kliniğiniz için henüz açılmamış.</p>
        <p className="mt-1 text-xs text-slate-500">Bu özelliği açmak için sistem yöneticinizle iletişime geçin.</p>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black text-slate-900">WhatsApp Ayarları</h1>
            <p className="mt-1 text-sm text-slate-500">Kendi Meta Business hesabınızı bağlayın — mesajlarınız kendi numaranızdan gider.</p>
          </div>
          {provider && (
            <Badge tone={provider.isActive ? "success" : "neutral"} size="md">
              {provider.isActive ? "Aktif" : "Pasif"}
            </Badge>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Telefon Numarası Kimliği" required hint="Meta Business Suite &gt; WhatsApp &gt; API Kurulumu ekranından alınır.">
            <input className={inputClass} value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} placeholder="123456789012345" />
          </FormField>
          <FormField label="WhatsApp Business Hesap Kimliği">
            <input className={inputClass} value={form.businessAccountId} onChange={(e) => setForm({ ...form, businessAccountId: e.target.value })} />
          </FormField>
          <FormField label="Erişim Token'ı" required={!provider} hint={provider ? "Değiştirmek istemiyorsanız boş bırakın" : "Meta Business Suite'ten alınan kalıcı erişim anahtarı"}>
            <input type="password" className={inputClass} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="••••••••" />
          </FormField>
          <FormField label="Görünen Gönderici Adı">
            <input className={inputClass} value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} placeholder="Klinik adı" />
          </FormField>
          <FormField label="Graph API Sürümü">
            <input className={inputClass} value={form.apiVersion} onChange={(e) => setForm({ ...form, apiVersion: e.target.value })} placeholder="v23.0" />
          </FormField>
          <FormField label="Randevu Şablon Adı" hint="Meta'da onaylı bir şablon kullanıyorsanız">
            <input className={inputClass} value={form.appointmentTemplateName} onChange={(e) => setForm({ ...form, appointmentTemplateName: e.target.value })} />
          </FormField>
          <FormField label="Şablon Dili">
            <input className={inputClass} value={form.appointmentTemplateLanguage} onChange={(e) => setForm({ ...form, appointmentTemplateLanguage: e.target.value })} placeholder="tr" />
          </FormField>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          <span className="text-sm font-semibold text-slate-700">Bağlantı aktif</span>
        </label>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {provider && (
          <Button variant="secondary" icon={Send} onClick={() => setTestOpen(true)}>
            Bağlantıyı Test Et
          </Button>
        )}
        <Button variant="secondary" onClick={() => void load()} disabled={saving}>
          Yenile
        </Button>
        <Button variant="primary" onClick={() => void save()} loading={saving}>
          Kaydet
        </Button>
      </div>

      <Modal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        title="Test Mesajı Gönder"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTestOpen(false)}>İptal</Button>
            <Button loading={testing} onClick={submitTest} disabled={!testPhone.trim() || !testMessage.trim()}>Gönder</Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Telefon">
            <input className={inputClass} value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="5xx xxx xx xx" />
          </FormField>
          <FormField label="Mesaj">
            <textarea className={inputClass} rows={3} value={testMessage} onChange={(e) => setTestMessage(e.target.value)} />
          </FormField>
        </div>
      </Modal>
    </section>
  );
}
