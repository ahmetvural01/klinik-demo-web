"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { showToastSafe } from "@/lib/toast-client";

type ClinicUnit = {
  id: string;
  name: string;
  code?: string | null;
  isActive: boolean;
  _count?: { appointments: number };
};

const EMPTY_FORM = { name: "", code: "" };

export default function UnitelerTab() {
  const [items, setItems] = useState<ClinicUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ClinicUnit | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const response = await fetch("/api/clinic-units", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => []);
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (item: ClinicUnit) => {
    setEditing(item);
    setForm({ name: item.name, code: item.code || "" });
    setShowForm(true);
  };

  const save = async () => {
    if (form.name.trim().length < 2) {
      showToastSafe({ title: "Eksik bilgi", message: "Ünite adı en az 2 karakter olmalıdır.", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/clinic-units", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing
          ? { id: editing.id, name: form.name, code: form.code, isActive: editing.isActive }
          : { name: form.name, code: form.code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Ünite kaydedilemedi.");
      setShowForm(false);
      showToastSafe({ title: editing ? "Güncellendi" : "Eklendi", message: "Klinik ünitesi kaydedildi.", type: "success" });
      await load();
    } catch (error) {
      showToastSafe({ title: "Hata", message: error instanceof Error ? error.message : "Ünite kaydedilemedi.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: ClinicUnit) => {
    const response = await fetch("/api/clinic-units", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
    }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      showToastSafe({ title: "Hata", message: data?.message || "Ünite güncellenemedi.", type: "error" });
      return;
    }
    showToastSafe({ title: item.isActive ? "Pasife alındı" : "Aktifleştirildi", message: item.name, type: "success" });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-900">Klinik Üniteleri</h3>
          <p className="mt-0.5 text-xs text-slate-500">Randevuda isteğe bağlı seçilir; seçildiğinde aynı üniteye çakışan randevu açılması engellenir.</p>
        </div>
        <Button onClick={openCreate}>Yeni Ünite</Button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-100 bg-white py-10 text-center text-sm text-slate-400">Üniteler yükleniyor…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-500">Henüz ünite tanımlanmadı. Tek üniteli kliniklerde bu alanı boş bırakabilirsiniz.</div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100 bg-white">
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">{item.name}{item.code ? <span className="ml-2 text-xs font-medium text-slate-400">{item.code}</span> : null}</p>
                <p className="mt-0.5 text-xs text-slate-500">{item.isActive ? "Randevuda seçilebilir" : "Pasif - yeni randevuda seçilemez"}{item._count?.appointments ? ` · ${item._count.appointments} kayıtla ilişkili` : ""}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="secondary" onClick={() => openEdit(item)}>Düzenle</Button>
                <Button size="sm" variant="ghost" onClick={() => void toggleActive(item)}>{item.isActive ? "Pasif Yap" : "Aktif Yap"}</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Klinik Ünitesini Düzenle" : "Yeni Klinik Ünitesi"}
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>Vazgeç</Button><Button onClick={save} loading={saving}>{editing ? "Güncelle" : "Kaydet"}</Button></>}
      >
        <div className="space-y-4">
          <FormField label="Ünite Adı" required>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Örn: Ünite 1, Cerrahi Oda" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </FormField>
          <FormField label="Kısa Kod (isteğe bağlı)">
            <input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="Örn: U1" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm uppercase outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
