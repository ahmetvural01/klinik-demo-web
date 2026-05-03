"use client";

import { useEffect, useState } from "react";

type Invoice = {
  id: string;
  amount: number;
  status: string;
  description?: string;
  institution?: { name: string };
  createdAt: string;
  paidAt?: string;
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch("/api/superadmin/invoices")
      .then((r) => r.json())
      .then((d) => setInvoices(Array.isArray(d) ? d : d.invoices ?? []))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const markPaid = async (id: string) => {
    await fetch(`/api/superadmin/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAID" }),
    });
    load();
  };

  const total = invoices.reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const paid = invoices.filter((i) => i.status === "PAID").reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const pending = invoices.filter((i) => i.status !== "PAID").reduce((sum, i) => sum + (i.amount ?? 0), 0);

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-3xl">💳</span>
        <h2 className="text-2xl font-bold text-gray-900">Faturalar</h2>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Toplam", value: total, color: "blue" },
          { label: "Ödendi", value: paid, color: "green" },
          { label: "Bekliyor", value: pending, color: "orange" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-white shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className={`text-2xl font-bold text-${stat.color}-600`}>
              ₺{stat.value.toLocaleString("tr-TR")}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <span className="text-sm font-medium text-gray-700">Fatura Listesi</span>
          <button onClick={load} className="text-xs text-blue-600 hover:underline">Yenile</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Klinik</th>
                  <th className="px-4 py-3 text-left">Açıklama</th>
                  <th className="px-4 py-3 text-right">Tutar</th>
                  <th className="px-4 py-3 text-left">Durum</th>
                  <th className="px-4 py-3 text-left">Tarih</th>
                  <th className="px-4 py-3 text-left">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Fatura bulunamadı</td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{inv.institution?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{inv.description ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        ₺{(inv.amount ?? 0).toLocaleString("tr-TR")}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            inv.status === "PAID"
                              ? "bg-green-100 text-green-700"
                              : inv.status === "CANCELLED"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {inv.status === "PAID" ? "Ödendi" : inv.status === "CANCELLED" ? "İptal" : "Bekliyor"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(inv.createdAt).toLocaleDateString("tr-TR")}
                      </td>
                      <td className="px-4 py-3">
                        {inv.status !== "PAID" && (
                          <button
                            onClick={() => markPaid(inv.id)}
                            className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700"
                          >
                            Ödendi İşaretle
                          </button>
                        )}
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
