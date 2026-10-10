"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Palette, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { FormModal } from "@/components/ui/FormModal";
import { Input } from "@/components/ui/Input";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { confirmDialog } from "@/lib/confirm-client";
import { invalidateCachedGet } from "@/lib/client-cache";
import { showToastSafe } from "@/lib/toast-client";

type AppointmentType = { id: string; value: string; label: string; color: string; order: number; isActive: boolean; appointmentCount?: number };

// Randevu takvimi türleri bu önbellekten okur; değişiklik hemen görünsün.
const refreshCalendar = () => invalidateCachedGet("/api/appointments/calendar-settings");
type TypeForm = { id: string | null; label: string; color: string };

const NETWORK_ERROR = "Bağlantınızı kontrol edin ve tekrar deneyin.";
// Takvimde birbirinden kolay ayrılan hazır renkler (ekran okuyucu adlarıyla);
// özel renk de seçilebilir.
const COLOR_PRESETS = [
  { value: "#2563eb", name: "Mavi" },
  { value: "#0d9488", name: "Turkuaz" },
  { value: "#16a34a", name: "Yeşil" },
  { value: "#ca8a04", name: "Hardal" },
  { value: "#ea580c", name: "Turuncu" },
  { value: "#dc2626", name: "Kırmızı" },
  { value: "#db2777", name: "Pembe" },
  { value: "#7c3aed", name: "Mor" },
  { value: "#475569", name: "Gri" },
] as const;

/** Ad karşılaştırması sunucuyla aynı (api/treatment-types treatmentLabelKey): büyük/küçük harf, I/ı ve fazladan boşluk fark etmez. */
const labelKey = (label: string) => label.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR").replace(/ı/g, "i");

async function readMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return (data && typeof data.message === "string" && data.message) || fallback;
}

function ColorDot({ color }: { color: string }) {
  return <span className="inline-block h-4 w-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: color }} aria-hidden="true" />;
}

/**
 * Ayarlar > Randevu > Randevu türleri. Randevu formundaki tür listesi ve
 * takvimdeki renkler. Önceden "Tedavi türleri" adını taşıyordu; fiyat
 * listesindeki tedavi kalemleri ve tedavi planıyla karışıyordu.
 */
export default function RandevuTurleri({ canWrite, scopeBadge }: { canWrite: boolean; scopeBadge?: ReactNode }) {
  const [items, setItems] = useState<AppointmentType[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<TypeForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/treatment-types", { cache: "no-store" });
      if (!response.ok) throw new Error(await readMessage(response, "Randevu türleri yüklenemedi."));
      const data = await response.json();
      // Pasif türler listenin sonunda; kendi aralarında kayıtlı sıra korunur.
      setItems(Array.isArray(data) ? [...data].sort((a: AppointmentType, b: AppointmentType) => Number(b.isActive) - Number(a.isActive)) : []);
      setLoaded(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Randevu türleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openForm = (item?: AppointmentType) => {
    setFormError(null);
    setForm(item ? { id: item.id, label: item.label, color: item.color } : { id: null, label: "", color: COLOR_PRESETS[0].value });
  };

  const save = async () => {
    if (!form) return;
    const label = form.label.trim().replace(/\s+/g, " ");
    if (!label) {
      setFormError("Randevu türünün adını yazın.");
      return;
    }
    // Aynı adla ikinci tür randevu formunda iki kez görünüyor, raporları
    // bölüyordu (canlı H-5). Sunucu da 409 ile reddeder; burada beklemeden söylenir.
    // Ad değişmediyse denetlenmez (sunucu da yalnız ad değişince bakar):
    // canlıdaki eski çift adlı türlerin rengi/adı düzenlenebilsin.
    const original = form.id ? items.find((item) => item.id === form.id) : null;
    const nameChanged = !original || labelKey(original.label) !== labelKey(label);
    const duplicate = nameChanged ? items.find((item) => item.id !== form.id && labelKey(item.label) === labelKey(label)) : undefined;
    if (duplicate) {
      setFormError(`"${duplicate.label}" adında bir randevu türü zaten var${duplicate.isActive ? "" : " (pasif)"}. Var olanı düzenleyin ya da başka bir ad yazın.`);
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
        setFormError(await readMessage(response, "Randevu türü kaydedilemedi."));
        return;
      }
      showToastSafe({ message: form.id ? "Randevu türü güncellendi." : `${label} eklendi. Randevu formunda seçilebilir.`, type: "success" });
      refreshCalendar();
      setForm(null);
      void load();
    } catch {
      setFormError(`Randevu türü kaydedilemedi. ${NETWORK_ERROR}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: AppointmentType) => {
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/treatment-types/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      if (!response.ok) {
        showToastSafe({ message: await readMessage(response, "Randevu türünün durumu değiştirilemedi."), type: "error" });
        return;
      }
      showToastSafe({ message: item.isActive ? `${item.label} pasife alındı; yeni randevuda seçilemez.` : `${item.label} randevu formunda yeniden görünecek.`, type: "success" });
      refreshCalendar();
      void load();
    } catch {
      showToastSafe({ message: `Randevu türünün durumu değiştirilemedi. ${NETWORK_ERROR}`, type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: AppointmentType) => {
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
        showToastSafe({ message: data?.message || "Randevu türü silinemedi.", type: "error" });
        return;
      }
      // Sunucu, bu arada randevuda kullanılmış türü silmez, pasife alır.
      showToastSafe({ message: data?.deactivated ? data.message : `${item.label} silindi.`, type: "success" });
      refreshCalendar();
      void load();
    } catch {
      showToastSafe({ message: `Randevu türü silinemedi. ${NETWORK_ERROR}`, type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  // Sil yalnız hiç kullanılmamış türde görünür; kullanılmış tür pasife alınır.
  const rowActions = (item: AppointmentType) => (
    <div className="flex shrink-0 justify-end gap-1.5">
      <IconButton icon={Pencil} title="Düzenle" size="sm" disabled={busyId === item.id} onClick={() => openForm(item)} />
      <IconButton icon={Power} title={item.isActive ? "Pasife al" : "Yeniden kullanıma aç"} size="sm" disabled={busyId === item.id} onClick={() => void toggleActive(item)} />
      {!item.appointmentCount && (
        <IconButton icon={Trash2} title="Sil (hiç kullanılmadı)" tone="danger" size="sm" disabled={busyId === item.id} onClick={() => void remove(item)} />
      )}
    </div>
  );

  // Yalnız istisna (pasif) işaretlenir.
  const nameCell = (item: AppointmentType) => (
    <span className="flex min-w-0 flex-wrap items-center gap-2.5">
      <ColorDot color={item.color} />
      <span className="font-semibold text-slate-800">{item.label}</span>
      {!item.isActive && <Badge tone="neutral">Pasif</Badge>}
    </span>
  );

  const usageText = (item: AppointmentType) => (item.appointmentCount ? `${item.appointmentCount.toLocaleString("tr-TR")} randevu` : "Kullanılmadı");

  const columns: ListTableColumn<AppointmentType>[] = [
    { key: "label", header: "Randevu türü", render: nameCell },
    {
      key: "usage",
      header: "Randevu",
      align: "right",
      render: (item) => <span className="text-sm tabular-nums text-slate-600">{usageText(item)}</span>,
    },
    ...(canWrite ? [{ key: "actions", header: "", align: "right" as const, render: rowActions }] : []),
  ];

  const presetSelected = COLOR_PRESETS.some((preset) => preset.value === form?.color.toLowerCase());

  return (
    <>
      <ListTable
        title="Randevu türleri"
        badge={scopeBadge}
        subtitle="Randevu formundaki tür listesi; renk takvimde görünür."
        actions={canWrite ? <Button variant="secondary" size="sm" icon={Plus} onClick={() => openForm()}>Yeni randevu türü</Button> : undefined}
        columns={columns}
        rows={items}
        rowKey={(item) => item.id}
        loading={loading && !loaded}
        error={loaded ? null : loadError}
        staleError={loaded ? loadError : null}
        onRetry={() => void load()}
        emptyIcon={Palette}
        emptyText="Henüz randevu türü yok"
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

      <FormModal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? "Randevu türünü düzenle" : "Yeni randevu türü"}
        size="sm"
        onSubmit={() => save()}
        submitting={saving}
      >
        {form && (
          <>
            <FormField label="Ad" htmlFor="randevu-turu-adi" required error={formError || undefined}>
              <Input
                id="randevu-turu-adi"
                autoFocus
                value={form.label}
                maxLength={120}
                placeholder="ör. Kanal tedavisi"
                onChange={(event) => setForm((current) => (current ? { ...current, label: event.target.value } : current))}
              />
            </FormField>
            <FormField as="div" label="Takvim rengi">
              <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Takvim rengi">
                {COLOR_PRESETS.map((preset) => {
                  const selected = form.color.toLowerCase() === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={preset.name}
                      title={preset.name}
                      onClick={() => setForm((current) => (current ? { ...current, color: preset.value } : current))}
                      className={`h-8 w-8 rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${selected ? "border-slate-900" : "border-white shadow-[0_0_0_1px_rgb(15_23_42/0.12)]"}`}
                      style={{ backgroundColor: preset.value }}
                    />
                  );
                })}
                <label className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-xs font-semibold hover:bg-slate-50 ${presetSelected ? "border-slate-200 text-slate-600" : "border-slate-900 text-slate-900"}`}>
                  <input
                    type="color"
                    value={form.color}
                    onChange={(event) => setForm((current) => (current ? { ...current, color: event.target.value } : current))}
                    className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  Başka renk
                </label>
              </div>
            </FormField>
          </>
        )}
      </FormModal>
    </>
  );
}
