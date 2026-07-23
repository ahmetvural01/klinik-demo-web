"use client";

import { useEffect, useState } from "react";
import { PlusCircle, Pencil, Zap, Send, CheckCircle2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";
import { showToastSafe } from "@/lib/toast-client";

type Provider = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  priority: number;
  sendUrl: string | null;
  balanceUrl: string | null;
  httpMethod: string;
  username: string | null;
  hasPassword: boolean;
  hasApiKey: boolean;
  sender: string | null;
  headersJson: string | null;
  bodyTemplate: string | null;
  successPattern: string | null;
};

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const emptyForm = {
  code: "", name: "", priority: "100", sendUrl: "", balanceUrl: "", httpMethod: "POST",
  username: "", password: "", apiKey: "", sender: "", headersJson: "", bodyTemplate: "", successPattern: "",
  isActive: false,
};

export default function ProviderTab() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [sendModal, setSendModal] = useState<Provider | null>(null);
  const [sendForm, setSendForm] = useState({ phone: "", message: "" });
  const [sending, setSending] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/superadmin/sms-provider")
      .then((r) => r.json())
      .then((d) => setProviders(d.providers ?? []))
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (p: Provider) => {
    setEditing(p);
    setForm({
      code: p.code, name: p.name, priority: String(p.priority),
      sendUrl: p.sendUrl ?? "", balanceUrl: p.balanceUrl ?? "", httpMethod: p.httpMethod,
      username: p.username ?? "", password: "", apiKey: "",
      sender: p.sender ?? "", headersJson: p.headersJson ?? "", bodyTemplate: p.bodyTemplate ?? "",
      successPattern: p.successPattern ?? "", isActive: p.isActive,
    });
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      showToastSafe({ title: "Eksik alan", message: "Kod ve ad zorunlu", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, priority: Number(form.priority) };
      const res = await fetch("/api/superadmin/sms-provider", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...payload, id: editing.id } : payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Kaydedilemedi");
      showToastSafe({ title: "Kaydedildi", message: `${d.name} sağlayıcısı kaydedildi`, type: "success" });
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
      const res = await fetch("/api/superadmin/sms-provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, isActive: true }),
      });
      if (!res.ok) throw new Error("Aktif edilemedi");
      showToastSafe({ title: "Aktif edildi", message: `${p.name} artık aktif sağlayıcı`, type: "success" });
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    }
  };

  const testBalance = async (p: Provider) => {
    setTestingId(p.id);
    try {
      const res = await fetch("/api/superadmin/sms-provider/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: p.id }),
      });
      const d = await res.json();
      if (d.ok) {
        showToastSafe({ title: "Bakiye", message: `${p.name}: ${d.balance ?? d.raw}`, type: "success" });
      } else {
        showToastSafe({ title: "Hata", message: d.error || "Bakiye alınamadı", type: "error" });
      }
    } catch {
      showToastSafe({ title: "Hata", message: "Bağlantı hatası", type: "error" });
    } finally {
      setTestingId(null);
    }
  };

  const submitTestSend = async () => {
    if (!sendModal || !sendForm.phone.trim() || !sendForm.message.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/superadmin/sms-provider/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: sendModal.id, phone: sendForm.phone.trim(), message: sendForm.message.trim() }),
      });
      const d = await res.json();
      if (d.ok) {
        showToastSafe({ title: "Gönderildi", message: `Test SMS gönderildi (${d.providerMessageId ?? "-"})`, type: "success" });
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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Öncelik sırasına göre çalışan çoklu SMS sağlayıcı yapılandırması. Aynı anda yalnızca bir sağlayıcı aktif olabilir.</p>
        <Button icon={PlusCircle} size="sm" onClick={openCreate}>Yeni Sağlayıcı</Button>
      </div>

      {providers.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
          Henüz sağlayıcı tanımlanmamış
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
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
                  <IconButton icon={Zap} title="Bakiye Sorgula" tone="primary" onClick={() => testBalance(p)} disabled={testingId === p.id} />
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
        title={editing ? `Düzenle: ${editing.name}` : "Yeni SMS Sağlayıcısı"}
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
            <input className={inputClass} value={form.code} disabled={!!editing} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="NETGSM" />
          </FormField>
          <FormField label="Ad" required>
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="NetGSM" />
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
          <div className="sm:col-span-2">
            <FormField label="Gönderim URL">
              <input className={inputClass} value={form.sendUrl} onChange={(e) => setForm({ ...form, sendUrl: e.target.value })} placeholder="https://api.provider.com/sms/send" />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label="Bakiye Sorgu URL">
              <input className={inputClass} value={form.balanceUrl} onChange={(e) => setForm({ ...form, balanceUrl: e.target.value })} placeholder="https://api.provider.com/sms/balance" />
            </FormField>
          </div>
          <FormField label="Kullanıcı Adı">
            <input className={inputClass} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </FormField>
          <FormField label="Gönderici Başlığı">
            <input className={inputClass} value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} placeholder="KlinikPanel" />
          </FormField>
          <FormField label="Şifre" hint={editing ? "Değiştirmek istemiyorsanız boş bırakın" : undefined}>
            <input type="password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
          </FormField>
          <FormField label="API Anahtarı" hint={editing ? "Değiştirmek istemiyorsanız boş bırakın" : undefined}>
            <input type="password" className={inputClass} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="••••••••" />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Ek Header'lar (JSON)" hint="Opsiyonel">
              <textarea className={inputClass} rows={2} value={form.headersJson} onChange={(e) => setForm({ ...form, headersJson: e.target.value })} placeholder='{"X-Api-Key": "..."}' />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label="İstek Gövde Şablonu" hint="Opsiyonel — {{phone}}, {{message}} yer tutucularını kullanabilirsiniz">
              <textarea className={inputClass} rows={2} value={form.bodyTemplate} onChange={(e) => setForm({ ...form, bodyTemplate: e.target.value })} />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label="Başarı Deseni (regex)" hint="Opsiyonel">
              <input className={inputClass} value={form.successPattern} onChange={(e) => setForm({ ...form, successPattern: e.target.value })} />
            </FormField>
          </div>
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
            <input className={inputClass} value={sendForm.phone} onChange={(e) => setSendForm({ ...sendForm, phone: e.target.value })} placeholder="05xx xxx xx xx" />
          </FormField>
          <FormField label="Mesaj">
            <textarea className={inputClass} rows={3} value={sendForm.message} onChange={(e) => setSendForm({ ...sendForm, message: e.target.value })} />
          </FormField>
        </div>
      </Modal>
    </section>
  );
}
