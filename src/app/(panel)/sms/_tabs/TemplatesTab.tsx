"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, PenSquare, PlusCircle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FormField } from "@/components/ui/FormField";
import { SmsMessageEditor } from "@/components/sms/SmsMessageEditor";
import { showToastSafe } from "@/lib/toast-client";
import { confirmDialog } from "@/lib/confirm-client";
import { SMS_PLACEHOLDERS, renderSmsPreview, toReadableText, toStoredText } from "@/lib/sms-template-placeholders";

type Template = {
  code: string;
  title: string;
  content: string;
  isActive: boolean;
  isCustom: boolean;
  hasDefault: boolean;
  defaultTitle?: string;
  defaultContent?: string;
  updatedAt: string;
};

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const emptyForm = { code: "", title: "", content: "", isActive: true };

export default function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [institutionName, setInstitutionName] = useState("");
  const [institutionPhone, setInstitutionPhone] = useState("");
  const [editing, setEditing] = useState<Template | null>(null);
  const [isNewCustom, setIsNewCustom] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/sms/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(Array.isArray(d?.templates) ? d.templates : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setInstitutionName(d?.institutionName || "");
        setInstitutionPhone(d?.institutionPhone || "");
      })
      .catch(() => {});
  }, []);

  const previewContext = { institutionName: institutionName || undefined, institutionPhone: institutionPhone || undefined };

  const openCreate = () => {
    setEditing(null);
    setIsNewCustom(true);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEditCustom = (t: Template) => {
    setEditing(t);
    setIsNewCustom(false);
    setForm({ code: t.code, title: t.title, content: toReadableText(t.content), isActive: t.isActive });
    setShowForm(true);
  };

  // "Kendi Şablonum" seçilir seçilmez, henüz bir override yoksa, varsayılan
  // metin başlangıç noktası olarak editöre yüklenir — sıfırdan yazmaya
  // zorlamak yerine düzenlemeye başlanır.
  const switchToCustom = (t: Template) => {
    setEditing(t);
    setIsNewCustom(false);
    setForm({ code: t.code, title: t.title, content: toReadableText(t.content), isActive: t.isActive });
    setShowForm(true);
  };

  const switchToDefault = async (t: Template) => {
    const ok = await confirmDialog({
      title: "Varsayılan Şablona Dön",
      message: `"${t.defaultTitle ?? t.title}" için kendi özelleştirmeniz silinip sistem varsayılanı kullanılacak. Emin misiniz?`,
      confirmText: "Varsayılana Dön",
    });
    if (!ok) return;
    setSwitching(t.code);
    try {
      const res = await fetch(`/api/sms/templates?code=${encodeURIComponent(t.code)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("İşlem başarısız");
      showToastSafe({ title: "Tamamlandı", message: "Sistem varsayılanına dönüldü", type: "success" });
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    } finally {
      setSwitching(null);
    }
  };

  const deleteCustomOnly = async (t: Template) => {
    const ok = await confirmDialog({
      title: "Şablonu Sil",
      message: `"${t.title}" şablonu kalıcı olarak silinecek. Emin misiniz?`,
      danger: true,
      confirmText: "Sil",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/sms/templates?code=${encodeURIComponent(t.code)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Silinemedi");
      showToastSafe({ title: "Silindi", message: "Şablon silindi", type: "success" });
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    }
  };

  const submit = async () => {
    if (!form.code.trim() || !form.title.trim() || !form.content.trim()) {
      showToastSafe({ title: "Eksik alan", message: "Kod, başlık ve içerik zorunlu", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sms/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: form.code, title: form.title, content: toStoredText(form.content), isActive: form.isActive }),
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
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-900">SMS Şablonları</h2>
            <p className="mt-1 text-sm text-slate-500">
              Her şablon için ya sistem varsayılanını kullanın, ya da kendi metninizi tasarlayın.
            </p>
          </div>
          <Button icon={PlusCircle} size="sm" onClick={openCreate}>Yeni Özel Şablon</Button>
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-50" style={{ animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white px-6 py-14 text-center text-sm text-slate-400 shadow-sm">Şablon bulunamadı</div>
        ) : (
          templates.map((t) => (
            <div key={t.code} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">{t.title}</span>
                    {!t.isActive && <Badge tone="neutral" size="sm">Pasif</Badge>}
                  </div>
                  <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">{renderSmsPreview(t.content, previewContext)}</p>
                  <p className="mt-1 text-xs text-slate-400">Örnek bir hastaya böyle görünür</p>
                </div>
                {!t.hasDefault && (
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton icon={PenSquare} title="Düzenle" tone="neutral" onClick={() => openEditCustom(t)} />
                    <IconButton icon={Trash2} title="Sil" tone="danger" onClick={() => deleteCustomOnly(t)} />
                  </div>
                )}
              </div>

              {t.hasDefault && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => { if (t.isCustom) void switchToDefault(t); }}
                    disabled={switching === t.code}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      !t.isCustom ? "bg-primary text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {!t.isCustom && <CheckCircle2 className="h-3.5 w-3.5" />}
                    Varsayılan Şablon
                  </button>
                  <button
                    type="button"
                    onClick={() => switchToCustom(t)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      t.isCustom ? "bg-primary text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {t.isCustom && <CheckCircle2 className="h-3.5 w-3.5" />}
                    Kendi Şablonum
                  </button>
                  {t.isCustom && (
                    <IconButton icon={PenSquare} title="Kendi şablonumu düzenle" tone="neutral" size="sm" onClick={() => openEditCustom(t)} />
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={isNewCustom ? "Yeni Özel Şablon" : `Düzenle: ${editing?.title ?? ""}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>İptal</Button>
            <Button loading={saving} onClick={submit}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Başlık" required hint="Bu şablonu tanımak için kısa bir ad">
            <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </FormField>
          {isNewCustom && (
            <FormField label="Kod" required hint="Sistemdeki bilinen bir kodu yazarsanız (BILGI, HATIRLATMA, ANKET, ODEME_YAKLASIYOR, ODEME_GECIKTI, DOGUM_GUNU) o şablonu kendi metninizle değiştirirsiniz; farklı bir kod yazarsanız yeni, tamamen size özel bir şablon oluşturursunuz">
              <input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </FormField>
          )}
          <SmsMessageEditor
            value={form.content}
            onChange={(content) => setForm({ ...form, content })}
            placeholders={SMS_PLACEHOLDERS}
            previewContext={previewContext}
          />
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
