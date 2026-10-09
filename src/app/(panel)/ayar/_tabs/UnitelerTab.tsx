"use client";

import { useEffect, useState } from "react";
import { Armchair, Pencil, Plus, Power } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Modal } from "@/components/ui/Modal";
import { showToastSafe } from "@/lib/toast-client";
import { invalidateCachedGet } from "@/lib/client-cache";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { SettingsListHeader } from "./SettingsListHeader";

type ClinicUnit = {
  id: string;
  name: string;
  code?: string | null;
  isActive: boolean;
  _count?: { appointments: number };
};

type UnitForm = { id: string | null; name: string; code: string; isActive: boolean };

const NETWORK_ERROR = "Bağlantınızı kontrol edin ve tekrar deneyin.";

export default function UnitelerTab() {
  const { can } = usePermissions();
  const canWriteSettings = can("settings:write");
  const [items, setItems] = useState<ClinicUnit[]>([]);
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
      if (!response.ok || !Array.isArray(data)) throw new Error(data?.message || "Tedavi alanları yüklenemedi.");
      // Pasif koltuk/odalar listenin sonunda.
      setItems([...data].sort((a: ClinicUnit, b: ClinicUnit) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "tr")));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Tedavi alanları yüklenemedi.");
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
      setFormError("Koltuk / oda adı en az 2 karakter olmalıdır.");
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
        setFormError(data?.message || "Tedavi alanı kaydedilemedi.");
        return;
      }
      showToastSafe({ message: form.id ? "Tedavi alanı güncellendi." : `${name} eklendi. Randevu formunda seçilebilir.`, type: "success" });
      invalidateCachedGet("/api/clinic-units");
      setForm(null);
      await load();
    } catch {
      setFormError(`Tedavi alanı kaydedilemedi. ${NETWORK_ERROR}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: ClinicUnit) => {
    if (actionId) return;
    setActionId(item.id);
    try {
      const response = await fetch("/api/clinic-units", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Tedavi alanı güncellenemedi.");
      showToastSafe({ message: item.isActive ? `${item.name} pasife alındı; yeni randevuda seçilemez.` : `${item.name} yeniden kullanıma açıldı.`, type: "success" });
      invalidateCachedGet("/api/clinic-units");
      await load();
    } catch (error) {
      showToastSafe({ message: error instanceof Error ? error.message : "Tedavi alanı güncellenemedi.", type: "error" });
    } finally {
      setActionId(null);
    }
  };

  // Yalnız istisna (pasif) işaretlenir; her satırda "seçilebilir" yazmak gereksizdi.
  const nameCell = (item: ClinicUnit) => (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="font-semibold text-slate-800">{item.name}</span>
      {item.code ? <span className="text-xs font-medium text-slate-400">{item.code}</span> : null}
      {!item.isActive && <Badge tone="neutral">Pasif · randevuda seçilemez</Badge>}
    </span>
  );

  const rowActions = (item: ClinicUnit) => (
    <div className="flex shrink-0 justify-end gap-1.5">
      <IconButton icon={Pencil} title="Düzenle" size="sm" disabled={Boolean(actionId)} onClick={() => openForm(item)} />
      <IconButton icon={Power} title={item.isActive ? "Pasife al" : "Yeniden kullanıma aç"} size="sm" disabled={Boolean(actionId)} onClick={() => void toggleActive(item)} />
    </div>
  );

  const columns: ListTableColumn<ClinicUnit>[] = [
    { key: "name", header: "Koltuk / oda", render: nameCell },
    {
      key: "appointments",
      header: "Randevu sayısı",
      align: "right",
      render: (item) => <span className="tabular-nums text-slate-600">{item._count?.appointments || 0}</span>,
    },
    ...(canWriteSettings ? [{ key: "actions", header: "", align: "right" as const, render: rowActions }] : []),
  ];

  return (
    <div className="space-y-3">
      <SettingsListHeader
        title="Tedavi alanları (koltuk / oda)"
        description="Aynı saatte aynı koltuğa ikinci randevu verilmesin istiyorsanız koltuk ve odalarınızı ekleyin. Tek koltuklu kliniklerde boş bırakılabilir."
        action={canWriteSettings ? <Button icon={Plus} onClick={() => openForm()}>Yeni tedavi alanı</Button> : null}
      />
      <ListTable
        columns={columns}
        rows={items}
        rowKey={(item) => item.id}
        loading={loading}
        error={loadError}
        onRetry={() => void load()}
        emptyIcon={Armchair}
        emptyText="Henüz tedavi alanı yok"
        emptyDescription="Koltuk veya oda çakışmasını takip etmeyecekseniz bu bölümü boş bırakabilirsiniz."
        rowClassName={(item) => (item.isActive ? "" : "opacity-70")}
        mobileCard={(item) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {nameCell(item)}
              <p className="mt-1 text-xs text-slate-500">{item._count?.appointments || 0} randevu</p>
            </div>
            {canWriteSettings && rowActions(item)}
          </div>
        )}
      />

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? "Tedavi alanını düzenle" : "Yeni tedavi alanı"}
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
            <FormField label="Koltuk / oda adı" htmlFor="unite-adi" required error={formError || undefined}>
              <Input
                id="unite-adi"
                maxLength={80}
                value={form.name}
                placeholder="örn: Koltuk 1, Cerrahi oda"
                onChange={(event) => setForm((current) => (current ? { ...current, name: event.target.value } : current))}
              />
            </FormField>
            <FormField label="Kısa kod (isteğe bağlı)" htmlFor="unite-kod" hint="Randevu formunda adın yanında görünür (örn: Koltuk 1 · K1).">
              <Input
                id="unite-kod"
                maxLength={20}
                value={form.code}
                placeholder="örn: K1"
                className="uppercase"
                onChange={(event) => setForm((current) => (current ? { ...current, code: event.target.value } : current))}
              />
            </FormField>
          </form>
        )}
      </Modal>
    </div>
  );
}
