"use client";

import { useEffect, useRef, useState } from "react";
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
  const [actionId, setActionId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/clinic-units", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data)) throw new Error("Tedavi alanları yüklenemedi.");
      setItems(data);
    } catch (error) {
      showToastSafe({ title: "Yükleme hatası", message: error instanceof Error ? error.message : "Mevcut liste korunarak işlem durduruldu.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const formSnapshotRef = useRef(JSON.stringify(EMPTY_FORM));
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    formSnapshotRef.current = JSON.stringify(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (item: ClinicUnit) => {
    setEditing(item);
    const next = { name: item.name, code: item.code || "" };
    setForm(next);
    formSnapshotRef.current = JSON.stringify(next);
    setShowForm(true);
  };
  const formDirty = showForm && JSON.stringify(form) !== formSnapshotRef.current;
  const requestCloseForm = () => {
    setShowForm(false);
  };

  const save = async () => {
    if (form.name.trim().length < 2) {
      showToastSafe({ title: "Eksik bilgi", message: "Tedavi alanı adı en az 2 karakter olmalıdır.", type: "error" });
      return;
    }
    if (form.name.trim().length > 80 || form.code.trim().length > 20) {
      showToastSafe({ title: "Geçersiz bilgi", message: "Alan adı en fazla 80, kısa kod en fazla 20 karakter olabilir.", type: "error" });
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
      if (!response.ok) throw new Error(data?.message || "Tedavi alanı kaydedilemedi.");
      setShowForm(false);
      showToastSafe({ title: editing ? "Güncellendi" : "Eklendi", message: "Tedavi alanı kaydedildi.", type: "success" });
      await load();
    } catch (error) {
      showToastSafe({ title: "Hata", message: error instanceof Error ? error.message : "Tedavi alanı kaydedilemedi.", type: "error" });
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
      showToastSafe({ title: item.isActive ? "Pasife alındı" : "Aktifleştirildi", message: item.name, type: "success" });
      await load();
    } catch (error) {
      showToastSafe({ title: "Hata", message: error instanceof Error ? error.message : "Tedavi alanı güncellenemedi.", type: "error" });
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-900">Tedavi Alanları</h3>
          <p className="mt-0.5 max-w-2xl text-xs leading-5 text-slate-500">Koltuk veya oda kapasitesini takip etmek isteyen klinikler içindir. Randevuda seçilen alan aynı saatte ikinci kez kullanılamaz. Tek koltuklu kliniklerde tanımlama zorunlu değildir.</p>
        </div>
        <Button onClick={openCreate}>Yeni Alan</Button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-100 bg-white py-10 text-center text-sm text-slate-400">Tedavi alanları hazırlanıyor…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">Henüz tedavi alanı tanımlanmadı. Koltuk veya oda çakışması takip edilmeyecekse bu bölümü boş bırakabilirsiniz.</div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100 bg-white">
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">{item.name}{item.code ? <span className="ml-2 text-xs font-medium text-slate-400">{item.code}</span> : null}</p>
                <p className="mt-0.5 text-xs text-slate-500">{item.isActive ? "Randevuda seçilebilir" : "Pasif - yeni randevuda seçilemez"}{item._count?.appointments ? ` · ${item._count.appointments} kayıtla ilişkili` : ""}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="secondary" disabled={Boolean(actionId)} onClick={() => openEdit(item)}>Düzenle</Button>
                <Button size="sm" variant="ghost" loading={actionId === item.id} disabled={Boolean(actionId)} onClick={() => void toggleActive(item)}>{item.isActive ? "Pasif Yap" : "Aktif Yap"}</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        isDirty={formDirty}
        title={editing ? "Tedavi Alanını Düzenle" : "Yeni Tedavi Alanı"}
        footer={<><Button variant="secondary" onClick={() => void requestCloseForm()}>Vazgeç</Button><Button onClick={save} loading={saving}>{editing ? "Güncelle" : "Kaydet"}</Button></>}
      >
        <div className="space-y-4">
          <FormField label="Koltuk / Oda Adı" required>
            <input maxLength={80} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Örn: Koltuk 1, Cerrahi Oda" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </FormField>
          <FormField label="Kısa Kod (isteğe bağlı)">
            <input maxLength={20} value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="Örn: U1" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm uppercase outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
