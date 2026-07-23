"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Wallet,
  Smartphone,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { ListTable } from "@/components/ui/ListTable";
import { Badge } from "@/components/ui/Badge";

// Bu sayfa daha önce API'nin hiç döndürmediği alanları (totalInstitutions,
// totalUsers, monthlyRevenue, topInstitutions vb.) okuyordu — her istatistik
// sessizce 0 gösteriyordu. Tip artık gerçek API yanıtıyla (route.ts) birebir
// eşleşiyor.
type ReportData = {
  totalIncome: number;
  totalSmsUsed: number;
  activeClinicCount: number;
  monthlyGrowth: number;
  topClinicsByUsage: { name: string; smsUsed: number; revenue: number }[];
};

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/superadmin/reports")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">
        Raporlar yüklenemedi.
      </div>
    );
  }

  const stats = [
    { label: "Bu Ay Ödenen Toplam", value: `₺${data.totalIncome.toLocaleString("tr-TR")}`, icon: Wallet },
    { label: "Aktif Klinik", value: data.activeClinicCount, icon: CheckCircle2 },
    { label: "Toplam SMS Kullanımı", value: data.totalSmsUsed.toLocaleString("tr-TR"), icon: Smartphone },
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div>
          <h1 className="text-lg font-black text-slate-900">Sistem Raporları</h1>
          <p className="mt-0.5 text-xs text-slate-500">Geçmişe dönük analiz — anlık durum için Kontrol Paneli&apos;ne bakın.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${data.monthlyGrowth >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
            {data.monthlyGrowth >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Aylık Gelir Büyümesi</p>
            <p className="text-xl font-black text-slate-900">
              <Badge tone={data.monthlyGrowth >= 0 ? "success" : "critical"}>{data.monthlyGrowth >= 0 ? "+" : ""}{data.monthlyGrowth}%</Badge>
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-black text-slate-900">SMS Kullanımına Göre En Yoğun Klinikler</h3>
        <ListTable
          columns={[
            {
              key: "rank",
              header: "#",
              render: (inst: { name: string; smsUsed: number; revenue: number; _rank: number }) => <span className="font-bold text-slate-400">{inst._rank}</span>,
            },
            {
              key: "name",
              header: "Klinik",
              render: (inst) => <span className="font-bold text-slate-900">{inst.name}</span>,
            },
            {
              key: "smsUsed",
              header: "Kullanılan SMS",
              align: "right",
              render: (inst) => <span className="font-semibold text-slate-700">{inst.smsUsed.toLocaleString("tr-TR")}</span>,
            },
            {
              key: "revenue",
              header: "SMS Paket Geliri",
              align: "right",
              render: (inst) => <span className="font-bold text-emerald-600">₺{inst.revenue.toLocaleString("tr-TR")}</span>,
            },
          ]}
          rows={data.topClinicsByUsage.map((inst, i) => ({ ...inst, _rank: i + 1 }))}
          rowKey={(inst) => inst.name}
          emptyText="Henüz SMS kullanım verisi yok"
        />
      </div>
    </section>
  );
}
