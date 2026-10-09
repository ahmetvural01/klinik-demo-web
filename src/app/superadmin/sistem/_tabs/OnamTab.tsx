"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { createModuleEmptyIcon } from "@/components/ui/ModuleIcon";
import { clientMutation } from "@/lib/client-mutation";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { dateTime } from "@/components/superadmin/sa-format";

const OnamEmptyIcon = createModuleEmptyIcon("clipboard");
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
 * sunucuda sabittir (değiştirilemez); önceden düzenlenebilir görünüp
 * kaydedilince sessizce yok sayılıyordu. Tek "Kaydet" vardır ve kısa metinde
 * neden basılamadığı yazar.
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
      const res = await fetch("/api/superadmin/consent-template", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.message || "Onam paketi yüklenemedi.");
      setTemplate(data.template);
      setOldTemplates(Array.isArray(data.oldTemplates) ? data.oldTemplates : []);
      setBody(data.template?.body || "");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Onam paketi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (length < MIN_LENGTH) {
      setSaveError(`Onam metni en az ${MIN_LENGTH} karakter olmalı (şu an ${length}).`);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await clientMutation(
        "/api/superadmin/consent-template",
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) },
        "Onam paketi kaydedilemedi.",
      );
      showToastSafe({ type: "success", message: "Onam paketi kaydedildi. Klinikler yeni onamlarda bu metni kullanır.", icon: "clipboard" });
      await load();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Onam paketi kaydedilemedi.");
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
      await clientMutation(`/api/superadmin/consent-template?id=${encodeURIComponent(item.id)}`, { method: "DELETE" }, "Şablon silinemedi.");
      setOldTemplates((current) => current.filter((row) => row.id !== item.id));
      showToastSafe({ type: "success", message: "Eski şablon silindi.", icon: "clipboard" });
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Şablon silinemedi." });
    } finally {
      setDeletingId("");
    }
  };

  if (loading) return <div className="ui-surface"><ListRowSkeleton rows={4} /></div>;
  if (loadError) return <LoadErrorState message={loadError} onRetry={() => void load()} />;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="ui-surface space-y-3 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">{template?.title || "Kapsamlı Klinik Onam ve KVKK Paketi"}</h2>
          <p className="text-sm text-slate-500">
            Kliniklerde hastaya imzalatılan tek onam metni. Son değişiklik: {template?.updatedAt ? dateTime(template.updatedAt) : "—"}.
          </p>
        </div>
        <FormErrorBanner message={saveError} />
        <FormField
          label="Onam metni"
          htmlFor="consent-body"
          hint={`${sectionCount} bölüm · ${length.toLocaleString("tr-TR")} karakter. Bölüm başlıkları "## 1. Başlık" biçiminde yazılır; yazdırırken form düzenine çevrilir.`}
        >
          <Textarea id="consent-body" rows={24} value={body} onChange={(event) => setBody(event.target.value)} className="min-h-[480px] font-mono leading-relaxed" />
        </FormField>
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 bg-[rgb(var(--app-surface))] px-4 pt-3 sm:-mx-5 sm:px-5">
          {length < MIN_LENGTH && <span className="text-xs font-semibold text-amber-700">En az {MIN_LENGTH} karakter gerekli (şu an {length}).</span>}
          {dirty && length >= MIN_LENGTH && <span className="text-xs text-slate-500">Kaydedilmemiş değişiklik var.</span>}
          <Button loading={saving} disabled={!dirty || length < MIN_LENGTH} onClick={() => void save()}>Kaydet</Button>
        </div>
      </section>

      <aside className="ui-surface h-fit p-4">
        <h2 className="text-sm font-bold text-slate-900">Eski şablonlar ({oldTemplates.length})</h2>
        <p className="mb-3 text-xs text-slate-500">Artık kullanılmayan şablonlar. Silmek imzalı onamları etkilemez.</p>
        {oldTemplates.length === 0 ? (
          <EmptyState icon={OnamEmptyIcon} illustrative compact title="Silinebilecek eski şablon yok" />
        ) : (
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
        )}
      </aside>
    </div>
  );
}
