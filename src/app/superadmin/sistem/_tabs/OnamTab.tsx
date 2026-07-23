"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { showToastSafe } from "@/lib/toast-client";
import { confirmDialog } from "@/lib/confirm-client";

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

function formatDate(value: string) {
  return new Date(value).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

function countSections(body: string) {
  return (body.match(/^##\s+/gm) || []).length;
}

export default function OnamTab() {
  const [template, setTemplate] = useState<ConsentTemplate | null>(null);
  const [oldTemplates, setOldTemplates] = useState<OldTemplate[]>([]);
  const [title, setTitle] = useState("Kapsamlı Klinik Onam ve KVKK Paketi");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const sectionCount = useMemo(() => countSections(body), [body]);
  const wordCount = useMemo(() => body.trim().split(/\s+/).filter(Boolean).length, [body]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/superadmin/consent-template", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Onam paketi yüklenemedi.");
      setTemplate(data.template);
      setOldTemplates(Array.isArray(data.oldTemplates) ? data.oldTemplates : []);
      setTitle(data.template?.title || "Kapsamlı Klinik Onam ve KVKK Paketi");
      setBody(data.template?.body || "");
    } catch (error) {
      showToastSafe({ title: "Hata", message: error instanceof Error ? error.message : "Onam paketi yüklenemedi.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/superadmin/consent-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Onam paketi kaydedilemedi.");
      setTemplate(data);
      showToastSafe({ title: "Kaydedildi", message: "Onam paketi kaydedildi. Klinik ekranları bu metni kullanacak.", type: "success" });
      await load();
    } catch (error) {
      showToastSafe({ title: "Hata", message: error instanceof Error ? error.message : "Onam paketi kaydedilemedi.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteOld(id: string) {
    const confirmed = await confirmDialog({
      title: "Şablonu Sil",
      message: "Bu pasif onam şablonu silinsin mi? İmzalı hasta kayıtları saklanmaya devam eder.",
      confirmText: "Sil",
      danger: true,
    });
    if (!confirmed) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/superadmin/consent-template?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Şablon silinemedi.");
      setOldTemplates((current) => current.filter((item) => item.id !== id));
      showToastSafe({ title: "Silindi", message: "Pasif onam şablonu silindi.", type: "success" });
    } catch (error) {
      showToastSafe({ title: "Hata", message: error instanceof Error ? error.message : "Şablon silinemedi.", type: "error" });
    } finally {
      setDeletingId("");
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Kliniklerde kullanılan tek kapsamlı KVKK ve tedavi onam metni.</p>
        <Button onClick={() => void save()} disabled={loading || body.trim().length < 200} loading={saving}>
          Paketi Kaydet
        </Button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_220px]">
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">Belge Başlığı</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-bold uppercase text-slate-500">Bölüm</p>
                <p className="text-lg font-black text-slate-900">{sectionCount}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-bold uppercase text-slate-500">Kelime</p>
                <p className="text-lg font-black text-slate-900">{wordCount}</p>
              </div>
            </div>

            <label className="mb-1 block text-sm font-bold text-slate-700">Onam Metni</label>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={30}
              className="min-h-[640px] w-full rounded-lg border border-slate-200 px-3 py-3 font-mono text-sm leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">Başlıklar için <code>## 1. Başlık</code> formatı kullanılır; klinik yazdırma çıktısı bu bölümleri profesyonel form düzenine dönüştürür.</p>
              <Button onClick={() => void save()} disabled={body.trim().length < 200} loading={saving}>
                Paketi Kaydet
              </Button>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">Aktif Paket</h3>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <p><span className="font-semibold text-slate-900">Başlık:</span> {template?.title || "-"}</p>
                <p><span className="font-semibold text-slate-900">Durum:</span> Aktif global paket</p>
                <p><span className="font-semibold text-slate-900">Güncelleme:</span> {template?.updatedAt ? formatDate(template.updatedAt) : "-"}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-slate-900">Eski Şablonlar</h3>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{oldTemplates.length}</span>
              </div>
              <div className="max-h-[620px] space-y-2 overflow-auto pr-1">
                {oldTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg bg-slate-50 px-3 py-8 text-center text-slate-400">
                    <FileText className="mb-2 h-8 w-8 text-slate-200" />
                    <p className="text-sm">Silinebilir pasif şablon yok.</p>
                  </div>
                ) : (
                  oldTemplates.map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900">{item.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.institution?.name || "Global"} · {formatDate(item.updatedAt)}</p>
                          <p className="mt-1 text-xs text-slate-500">{item._count?.consents || 0} imzalı kayıt bağlantısı</p>
                        </div>
                        <IconButton
                          icon={Trash2}
                          title="Sil"
                          tone="danger"
                          size="sm"
                          disabled={deletingId === item.id}
                          onClick={() => void deleteOld(item.id)}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
