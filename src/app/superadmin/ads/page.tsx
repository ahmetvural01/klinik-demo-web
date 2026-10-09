"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Switch } from "@/components/ui/Switch";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { createModuleEmptyIcon } from "@/components/ui/ModuleIcon";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { shortDate } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet, saSend } from "@/components/superadmin/sa-fetch";

const AdsEmptyIcon = createModuleEmptyIcon("chart");

type Ad = {
  id: string;
  title: string;
  content: string;
  imageUrl?: string | null;
  ctaText?: string | null;
  ctaUrl?: string | null;
  sponsorName?: string | null;
  isActive: boolean;
  startAt?: string | null;
  endAt?: string | null;
  createdAt: string;
};

const EMPTY = { title: "", content: "", imageUrl: "", ctaText: "", ctaUrl: "", sponsorName: "", startAt: "", endAt: "", isActive: false };

/**
 * Reklamlar. ÖNEMLİ: klinik panelinde reklamların gösterildiği bir alan henüz
 * yok; bu yüzden menüden kaldırıldı ve sayfanın başında açıkça yazıyor.
 * Kayıtlar korunur. Etkisiz alanlar (öncelik, toplam/günlük gösterim sınırı —
 * hiçbir yerde uygulanmıyordu) formdan çıkarıldı; mevcut değerleri değişmez.
 */
export default function AdsPage() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<Ad | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    saGet<Ad[]>("/api/superadmin/ads", "Reklamlar yüklenemedi.", controller.signal)
      .then((data) => setAds(Array.isArray(data) ? data : []))
      .catch((error) => {
        if (!isAbort(error)) setLoadError(errorMessage(error, "Reklamlar yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm((current) => ({ ...current, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (ad: Ad) => {
    setEditing(ad);
    setForm({
      title: ad.title, content: ad.content, imageUrl: ad.imageUrl ?? "", ctaText: ad.ctaText ?? "", ctaUrl: ad.ctaUrl ?? "",
      sponsorName: ad.sponsorName ?? "", startAt: ad.startAt ? ad.startAt.slice(0, 10) : "", endAt: ad.endAt ? ad.endAt.slice(0, 10) : "", isActive: ad.isActive,
    });
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) return setFormError("Başlık ve metin zorunlu.");
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        imageUrl: form.imageUrl.trim() || null,
        ctaText: form.ctaText.trim() || null,
        ctaUrl: form.ctaUrl.trim() || null,
        sponsorName: form.sponsorName.trim() || null,
        startAt: form.startAt || null,
        endAt: form.endAt || null,
        isActive: form.isActive,
      };
      if (editing) await saSend("/api/superadmin/ads", "PUT", { id: editing.id, ...payload }, "Reklam kaydedilemedi.");
      else await saSend("/api/superadmin/ads", "POST", payload, "Reklam kaydedilemedi.");
      showToastSafe({ type: "success", message: `${payload.title} kaydedildi.` });
      setOpen(false);
      reload();
    } catch (error) {
      setFormError(errorMessage(error, "Reklam kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (ad: Ad) => {
    if (ad.isActive) {
      const ok = await confirmDialog({ title: "Reklam durdurulsun mu?", message: `"${ad.title}" pasife alınacak.`, confirmText: "Durdur", cancelText: "Vazgeç" });
      if (!ok) return;
    }
    setBusyId(ad.id);
    try {
      await saSend("/api/superadmin/ads", "PUT", { id: ad.id, isActive: !ad.isActive }, "Reklam güncellenemedi.");
      showToastSafe({ type: "success", message: ad.isActive ? `${ad.title} durduruldu.` : `${ad.title} aktif.` });
      reload();
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Reklam güncellenemedi.") });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (ad: Ad) => {
    const ok = await confirmDialog({ title: "Reklam silinsin mi?", message: `"${ad.title}" kalıcı olarak silinecek.`, confirmText: "Sil", cancelText: "Vazgeç", danger: true });
    if (!ok) return;
    setBusyId(ad.id);
    try {
      await saSend("/api/superadmin/ads", "DELETE", { id: ad.id }, "Reklam silinemedi.");
      showToastSafe({ type: "success", message: `${ad.title} silindi.` });
      reload();
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Reklam silinemedi.") });
    } finally {
      setBusyId(null);
    }
  };

  const actions = (ad: Ad) => (
    <div className="flex items-center justify-end gap-1.5">
      <IconButton icon={ad.isActive ? Pause : Play} title={ad.isActive ? "Durdur" : "Aktif et"} size="sm" disabled={busyId === ad.id} onClick={() => void toggle(ad)} />
      <IconButton icon={Pencil} title="Düzenle" size="sm" onClick={() => openEdit(ad)} />
      <IconButton icon={Trash2} title="Sil" tone="danger" size="sm" disabled={busyId === ad.id} onClick={() => void remove(ad)} />
    </div>
  );

  const columns: ListTableColumn<Ad>[] = [
    {
      key: "title",
      header: "Reklam",
      render: (ad) => (
        <div className="min-w-0 max-w-xl">
          <p className="font-semibold text-slate-900">{ad.title}</p>
          <p className="line-clamp-1 text-xs text-slate-500">{ad.content}</p>
        </div>
      ),
    },
    { key: "sponsor", header: "Sponsor", render: (ad) => ad.sponsorName || <EmptyValue /> },
    { key: "range", header: "Tarih aralığı", render: (ad) => <span className="whitespace-nowrap text-sm text-slate-600">{ad.startAt || ad.endAt ? `${shortDate(ad.startAt) || "—"} – ${shortDate(ad.endAt) || "süresiz"}` : "Süresiz"}</span> },
    { key: "status", header: "Durum", render: (ad) => <Badge tone={ad.isActive ? "success" : "neutral"}>{ad.isActive ? "Aktif" : "Pasif"}</Badge> },
    { key: "actions", header: "", align: "right", render: actions },
  ];

  return (
    <section className="space-y-4">
      <PageHeader icon="chart" title="Reklamlar" description="Sponsorlu içerik kayıtları." actions={<Button icon={Plus} onClick={openCreate}>Yeni reklam</Button>} />

      <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Klinik panelinde reklamların gösterildiği bir alan henüz yok: burada “aktif” görünen reklamlar hiçbir klinikte görünmez. Sponsorlara gösterim sözü vermeyin.
      </p>

      <ListTable<Ad>
        columns={columns}
        rows={ads}
        rowKey={(ad) => ad.id}
        loading={loading}
        error={loadError}
        onRetry={reload}
        emptyText="Reklam yok"
        emptyIcon={AdsEmptyIcon}
        emptyIllustrative
        rowClassName={(ad) => (ad.isActive ? "" : "opacity-70")}
        mobileCard={(ad) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-semibold text-slate-900">{ad.title}</p>
              <Badge tone={ad.isActive ? "success" : "neutral"}>{ad.isActive ? "Aktif" : "Pasif"}</Badge>
            </div>
            <p className="line-clamp-2 text-xs text-slate-500">{ad.content}</p>
            {actions(ad)}
          </div>
        )}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Reklamı düzenle" : "Yeni reklam"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button loading={saving} onClick={() => void save()}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormErrorBanner message={formError} />
          <FormField label="Başlık" htmlFor="ad-title" required>
            <Input id="ad-title" value={form.title} onChange={(event) => set("title", event.target.value)} />
          </FormField>
          <FormField label="Metin" htmlFor="ad-content" required>
            <Textarea id="ad-content" rows={3} value={form.content} onChange={(event) => set("content", event.target.value)} />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Sponsor" htmlFor="ad-sponsor">
              <Input id="ad-sponsor" value={form.sponsorName} onChange={(event) => set("sponsorName", event.target.value)} />
            </FormField>
            <FormField label="Görsel adresi" htmlFor="ad-image">
              <Input id="ad-image" value={form.imageUrl} onChange={(event) => set("imageUrl", event.target.value)} placeholder="https://" />
            </FormField>
            <FormField label="Düğme yazısı" htmlFor="ad-cta-text">
              <Input id="ad-cta-text" value={form.ctaText} onChange={(event) => set("ctaText", event.target.value)} placeholder="İncele" />
            </FormField>
            <FormField label="Düğme bağlantısı" htmlFor="ad-cta-url">
              <Input id="ad-cta-url" value={form.ctaUrl} onChange={(event) => set("ctaUrl", event.target.value)} placeholder="https://" />
            </FormField>
            <FormField label="Başlangıç" htmlFor="ad-start">
              <Input id="ad-start" type="date" value={form.startAt} onChange={(event) => set("startAt", event.target.value)} />
            </FormField>
            <FormField label="Bitiş" htmlFor="ad-end">
              <Input id="ad-end" type="date" value={form.endAt} onChange={(event) => set("endAt", event.target.value)} />
            </FormField>
          </div>
          <Switch checked={form.isActive} onChange={(checked) => set("isActive", checked)} label="Aktif" description="Gösterim alanı yapılana kadar aktif reklam da kliniklerde görünmez." />
        </div>
      </Modal>
    </section>
  );
}
