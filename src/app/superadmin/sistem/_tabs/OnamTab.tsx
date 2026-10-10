"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Section } from "@/components/ui/Section";
import { SaveBar } from "@/components/ui/SaveBar";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { FormSkeleton } from "@/components/ui/PageSkeleton";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { dateTime } from "@/components/superadmin/sa-format";
import { errorMessage, saGet, saSend } from "@/components/superadmin/sa-fetch";

const MIN_LENGTH = 200;

type ConsentTemplate = {
  id: string;
  title: string;
  category: string;
  body: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type OldTemplate = {
  id: string;
  title: string;
  category: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  institution?: { name: string } | null;
  _count?: { consents: number };
};

function countSections(body: string) {
  return (body.match(/^##\s+/gm) || []).length;
}

/**
 * Tüm kliniklerin kullandığı tek KVKK ve tedavi onam metni. Belge başlığı
 * sunucuda sabittir (değiştirilemez). Kaydet/Vazgeç ekranın altındaki ortak
 * kaydetme çubuğunda (değişiklik varken görünür; önceden elle yazılmış
 * yapışkan çubuk metnin üstüne biniyordu) ve kaydedilmemiş metinle sayfadan
 * çıkılırken tarayıcı uyarır (Rol Yetkileri ile aynı).
 */
export default function OnamTab() {
  const [template, setTemplate] = useState<ConsentTemplate | null>(null);
  const [oldTemplates, setOldTemplates] = useState<OldTemplate[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState("");

  const sectionCount = useMemo(() => countSections(body), [body]);
  const length = body.trim().length;
  const dirty = template ? body !== template.body : body.trim().length > 0;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await saGet<{ template: ConsentTemplate | null; oldTemplates?: OldTemplate[] }>("/api/superadmin/consent-template", "Onam paketi yüklenemedi.");
      setTemplate(data?.template ?? null);
      setOldTemplates(Array.isArray(data?.oldTemplates) ? data.oldTemplates : []);
      setBody(data?.template?.body || "");
    } catch (error) {
      setLoadError(errorMessage(error, "Onam paketi yüklenemedi."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const save = async () => {
    if (length < MIN_LENGTH) {
      setSaveError(`Onam metni en az ${MIN_LENGTH} karakter olmalı (şu an ${length}).`);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await saSend("/api/superadmin/consent-template", "PUT", { body }, "Onam paketi kaydedilemedi.");
      showToastSafe({ type: "success", message: "Onam paketi kaydedildi. Klinikler yeni onamlarda bu metni kullanır.", icon: "clipboard" });
      await load();
    } catch (error) {
      setSaveError(errorMessage(error, "Onam paketi kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const deleteOld = async (item: OldTemplate) => {
    const confirmed = await confirmDialog({
      title: "Eski şablon silinsin mi?",
      message: `"${item.title}" kullanılmayan eski bir şablon. İmzalanmış hasta onamları silinmez.`,
      confirmText: "Sil",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (!confirmed) return;
    setDeletingId(item.id);
    try {
      await saSend(`/api/superadmin/consent-template?id=${encodeURIComponent(item.id)}`, "DELETE", undefined, "Şablon silinemedi.");
      setOldTemplates((current) => current.filter((row) => row.id !== item.id));
      showToastSafe({ type: "success", message: "Eski şablon silindi.", icon: "clipboard" });
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Şablon silinemedi.") });
    } finally {
      setDeletingId("");
    }
  };

  if (loading) return <FormSkeleton fields={2} columns={1} />;
  if (loadError) return <LoadErrorState message={loadError} onRetry={() => void load()} />;

  const tooShort = length < MIN_LENGTH;

  return (
    <div className={`grid gap-4 ${oldTemplates.length > 0 ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
      <Section
        title={template?.title || "Kapsamlı Klinik Onam ve KVKK Paketi"}
        description={`Kliniklerde hastaya imzalatılan tek onam metni. Son değişiklik: ${template?.updatedAt ? dateTime(template.updatedAt) : "—"}.`}
      >
        <div className="space-y-3">
          <FormErrorBanner message={saveError} />
          <FormField
            label="Onam metni"
            htmlFor="consent-body"
            error={dirty && tooShort ? `En az ${MIN_LENGTH} karakter gerekli (şu an ${length}).` : undefined}
            hint={`${sectionCount} bölüm · ${length.toLocaleString("tr-TR")} karakter. Bölüm başlıkları "## 1. Başlık" biçiminde yazılır; yazdırırken form düzenine çevrilir.`}
          >
            <Textarea id="consent-body" rows={24} value={body} onChange={(event) => setBody(event.target.value)} className="min-h-[480px] font-mono leading-relaxed" />
          </FormField>
        </div>
      </Section>

      {/* Eski sürümler yalnız varsa yer kaplar (önceden boşken de yan sütun açıktı). */}
      {oldTemplates.length > 0 ? (
        <Section title={`Eski şablonlar (${oldTemplates.length})`} description="Artık kullanılmayan şablonlar. Silmek imzalı onamları etkilemez." className="h-fit">
          <ul className="max-h-[520px] divide-y divide-slate-100 overflow-auto">
            {oldTemplates.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.institution?.name || "Tüm klinikler"} · {dateTime(item.updatedAt)}</p>
                  <p className="text-xs text-slate-500">{item._count?.consents || 0} imzalı onamda kullanıldı</p>
                </div>
                <IconButton icon={Trash2} title="Sil" tone="danger" size="sm" disabled={deletingId === item.id} onClick={() => void deleteOld(item)} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void save()}
        onDiscard={() => {
          setBody(template?.body || "");
          setSaveError(null);
        }}
        message={tooShort ? `En az ${MIN_LENGTH} karakter gerekli (şu an ${length})` : "Onam metninde kaydedilmemiş değişiklik var"}
      />
    </div>
  );
}
