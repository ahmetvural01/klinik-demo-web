"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Armchair, Pencil, Plus, Power } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { FormModal } from "@/components/ui/FormModal";
import { Input } from "@/components/ui/Input";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { showToastSafe } from "@/lib/toast-client";
import { invalidateCachedGet } from "@/lib/client-cache";

type ClinicUnit = {
  id: string;
  name: string;
  code?: string | null;
  isActive: boolean;
  _count?: { appointments: number };
};

type UnitForm = { id: string | null; name: string; code: string; isActive: boolean };

const NETWORK_ERROR = "Bağlantınızı kontrol edin ve tekrar deneyin.";

/**
 * Ayarlar > Randevu > Koltuk / oda (şubeye özel). Aynı kavram önceden beş
 * farklı adla geçiyordu ("Tedavi alanları", "Tedavi alanı", "Koltuk / oda"…);
 * her yerde "Koltuk / oda". Silme yok, yalnız pasife alma.
 */
export default function KoltukOda({ canWrite, scopeBadge }: { canWrite: boolean; scopeBadge?: ReactNode }) {
  const [items, setItems] = useState<ClinicUnit[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<UnitForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/clinic-units", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data)) throw new Error(data?.message || "Koltuk / oda listesi yüklenemedi.");
      // Pasif koltuk/odalar listenin sonunda.
      setItems([...data].sort((a: ClinicUnit, b: ClinicUnit) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "tr")));
      setLoaded(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Koltuk / oda listesi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openForm = (item?: ClinicUnit) => {
    setFormError(null);
    setForm(item
      ? { id: item.id, name: item.name, code: item.code || "", isActive: item.isActive }
      : { id: null, name: "", code: "", isActive: true });
  };

  const save = async () => {
    if (!form) return;
    const name = form.name.trim();
    if (name.length < 2) {
      setFormError("Ad en az 2 karakter olmalıdır.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch("/api/clinic-units", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.id
          ? { id: form.id, name, code: form.code, isActive: form.isActive }
          : { name, code: form.code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFormError(data?.message || "Koltuk / oda kaydedilemedi.");
        return;
      }
      showToastSafe({ message: form.id ? `${name} güncellendi.` : `${name} eklendi. Randevu formunda seçilebilir.`, type: "success" });
      invalidateCachedGet("/api/clinic-units");
      setForm(null);
      await load();
    } catch {
      setFormError(`Koltuk / oda kaydedilemedi. ${NETWORK_ERROR}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: ClinicUnit) => {
    if (actionId === item.id) return;
    setActionId(item.id);
    try {
      const response = await fetch("/api/clinic-units", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Koltuk / oda güncellenemedi.");
      showToastSafe({ message: item.isActive ? `${item.name} pasife alındı; yeni randevuda seçilemez.` : `${item.name} yeniden kullanıma açıldı.`, type: "success" });
      invalidateCachedGet("/api/clinic-units");
      await load();
    } catch (error) {
      showToastSafe({ message: error instanceof Error ? error.message : "Koltuk / oda güncellenemedi.", type: "error" });
    } finally {
      setActionId(null);
    }
  };

  // Yalnız istisna (pasif) işaretlenir.
  const nameCell = (item: ClinicUnit) => (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="font-semibold text-slate-800">{item.name}</span>
      {item.code ? <span className="text-xs font-medium text-slate-400">{item.code}</span> : null}
      {!item.isActive && <Badge tone="neutral">Pasif</Badge>}
    </span>
  );

  // Yalnız işlem süren satır kilitlenir (önceden bir satırda işlem sürerken tüm satırlar kilitleniyordu).
  const rowActions = (item: ClinicUnit) => (
    <div className="flex shrink-0 justify-end gap-1.5">
      <IconButton icon={Pencil} title="Düzenle" size="sm" disabled={actionId === item.id} onClick={() => openForm(item)} />
      <IconButton icon={Power} title={item.isActive ? "Pasife al" : "Yeniden kullanıma aç"} size="sm" disabled={actionId === item.id} onClick={() => void toggleActive(item)} />
    </div>
  );

  const usageText = (item: ClinicUnit) => {
    const count = item._count?.appointments || 0;
    return count ? `${count.toLocaleString("tr-TR")} randevu` : "Kullanılmadı";
  };

  const columns: ListTableColumn<ClinicUnit>[] = [
    { key: "name", header: "Koltuk / oda", render: nameCell },
    {
      key: "appointments",
      header: "Randevu",
      align: "right",
      render: (item) => <span className="text-sm tabular-nums text-slate-600">{usageText(item)}</span>,
    },
    ...(canWrite ? [{ key: "actions", header: "", align: "right" as const, render: rowActions }] : []),
  ];

  return (
    <>
      <ListTable
        title="Koltuk / oda"
        badge={scopeBadge}
        subtitle="Eklerseniz aynı saatte aynı koltuğa ikinci randevu verilmez."
        actions={canWrite ? <Button variant="secondary" size="sm" icon={Plus} onClick={() => openForm()}>Yeni koltuk / oda</Button> : undefined}
        columns={columns}
        rows={items}
        rowKey={(item) => item.id}
        loading={loading && !loaded}
        error={loaded ? null : loadError}
        staleError={loaded ? loadError : null}
        onRetry={() => void load()}
        emptyIcon={Armchair}
        emptyText="Koltuk takibi kapalı"
        emptyDescription="Tek koltukta çalışıyorsanız boş bırakabilirsiniz."
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
        title={form?.id ? "Koltuk / odayı düzenle" : "Yeni koltuk / oda"}
        size="sm"
        onSubmit={() => save()}
        submitting={saving}
      >
        {form && (
          <>
            <FormField label="Ad" htmlFor="koltuk-adi" required error={formError || undefined}>
              <Input
                id="koltuk-adi"
                autoFocus
                maxLength={80}
                value={form.name}
                placeholder="ör. Koltuk 1, Cerrahi oda"
                onChange={(event) => setForm((current) => (current ? { ...current, name: event.target.value } : current))}
              />
            </FormField>
            <FormField label="Kısa kod (isteğe bağlı)" htmlFor="koltuk-kod" hint="Randevu formunda adın yanında görünür (ör. Koltuk 1 · K1).">
              <Input
                id="koltuk-kod"
                maxLength={20}
                value={form.code}
                placeholder="ör. K1"
                className="uppercase"
                onChange={(event) => setForm((current) => (current ? { ...current, code: event.target.value } : current))}
              />
            </FormField>
          </>
        )}
      </FormModal>
    </>
  );
}
