"use client";

import { useEffect, useMemo, useState } from "react";

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

export default function SuperadminConsentPage() {
  const [template, setTemplate] = useState<ConsentTemplate | null>(null);
  const [oldTemplates, setOldTemplates] = useState<OldTemplate[]>([]);
  const [title, setTitle] = useState("Kapsamlı Klinik Onam ve KVKK Paketi");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState("");

  const sectionCount = useMemo(() => countSections(body), [body]);
  const wordCount = useMemo(() => body.trim().split(/\s+/).filter(Boolean).length, [body]);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/superadmin/consent-template", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Onam paketi yüklenemedi.");
      setTemplate(data.template);
      setOldTemplates(Array.isArray(data.oldTemplates) ? data.oldTemplates : []);
      setTitle(data.template?.title || "Kapsamlı Klinik Onam ve KVKK Paketi");
      setBody(data.template?.body || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Onam paketi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/superadmin/consent-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Onam paketi kaydedilemedi.");
      setTemplate(data);
      setMessage("Onam paketi kaydedildi. Klinik ekranları bu metni kullanacak.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Onam paketi kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOld(id: string) {
    if (!window.confirm("Bu pasif onam şablonu silinsin mi? İmzalı hasta kayıtları saklanmaya devam eder.")) return;
    setDeletingId(id);
    setMessage("");
    try {
      const res = await fetch(`/api/superadmin/consent-template?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Şablon silinemedi.");
      setOldTemplates((current) => current.filter((item) => item.id !== id));
      setMessage("Pasif onam şablonu silindi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Şablon silinemedi.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">📝</span>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Onam Paketi</h2>
            <p className="text-sm text-gray-500">Kliniklerde kullanılan tek kapsamlı KVKK ve tedavi onam metni.</p>
          </div>
        </div>
        <button
          onClick={() => void save()}
          disabled={saving || loading || body.trim().length < 200}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Kaydediliyor..." : "Paketi Kaydet"}
        </button>
      </div>

      {message && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
          {message}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-gray-100 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_220px]">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Belge Başlığı</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-xs font-bold uppercase text-gray-500">Bölüm</p>
                <p className="text-lg font-black text-gray-900">{sectionCount}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-xs font-bold uppercase text-gray-500">Kelime</p>
                <p className="text-lg font-black text-gray-900">{wordCount}</p>
              </div>
            </div>

            <label className="mb-1 block text-sm font-medium text-gray-700">Onam Metni</label>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={30}
              className="min-h-[640px] w-full rounded-lg border border-gray-200 px-3 py-3 font-mono text-sm leading-relaxed outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-gray-500">Başlıklar için <code>## 1. Başlık</code> formatı kullanılır; klinik yazdırma çıktısı bu bölümleri profesyonel form düzenine dönüştürür.</p>
              <button
                onClick={() => void save()}
                disabled={saving || body.trim().length < 200}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Kaydediliyor..." : "Paketi Kaydet"}
              </button>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-gray-900">Aktif Paket</h3>
              <div className="mt-3 space-y-2 text-sm text-gray-600">
                <p><span className="font-semibold text-gray-900">Başlık:</span> {template?.title || "-"}</p>
                <p><span className="font-semibold text-gray-900">Durum:</span> Aktif global paket</p>
                <p><span className="font-semibold text-gray-900">Güncelleme:</span> {template?.updatedAt ? formatDate(template.updatedAt) : "-"}</p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-gray-900">Eski Şablonlar</h3>
                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600">{oldTemplates.length}</span>
              </div>
              <div className="max-h-[620px] space-y-2 overflow-auto pr-1">
                {oldTemplates.length === 0 ? (
                  <p className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">Silinebilir pasif şablon yok.</p>
                ) : (
                  oldTemplates.map((item) => (
                    <div key={item.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-gray-900">{item.title}</p>
                          <p className="mt-1 text-xs text-gray-500">{item.institution?.name || "Global"} · {formatDate(item.updatedAt)}</p>
                          <p className="mt-1 text-xs text-gray-500">{item._count?.consents || 0} imzalı kayıt bağlantısı</p>
                        </div>
                        <button
                          onClick={() => void deleteOld(item.id)}
                          disabled={deletingId === item.id}
                          className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          {deletingId === item.id ? "Siliniyor" : "Sil"}
                        </button>
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
