"use client";

import { useEffect, useState } from "react";
import { CreditCard, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { SettingsListHeader } from "./SettingsListHeader";

type PosDevice = { id: string; name: string; isActive: boolean; createdAt: string };

const NETWORK_ERROR = "Bağlantınızı kontrol edin ve tekrar deneyin.";

async function readMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return (data && typeof data.message === "string" && data.message) || fallback;
}

export default function PosTab({ canWrite }: { canWrite: boolean }) {
  const [devices, setDevices] = useState<PosDevice[]>([]);
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
      const response = await fetch("/api/pos-devices", { cache: "no-store" });
      if (!response.ok) throw new Error(await readMessage(response, "POS cihazları yüklenemedi."));
      const data = await response.json();
      // Pasif cihazlar listenin sonunda.
      setDevices(Array.isArray(data) ? [...data].sort((a: PosDevice, b: PosDevice) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "tr")) : []);
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
      message: "Bu cihazla alınmış tahsilat varsa kayıtlar korunur ve cihaz yalnız pasife alınır. Hiç kullanılmadıysa tamamen silinir.",
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
      // Geçmiş tahsilatı olan cihaz sunucuda silinmez, pasife alınır — kullanıcıya
      // "silindi" denirse listede durmaya devam etmesi kafa karıştırıyordu.
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

  // Yalnız istisna (pasif) işaretlenir; her satırda "kullanımda" yazmak gereksizdi.
  const nameCell = (device: PosDevice) => (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="font-semibold text-slate-800">{device.name}</span>
      {!device.isActive && <Badge tone="neutral">Pasif · tahsilatta seçilemez</Badge>}
    </span>
  );

  const rowActions = (device: PosDevice) => (
    <div className="flex shrink-0 justify-end gap-1.5">
      <IconButton icon={Pencil} title="Adını düzenle" size="sm" disabled={busyId === device.id} onClick={() => { setFormError(null); setForm({ id: device.id, name: device.name }); }} />
      <IconButton icon={Power} title={device.isActive ? "Pasife al" : "Yeniden kullanıma aç"} size="sm" disabled={busyId === device.id} onClick={() => void toggleActive(device)} />
      <IconButton icon={Trash2} title="Sil" tone="danger" size="sm" disabled={busyId === device.id} onClick={() => void remove(device)} />
    </div>
  );

  const columns: ListTableColumn<PosDevice>[] = [
    { key: "name", header: "Cihaz", render: (device) => nameCell(device) },
    ...(canWrite ? [{ key: "actions", header: "", align: "right" as const, render: (device: PosDevice) => rowActions(device) }] : []),
  ];

  return (
    <div className="space-y-3">
      <SettingsListHeader
        title="POS cihazları"
        description="Kartla alınan tahsilatlarda hangi POS cihazının kullanıldığı seçilir. Pasif cihaz yeni tahsilatta görünmez."
        action={canWrite ? (
          <Button icon={Plus} onClick={() => { setFormError(null); setForm({ id: null, name: "" }); }}>Yeni POS cihazı</Button>
        ) : null}
      />
      <ListTable
        columns={columns}
        rows={devices}
        rowKey={(device) => device.id}
        loading={loading}
        error={loadError}
        onRetry={() => void load()}
        emptyIcon={CreditCard}
        emptyText="Henüz POS cihazı yok"
        emptyDescription={canWrite ? "Kartla tahsilat alıyorsanız kullandığınız POS cihazını ekleyin." : undefined}
        rowClassName={(device) => (device.isActive ? "" : "opacity-70")}
        mobileCard={(device) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">{nameCell(device)}</div>
            {canWrite && rowActions(device)}
          </div>
        )}
      />

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? "POS cihazını düzenle" : "Yeni POS cihazı"}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>Vazgeç</Button>
            <Button onClick={() => void save()} loading={saving}>Kaydet</Button>
          </>
        )}
      >
        {form && (
          <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <FormField label="Cihaz adı" htmlFor="pos-cihaz-adi" required error={formError || undefined} hint="Banka veya cihaz adını yazın; tahsilat ekranında bu adla görünür.">
              <Input
                id="pos-cihaz-adi"
                value={form.name}
                maxLength={120}
                placeholder="örn: İşbankası POS"
                onChange={(event) => setForm((current) => (current ? { ...current, name: event.target.value } : current))}
              />
            </FormField>
          </form>
        )}
      </Modal>
    </div>
  );
}
