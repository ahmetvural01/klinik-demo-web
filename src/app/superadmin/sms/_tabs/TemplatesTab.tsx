"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Switch } from "@/components/ui/Switch";
import { Toolbar } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { SmsMessageEditor } from "@/components/sms/SmsMessageEditor";
import { showToastSafe } from "@/lib/toast-client";
import { SMS_PLACEHOLDERS, renderSmsPreview, toReadableText, toStoredText } from "@/lib/sms-template-placeholders";
import { TabIntro } from "@/components/superadmin/TabIntro";
import { codeFromTitle } from "@/components/superadmin/sa-labels";
import { errorMessage, isAbort, saGet, saSend } from "@/components/superadmin/sa-fetch";

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

const CATEGORIES: Record<string, string> = { APPOINTMENT: "Randevu", PAYMENT: "Ödeme", GREETING: "Kutlama", AFTERCARE: "Randevu sonrası", GENERAL: "Genel" };

type FormState = {
  title: string;
  description: string;
  category: string;
  content: string;
  sameForWhatsapp: boolean;
  whatsappContent: string;
  whatsappTemplateName: string;
  whatsappTemplateLanguage: string;
  isActive: boolean;
};

const EMPTY: FormState = { title: "", description: "", category: "GENERAL", content: "", sameForWhatsapp: true, whatsappContent: "", whatsappTemplateName: "", whatsappTemplateLanguage: "tr", isActive: true };

function sameText(a: string | null | undefined, b: string | null | undefined) {
  return (a || "").trim() === (b || "").trim();
}

/**
 * Tüm kliniklerin varsayılan SMS/WhatsApp şablonları. Liste sade: başlık,
 * kategori, ilk satır, WhatsApp metninin SMS ile aynı mı özel mi olduğu.
 * Önceden her kartta ham kod, iki önizleme (özel metin yoksa aynısı iki kez)
 * ve tarih vardı; düzenlerken WhatsApp alanı SMS metnini kopyalıyor, sonradan
 * SMS değişince WhatsApp eski metinde kalıyordu. Artık "SMS ile aynı" açıkken
 * ayrı kopya yazılmaz.
 */
export default function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<Template | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    saGet<Template[]>("/api/superadmin/sms-templates", "Şablonlar yüklenemedi.", controller.signal)
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch((error) => {
        if (!isAbort(error)) setLoadError(errorMessage(error, "Şablonlar yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return templates.filter((item) => (!category || item.category === category)
      && (!q || item.title.toLocaleLowerCase("tr-TR").includes(q) || item.content.toLocaleLowerCase("tr-TR").includes(q)));
  }, [templates, query, category]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (item: Template) => {
    const same = !item.whatsappContent || sameText(item.whatsappContent, item.content);
    setEditing(item);
    setForm({
      title: item.title,
      description: item.description || "",
      category: item.category,
      content: toReadableText(item.content),
      sameForWhatsapp: same,
      whatsappContent: same ? "" : toReadableText(item.whatsappContent || ""),
      whatsappTemplateName: item.whatsappTemplateName || "",
      whatsappTemplateLanguage: item.whatsappTemplateLanguage || "tr",
      isActive: item.isActive,
    });
    setFormError(null);
    setOpen(true);
  };

  const uniqueCode = (title: string) => {
    const base = codeFromTitle(title) || "OZEL_SABLON";
    const taken = new Set(templates.map((item) => item.code));
    if (!taken.has(base)) return base;
    let index = 2;
    while (taken.has(`${base}_${index}`)) index += 1;
    return `${base}_${index}`;
  };

  const save = async () => {
    if (!form.title.trim()) return setFormError("Şablon başlığını yazın.");
    if (!form.content.trim()) return setFormError("Mesaj metnini yazın.");
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        content: toStoredText(form.content),
        // Tek metin: aynı metin WhatsApp'tan da gider; eski ayrı WhatsApp metni
        // ve Meta şablon adı temizlenir.
        whatsappContent: "",
        whatsappTemplateName: "",
        whatsappTemplateLanguage: "tr",
        isActive: form.isActive,
      };
      // Yeni şablonda sistem kodu başlıktan üretilir ve mevcut bir kodla
      // çakışmaz (aynı kodla kayıt mevcut şablonun üzerine yazardı).
      if (editing) await saSend("/api/superadmin/sms-templates", "PUT", { id: editing.id, ...payload }, "Şablon kaydedilemedi.");
      else await saSend("/api/superadmin/sms-templates", "POST", { code: uniqueCode(form.title), ...payload }, "Şablon kaydedilemedi.");
      showToastSafe({ type: "success", message: `${payload.title} kaydedildi.`, icon: "sms" });
      setOpen(false);
      reload();
    } catch (error) {
      setFormError(errorMessage(error, "Şablon kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const columns: ListTableColumn<Template>[] = [
    {
      key: "title",
      header: "Şablon",
      render: (item) => (
        <div className="min-w-0 max-w-xl">
          <p className="font-semibold text-slate-900">{item.title}</p>
          <p className="truncate text-xs text-slate-500">{renderSmsPreview(item.content)}</p>
        </div>
      ),
    },
    { key: "category", header: "Kategori", render: (item) => <Badge tone="info">{CATEGORIES[item.category] || "Genel"}</Badge> },
    { key: "status", header: "Durum", render: (item) => <Badge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Kullanımda" : "Pasif"}</Badge> },
    { key: "actions", header: "", align: "right", render: (item) => <IconButton icon={Pencil} title="Düzenle" size="sm" onClick={() => openEdit(item)} /> },
  ];

  return (
    <section className="space-y-3">
      <TabIntro
        text="Tüm kliniklerin varsayılan mesajları. Klinikler kendi metinlerini İletişim ekranından değiştirebilir."
        actions={<Button icon={Plus} onClick={openCreate}>Yeni şablon</Button>}
      />
      <ListTable<Template>
        header={
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} placeholder="Şablon adı veya metin" wrapperClassName="flex-1 min-w-[220px]" />
            <Select aria-label="Kategori" value={category} onChange={(event) => setCategory(event.target.value)} className="sm:w-48">
              <option value="">Tüm kategoriler</option>
              {Object.entries(CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Toolbar>
        }
        columns={columns}
        rows={filtered}
        rowKey={(item) => item.id}
        loading={loading}
        error={loadError}
        onRetry={reload}
        onRowClick={openEdit}
        getRowAriaLabel={(item) => `${item.title} şablonunu düzenle`}
        rowClassName={(item) => (item.isActive ? "" : "opacity-60")}
        emptyText={query || category ? "Bu aramaya uyan şablon yok" : "Şablon yok"}
        mobileCard={(item) => (
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-semibold text-slate-900">{item.title}</p>
              <Badge tone="info">{CATEGORIES[item.category] || "Genel"}</Badge>
            </div>
            <p className="line-clamp-2 text-xs text-slate-500">{renderSmsPreview(item.content)}</p>
            {!item.isActive && <div className="flex items-center gap-1.5"><Badge tone="neutral">Pasif</Badge></div>}
          </div>
        )}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Şablonu düzenle" : "Yeni şablon"}
        description={editing ? `Sistem kodu: ${editing.code}` : "Sistem kodu başlıktan otomatik oluşturulur."}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button loading={saving} onClick={() => void save()}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormErrorBanner message={formError} />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Başlık" htmlFor="template-title" required hint="Ör. Randevu hatırlatması">
              <Input id="template-title" value={form.title} onChange={(event) => set("title", event.target.value)} />
            </FormField>
            <FormField label="Kategori" htmlFor="template-category">
              <Select id="template-category" value={form.category} onChange={(event) => set("category", event.target.value)}>
                {Object.entries(CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Ne zaman kullanılır?" htmlFor="template-description" hint="Kliniklere gösterilen kısa açıklama">
                <Input id="template-description" value={form.description} onChange={(event) => set("description", event.target.value)} />
              </FormField>
            </div>
          </div>
          <SmsMessageEditor value={form.content} onChange={(content) => set("content", content)} placeholders={SMS_PLACEHOLDERS} label="Mesaj metni" hint="Aynı metin WhatsApp bağlı kliniklerde WhatsApp'tan, diğerlerinde SMS ile gider." />
          <Switch checked={form.isActive} onChange={(checked) => set("isActive", checked)} label="Şablon aktif" description="Kapalı şablon kliniklerin listesinde pasif olarak görünür." />
        </div>
      </Modal>
    </section>
  );
}
