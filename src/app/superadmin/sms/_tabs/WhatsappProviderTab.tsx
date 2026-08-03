"use client";

import { useEffect, useState } from "react";
import { PlusCircle, Pencil, Send, CheckCircle2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";
import { EmptyState } from "@/components/ui/EmptyState";
import { createModuleEmptyIcon } from "@/components/ui/ModuleIcon";
import { Spinner } from "@/components/ui/Spinner";
import { showToastSafe } from "@/lib/toast-client";

const WhatsappProviderEmptyIcon = createModuleEmptyIcon("sms");

type Provider = {
  id: string;
  institutionId: string | null;
  code: string;
  name: string;
  providerType: string;
  isActive: boolean;
  priority: number;
  sendUrl: string | null;
  httpMethod: string;
  username: string | null;
  hasPassword: boolean;
  hasApiKey: boolean;
  sender: string | null;
  headersJson: string | null;
  bodyTemplate: string | null;
  successPattern: string | null;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  apiVersion: string;
  appointmentTemplateName: string | null;
  appointmentTemplateLanguage: string;
  hasVerifyToken: boolean;
  hasAppSecret: boolean;
};

type InstitutionOption = { id: string; name: string };

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const emptyForm = {
  code: "", name: "", institutionId: "", providerType: "META_CLOUD", priority: "100", sendUrl: "", httpMethod: "POST",
  username: "", password: "", apiKey: "", sender: "", headersJson: "", bodyTemplate: "", successPattern: "",
  phoneNumberId: "", businessAccountId: "", verifyToken: "", appSecret: "", apiVersion: "v23.0",
  appointmentTemplateName: "", appointmentTemplateLanguage: "tr",
  isActive: false,
};

export default function WhatsappProviderTab() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [sendModal, setSendModal] = useState<Provider | null>(null);
  const [sendForm, setSendForm] = useState({ phone: "", message: "" });
  const [sending, setSending] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/superadmin/whatsapp-provider")
      .then((r) => r.json())
      .then((d) => setProviders(d.providers ?? []))
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetch("/api/superadmin/institutions?take=500")
      .then((response) => response.json())
      .then((body) => setInstitutions(Array.isArray(body) ? body : body?.institutions || []))
      .catch(() => setInstitutions([]));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (p: Provider) => {
    setEditing(p);
    setForm({
      code: p.code, name: p.name, priority: String(p.priority),
      institutionId: p.institutionId || "",
      providerType: p.providerType,
      sendUrl: p.sendUrl ?? "", httpMethod: p.httpMethod,
      username: p.username ?? "", password: "", apiKey: "",
      sender: p.sender ?? "", headersJson: p.headersJson ?? "", bodyTemplate: p.bodyTemplate ?? "",
      successPattern: p.successPattern ?? "", isActive: p.isActive,
      phoneNumberId: p.phoneNumberId ?? "", businessAccountId: p.businessAccountId ?? "",
      verifyToken: "", appSecret: "", apiVersion: p.apiVersion || "v23.0",
      appointmentTemplateName: p.appointmentTemplateName ?? "",
      appointmentTemplateLanguage: p.appointmentTemplateLanguage || "tr",
    });
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.institutionId.trim()) {
      showToastSafe({ title: "Eksik alan", message: "Kod, ad ve kurum zorunlu", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, priority: Number(form.priority) };
      const res = await fetch("/api/superadmin/whatsapp-provider", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...payload, id: editing.id } : payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Kaydedilemedi");
      showToastSafe({ title: "Kaydedildi", message: `${d.name} sağlayıcısı kaydedildi`, type: "success", icon: "sms" });
      setShowForm(false);
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const activate = async (p: Provider) => {
    try {
      const res = await fetch("/api/superadmin/whatsapp-provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, isActive: true }),
      });
      if (!res.ok) throw new Error("Aktif edilemedi");
      showToastSafe({ title: "Aktif edildi", message: `${p.name} artık aktif sağlayıcı`, type: "success", icon: "sms" });
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    }
  };

  const submitTestSend = async () => {
    if (!sendModal || !sendForm.phone.trim() || !sendForm.message.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/superadmin/whatsapp-provider/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: sendModal.id, phone: sendForm.phone.trim(), message: sendForm.message.trim() }),
      });
      const d = await res.json();
      if (d.ok) {
        showToastSafe({ title: "Gönderildi", message: `Test WhatsApp mesajı gönderildi (${d.providerMessageId ?? "-"})`, type: "success", icon: "sms" });
        setSendModal(null);
        setSendForm({ phone: "", message: "" });
      } else {
        showToastSafe({ title: "Hata", message: d.error || "Gönderilemedi", type: "error" });
      }
    } catch {
      showToastSafe({ title: "Hata", message: "Bağlantı hatası", type: "error" });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-100 bg-white py-16 shadow-sm">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Buradaki kayıtlar, teknik destek veya platform yöneticisi tarafından yönetilen WhatsApp sağlayıcılarını gösterir.
          Kliniklerin günlük kullanım akışı Kurumlar &gt; Kurum Detayı ve Ayarlar &gt; SMS &gt; WhatsApp üzerinden yürür.
        </p>
        <Button icon={PlusCircle} size="sm" onClick={openCreate}>Yeni Sağlayıcı</Button>
      </div>

      {providers.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <EmptyState icon={WhatsappProviderEmptyIcon} illustrative title="Henüz sağlayıcı tanımlanmamış" description="Bir sağlayıcı hesabınız olduğunda buradan ekleyin." />
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((p, pIdx) => (
            <div key={p.id} style={{ ["--row-delay" as string]: `${Math.min(pIdx, 14) * 18}ms` }} className="ui-row-in rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">{p.name}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">{p.code}</span>
                    {p.isActive && <Badge tone="success" icon={CheckCircle2}>Aktif</Badge>}
                    <Badge tone="neutral" size="sm">Öncelik {p.priority}</Badge>
                  </div>
                  <p className="truncate font-mono text-xs text-slate-400">{p.sendUrl || "gönderim URL'i tanımlı değil"}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {p.username && <>Kullanıcı: {p.username} · </>}
                    Şifre: {p.hasPassword ? "tanımlı" : "yok"} · API Anahtarı: {p.hasApiKey ? "tanımlı" : "yok"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  {!p.isActive && (
                    <Button variant="secondary" size="sm" onClick={() => activate(p)}>Aktif Et</Button>
                  )}
                  <IconButton icon={Send} title="Test Gönder" tone="neutral" onClick={() => { setSendModal(p); setSendForm({ phone: "", message: "Test mesajı" }); }} />
                  <IconButton icon={Pencil} title="Düzenle" tone="neutral" onClick={() => openEdit(p)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? `Düzenle: ${editing.name}` : "Yeni WhatsApp Sağlayıcısı"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>İptal</Button>
            <Button loading={saving} onClick={submit}>Kaydet</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Kod" required>
            <input className={inputClass} value={form.code} disabled={!!editing} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="META_CLOUD" />
          </FormField>
          <FormField label="Ad" required>
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Meta WhatsApp Cloud API" />
          </FormField>
          <FormField label="Kurum" required hint="Her sağlayıcı tek bir kliniğe aittir — platform genelinde paylaşılan sağlayıcı desteklenmez, mesajlar her zaman kliniğin kendi numarasından gider.">
            <select className={inputClass} value={form.institutionId} disabled={!!editing} onChange={(e) => setForm({ ...form, institutionId: e.target.value })}>
              <option value="">Kurum seçin</option>
              {institutions.map((institution) => (
                <option key={institution.id} value={institution.id}>{institution.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Sağlayıcı Türü" required>
            <select className={inputClass} value={form.providerType} onChange={(e) => setForm({ ...form, providerType: e.target.value })}>
              <option value="TWILIO">Twilio WhatsApp API</option>
              <option value="META_CLOUD">Meta WhatsApp Cloud API</option>
              <option value="CUSTOM">Özel HTTP sağlayıcısı</option>
              <option value="MOCK">Test sağlayıcısı</option>
            </select>
          </FormField>
          <FormField label="Öncelik">
            <input type="number" className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          </FormField>
          <FormField label="HTTP Metodu">
            <select className={inputClass} value={form.httpMethod} onChange={(e) => setForm({ ...form, httpMethod: e.target.value })}>
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </select>
          </FormField>
          {form.providerType === "CUSTOM" && <div className="sm:col-span-2">
            <FormField label="Gönderim URL">
              <input className={inputClass} value={form.sendUrl} onChange={(e) => setForm({ ...form, sendUrl: e.target.value })} placeholder="https://graph.facebook.com/v20.0/{{phoneNumberId}}/messages" />
            </FormField>
          </div>}
          <FormField label={form.providerType === "TWILIO" ? "Twilio Account SID" : "Kullanıcı Adı"}>
            <input className={inputClass} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder={form.providerType === "TWILIO" ? "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" : undefined} />
          </FormField>
          <FormField label={form.providerType === "TWILIO" ? "WhatsApp Numarası" : "Gönderici / Numara Kimliği"}>
            <input className={inputClass} value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} placeholder={form.providerType === "TWILIO" ? "+14155238886" : "+90 5xx xxx xx xx"} />
          </FormField>
          <FormField label="Şifre" hint={editing ? "Değiştirmek istemiyorsanız boş bırakın" : undefined}>
            <input type="password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
          </FormField>
          <FormField label={form.providerType === "TWILIO" ? "Twilio Auth Token" : "API Anahtarı / Erişim Token"} hint={editing ? "Değiştirmek istemiyorsanız boş bırakın" : undefined}>
            <input type="password" className={inputClass} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="••••••••" />
          </FormField>
          {form.providerType === "META_CLOUD" && (
            <>
              <FormField label="Telefon Numarası Kimliği" required>
                <input className={inputClass} value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} />
              </FormField>
              <FormField label="WhatsApp Business Hesap Kimliği">
                <input className={inputClass} value={form.businessAccountId} onChange={(e) => setForm({ ...form, businessAccountId: e.target.value })} />
              </FormField>
              <FormField label="Webhook Doğrulama Anahtarı" hint={editing ? "Değiştirmek istemiyorsanız boş bırakın" : undefined}>
                <input type="password" className={inputClass} value={form.verifyToken} onChange={(e) => setForm({ ...form, verifyToken: e.target.value })} />
              </FormField>
              <FormField label="Meta Uygulama Gizli Anahtarı" hint={editing ? "Değiştirmek istemiyorsanız boş bırakın" : undefined}>
                <input type="password" className={inputClass} value={form.appSecret} onChange={(e) => setForm({ ...form, appSecret: e.target.value })} />
              </FormField>
              <FormField label="Graph API Sürümü">
                <input className={inputClass} value={form.apiVersion} onChange={(e) => setForm({ ...form, apiVersion: e.target.value })} placeholder="v23.0" />
              </FormField>
              <FormField label="Randevu Şablonu">
                <input className={inputClass} value={form.appointmentTemplateName} onChange={(e) => setForm({ ...form, appointmentTemplateName: e.target.value })} placeholder="randevu_bilgilendirme" />
              </FormField>
              <FormField label="Şablon Dili">
                <input className={inputClass} value={form.appointmentTemplateLanguage} onChange={(e) => setForm({ ...form, appointmentTemplateLanguage: e.target.value })} placeholder="tr" />
              </FormField>
            </>
          )}
          {form.providerType === "CUSTOM" && <div className="sm:col-span-2">
            <FormField label="Ek Header'lar (JSON)" hint='Opsiyonel — ör. {"Authorization": "Bearer {{apiKey}}"}'>
              <textarea className={inputClass} rows={2} value={form.headersJson} onChange={(e) => setForm({ ...form, headersJson: e.target.value })} placeholder='{"Authorization": "Bearer {{apiKey}}"}' />
            </FormField>
          </div>}
          {form.providerType === "CUSTOM" && <div className="sm:col-span-2">
            <FormField label="İstek Gövde Şablonu (JSON)" hint="Opsiyonel — {{phone}}, {{message}} yer tutucularını kullanabilirsiniz">
              <textarea className={inputClass} rows={3} value={form.bodyTemplate} onChange={(e) => setForm({ ...form, bodyTemplate: e.target.value })} placeholder='{"messaging_product":"whatsapp","to":"{{phone}}","type":"text","text":{"body":"{{message}}"}}' />
            </FormField>
          </div>}
          {form.providerType === "CUSTOM" && <div className="sm:col-span-2">
            <FormField label="Başarı Deseni (regex)" hint="Opsiyonel">
              <input className={inputClass} value={form.successPattern} onChange={(e) => setForm({ ...form, successPattern: e.target.value })} />
            </FormField>
          </div>}
          <div className="sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="rounded border-slate-300 text-primary focus:ring-primary/30"
              />
              <span className="text-sm text-slate-700">Kaydettikten sonra bu sağlayıcıyı aktif et</span>
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!sendModal}
        onClose={() => setSendModal(null)}
        title={`Test Gönder: ${sendModal?.name ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSendModal(null)}>İptal</Button>
            <Button loading={sending} onClick={submitTestSend} disabled={!sendForm.phone.trim() || !sendForm.message.trim()}>Gönder</Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Telefon">
            <input className={inputClass} value={sendForm.phone} onChange={(e) => setSendForm({ ...sendForm, phone: e.target.value })} placeholder="5xx xxx xx xx" />
          </FormField>
          <FormField label="Mesaj">
            <textarea className={inputClass} rows={3} value={sendForm.message} onChange={(e) => setSendForm({ ...sendForm, message: e.target.value })} />
          </FormField>
        </div>
      </Modal>
    </section>
  );
}
