"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, PlusCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FormField } from "@/components/ui/FormField";
import { showToastSafe } from "@/lib/toast-client";
import { SMS_PLACEHOLDERS, renderSmsPreview } from "@/lib/sms-template-placeholders";

type Template = {
  id: string;
  code: string;
  title: string;
  content: string;
  isActive: boolean;
  createdAt: string;
};

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const emptyForm = { code: "", title: "", content: "", isActive: true };

export default function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/superadmin/sms-templates")
      .then((r) => r.json())
      .then((d) => setTemplates(Array.isArray(d) ? d : d.templates ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setForm({ code: t.code, title: t.title, content: t.content, isActive: t.isActive });
    setShowForm(true);
  };

  const insertPlaceholder = (token: string) => {
    const el = textareaRef.current;
    const insertText = `{{${token}}}`;
    if (!el) {
      setForm((f) => ({ ...f, content: f.content + insertText }));
      return;
    }
    const start = el.selectionStart ?? form.content.length;
    const end = el.selectionEnd ?? form.content.length;
    const nextContent = form.content.slice(0, start) + insertText + form.content.slice(end);
    setForm((f) => ({ ...f, content: nextContent }));
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + insertText.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const submit = async () => {
    if (!form.code.trim() || !form.title.trim() || !form.content.trim()) {
      showToastSafe({ title: "Eksik alan", message: "Kod, başlık ve içerik zorunlu", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/superadmin/sms-templates", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing
            ? { id: editing.id, title: form.title, content: form.content, isActive: form.isActive }
            : { code: form.code, title: form.title, content: form.content, isActive: form.isActive }
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
        <p className="text-sm text-slate-500">Hastalara otomatik gönderilen SMS metinleri. Örnek bir hasta üzerinden nasıl görüneceğini aşağıda inceleyebilirsiniz.</p>
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
                      {!t.isActive && <Badge tone="neutral">Pasif</Badge>}
                    </div>
                    <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">{renderSmsPreview(t.content)}</p>
                    <p className="mt-1 text-xs text-slate-400">Örnek bir hastaya böyle görünür</p>
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
        title={editing ? `Düzenle: ${editing.title}` : "Yeni SMS Şablonu"}
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
          <FormField label="Mesaj Metni" required hint="Aşağıdaki butonlara tıklayarak imleç konumuna otomatik dolacak bilgiyi ekleyebilirsiniz">
            <textarea
              ref={textareaRef}
              className={inputClass}
              rows={4}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
          </FormField>
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Otomatik Doldurulacak Bilgiler</p>
            <div className="flex flex-wrap gap-1.5">
              {SMS_PLACEHOLDERS.map((p) => (
                <button
                  key={p.token}
                  type="button"
                  onClick={() => insertPlaceholder(p.token)}
                  className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10"
                >
                  + {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Örnek Önizleme</p>
            <p className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
              {form.content.trim() ? renderSmsPreview(form.content) : "Mesaj metni girildikçe burada örnek bir hastaya nasıl göründüğünü görürsünüz."}
            </p>
          </div>
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
