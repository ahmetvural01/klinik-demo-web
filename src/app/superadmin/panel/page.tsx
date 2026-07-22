"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cachedGet } from "@/lib/client-cache";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";

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
      const meData = await cachedGet<{ role?: string } | null>("/api/auth/me", 60_000);
      if (!meData) {
        router.replace("/superadmin");
        return;
      }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: ListTableColumn<Dashboard["recentTransactions"][number]>[] = [
    {
      key: "institution",
      header: "Klinik",
      render: (t) => <span className="font-bold text-slate-900">{t.institution}</span>,
    },
    {
      key: "smsCount",
      header: "SMS Adeti",
      align: "right",
      render: (t) => <span className="text-slate-700">{t.smsCount.toLocaleString("tr-TR")}</span>,
    },
    {
      key: "amount",
      header: "Tutarı",
      align: "right",
      render: (t) => <span className="font-bold text-emerald-700">₺{Number(t.amount).toLocaleString("tr-TR")}</span>,
    },
    {
      key: "createdAt",
      header: "Tarih",
      render: (t) => <span className="text-slate-500">{new Date(t.createdAt).toLocaleDateString("tr-TR")}</span>,
    },
  ];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
        {error}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <h1 className="text-lg font-black text-slate-900">Sistem Kontrol Paneli</h1>
      </div>

      {/* KPI Kartları */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Toplam Klinik</p>
          <p className="mt-1 text-3xl font-black text-primary">{data?.totalInstitutions ?? 0}</p>
          <p className="mt-1 text-xs font-semibold text-emerald-600">{data?.activeInstitutions ?? 0} aktif</p>
        </article>

        <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Toplam SMS Kredisi</p>
          <p className="mt-1 text-3xl font-black text-slate-900">
            {(data?.totalSmsBalance ?? 0).toLocaleString("tr-TR")}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Beklemede Fatura</p>
          <p className="mt-1 text-3xl font-black text-amber-600">{data?.pendingInvoices ?? 0}</p>
        </article>

        <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Toplam Gelir</p>
          <p className="mt-1 text-3xl font-black text-emerald-600">
            ₺{(data?.totalRevenue ?? 0).toLocaleString("tr-TR")}
          </p>
        </article>
      </div>

      {/* Son SMS Satışları */}
      <div className="space-y-3">
        <h3 className="text-sm font-black text-slate-900">Son SMS Satışları</h3>
        <ListTable
          columns={columns}
          rows={data?.recentTransactions ?? []}
          rowKey={(t) => t.id}
          emptyText="İşlem bulunmadı"
        />
      </div>
    </section>
  );
}
