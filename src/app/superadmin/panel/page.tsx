"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Dashboard = {
  totalInstitutions: number;
  activeInstitutions: number;
  totalSmsBalance: number;
  totalRevenue: number;
  pendingInvoices: number;
  recentTransactions: {
    id: string;
    institution: string;
    smsCount: number;
    amount: number;
    createdAt: string;
  }[];
};

export default function SuperadminPanelPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const me = await fetch("/api/auth/me");
      if (!me.ok) {
        router.replace("/superadmin");
        return;
      }
      const meData = (await me.json()) as { role?: string };
      if (meData.role !== "SUPERADMIN") {
        router.replace("/superadmin");
        return;
      }
      const res = await fetch("/api/superadmin/dashboard");
      if (res.ok) {
        setData(await res.json() as Dashboard);
      } else {
        setError("Dashboard verisi alınamadı");
      }
      setLoading(false);
    };
    void run();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Yükleniyor...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-600">
        {error}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-3xl">📊</span>
        <h2 className="text-2xl font-bold text-gray-900">Sistem Kontrol Paneli</h2>
      </div>

      {/* KPI Kartları */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <article className="rounded-xl bg-white p-5 shadow-sm border">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Toplam Klinik</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{data?.totalInstitutions ?? 0}</p>
          <p className="text-xs text-green-600 mt-1">✓ {data?.activeInstitutions ?? 0} aktif</p>
        </article>

        <article className="rounded-xl bg-white p-5 shadow-sm border">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Toplam SMS Kredisi</p>
          <p className="text-3xl font-bold text-purple-600 mt-1">
            {(data?.totalSmsBalance ?? 0).toLocaleString("tr-TR")}
          </p>
        </article>

        <article className="rounded-xl bg-white p-5 shadow-sm border">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Beklemede Fatura</p>
          <p className="text-3xl font-bold text-orange-600 mt-1">{data?.pendingInvoices ?? 0}</p>
        </article>

        <article className="rounded-xl bg-white p-5 shadow-sm border">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Toplam Gelir</p>
          <p className="text-3xl font-bold text-green-600 mt-1">
            ₺{(data?.totalRevenue ?? 0).toLocaleString("tr-TR")}
          </p>
        </article>
      </div>

      {/* Son SMS Satışları */}
      <div className="rounded-xl bg-white p-6 shadow-sm border">
        <h3 className="font-bold text-gray-800 mb-4">Son SMS Satışları</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-gray-600">Klinik</th>
                <th className="px-4 py-2 text-right text-gray-600">SMS Adeti</th>
                <th className="px-4 py-2 text-right text-gray-600">Tutarı</th>
                <th className="px-4 py-2 text-left text-gray-600">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {!data?.recentTransactions || data.recentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    İşlem bulunmadı
                  </td>
                </tr>
              ) : (
                data.recentTransactions.map((t) => (
                  <tr key={t.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{t.institution}</td>
                    <td className="px-4 py-3 text-right">{t.smsCount.toLocaleString("tr-TR")}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">
                      ₺{Number(t.amount).toLocaleString("tr-TR")}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(t.createdAt).toLocaleDateString("tr-TR")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
