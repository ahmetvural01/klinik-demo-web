"use client";

import { useEffect, useState } from "react";
import { Edit3, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { FormField } from "@/components/ui/FormField";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { showToastSafe } from "@/lib/toast-client";

type Admin = {
  id: string;
  fullName: string;
  identityNo: string;
  email?: string | null;
  isActive: boolean;
  createdAt: string;
};

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Admin | null>(null);
  const [editIsActive, setEditIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ fullName: "", identityNo: "", email: "", password: "" });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/superadmin/admins", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Sistem yöneticileri yüklenemedi.");
      setAdmins(Array.isArray(data) ? data : data?.admins ?? []);
    } catch (error) {
      showToastSafe({ title: "Yükleme hatası", message: error instanceof Error ? error.message : "Sistem yöneticileri yüklenemedi.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openEdit = (admin: Admin) => {
    setSelected(admin);
    setEditIsActive(admin.isActive);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/superadmin/admins/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: editIsActive }),
      });
      if (!res.ok) throw new Error("Kaydedilemedi");
      showToastSafe({ title: "Kaydedildi", message: "Admin bilgileri güncellendi", type: "success", icon: "settings" });
      setSelected(null);
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const submitCreate = async () => {
    if (!createForm.fullName.trim() || !createForm.identityNo.trim() || createForm.password.length < 8 || createForm.password.length > 72) {
      showToastSafe({ title: "Eksik alan", message: "Ad soyad, TC ve 8-72 karakter uzunluğunda şifre zorunlu", type: "error" });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/superadmin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: createForm.fullName.trim(),
          identityNo: createForm.identityNo.trim(),
          email: createForm.email.trim() || undefined,
          password: createForm.password,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Oluşturulamadı");
      showToastSafe({ title: "Oluşturuldu", message: `${d.fullName} admin olarak eklendi`, type: "success", icon: "person" });
      setShowCreate(false);
      setCreateForm({ fullName: "", identityNo: "", email: "", password: "" });
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    } finally {
      setCreating(false);
    }
  };

  const columns: ListTableColumn<Admin>[] = [
    {
      key: "fullName",
      header: "Ad Soyad",
      render: (a) => <span className="font-bold text-slate-900">{a.fullName}</span>,
    },
    {
      key: "identityNo",
      header: "TC Kimlik",
      render: (a) => <span className="font-mono text-slate-600">{a.identityNo}</span>,
    },
    {
      key: "access",
      header: "Erişim",
      render: () => <Badge tone="info">Tam erişim</Badge>,
    },
    {
      key: "isActive",
      header: "Durum",
      render: (a) => <Badge tone={a.isActive ? "success" : "neutral"}>{a.isActive ? "Aktif" : "Pasif"}</Badge>,
    },
    {
      key: "createdAt",
      header: "Kayıt",
      render: (a) => <span className="text-slate-500">{new Date(a.createdAt).toLocaleDateString("tr-TR")}</span>,
    },
    {
      key: "actions",
      header: "İşlem",
      render: (a) => (
        <Button size="sm" variant="secondary" icon={Edit3} onClick={() => openEdit(a)}>
          Hesabı Düzenle
        </Button>
      ),
    },
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black text-slate-900">Admin Yetkileri</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{admins.length} admin</span>
        </div>
        <Button icon={PlusCircle} size="sm" onClick={() => setShowCreate(true)}>Yeni Admin</Button>
      </div>

      <ListTable
        columns={columns}
        rows={admins}
        rowKey={(a) => a.id}
        loading={loading}
        emptyText="Admin bulunamadı"
      />

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Admin Hesabı"
        description={selected?.fullName}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelected(null)}>İptal</Button>
            <Button onClick={handleSave} loading={saving}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Platform yöneticileri tüm sistem yönetimi işlevlerine erişir.</p>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={editIsActive}
              onChange={(e) => setEditIsActive(e.target.checked)}
              className="rounded border-slate-300 text-primary focus:ring-primary/30"
            />
            <span className="text-sm text-slate-700">Hesap aktif</span>
          </label>
        </div>
      </Modal>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Yeni Admin Ekle"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>İptal</Button>
            <Button loading={creating} onClick={submitCreate}>Oluştur</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Ad Soyad" required>
              <input className={inputClass} value={createForm.fullName} onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })} />
            </FormField>
            <FormField label="TC Kimlik No" required>
              <input className={inputClass} value={createForm.identityNo} onChange={(e) => setCreateForm({ ...createForm, identityNo: e.target.value })} />
            </FormField>
            <FormField label="E-posta">
              <input className={inputClass} value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
            </FormField>
            <FormField label="Şifre" required hint="8-72 karakter">
              <input type="password" className={inputClass} value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
            </FormField>
          </div>
          <p className="text-xs text-slate-500">Yeni hesap platform yönetimi işlevlerinin tamamına erişir.</p>
        </div>
      </Modal>
    </section>
  );
}
