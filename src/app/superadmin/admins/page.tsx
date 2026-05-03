"use client";

import { useEffect, useState } from "react";

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
    await fetch(`/api/superadmin/admins/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modules }),
    });
    setSaving(false);
    setSelected(null);
    load();
  };

  const toggleModule = (key: string) => {
    setModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🛡️</span>
        <h2 className="text-2xl font-bold text-gray-900">Admin Yetkileri</h2>
      </div>

      {selected && (
        <div className="rounded-xl bg-white shadow-sm border border-blue-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">
            Modül Erişimi: <span className="text-blue-600">{selected.fullName}</span>
          </h3>
          <div className="grid grid-cols-4 gap-2">
            {ALL_MODULES.map((m) => (
              <label key={m.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={modules.includes(m.key)}
                  onChange={() => toggleModule(m.key)}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">{m.label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setModules(ALL_MODULES.map((m) => m.key))}
              className="text-xs text-blue-600 hover:underline"
            >
              Tümünü Seç
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={() => setModules([])}
              className="text-xs text-red-500 hover:underline"
            >
              Tümünü Kaldır
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <button
              onClick={() => setSelected(null)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Ad Soyad</th>
                <th className="px-4 py-3 text-left">TC Kimlik</th>
                <th className="px-4 py-3 text-left">Modüller</th>
                <th className="px-4 py-3 text-left">Kayıt</th>
                <th className="px-4 py-3 text-left">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Admin bulunamadı</td>
                </tr>
              ) : (
                admins.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{a.fullName}</td>
                    <td className="px-4 py-3 font-mono text-gray-600">{a.identityNo}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(a.modules ?? []).slice(0, 4).map((m) => (
                          <span key={m} className="inline-flex rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                            {m}
                          </span>
                        ))}
                        {(a.modules ?? []).length > 4 && (
                          <span className="text-xs text-gray-400">+{(a.modules ?? []).length - 4}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(a.createdAt).toLocaleDateString("tr-TR")}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openEdit(a)}
                        className="rounded-lg bg-slate-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Yetki Düzenle
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
