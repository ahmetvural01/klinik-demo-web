"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
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
  const [actionId, setActionId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/package-definitions");
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data)) throw new Error("Paket şablonları yüklenemedi.");
      setItems(data);
    } catch (error) {
      showToastSafe({ title: "Yükleme hatası", message: error instanceof Error ? error.message : "Mevcut liste korunarak işlem durduruldu.", type: "error" });
    } finally {
      setLoading(false);
    }
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
  const requestCloseForm = () => {
    setShowForm(false);
  };

  const save = async () => {
    if (!form.name.trim()) { showToastSafe({ title: "Eksik bilgi", message: "Paket adı zorunlu", type: "error" }); return; }
    const sessions = Number(form.sessionCount);
    const price = Number(form.price);
    const validity = Number(form.validityDays);
    if (!Number.isInteger(sessions) || sessions < 1 || sessions > 10_000 || !Number.isFinite(price) || price <= 0 || price > 99_999_999.99 || !Number.isInteger(validity) || validity < 1 || validity > 3650) {
      showToastSafe({ title: "Geçersiz bilgi", message: "Seans, fiyat ve geçerlilik değerlerini izin verilen aralıklarda girin.", type: "error" });
      return;
    }
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
    if (actionId) return;
    setActionId(item.id);
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
    } finally {
      setActionId(null);
    }
  };

  const remove = async (item: PackageDefinition) => {
    if (actionId) return;
    if (!(await confirmDialog({ message: `"${item.name}" paketi pasifleştirilsin mi? Daha önce satılmış paketler etkilenmez.`, danger: true, confirmText: "Pasifleştir" }))) return;
    setActionId(item.id);
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
    } finally {
      setActionId(null);
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
                <Button size="sm" variant="secondary" disabled={Boolean(actionId)} onClick={() => openEdit(item)}>Düzenle</Button>
                <Button size="sm" variant="secondary" loading={actionId === item.id} disabled={Boolean(actionId)} onClick={() => void toggleActive(item)}>{item.isActive ? "Pasif Yap" : "Aktif Yap"}</Button>
                <Button size="sm" variant="ghost" disabled={Boolean(actionId)} onClick={() => void remove(item)}>Sil</Button>
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
              <input type="number" min={1} max={10000} value={form.sessionCount} onChange={(e) => setForm((f) => ({ ...f, sessionCount: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </FormField>
            <FormField label="Fiyat (₺)" required>
              <input type="number" min={0.01} max={99999999.99} step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </FormField>
            <FormField label="Geçerlilik (gün)" required>
              <input type="number" min={1} max={3650} value={form.validityDays} onChange={(e) => setForm((f) => ({ ...f, validityDays: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </FormField>
          </div>
        </div>
      </Modal>
    </div>
  );
}
