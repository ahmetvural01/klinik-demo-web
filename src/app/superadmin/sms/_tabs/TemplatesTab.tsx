"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Pencil, PlusCircle, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FormField } from "@/components/ui/FormField";
import { SmsMessageEditor } from "@/components/sms/SmsMessageEditor";
import { showToastSafe } from "@/lib/toast-client";
import { SMS_PLACEHOLDERS, renderSmsPreview, toReadableText, toStoredText } from "@/lib/sms-template-placeholders";

type Template = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string;
  content: string;
  whatsappContent: string | null;
  whatsappTemplateName: string | null;
  whatsappTemplateLanguage: string;
  isActive: boolean;
  createdAt: string;
};

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const emptyForm = { code: "", title: "", description: "", category: "GENERAL", content: "", whatsappContent: "", whatsappTemplateName: "", whatsappTemplateLanguage: "tr", isActive: true };
const CATEGORIES: Record<string, string> = { APPOINTMENT: "Randevu", PAYMENT: "Ödeme", GREETING: "Kutlama", AFTERCARE: "Randevu Sonrası", GENERAL: "Genel" };

export default function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/superadmin/sms-templates", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "İletişim şablonları yüklenemedi.");
      setTemplates(Array.isArray(data) ? data : data?.templates ?? []);
    } catch (error) {
      showToastSafe({ title: "Yükleme hatası", message: error instanceof Error ? error.message : "İletişim şablonları yüklenemedi.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setForm({ code: t.code, title: t.title, description: t.description || "", category: t.category, content: toReadableText(t.content), whatsappContent: toReadableText(t.whatsappContent || t.content), whatsappTemplateName: t.whatsappTemplateName || "", whatsappTemplateLanguage: t.whatsappTemplateLanguage || "tr", isActive: t.isActive });
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.code.trim() || !form.title.trim() || !form.content.trim()) {
      showToastSafe({ title: "Eksik alan", message: "Kod, başlık ve içerik zorunlu", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, content: toStoredText(form.content), whatsappContent: toStoredText(form.whatsappContent || form.content) };
      const res = await fetch("/api/superadmin/sms-templates", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing
            ? { id: editing.id, ...payload }
            : payload
        ),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Kaydedilemedi");
      showToastSafe({ title: "Kaydedildi", message: `${d.title} şablonu kaydedildi`, type: "success" });
      setShowForm(false);
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">SMS ve WhatsApp için tüm kliniklerde kullanılan sistem şablonları. Klinik özelleştirmeleri İletişim Merkezi&apos;nden yapılır.</p>
        <Button icon={PlusCircle} size="sm" onClick={openCreate}>Yeni Şablon</Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse bg-slate-50" style={{ animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-slate-400">Şablon bulunamadı</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {templates.map((t) => (
              <div key={t.id} className="p-4 transition hover:bg-slate-50/80">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{t.title}</span>
                      <Badge tone="info">{CATEGORIES[t.category] || t.category}</Badge>
                      <Badge tone="neutral">{t.code}</Badge>
                      {!t.isActive && <Badge tone="neutral">Pasif</Badge>}
                    </div>
                    {t.description && <p className="mb-2 text-xs text-slate-500">{t.description}</p>}
                    <div className="grid gap-2 md:grid-cols-2"><div className="rounded-lg border border-sky-100 bg-sky-50 p-2 text-sm text-slate-600"><p className="mb-1 flex items-center gap-1 text-xs font-black text-sky-700"><Smartphone className="h-3.5 w-3.5" />SMS</p>{renderSmsPreview(t.content)}</div><div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2 text-sm text-slate-600"><p className="mb-1 flex items-center gap-1 text-xs font-black text-emerald-700"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</p>{renderSmsPreview(t.whatsappContent || t.content)}</div></div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="whitespace-nowrap text-xs text-slate-400">
                      {new Date(t.createdAt).toLocaleDateString("tr-TR")}
                    </span>
                    <IconButton icon={Pencil} title="Düzenle" tone="neutral" onClick={() => openEdit(t)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? `Düzenle: ${editing.title}` : "Yeni İletişim Şablonu"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>İptal</Button>
            <Button loading={saving} onClick={submit}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Başlık" required hint="Bu şablonu tanımak için kısa bir ad, örn. Randevu Hatırlatması">
            <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </FormField>
          {!editing && (
            <FormField label="Kod" required hint="Sistem içi kısa tanımlayıcı, sonradan değiştirilemez — örn. OZEL_HATIRLATMA">
              <input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </FormField>
          )}
          <div className="grid gap-3 sm:grid-cols-2"><FormField label="Kategori"><select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{Object.entries(CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField><FormField label="Açıklama"><input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField></div>
          <SmsMessageEditor
            value={form.content}
            onChange={(content) => setForm({ ...form, content })}
            placeholders={SMS_PLACEHOLDERS}
          />
          <div className="border-t border-slate-100 pt-4"><SmsMessageEditor value={form.whatsappContent} onChange={(whatsappContent) => setForm({ ...form, whatsappContent })} placeholders={SMS_PLACEHOLDERS} label="WhatsApp Mesajı" /><div className="mt-3 grid gap-3 sm:grid-cols-2"><FormField label="Meta şablon adı"><input className={inputClass} value={form.whatsappTemplateName} onChange={(e) => setForm({ ...form, whatsappTemplateName: e.target.value })} /></FormField><FormField label="Dil"><select className={inputClass} value={form.whatsappTemplateLanguage} onChange={(e) => setForm({ ...form, whatsappTemplateLanguage: e.target.value })}><option value="tr">Türkçe (tr)</option><option value="en_US">English (en_US)</option></select></FormField></div></div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="rounded border-slate-300 text-primary focus:ring-primary/30"
            />
            <span className="text-sm text-slate-700">Aktif</span>
          </label>
        </div>
      </Modal>
    </section>
  );
}
