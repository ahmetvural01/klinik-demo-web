"use client";

import { useEffect, useState } from "react";
import { Shield, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { showToastSafe } from "@/lib/toast-client";

type Admin = {
  id: string;
  fullName: string;
  identityNo: string;
  modules: string[];
  createdAt: string;
};

const ALL_MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "institutions", label: "Klinikler" },
  { key: "users", label: "Kullanıcılar" },
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
  const [saving, setSaving] = useState(false);

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
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/superadmin/admins/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules }),
      });
      if (!res.ok) throw new Error("Kaydedilemedi");
      showToastSafe({ title: "Kaydedildi", message: "Modül erişimleri güncellendi", type: "success" });
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
    </section>
  );
}
