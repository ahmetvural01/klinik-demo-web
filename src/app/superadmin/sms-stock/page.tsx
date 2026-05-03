"use client";

import { useEffect, useState } from "react";

type WalletEntry = {
  id: string;
  institution?: { name: string };
  balance: number;
  usedCount: number;
  updatedAt: string;
};

export default function SmsStockPage() {
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/superadmin/sms-wallet")
      .then((r) => r.json())
      .then((d) => setWallets(Array.isArray(d) ? d : d.wallets ?? []))
      .catch(() => setWallets([]))
      .finally(() => setLoading(false));
  }, []);

  const totalBalance = wallets.reduce((sum, w) => sum + (w.balance ?? 0), 0);
  const totalUsed = wallets.reduce((sum, w) => sum + (w.usedCount ?? 0), 0);

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-3xl">📦</span>
        <h2 className="text-2xl font-bold text-gray-900">SMS Stok</h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Toplam Kalan Kredi</p>
          <p className="text-2xl font-bold text-blue-600">{totalBalance.toLocaleString("tr-TR")}</p>
        </div>
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Toplam Kullanılan</p>
          <p className="text-2xl font-bold text-gray-700">{totalUsed.toLocaleString("tr-TR")}</p>
        </div>
      </div>

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Klinik</th>
                <th className="px-4 py-3 text-right">Kalan Kredi</th>
                <th className="px-4 py-3 text-right">Kullanılan</th>
                <th className="px-4 py-3 text-left">Güncelleme</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {wallets.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">Veri bulunamadı</td>
                </tr>
              ) : (
                wallets.map((w) => (
                  <tr key={w.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{w.institution?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${w.balance < 50 ? "text-red-600" : "text-green-600"}`}>
                        {w.balance.toLocaleString("tr-TR")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{w.usedCount.toLocaleString("tr-TR")}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(w.updatedAt).toLocaleDateString("tr-TR")}
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
