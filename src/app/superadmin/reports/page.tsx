"use client";

import { useEffect, useState } from "react";

type ReportData = {
  totalInstitutions?: number;
  totalUsers?: number;
  totalRevenue?: number;
  totalSmsSent?: number;
  newInstitutionsThisMonth?: number;
  activeInstitutions?: number;
  monthlyRevenue?: { month: string; amount: number }[];
  topInstitutions?: { name: string; revenue: number }[];
};

export default function ReportsPage() {
  const [data, setData] = useState<ReportData>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/superadmin/reports")
      .then((r) => r.json())
      .then((d) => setData(d ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-3xl">📈</span>
        <h2 className="text-2xl font-bold text-gray-900">Sistem Raporları</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: "Toplam Klinik", value: data.totalInstitutions ?? 0, icon: "🏢", color: "blue" },
          { label: "Aktif Klinik", value: data.activeInstitutions ?? 0, icon: "✅", color: "green" },
          { label: "Toplam Kullanıcı", value: data.totalUsers ?? 0, icon: "👥", color: "purple" },
          { label: "Toplam Gelir (₺)", value: (data.totalRevenue ?? 0).toLocaleString("tr-TR"), icon: "💰", color: "yellow" },
          { label: "Toplam SMS Gönderim", value: (data.totalSmsSent ?? 0).toLocaleString("tr-TR"), icon: "📱", color: "indigo" },
          { label: "Bu Ay Yeni Klinik", value: data.newInstitutionsThisMonth ?? 0, icon: "🆕", color: "teal" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-white shadow-sm border border-gray-100 p-4 flex items-center gap-4">
            <span className="text-3xl">{stat.icon}</span>
            <div>
              <p className="text-xs text-gray-500">{stat.label}</p>
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {data.topInstitutions && data.topInstitutions.length > 0 && (
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">En Yüksek Gelirli Klinikler</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Klinik</th>
                <th className="px-4 py-3 text-right">Toplam Gelir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.topInstitutions.map((inst, i) => (
                <tr key={inst.name} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-bold text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{inst.name}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-600">
                    ₺{inst.revenue.toLocaleString("tr-TR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.monthlyRevenue && data.monthlyRevenue.length > 0 && (
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Aylık Gelir</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Ay</th>
                <th className="px-4 py-3 text-right">Gelir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.monthlyRevenue.map((row) => (
                <tr key={row.month} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{row.month}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    ₺{row.amount.toLocaleString("tr-TR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
