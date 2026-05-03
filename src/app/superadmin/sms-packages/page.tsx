"use client";

import { useEffect, useState } from "react";

type Package = {
  id: string;
  name: string;
  smsCount: number;
  price: number;
  isActive: boolean;
  createdAt: string;
};

export default function SmsPackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", smsCount: "", price: "" });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/superadmin/sms-packages")
      .then((r) => r.json())
      .then((d) => setPackages(Array.isArray(d) ? d : d.packages ?? []))
      .catch(() => setPackages([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.name || !form.smsCount || !form.price) return;
    setSaving(true);
    await fetch("/api/superadmin/sms-packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        smsCount: parseInt(form.smsCount),
        price: parseFloat(form.price),
      }),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ name: "", smsCount: "", price: "" });
    load();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await fetch(`/api/superadmin/sms-packages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !current }),
    });
    load();
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">📱</span>
          <h2 className="text-2xl font-bold text-gray-900">SMS Paketleri</h2>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Yeni Paket
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">Yeni SMS Paketi</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Paket Adı</label>
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="Başlangıç Paketi"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">SMS Adedi</label>
              <input
                type="number"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="500"
                value={form.smsCount}
                onChange={(e) => setForm({ ...form, smsCount: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fiyat (₺)</label>
              <input
                type="number"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="150.00"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <button
              onClick={() => setShowForm(false)}
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Paket Adı</th>
                  <th className="px-4 py-3 text-right">SMS Adedi</th>
                  <th className="px-4 py-3 text-right">Fiyat</th>
                  <th className="px-4 py-3 text-right">Birim Fiyat</th>
                  <th className="px-4 py-3 text-left">Durum</th>
                  <th className="px-4 py-3 text-left">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {packages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Paket bulunamadı</td>
                  </tr>
                ) : (
                  packages.map((pkg) => (
                    <tr key={pkg.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{pkg.name}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {pkg.smsCount.toLocaleString("tr-TR")}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        ₺{pkg.price.toLocaleString("tr-TR")}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">
                        ₺{(pkg.price / pkg.smsCount).toFixed(3)}/SMS
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            pkg.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {pkg.isActive ? "Aktif" : "Pasif"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleActive(pkg.id, pkg.isActive)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                            pkg.isActive
                              ? "bg-red-50 text-red-600 hover:bg-red-100"
                              : "bg-green-50 text-green-600 hover:bg-green-100"
                          }`}
                        >
                          {pkg.isActive ? "Pasif Et" : "Aktif Et"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
