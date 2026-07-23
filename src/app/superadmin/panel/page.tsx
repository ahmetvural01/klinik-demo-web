"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, FileWarning, MessageSquare, Wallet } from "lucide-react";
import { cachedGet } from "@/lib/client-cache";
import { Badge } from "@/components/ui/Badge";

type Dashboard = {
  totalInstitutions: number;
  activeInstitutions: number;
  suspendedInstitutions: number;
  totalSmsBalance: number;
  platformSmsStock: number;
  totalRevenue: number;
  pendingInvoices: number;
  overdueInvoices: number;
  unpaidAmount: number;
  lowSmsInstitutions: { id: string; name: string; smsBalance: number }[];
  recentInstitutions: { id: string; name: string; subscriptionPlan: string; createdAt: string }[];
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
        {error || "Veri yüklenemedi"}
      </div>
    );
  }

  const hasAttention = data.lowSmsInstitutions.length > 0 || data.overdueInvoices > 0 || data.suspendedInstitutions > 0;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <h1 className="text-lg font-black text-slate-900">Sistem Kontrol Paneli</h1>
        <p className="mt-0.5 text-xs text-slate-500">Şu anki durum — geçmişe dönük analiz için Raporlar sayfasına bakın.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-4 w-4" /></span>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Toplam Klinik</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{data.totalInstitutions}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            <span className="text-emerald-600">{data.activeInstitutions} aktif</span>
            {data.suspendedInstitutions > 0 && <span className="text-amber-600"> · {data.suspendedInstitutions} askıda</span>}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><FileWarning className="h-4 w-4" /></span>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Bekleyen Fatura</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{data.pendingInvoices}</p>
          <p className="mt-1 text-xs font-semibold text-red-600">{data.overdueInvoices} gecikmiş</p>
        </article>

        <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><MessageSquare className="h-4 w-4" /></span>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Platform SMS Stoku</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{data.platformSmsStock.toLocaleString("tr-TR")}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Kliniklere ayrılan: {data.totalSmsBalance.toLocaleString("tr-TR")}</p>
        </article>

        <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><Wallet className="h-4 w-4" /></span>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Toplam Gelir</p>
          <p className="mt-1 text-2xl font-black text-emerald-600">₺{data.totalRevenue.toLocaleString("tr-TR")}</p>
          {data.unpaidAmount > 0 && <p className="mt-1 text-xs font-semibold text-red-600">₺{data.unpaidAmount.toLocaleString("tr-TR")} tahsil edilmedi</p>}
        </article>
      </div>

      {hasAttention && (
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-black text-amber-900">Dikkat Gerektirenler</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.suspendedInstitutions > 0 && (
              <Badge tone="warning">{data.suspendedInstitutions} klinik hizmeti kısıtlı/askıda</Badge>
            )}
            {data.overdueInvoices > 0 && (
              <Badge tone="critical">{data.overdueInvoices} fatura gecikmiş (₺{data.unpaidAmount.toLocaleString("tr-TR")})</Badge>
            )}
          </div>
          {data.lowSmsInstitutions.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-amber-700">SMS Kredisi Az Olan Klinikler</p>
              <div className="flex flex-wrap gap-1.5">
                {data.lowSmsInstitutions.map((i) => (
                  <span key={i.id} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                    {i.name}: {i.smsBalance} SMS
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-black text-slate-900">Son Kaydolan Klinikler</h3>
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            {data.recentInstitutions.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">Kayıt yok</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.recentInstitutions.map((i) => (
                  <div key={i.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="font-bold text-slate-900">{i.name}</span>
                    <span className="text-xs text-slate-500">{new Date(i.createdAt).toLocaleDateString("tr-TR")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-black text-slate-900">Son SMS Satışları</h3>
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            {data.recentTransactions.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">İşlem yok</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.recentTransactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="font-bold text-slate-900">{t.institution}</span>
                    <span className="text-xs text-slate-500">{t.smsCount.toLocaleString("tr-TR")} SMS · ₺{t.amount.toLocaleString("tr-TR")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
