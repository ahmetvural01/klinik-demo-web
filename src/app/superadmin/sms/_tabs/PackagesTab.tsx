"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Power } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { TabIntro } from "@/components/superadmin/TabIntro";
import { count, money, unitPrice } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet, saSend } from "@/components/superadmin/sa-fetch";

type Package = {
  id: string;
  name: string;
  smsCount: number;
  price: number;
  isActive: boolean;
  createdAt: string;
};

const EMPTY = { name: "", smsCount: "", price: "" };

/**
 * SMS paketleri kataloğu. Paket burada tanımlanır, kliniğe satışı klinik
 * dosyası › SMS › "Paket sat" ile yapılır (platform stoğundan düşer, fatura
 * keser). Önceden paket düzenlenemiyordu ve kırmızı "Pasif Et" onaysızdı.
 */
export default function PackagesTab() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<Package | null>(null);
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
    saGet<Package[]>("/api/superadmin/sms-packages", "SMS paketleri yüklenemedi.", controller.signal)
      .then((data) => setPackages(Array.isArray(data) ? data : []))
      .catch((error) => {
        if (!isAbort(error)) setLoadError(errorMessage(error, "SMS paketleri yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (item: Package) => {
    setEditing(item);
    setForm({ name: item.name, smsCount: String(item.smsCount), price: String(item.price) });
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    const smsCount = Number(form.smsCount);
    const price = Number(form.price.replace(",", "."));
    if (!form.name.trim()) return setFormError("Paket adını yazın.");
    if (!Number.isInteger(smsCount) || smsCount < 1) return setFormError("SMS adedi 1 veya daha büyük bir tam sayı olmalı.");
    if (!Number.isFinite(price) || price <= 0) return setFormError("Fiyat sıfırdan büyük olmalı.");
    setSaving(true);
    setFormError(null);
    try {
      const body = { name: form.name.trim(), smsCount, price };
      if (editing) await saSend(`/api/superadmin/sms-packages/${editing.id}`, "PATCH", body, "Paket kaydedilemedi.");
      else await saSend("/api/superadmin/sms-packages", "POST", body, "Paket kaydedilemedi.");
      showToastSafe({ type: "success", message: `${body.name} kaydedildi.`, icon: "sms" });
      setOpen(false);
      reload();
    } catch (error) {
      setFormError(errorMessage(error, "Paket kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: Package) => {
    if (item.isActive) {
      const ok = await confirmDialog({
        title: "Paket satıştan kaldırılsın mı?",
        message: `"${item.name}" artık kliniklere satılamaz. Daha önce satılmış SMS'ler kliniklerin bakiyesinde kalır.`,
        confirmText: "Pasife al",
        cancelText: "Vazgeç",
        danger: true,
      });
      if (!ok) return;
    }
    setBusyId(item.id);
    try {
      await saSend(`/api/superadmin/sms-packages/${item.id}`, "PATCH", { isActive: !item.isActive }, "Paket durumu değiştirilemedi.");
      showToastSafe({ type: "success", message: item.isActive ? `${item.name} pasife alındı.` : `${item.name} yeniden satışta.`, icon: "sms" });
      reload();
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Paket durumu değiştirilemedi.") });
    } finally {
      setBusyId(null);
    }
  };

  const statusBadge = (item: Package) => <Badge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Satışta" : "Pasif"}</Badge>;

  const actions = (item: Package) => (
    <div className="flex items-center justify-end gap-1.5">
      <IconButton icon={Pencil} title="Düzenle" size="sm" onClick={() => openEdit(item)} />
      <IconButton
        icon={Power}
        title={item.isActive ? "Pasife al" : "Yeniden satışa aç"}
        tone={item.isActive ? "danger" : "primary"}
        size="sm"
        disabled={busyId === item.id}
        onClick={() => void toggleActive(item)}
      />
    </div>
  );

  const columns: ListTableColumn<Package>[] = [
    { key: "name", header: "Paket", render: (item) => <span className="font-semibold text-slate-900">{item.name}</span> },
    { key: "smsCount", header: "SMS adedi", align: "right", render: (item) => <span className="tabular-nums">{count(item.smsCount)}</span> },
    { key: "price", header: "Fiyat", align: "right", render: (item) => <span className="font-semibold tabular-nums">{money(item.price)}</span> },
    { key: "unit", header: "SMS başına", align: "right", render: (item) => <span className="text-sm tabular-nums text-slate-500">{unitPrice(item.price, item.smsCount)}</span> },
    { key: "status", header: "Durum", render: statusBadge },
    { key: "actions", header: "", align: "right", render: actions },
  ];

  const previewUnit = Number(form.smsCount) > 0 && Number(form.price.replace(",", ".")) > 0 ? unitPrice(Number(form.price.replace(",", ".")), Number(form.smsCount)) : null;

  return (
    <section className="space-y-3">
      <TabIntro
        text="Kliniklere satılan SMS paketleri. Satış, klinik dosyasındaki SMS sekmesinden “Paket sat” ile yapılır."
        actions={<Button icon={Plus} onClick={openCreate}>Yeni paket</Button>}
      />
      <ListTable<Package>
        columns={columns}
        rows={packages}
        rowKey={(item) => item.id}
        loading={loading}
        error={loadError}
        onRetry={reload}
        emptyText="Henüz paket yok"
        emptyDescription="Kliniklere SMS satabilmek için önce bir paket tanımlayın."
        rowClassName={(item) => (item.isActive ? "" : "opacity-60")}
        mobileCard={(item) => (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{item.name}</p>
              <p className="text-xs text-slate-500">{count(item.smsCount)} SMS · {money(item.price)} · SMS başına {unitPrice(item.price, item.smsCount)}</p>
              <div className="mt-1">{statusBadge(item)}</div>
            </div>
            {actions(item)}
          </div>
        )}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Paketi düzenle" : "Yeni SMS paketi"}
        description={editing ? "Değişiklik yalnız bundan sonraki satışları etkiler." : undefined}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button loading={saving} onClick={() => void save()}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormErrorBanner message={formError} />
          <FormField label="Paket adı" htmlFor="package-name" required>
            <Input id="package-name" value={form.name} maxLength={80} placeholder="Ör. Başlangıç paketi" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="SMS adedi" htmlFor="package-count" required hint="Aynı adette iki paket olamaz">
              <Input id="package-count" type="number" inputMode="numeric" min="1" step="1" value={form.smsCount} onChange={(event) => setForm((current) => ({ ...current, smsCount: event.target.value }))} />
            </FormField>
            <FormField label="Fiyat (₺)" htmlFor="package-price" required hint={previewUnit ? `SMS başına ${previewUnit}` : undefined}>
              <Input id="package-price" type="number" inputMode="decimal" min="0" step="0.01" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} />
            </FormField>
          </div>
        </div>
      </Modal>
    </section>
  );
}
