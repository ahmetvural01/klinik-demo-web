"use client";

import { useEffect, useState } from "react";
import { Shield, Edit3, PlusCircle } from "lucide-react";
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
  modules: string[];
  createdAt: string;
};

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const ALL_MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "institutions", label: "Klinikler" },
  { key: "roles", label: "Rol Yetkileri" },
  { key: "invoices", label: "Faturalar" },
  { key: "sms", label: "SMS" },
  { key: "ads", label: "Reklamlar" },
  { key: "smtp", label: "SMTP" },
  { key: "reports", label: "Raporlar" },
  { key: "support", label: "Destek" },
  { key: "audit", label: "Denetim" },
  { key: "announcements", label: "Duyurular" },
  { key: "settings", label: "Ayarlar" },
  { key: "admins", label: "Admin Yönetimi" },
];

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Admin | null>(null);
  const [modules, setModules] = useState<string[]>([]);
  const [editIsActive, setEditIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ fullName: "", identityNo: "", email: "", password: "" });
  const [createModules, setCreateModules] = useState<string[]>(ALL_MODULES.map((m) => m.key));
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/superadmin/admins")
      .then((r) => r.json())
      .then((d) => setAdmins(Array.isArray(d) ? d : d.admins ?? []))
      .catch(() => setAdmins([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openEdit = (admin: Admin) => {
    setSelected(admin);
    setModules(admin.modules ?? []);
    setEditIsActive(admin.isActive);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/superadmin/admins/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules, isActive: editIsActive }),
      });
      if (!res.ok) throw new Error("Kaydedilemedi");
      showToastSafe({ title: "Kaydedildi", message: "Admin bilgileri güncellendi", type: "success" });
      setSelected(null);
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      showToastSafe({ title: "Hata", message: msg, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const toggleModule = (key: string) => {
    setModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  };

  const toggleCreateModule = (key: string) => {
    setCreateModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  };

  const submitCreate = async () => {
    if (!createForm.fullName.trim() || !createForm.identityNo.trim() || createForm.password.length < 6) {
      showToastSafe({ title: "Eksik alan", message: "Ad soyad, TC ve en az 6 haneli şifre zorunlu", type: "error" });
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
          modules: createModules,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Oluşturulamadı");
      showToastSafe({ title: "Oluşturuldu", message: `${d.fullName} admin olarak eklendi`, type: "success" });
      setShowCreate(false);
      setCreateForm({ fullName: "", identityNo: "", email: "", password: "" });
      setCreateModules(ALL_MODULES.map((m) => m.key));
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
      key: "modules",
      header: "Modüller",
      render: (a) => (
        <div className="flex flex-wrap gap-1">
          {(a.modules ?? []).slice(0, 4).map((m) => (
            <Badge key={m} tone="info">{m}</Badge>
          ))}
          {(a.modules ?? []).length > 4 && (
            <span className="text-xs text-slate-400">+{(a.modules ?? []).length - 4}</span>
          )}
        </div>
      ),
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
          Yetki Düzenle
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
        title="Modül Erişimi"
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
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Shield className="h-4 w-4" />
            </span>
            <p className="text-xs text-slate-500">Bu admin kullanıcısının erişebileceği modülleri seçin.</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={editIsActive}
              onChange={(e) => setEditIsActive(e.target.checked)}
              className="rounded border-slate-300 text-primary focus:ring-primary/30"
            />
            <span className="text-sm text-slate-700">Hesap aktif</span>
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ALL_MODULES.map((m) => (
              <label key={m.key} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={modules.includes(m.key)}
                  onChange={() => toggleModule(m.key)}
                  className="rounded border-slate-300 text-primary focus:ring-primary/30"
                />
                <span className="text-sm text-slate-700">{m.label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-3 border-t border-slate-100 pt-3">
            <button
              onClick={() => setModules(ALL_MODULES.map((m) => m.key))}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Tümünü Seç
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={() => setModules([])}
              className="text-xs font-semibold text-red-500 hover:underline"
            >
              Tümünü Kaldır
            </button>
          </div>
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
            <FormField label="Şifre" required hint="En az 6 karakter">
              <input type="password" className={inputClass} value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
            </FormField>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Modül Erişimi</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ALL_MODULES.map((m) => (
                <label key={m.key} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={createModules.includes(m.key)}
                    onChange={() => toggleCreateModule(m.key)}
                    className="rounded border-slate-300 text-primary focus:ring-primary/30"
                  />
                  <span className="text-sm text-slate-700">{m.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </section>
  );
}
