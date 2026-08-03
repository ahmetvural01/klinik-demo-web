"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";
import { Modal, DIRTY_CONFIRM_MESSAGE, DIRTY_CONFIRM_CANCEL_TEXT, DIRTY_CONFIRM_CONFIRM_TEXT } from "@/components/ui/Modal";
import { showToastSafe } from "@/lib/toast-client";
import { confirmDialog } from "@/lib/confirm-client";

type PackageDefinition = {
  id: string;
  name: string;
  treatmentType: string | null;
  sessionCount: number;
  price: number | string;
  validityDays: number;
  isActive: boolean;
};

const EMPTY_FORM = { name: "", treatmentType: "", sessionCount: "6", price: "", validityDays: "365" };

export default function PaketlerTab() {
  const [items, setItems] = useState<PackageDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PackageDefinition | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/package-definitions").catch(() => null);
    const data = await res?.json().catch(() => []);
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const formSnapshotRef = useRef(JSON.stringify(EMPTY_FORM));
  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); formSnapshotRef.current = JSON.stringify(EMPTY_FORM); setShowForm(true); };
  const openEdit = (item: PackageDefinition) => {
    setEditing(item);
    const next = {
      name: item.name,
      treatmentType: item.treatmentType || "",
      sessionCount: String(item.sessionCount),
      price: String(item.price),
      validityDays: String(item.validityDays),
    };
    setForm(next);
    formSnapshotRef.current = JSON.stringify(next);
    setShowForm(true);
  };
  const formDirty = showForm && JSON.stringify(form) !== formSnapshotRef.current;
  const requestCloseForm = async () => {
    if (formDirty && !(await confirmDialog({
      message: DIRTY_CONFIRM_MESSAGE, danger: true,
      cancelText: DIRTY_CONFIRM_CANCEL_TEXT, confirmText: DIRTY_CONFIRM_CONFIRM_TEXT,
    }))) return;
    setShowForm(false);
  };

  const save = async () => {
    if (!form.name.trim()) { showToastSafe({ title: "Eksik bilgi", message: "Paket adı zorunlu", type: "error" }); return; }
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/package-definitions/${editing.id}` : "/api/package-definitions", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          treatmentType: form.treatmentType.trim() || null,
          sessionCount: Number(form.sessionCount),
          price: Number(form.price),
          validityDays: Number(form.validityDays),
          isActive: editing ? editing.isActive : true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Paket kaydedilemedi.");
      showToastSafe({ title: editing ? "Güncellendi" : "Eklendi", message: `${form.name} paketi kaydedildi.`, type: "success" });
      setShowForm(false);
      await load();
    } catch (error) {
      showToastSafe({ title: "Hata", message: error instanceof Error ? error.message : "Paket kaydedilemedi.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: PackageDefinition) => {
    try {
      const r = await fetch(`/api/package-definitions/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.name, treatmentType: item.treatmentType, sessionCount: item.sessionCount,
          price: Number(item.price), validityDays: item.validityDays, isActive: !item.isActive,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        showToastSafe({ title: "Hata", message: e.message || "Paket durumu değiştirilemedi.", type: "error" });
        return;
      }
      await load();
    } catch {
      showToastSafe({ title: "Hata", message: "Bağlantı hatası — paket durumu değiştirilemedi.", type: "error" });
    }
  };

  const remove = async (item: PackageDefinition) => {
    if (!(await confirmDialog({ message: `"${item.name}" paketi pasifleştirilsin mi? Daha önce satılmış paketler etkilenmez.`, danger: true, confirmText: "Pasifleştir" }))) return;
    try {
      const r = await fetch(`/api/package-definitions/${item.id}`, { method: "DELETE" });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        showToastSafe({ title: "Hata", message: e.message || "Paket pasifleştirilemedi.", type: "error" });
        return;
      }
      showToastSafe({ title: "Pasifleştirildi", message: `${item.name} artık satılamaz.`, type: "success" });
      await load();
    } catch {
      showToastSafe({ title: "Hata", message: "Bağlantı hatası — paket pasifleştirilemedi.", type: "error" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black text-slate-900">Paket Şablonları</h3>
          <p className="mt-0.5 text-xs text-slate-500">Hasta kartından satılabilecek çok seanslı paketler (ör. &quot;6 Seans Detertraj&quot;).</p>
        </div>
        <Button onClick={openCreate}>Yeni Paket</Button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-100 bg-white py-10 text-center text-sm text-slate-400">Yükleniyor…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-100 bg-white py-10 text-center text-sm text-slate-400">Henüz paket şablonu yok</div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100 bg-white">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-800">{item.name}</p>
                  {!item.isActive && <Badge tone="neutral">Pasif</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {item.sessionCount} seans · ₺{Number(item.price).toLocaleString("tr-TR")} · {item.validityDays} gün geçerli
                  {item.treatmentType ? ` · ${item.treatmentType}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => openEdit(item)}>Düzenle</Button>
                <Button size="sm" variant="secondary" onClick={() => void toggleActive(item)}>{item.isActive ? "Pasif Yap" : "Aktif Yap"}</Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(item)}>Sil</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        isDirty={formDirty}
        title={editing ? "Paketi Düzenle" : "Yeni Paket Şablonu"}
        footer={(
          <>
            <Button variant="secondary" onClick={() => void requestCloseForm()}>Vazgeç</Button>
            <Button loading={saving} onClick={save}>{editing ? "Güncelle" : "Kaydet"}</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <FormField label="Paket Adı" required>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="6 Seans Detertraj" />
          </FormField>
          <FormField label="İlgili Tedavi Türü (opsiyonel)">
            <input value={form.treatmentType} onChange={(e) => setForm((f) => ({ ...f, treatmentType: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Detertraj" />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Seans Sayısı" required>
              <input type="number" min={1} value={form.sessionCount} onChange={(e) => setForm((f) => ({ ...f, sessionCount: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </FormField>
            <FormField label="Fiyat (₺)" required>
              <input type="number" min={0} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </FormField>
            <FormField label="Geçerlilik (gün)" required>
              <input type="number" min={1} value={form.validityDays} onChange={(e) => setForm((f) => ({ ...f, validityDays: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </FormField>
          </div>
        </div>
      </Modal>
    </div>
  );
}
