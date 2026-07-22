"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Users,
  Wallet,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { ListTable } from "@/components/ui/ListTable";

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
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const stats = [
    { label: "Toplam Klinik", value: data.totalInstitutions ?? 0, icon: Building2 },
    { label: "Aktif Klinik", value: data.activeInstitutions ?? 0, icon: CheckCircle2 },
    { label: "Toplam Kullanıcı", value: data.totalUsers ?? 0, icon: Users },
    { label: "Toplam Gelir (₺)", value: (data.totalRevenue ?? 0).toLocaleString("tr-TR"), icon: Wallet },
    { label: "Toplam SMS Gönderim", value: (data.totalSmsSent ?? 0).toLocaleString("tr-TR"), icon: Smartphone },
    { label: "Bu Ay Yeni Klinik", value: data.newInstitutionsThisMonth ?? 0, icon: Sparkles },
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <h1 className="text-lg font-black text-slate-900">Sistem Raporları</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <stat.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{stat.label}</p>
              <p className="text-xl font-black text-slate-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {data.topInstitutions && data.topInstitutions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-black text-slate-900">En Yüksek Gelirli Klinikler</h3>
          <ListTable
            columns={[
              {
                key: "rank",
                header: "#",
                headerClassName: "w-10",
                render: (inst) => <span className="font-bold text-slate-400">{inst._rank}</span>,
              },
              {
                key: "name",
                header: "Klinik",
                render: (inst) => <span className="font-bold text-slate-900">{inst.name}</span>,
              },
              {
                key: "revenue",
                header: "Toplam Gelir",
                align: "right",
                render: (inst) => <span className="font-bold text-emerald-600">₺{inst.revenue.toLocaleString("tr-TR")}</span>,
              },
            ]}
            rows={data.topInstitutions.map((inst, i) => ({ ...inst, _rank: i + 1 }))}
            rowKey={(inst) => inst.name}
          />
        </div>
      )}

      {data.monthlyRevenue && data.monthlyRevenue.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-black text-slate-900">Aylık Gelir</h3>
          <ListTable
            columns={[
              {
                key: "month",
                header: "Ay",
                render: (row) => <span className="text-slate-700">{row.month}</span>,
              },
              {
                key: "amount",
                header: "Gelir",
                align: "right",
                render: (row) => <span className="font-bold text-slate-900">₺{row.amount.toLocaleString("tr-TR")}</span>,
              },
            ]}
            rows={data.monthlyRevenue}
            rowKey={(row) => row.month}
          />
        </div>
      )}
    </section>
  );
}
