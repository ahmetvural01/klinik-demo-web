"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MessageCircle, PenSquare, PlusCircle, Smartphone, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FormField } from "@/components/ui/FormField";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { SmsMessageEditor } from "@/components/sms/SmsMessageEditor";
import { showToastSafe } from "@/lib/toast-client";
import { confirmDialog } from "@/lib/confirm-client";
import { SMS_PLACEHOLDERS, renderSmsPreview, toReadableText, toStoredText } from "@/lib/sms-template-placeholders";
import { usePermissions } from "@/components/auth/PermissionProvider";

type Template = {
  code: string;
  title: string;
  description: string | null;
  category: string;
  content: string;
  whatsappContent: string | null;
  whatsappTemplateName: string | null;
  whatsappTemplateLanguage: string;
  isActive: boolean;
  isCustom: boolean;
  hasDefault: boolean;
  defaultTitle?: string;
  defaultContent?: string;
  updatedAt: string;
};

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const emptyForm = { code: "", title: "", description: "", category: "GENERAL", content: "", whatsappContent: "", whatsappTemplateName: "", whatsappTemplateLanguage: "tr", isActive: true };

const CATEGORY_LABELS: Record<string, string> = { APPOINTMENT: "Randevu", PAYMENT: "Ödeme", GREETING: "Kutlama", AFTERCARE: "Randevu Sonrası", GENERAL: "Genel" };

export default function TemplatesTab({ readOnly = false }: { readOnly?: boolean }) {
  const { can, hasFeature } = usePermissions();
  const whatsappFeatureEnabled = hasFeature("whatsapp");
  const canReadSms = can("sms:read");
  const canWriteSms = !readOnly && can("sms:write");
  const canReadWhatsapp = whatsappFeatureEnabled && can("whatsapp:read");
  const canWriteWhatsapp = !readOnly && whatsappFeatureEnabled && can("whatsapp:write");
  const canWriteAny = canWriteSms || canWriteWhatsapp;
  const canManageShared = canWriteSms && (!whatsappFeatureEnabled || canWriteWhatsapp);
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
  const [loadError, setLoadError] = useState("");

  const load = () => {
    setLoading(true);
    setLoadError("");
    fetch("/api/sms/templates")
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.message || "SMS şablonları yüklenemedi.");
        return data;
      })
      .then((d) => setTemplates(Array.isArray(d?.templates) ? d.templates : []))
      .catch((error) => setLoadError(error instanceof Error ? error.message : "SMS şablonları yüklenemedi."))
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

  const formSnapshotRef = useRef(JSON.stringify(emptyForm));
  const openCreate = () => {
    setEditing(null);
    setIsNewCustom(true);
    setForm(emptyForm);
    formSnapshotRef.current = JSON.stringify(emptyForm);
    setShowForm(true);
  };

  const openEditCustom = (t: Template) => {
    setEditing(t);
    setIsNewCustom(false);
    const next = { code: t.code, title: t.title, description: t.description || "", category: t.category, content: toReadableText(t.content), whatsappContent: toReadableText(t.whatsappContent || t.content), whatsappTemplateName: t.whatsappTemplateName || "", whatsappTemplateLanguage: t.whatsappTemplateLanguage || "tr", isActive: t.isActive };
    setForm(next);
    formSnapshotRef.current = JSON.stringify(next);
    setShowForm(true);
  };

  // "Kendi Şablonum" seçilir seçilmez, henüz bir override yoksa, varsayılan
  // metin başlangıç noktası olarak editöre yüklenir — sıfırdan yazmaya
  // zorlamak yerine düzenlemeye başlanır.
  const switchToCustom = (t: Template) => {
    setEditing(t);
    setIsNewCustom(false);
    const next = { code: t.code, title: t.title, description: t.description || "", category: t.category, content: toReadableText(t.content), whatsappContent: toReadableText(t.whatsappContent || t.content), whatsappTemplateName: t.whatsappTemplateName || "", whatsappTemplateLanguage: t.whatsappTemplateLanguage || "tr", isActive: t.isActive };
    setForm(next);
    formSnapshotRef.current = JSON.stringify(next);
    setShowForm(true);
  };
  const templateFormDirty = showForm && JSON.stringify(form) !== formSnapshotRef.current;
  const requestCloseTemplateForm = () => {
    setShowForm(false);
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
    if (!form.code.trim() || !form.title.trim() || (canWriteSms && !form.content.trim()) || (canWriteWhatsapp && !form.whatsappContent.trim())) {
      showToastSafe({ title: "Eksik alan", message: "Kod, başlık ve yetkili olduğunuz kanalın içeriği zorunlu", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sms/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          content: canWriteSms ? toStoredText(form.content) : undefined,
          whatsappContent: canWriteWhatsapp ? toStoredText(form.whatsappContent) : undefined,
          whatsappTemplateName: canWriteWhatsapp ? form.whatsappTemplateName : undefined,
          whatsappTemplateLanguage: canWriteWhatsapp ? form.whatsappTemplateLanguage : undefined,
          isActive: canManageShared ? form.isActive : undefined,
        }),
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
            <h2 className="text-sm font-black text-slate-900">İletişim Şablonları</h2>
            <p className="mt-1 text-sm text-slate-500">
              Yetkili olduğunuz iletişim kanallarının olay bazlı metinlerini tek karttan yönetin.
            </p>
          </div>
          {canManageShared && <Button icon={PlusCircle} size="sm" onClick={openCreate}>Yeni Özel Şablon</Button>}
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-50" style={{ animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
        ) : loadError ? (
          <LoadErrorState message={loadError} onRetry={load} />
        ) : templates.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white px-6 py-14 text-center text-sm text-slate-400 shadow-sm">Şablon bulunamadı</div>
        ) : (
          templates.map((t) => (
            <div key={t.code} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">{t.title}</span>
                    <Badge tone="info" size="sm">{CATEGORY_LABELS[t.category] || t.category}</Badge>
                    <Badge tone="neutral" size="sm">{t.code}</Badge>
                    {!t.isActive && <Badge tone="neutral" size="sm">Pasif</Badge>}
                  </div>
                  {t.description && <p className="mb-3 text-xs text-slate-500">{t.description}</p>}
                  <div className={`grid gap-2 ${canReadSms && canReadWhatsapp ? "md:grid-cols-2" : ""}`}>
                    {canReadSms && <div className="rounded-lg border border-sky-100 bg-sky-50/60 p-3"><p className="mb-1 flex items-center gap-1.5 text-xs font-black text-sky-700"><Smartphone className="h-3.5 w-3.5" />SMS</p><p className="text-sm leading-5 text-slate-700">{renderSmsPreview(t.content, previewContext)}</p></div>}
                    {canReadWhatsapp && <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3"><p className="mb-1 flex items-center gap-1.5 text-xs font-black text-emerald-700"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</p><p className="text-sm leading-5 text-slate-700">{renderSmsPreview(t.whatsappContent || t.content, previewContext)}</p></div>}
                  </div>
                </div>
                {canWriteAny && !t.hasDefault && (
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton icon={PenSquare} title="Düzenle" tone="neutral" onClick={() => openEditCustom(t)} />
                    {canManageShared && <IconButton icon={Trash2} title="Sil" tone="danger" onClick={() => deleteCustomOnly(t)} />}
                  </div>
                )}
              </div>

              {canWriteAny && t.hasDefault && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => { if (t.isCustom && canManageShared) void switchToDefault(t); }}
                    disabled={switching === t.code || (t.isCustom && !canManageShared)}
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
        module="sms"
        open={showForm}
        onClose={() => setShowForm(false)}
        isDirty={templateFormDirty}
        title={isNewCustom ? "Yeni Özel Şablon" : `Düzenle: ${editing?.title ?? ""}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => void requestCloseTemplateForm()}>İptal</Button>
            <Button loading={saving} onClick={submit}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Başlık" required hint="Bu şablonu tanımak için kısa bir ad">
            <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Kategori"><select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField>
            <FormField label="Açıklama"><input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Hangi durumda gönderilir?" /></FormField>
          </div>
          {isNewCustom && (
            <FormField label="Kod" required hint="Sistemdeki bilinen bir kodu yazarsanız (BILGI, HATIRLATMA, ANKET, ODEME_YAKLASIYOR, ODEME_GECIKTI, DOGUM_GUNU) o şablonu kendi metninizle değiştirirsiniz; farklı bir kod yazarsanız yeni, tamamen size özel bir şablon oluşturursunuz">
              <input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </FormField>
          )}
          {canWriteSms && <SmsMessageEditor
            value={form.content}
            onChange={(content) => setForm({ ...form, content })}
            placeholders={SMS_PLACEHOLDERS}
            previewContext={previewContext}
          />}
          {canWriteWhatsapp && <div className="space-y-3 border-t border-slate-100 pt-4"><div className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-emerald-600" /><h3 className="text-sm font-black text-slate-900">WhatsApp içeriği</h3></div><SmsMessageEditor value={form.whatsappContent} onChange={(whatsappContent) => setForm({ ...form, whatsappContent })} placeholders={SMS_PLACEHOLDERS} previewContext={previewContext} label="WhatsApp Mesajı" /><div className="grid gap-3 sm:grid-cols-2"><FormField label="Meta şablon adı" hint="Meta Business Manager'da onaylı teknik ad."><input className={inputClass} value={form.whatsappTemplateName} onChange={(e) => setForm({ ...form, whatsappTemplateName: e.target.value })} placeholder="appointment_reminder_tr" /></FormField><FormField label="Dil"><select className={inputClass} value={form.whatsappTemplateLanguage} onChange={(e) => setForm({ ...form, whatsappTemplateLanguage: e.target.value })}><option value="tr">Türkçe (tr)</option><option value="en_US">English (en_US)</option></select></FormField></div></div>}
          {canManageShared && <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="rounded border-slate-300 text-primary focus:ring-primary/30"
            />
            <span className="text-sm text-slate-700">Aktif</span>
          </label>}
        </div>
      </Modal>
    </section>
  );
}
