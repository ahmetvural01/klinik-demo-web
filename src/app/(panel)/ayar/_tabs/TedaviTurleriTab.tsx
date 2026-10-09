"use client";

import { useEffect, useState } from "react";
import { Palette, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/lib/confirm-client";
import { invalidateCachedGet } from "@/lib/client-cache";
import { showToastSafe } from "@/lib/toast-client";
import { SettingsListHeader } from "./SettingsListHeader";

type TreatmentType = { id: string; value: string; label: string; color: string; order: number; isActive: boolean; appointmentCount?: number };

// Randevu takvimi türleri bu önbellekten okur; değişiklik hemen görünsün.
const refreshCalendar = () => invalidateCachedGet("/api/appointments/calendar-settings");
type TreatmentForm = { id: string | null; label: string; color: string };

const NETWORK_ERROR = "Bağlantınızı kontrol edin ve tekrar deneyin.";
// Takvimde birbirinden kolay ayrılan hazır renkler; özel renk de seçilebilir.
const COLOR_PRESETS = ["#2563eb", "#0d9488", "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#7c3aed", "#475569"];

async function readMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return (data && typeof data.message === "string" && data.message) || fallback;
}

function ColorDot({ color }: { color: string }) {
  return <span className="inline-block h-4 w-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: color }} aria-hidden="true" />;
}

export default function TedaviTurleriTab({ canWrite }: { canWrite: boolean }) {
  const [items, setItems] = useState<TreatmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<TreatmentForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/treatment-types", { cache: "no-store" });
      if (!response.ok) throw new Error(await readMessage(response, "Tedavi türleri yüklenemedi."));
      const data = await response.json();
      // Pasif türler listenin sonunda; kendi aralarında kayıtlı sıra korunur.
      setItems(Array.isArray(data) ? [...data].sort((a: TreatmentType, b: TreatmentType) => Number(b.isActive) - Number(a.isActive)) : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Tedavi türleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openForm = (item?: TreatmentType) => {
    setFormError(null);
    setForm(item ? { id: item.id, label: item.label, color: item.color } : { id: null, label: "", color: COLOR_PRESETS[0] });
  };

  const save = async () => {
    if (!form) return;
    const label = form.label.trim();
    if (!label) {
      setFormError("Tedavi adını yazın.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch(form.id ? `/api/treatment-types/${form.id}` : "/api/treatment-types", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, color: form.color }),
      });
      if (!response.ok) {
        setFormError(await readMessage(response, "Tedavi türü kaydedilemedi."));
        return;
      }
      showToastSafe({ message: form.id ? "Tedavi türü güncellendi." : `${label} eklendi. Randevu formunda seçilebilir.`, type: "success" });
      refreshCalendar();
      setForm(null);
      void load();
    } catch {
      setFormError(`Tedavi türü kaydedilemedi. ${NETWORK_ERROR}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: TreatmentType) => {
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/treatment-types/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      if (!response.ok) {
        showToastSafe({ message: await readMessage(response, "Tedavi türünün durumu değiştirilemedi."), type: "error" });
        return;
      }
      showToastSafe({ message: item.isActive ? `${item.label} pasife alındı; yeni randevuda seçilemez.` : `${item.label} randevu formunda yeniden görünecek.`, type: "success" });
      refreshCalendar();
      void load();
    } catch {
      showToastSafe({ message: `Tedavi türünün durumu değiştirilemedi. ${NETWORK_ERROR}`, type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: TreatmentType) => {
    if (!(await confirmDialog({
      title: `"${item.label}" silinsin mi?`,
      message: "Bu tür hiçbir randevuda kullanılmadı; listeden tamamen kaldırılır.",
      danger: true,
      confirmText: "Sil",
    }))) return;
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/treatment-types/${item.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        showToastSafe({ message: data?.message || "Tedavi türü silinemedi.", type: "error" });
        return;
      }
      // Sunucu, bu arada randevuda kullanılmış türü silmez, pasife alır.
      showToastSafe({ message: data?.deactivated ? data.message : `${item.label} silindi.`, type: "success" });
      refreshCalendar();
      void load();
    } catch {
      showToastSafe({ message: `Tedavi türü silinemedi. ${NETWORK_ERROR}`, type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const rowActions = (item: TreatmentType) => (
    <div className="flex shrink-0 justify-end gap-1.5">
      <IconButton icon={Pencil} title="Düzenle" size="sm" disabled={busyId === item.id} onClick={() => openForm(item)} />
      <IconButton icon={Power} title={item.isActive ? "Pasife al (randevu formunda gizle)" : "Yeniden kullanıma aç"} size="sm" disabled={busyId === item.id} onClick={() => void toggleActive(item)} />
      {!item.appointmentCount && (
        <IconButton icon={Trash2} title="Sil (hiç kullanılmadı)" tone="danger" size="sm" disabled={busyId === item.id} onClick={() => void remove(item)} />
      )}
    </div>
  );

  // Yalnız istisna (pasif) işaretlenir; her satırda "seçilebilir" yazmak
  // listeyi kalabalıklaştırıyordu.
  const nameCell = (item: TreatmentType) => (
    <span className="flex min-w-0 flex-wrap items-center gap-2.5">
      <ColorDot color={item.color} />
      <span className="font-semibold text-slate-800">{item.label}</span>
      {!item.isActive && <Badge tone="neutral">Pasif · randevuda görünmez</Badge>}
    </span>
  );

  const usageText = (item: TreatmentType) => (item.appointmentCount ? `${item.appointmentCount.toLocaleString("tr-TR")} randevu` : "Kullanılmadı");

  const columns: ListTableColumn<TreatmentType>[] = [
    { key: "label", header: "Tedavi türü", render: nameCell },
    {
      key: "usage",
      header: "Kullanıldığı randevu",
      align: "right",
      render: (item) => <span className="text-sm tabular-nums text-slate-600">{usageText(item)}</span>,
    },
    ...(canWrite ? [{ key: "actions", header: "", align: "right" as const, render: rowActions }] : []),
  ];

  return (
    <div className="space-y-3">
      <SettingsListHeader
        title="Tedavi türleri"
        description="Randevu formundaki “Tedavi” listesi. Renk, takvimde randevu kutusunun rengidir. Randevuda kullanılmış tür silinemez; pasife alınca yeni randevuda seçilemez."
        action={canWrite ? <Button icon={Plus} onClick={() => openForm()}>Yeni tedavi türü</Button> : null}
      />
      <ListTable
        columns={columns}
        rows={items}
        rowKey={(item) => item.id}
        loading={loading}
        error={loadError}
        onRetry={() => void load()}
        emptyIcon={Palette}
        emptyText="Henüz tedavi türü yok"
        rowClassName={(item) => (item.isActive ? "" : "opacity-70")}
        mobileCard={(item) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {nameCell(item)}
              <p className="mt-1 text-xs text-slate-500">{usageText(item)}</p>
            </div>
            {canWrite && rowActions(item)}
          </div>
        )}
      />

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? "Tedavi türünü düzenle" : "Yeni tedavi türü"}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>Vazgeç</Button>
            <Button onClick={() => void save()} loading={saving}>Kaydet</Button>
          </>
        )}
      >
        {form && (
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <FormField label="Tedavi adı" htmlFor="tedavi-turu-adi" required error={formError || undefined}>
              <Input
                id="tedavi-turu-adi"
                value={form.label}
                maxLength={120}
                placeholder="örn: Diş Beyazlatma"
                onChange={(event) => setForm((current) => (current ? { ...current, label: event.target.value } : current))}
              />
            </FormField>
            <div>
              <p className="ui-form-label mb-1.5 text-xs font-bold text-slate-800">Takvim rengi</p>
              <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Takvim rengi">
                {COLOR_PRESETS.map((color) => {
                  const selected = form.color.toLowerCase() === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`Renk ${color}`}
                      onClick={() => setForm((current) => (current ? { ...current, color } : current))}
                      className={`h-8 w-8 rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${selected ? "border-slate-900" : "border-white shadow-[0_0_0_1px_rgb(15_23_42/0.12)]"}`}
                      style={{ backgroundColor: color }}
                    />
                  );
                })}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(event) => setForm((current) => (current ? { ...current, color: event.target.value } : current))}
                    className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  Başka renk
                </label>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
