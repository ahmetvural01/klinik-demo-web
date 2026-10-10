"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CreditCard, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { FormModal } from "@/components/ui/FormModal";
import { Input } from "@/components/ui/Input";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";

type PosDevice = { id: string; name: string; isActive: boolean; createdAt: string; paymentCount?: number; inUse?: boolean };

const NETWORK_ERROR = "Bağlantınızı kontrol edin ve tekrar deneyin.";

async function readMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return (data && typeof data.message === "string" && data.message) || fallback;
}

/**
 * Ayarlar > Fiyat ve ödeme > POS cihazları (şubeye özel). Kullanılmış cihaz
 * silinmez, pasife alınır; bu yüzden "Sil" yalnız hiç kullanılmamış cihazda
 * görünür (önceden her satırda Sil ve Pasife al aynı işi yapıyordu). Ayar
 * okuma yetkisi olan da listeyi görür; değiştirmek için yazma yetkisi gerekir.
 */
export default function PosTab({ canWrite, scopeBadge }: { canWrite: boolean; scopeBadge?: ReactNode }) {
  const [devices, setDevices] = useState<PosDevice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<{ id: string | null; name: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/pos-devices?usage=1", { cache: "no-store" });
      if (!response.ok) throw new Error(await readMessage(response, "POS cihazları yüklenemedi."));
      const data = await response.json();
      // Pasif cihazlar listenin sonunda.
      setDevices(Array.isArray(data) ? [...data].sort((a: PosDevice, b: PosDevice) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "tr")) : []);
      setLoaded(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "POS cihazları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) {
      setFormError("Cihaz adını yazın.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch(form.id ? `/api/pos-devices/${form.id}` : "/api/pos-devices", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        setFormError(await readMessage(response, "POS cihazı kaydedilemedi."));
        return;
      }
      showToastSafe({ message: form.id ? "POS cihazının adı güncellendi." : `${name} eklendi. Kartlı tahsilatta seçilebilir.`, type: "success" });
      setForm(null);
      void load();
    } catch {
      // Form açık kalır ve yazılan ad korunur; kullanıcı yeniden deneyebilir.
      setFormError(`POS cihazı kaydedilemedi. ${NETWORK_ERROR}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (device: PosDevice) => {
    setBusyId(device.id);
    try {
      const response = await fetch(`/api/pos-devices/${device.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !device.isActive }),
      });
      if (!response.ok) {
        showToastSafe({ message: await readMessage(response, "POS durumu değiştirilemedi."), type: "error" });
        return;
      }
      showToastSafe({ message: device.isActive ? `${device.name} pasife alındı; yeni tahsilatlarda seçilemez.` : `${device.name} yeniden kullanıma açıldı.`, type: "success" });
      void load();
    } catch {
      showToastSafe({ message: `POS durumu değiştirilemedi. ${NETWORK_ERROR}`, type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (device: PosDevice) => {
    if (!(await confirmDialog({
      title: `"${device.name}" silinsin mi?`,
      message: "Bu cihazla hiç tahsilat alınmadı; listeden tamamen kaldırılır.",
      danger: true,
      confirmText: "Sil",
    }))) return;
    setBusyId(device.id);
    try {
      const response = await fetch(`/api/pos-devices/${device.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        showToastSafe({ message: data?.message || "POS cihazı silinemedi.", type: "error" });
        return;
      }
      // Bu arada tahsilatta kullanılmışsa sunucu silmez, pasife alır.
      showToastSafe({
        message: data?.deactivated ? `${device.name} ile alınmış tahsilatlar olduğu için silinmedi, pasife alındı.` : `${device.name} silindi.`,
        type: "success",
      });
      void load();
    } catch {
      showToastSafe({ message: `POS cihazı silinemedi. ${NETWORK_ERROR}`, type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  // Yalnız istisna (pasif) işaretlenir.
  const nameCell = (device: PosDevice) => (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="font-semibold text-slate-800">{device.name}</span>
      {!device.isActive && <Badge tone="neutral">Pasif</Badge>}
    </span>
  );

  // Yalnız kullanılmış cihazda kullanım yazılır ("Kullanılmadı" her satırda tekrar etmez).
  const usageText = (device: PosDevice) => (device.paymentCount
    ? `${device.paymentCount.toLocaleString("tr-TR")} tahsilat`
    : device.inUse ? "Taksitte kullanıldı" : "");

  const openEdit = (device: PosDevice) => { setFormError(null); setForm({ id: device.id, name: device.name }); };

  // Eylemler satır sonundaki çerçevesiz "…" menüsünde (sadelik K3).
  const menuItems = (device: PosDevice): ActionMenuItem[] => {
    const busy = busyId === device.id;
    return [
      { key: "edit", label: "Adını düzenle", icon: Pencil, disabled: busy, onSelect: () => openEdit(device) },
      {
        key: "toggle",
        label: device.isActive ? "Pasife al" : "Yeniden kullanıma aç",
        description: device.isActive ? "Yeni tahsilatta seçilemez" : undefined,
        icon: Power,
        disabled: busy,
        onSelect: () => void toggleActive(device),
      },
      ...(device.inUse === false
        ? [{ key: "delete", label: "Sil", description: "Hiç kullanılmadı", icon: Trash2, danger: true, separatorBefore: true, disabled: busy, onSelect: () => void remove(device) }]
        : []),
    ];
  };
  const rowMenu = (device: PosDevice) => <ActionMenu items={menuItems(device)} label={`${device.name} işlemleri`} />;

  const columns: ListTableColumn<PosDevice>[] = [
    { key: "name", header: "Cihaz", render: nameCell },
    { key: "usage", header: "Kullanım", align: "right", render: (device) => <span className="text-sm tabular-nums text-slate-500">{usageText(device)}</span> },
    ...(canWrite ? [{ key: "actions", header: "İşlemler", align: "right" as const, render: rowMenu }] : []),
  ];

  return (
    <>
      <ListTable
        title="POS cihazları"
        badge={scopeBadge}
        subtitle="Kartlı tahsilatta seçilir. Pasif cihaz yeni tahsilatta görünmez."
        actions={canWrite ? (
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => { setFormError(null); setForm({ id: null, name: "" }); }}>Yeni POS cihazı</Button>
        ) : undefined}
        columns={columns}
        rows={devices}
        rowKey={(device) => device.id}
        loading={loading && !loaded}
        error={loaded ? null : loadError}
        staleError={loaded ? loadError : null}
        onRetry={() => void load()}
        emptyIcon={CreditCard}
        emptyText="Henüz POS cihazı yok"
        emptyDescription={canWrite ? "Kartla tahsilat alıyorsanız kullandığınız POS cihazını ekleyin." : undefined}
        rowClassName={(device) => (device.isActive ? "" : "opacity-70")}
        // Satıra tıklamak ad düzenleme penceresini açar (menüdeki "Adını düzenle" ile aynı).
        onRowClick={canWrite ? openEdit : undefined}
        getRowAriaLabel={(device) => `${device.name} POS cihazının adını düzenle`}
        mobileCard={(device) => (
          <div className="flex min-h-7 min-w-0 items-center justify-between gap-3">
            {nameCell(device)}
            {usageText(device) && <span className="shrink-0 text-xs tabular-nums text-slate-500">{usageText(device)}</span>}
          </div>
        )}
        mobileCardActions={canWrite ? rowMenu : undefined}
      />

      <FormModal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? "POS cihazını düzenle" : "Yeni POS cihazı"}
        size="sm"
        onSubmit={() => save()}
        submitting={saving}
      >
        {form && (
          <FormField label="Cihaz adı" htmlFor="pos-cihaz-adi" required error={formError || undefined} hint="Tahsilat ekranında bu adla görünür.">
            <Input
              id="pos-cihaz-adi"
              autoFocus
              value={form.name}
              maxLength={120}
              placeholder="ör. İşbankası POS"
              onChange={(event) => setForm((current) => (current ? { ...current, name: event.target.value } : current))}
            />
          </FormField>
        )}
      </FormModal>
    </>
  );
}
