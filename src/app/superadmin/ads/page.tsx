"use client";

import { useEffect, useState } from "react";
import { Megaphone, PlusCircle, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FormField } from "@/components/ui/FormField";
import { showToastSafe } from "@/lib/toast-client";
import { confirmDialog } from "@/lib/confirm-client";

type Ad = {
  id: string;
  title: string;
  content: string;
  imageUrl?: string | null;
  ctaText?: string | null;
  ctaUrl?: string | null;
  sponsorName?: string | null;
  priority: number;
  isActive: boolean;
  startAt?: string | null;
  endAt?: string | null;
  maxImpressions?: number | null;
  dailyCap?: number | null;
  createdAt: string;
  _count?: { assignments: number };
};

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const emptyForm = {
  title: "", content: "", imageUrl: "", ctaText: "", ctaUrl: "", sponsorName: "",
  priority: "100", startAt: "", endAt: "", maxImpressions: "", dailyCap: "", isActive: true,
};

export default function AdsPage() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Ad | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/superadmin/ads")
      .then((r) => r.json())
      .then((d) => setAds(Array.isArray(d) ? d : d.ads ?? []))
      .catch(() => setAds([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggle = async (ad: Ad) => {
    try {
      const res = await fetch("/api/superadmin/ads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ad.id, isActive: !ad.isActive }),
      });
      if (!res.ok) throw new Error("Güncellenemedi");
      showToastSafe({ title: ad.isActive ? "Durduruldu" : "Yayınlandı", message: "Reklam durumu güncellendi", type: "success" });
      load();
    } catch {
      showToastSafe({ title: "Hata", message: "Reklam durumu güncellenemedi", type: "error" });
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (ad: Ad) => {
    setEditing(ad);
    setForm({
      title: ad.title, content: ad.content, imageUrl: ad.imageUrl ?? "",
      ctaText: ad.ctaText ?? "", ctaUrl: ad.ctaUrl ?? "", sponsorName: ad.sponsorName ?? "",
      priority: String(ad.priority), startAt: ad.startAt ? ad.startAt.slice(0, 10) : "",
      endAt: ad.endAt ? ad.endAt.slice(0, 10) : "",
      maxImpressions: ad.maxImpressions ? String(ad.maxImpressions) : "",
      dailyCap: ad.dailyCap ? String(ad.dailyCap) : "", isActive: ad.isActive,
    });
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      showToastSafe({ title: "Eksik alan", message: "Başlık ve içerik zorunlu", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        imageUrl: form.imageUrl.trim() || null,
        ctaText: form.ctaText.trim() || null,
        ctaUrl: form.ctaUrl.trim() || null,
        sponsorName: form.sponsorName.trim() || null,
        priority: Number(form.priority) || 100,
        startAt: form.startAt || null,
        endAt: form.endAt || null,
        maxImpressions: form.maxImpressions ? Number(form.maxImpressions) : null,
        dailyCap: form.dailyCap ? Number(form.dailyCap) : null,
        isActive: form.isActive,
      };
      const res = await fetch("/api/superadmin/ads", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...payload, id: editing.id } : payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Kaydedilemedi");
      showToastSafe({ title: "Kaydedildi", message: `${d.title} reklamı kaydedildi`, type: "success" });
      setShowForm(false);
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ad: Ad) => {
    const ok = await confirmDialog({
      title: "Reklamı Sil",
      message: `"${ad.title}" reklamı kalıcı olarak silinecek. Emin misiniz?`,
      danger: true,
      confirmText: "Sil",
    });
    if (!ok) return;
    try {
      const res = await fetch("/api/superadmin/ads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ad.id }),
      });
      if (!res.ok) throw new Error("Silinemedi");
      showToastSafe({ title: "Silindi", message: "Reklam silindi", type: "success" });
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Megaphone className="h-4 w-4" />
          </span>
          <h1 className="text-lg font-black text-slate-900">Reklamlar</h1>
        </div>
        <Button icon={PlusCircle} size="sm" onClick={openCreate}>Yeni Reklam</Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse bg-slate-50" style={{ animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
        ) : ads.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-slate-400">Reklam bulunamadı</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {ads.map((ad) => (
              <div key={ad.id} className="flex items-start justify-between gap-4 p-4 transition hover:bg-slate-50/80">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">{ad.title}</span>
                    <Badge tone={ad.isActive ? "success" : "neutral"}>{ad.isActive ? "Aktif" : "Pasif"}</Badge>
                    <Badge tone="neutral" size="sm">Öncelik {ad.priority}</Badge>
                    {typeof ad._count?.assignments === "number" && (
                      <Badge tone="info" size="sm">{ad._count.assignments} kuruma atandı</Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">{ad.content}</p>
                  {ad.ctaUrl && <p className="mt-1 truncate text-xs text-primary">{ad.ctaText || "Bağlantı"}: {ad.ctaUrl}</p>}
                  {ad.sponsorName && <p className="mt-0.5 text-xs text-slate-400">Sponsor: {ad.sponsorName}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant={ad.isActive ? "danger" : "secondary"} size="sm" onClick={() => toggle(ad)}>
                    {ad.isActive ? "Durdur" : "Yayınla"}
                  </Button>
                  <IconButton icon={Pencil} title="Düzenle" tone="neutral" onClick={() => openEdit(ad)} />
                  <IconButton icon={Trash2} title="Sil" tone="danger" onClick={() => remove(ad)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? `Düzenle: ${editing.title}` : "Yeni Reklam"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>İptal</Button>
            <Button loading={saving} onClick={submit}>Kaydet</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField label="Başlık" required>
              <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label="İçerik" required>
              <textarea className={inputClass} rows={3} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Görsel URL">
            <input className={inputClass} value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..." />
          </FormField>
          <FormField label="Sponsor Adı">
            <input className={inputClass} value={form.sponsorName} onChange={(e) => setForm({ ...form, sponsorName: e.target.value })} />
          </FormField>
          <FormField label="Buton Metni">
            <input className={inputClass} value={form.ctaText} onChange={(e) => setForm({ ...form, ctaText: e.target.value })} placeholder="İncele" />
          </FormField>
          <FormField label="Buton URL">
            <input className={inputClass} value={form.ctaUrl} onChange={(e) => setForm({ ...form, ctaUrl: e.target.value })} placeholder="https://..." />
          </FormField>
          <FormField label="Öncelik">
            <input type="number" className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          </FormField>
          <FormField label="Maks. Gösterim" hint="Boş = sınırsız">
            <input type="number" className={inputClass} value={form.maxImpressions} onChange={(e) => setForm({ ...form, maxImpressions: e.target.value })} />
          </FormField>
          <FormField label="Başlangıç Tarihi">
            <input type="date" className={inputClass} value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
          </FormField>
          <FormField label="Bitiş Tarihi">
            <input type="date" className={inputClass} value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
          </FormField>
          <FormField label="Günlük Gösterim Limiti" hint="Boş = sınırsız">
            <input type="number" className={inputClass} value={form.dailyCap} onChange={(e) => setForm({ ...form, dailyCap: e.target.value })} />
          </FormField>
          <div className="flex items-end pb-2">
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
        </div>
      </Modal>
    </section>
  );
}
