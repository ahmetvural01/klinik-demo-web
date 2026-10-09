"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AlertCard, StatsCard } from "@/components/ui/Premium";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { EmptyValue } from "@/components/ui/ListTable";
import { roleLabel } from "@/lib/staff-roles";
import type { InvoiceSummary } from "@/components/superadmin/invoice-status";
import { auditActionLabel, planLabel } from "@/components/superadmin/sa-labels";
import { count, dateTime, money, shortDate } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet } from "@/components/superadmin/sa-fetch";

type Dashboard = {
  totalInstitutions: number;
  activeInstitutions: number;
  blockedInstitutions: number;
  demoEndingSoon: number;
  lowSmsThreshold: number;
  lowSmsCount: number;
  lowSmsInstitutions: { id: string; name: string; smsBalance: number }[];
  platformSmsStock: number;
  totalSmsBalance: number;
  invoices: InvoiceSummary;
  openSupport: number;
  recentInstitutions: { id: string; name: string; subscriptionPlan: string; billingCycle: string; createdAt: string }[];
  recentTransactions: { id: string; institutionId: string; institution: string; smsCount: number; amount: number; createdAt: string }[];
  latestLogs: {
    id: string;
    action: string;
    detail: string | null;
    createdAt: string;
    isGhost: boolean;
    actorRole: string | null;
    user: { fullName: string; role: string; institution: { id: string; name: string } | null } | null;
  }[];
};

/**
 * Kontrol Paneli — "bugün neyle ilgilenmeliyim?" sorusunun cevabı en üstte:
 * gecikmiş fatura, erişimi kısıtlı klinik, yanıt bekleyen destek, biten demo,
 * azalan SMS. Her kart ilgili filtreli listeye götürür. Altında yalnız karar
 * verdiren dört sayı (aktif klinik, bu ay tahsilat, açık alacak, SMS stoğu).
 * Önceden platform geneli hasta/randevu sayıları, ham sistem sayaçları ve plan
 * kodları ilk ekranı kaplıyor, asıl yapılacaklar en altta kalıyordu.
 */
export default function SuperadminPanelPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback((signal?: AbortSignal) => {
    setError(null);
    saGet<Dashboard>("/api/superadmin/dashboard", "Kontrol paneli yüklenemedi.", signal)
      .then(setData)
      .catch((failure) => {
        if (!isAbort(failure)) setError(errorMessage(failure, "Kontrol paneli yüklenemedi."));
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, reloadKey]);

  const header = (
    <PageHeader
      icon="chart"
      title="Kontrol Paneli"
      description="Bugün ilgilenmeniz gerekenler ve platformun özeti."
      actions={<Button icon={Plus} href="/superadmin/institutions?yeni=1">Yeni klinik</Button>}
    />
  );

  if (error && !data) {
    return (
      <section className="space-y-4">
        {header}
        <LoadErrorState message={error} onRetry={() => setReloadKey((value) => value + 1)} />
      </section>
    );
  }

  if (!data) {
    return (
      <section className="space-y-4">
        {header}
        <div className="ui-surface overflow-hidden"><ListRowSkeleton rows={4} /></div>
      </section>
    );
  }

  const inv = data.invoices;
  const todo: { key: string; title: string; description: string; href: string; tone: "critical" | "warning" | "info" }[] = [];
  if (inv.overdueCount > 0) {
    todo.push({ key: "overdue", title: `${count(inv.overdueCount)} gecikmiş fatura · ${money(inv.overdueAmount)}`, description: "Vadesi geçti; tahsil edilmezse klinik kayıt ekleyemez.", href: "/superadmin/invoices?status=OVERDUE", tone: "critical" });
  }
  if (data.blockedInstitutions > 0) {
    todo.push({ key: "blocked", title: `${count(data.blockedInstitutions)} klinik kısıtlı veya kilitli`, description: "Askıda, salt okunur, kısıtlı ya da ödeme kilidinde olan klinikler.", href: "/superadmin/institutions?durum=sorunlu", tone: "critical" });
  }
  if (data.openSupport > 0) {
    todo.push({ key: "support", title: `${count(data.openSupport)} destek talebi yanıt bekliyor`, description: "Kliniklerin sorularını yanıtlayın.", href: "/superadmin/support", tone: "warning" });
  }
  if (data.demoEndingSoon > 0) {
    todo.push({ key: "demo", title: `${count(data.demoEndingSoon)} demo 7 gün içinde bitiyor`, description: "Satışa dönüştürmek için klinikle görüşün.", href: "/superadmin/institutions?durum=demo", tone: "warning" });
  }
  if (data.lowSmsCount > 0) {
    const names = data.lowSmsInstitutions.slice(0, 3).map((item) => `${item.name} (${count(item.smsBalance)})`).join(", ");
    todo.push({ key: "sms", title: `${count(data.lowSmsCount)} klinikte SMS ${data.lowSmsThreshold}'nin altında`, description: names, href: "/superadmin/institutions?durum=sms-az", tone: "info" });
  }
  if (data.platformSmsStock <= 0) {
    todo.push({ key: "stock", title: "Platform SMS stoğu bitti", description: "Stok eklenmeden kliniklere SMS paketi satılamaz.", href: "/superadmin/sms?tab=stok", tone: "warning" });
  }

  return (
    <section className="space-y-5">
      {header}

      <div>
        <h2 className="mb-2 text-sm font-bold text-slate-900">Bugün ilgilenilecekler</h2>
        {todo.length === 0 ? (
          <p className="ui-surface flex items-center gap-2 px-4 py-3 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Bekleyen iş yok: gecikmiş fatura, kısıtlı klinik veya yanıt bekleyen talep bulunmuyor.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {todo.map((item) => (
              <AlertCard key={item.key} title={item.title} description={item.description} href={item.href} tone={item.tone} />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatsCard label="Aktif klinik" value={count(data.activeInstitutions)} description={`Toplam ${count(data.totalInstitutions)} klinik`} href="/superadmin/institutions" />
        <StatsCard label="Bu ay tahsil edilen" value={money(inv.paidThisMonthAmount)} description={`${count(inv.paidThisMonthCount)} fatura`} tone="success" href="/superadmin/invoices?status=PAID" />
        <StatsCard label="Açık alacak" value={money(inv.openAmount)} description={`${count(inv.openCount)} fatura · ${count(inv.overdueCount)} gecikmiş`} tone={inv.overdueCount > 0 ? "critical" : "neutral"} href="/superadmin/invoices" />
        <StatsCard label="Platform SMS stoğu" value={count(data.platformSmsStock)} description={`Kliniklerde ${count(data.totalSmsBalance)} SMS`} tone={data.platformSmsStock <= 0 ? "warning" : "neutral"} href="/superadmin/sms?tab=stok" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="ui-surface overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">Son işlemler</h2>
            <Link href="/superadmin/audit" className="text-xs font-semibold text-primary hover:underline">Denetim Günlüğü</Link>
          </div>
          {data.latestLogs.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Henüz işlem yok.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.latestLogs.map((log) => (
                <li key={log.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-sm font-semibold text-slate-900">{auditActionLabel(log.action, log.detail)}</p>
                    <span className="text-xs text-slate-500">{dateTime(log.createdAt)}</span>
                  </div>
                  {log.detail && <p className="line-clamp-1 text-xs text-slate-600">{log.detail}</p>}
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span>{log.user?.fullName || "Sistem"}{log.user ? ` · ${roleLabel(log.user.role)}` : ""}</span>
                    {log.user?.institution && (
                      <Link href={`/superadmin/institutions/${log.user.institution.id}`} className="font-semibold text-primary hover:underline">{log.user.institution.name}</Link>
                    )}
                    {log.isGhost && <Badge tone="warning">Gizli giriş</Badge>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <div className="ui-surface overflow-hidden">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-900">Son açılan klinikler</h2>
            {data.recentInstitutions.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Henüz klinik yok.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.recentInstitutions.map((item) => (
                  <li key={item.id}>
                    <Link href={`/superadmin/institutions/${item.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-900">{item.name}</span>
                        <span className="text-xs text-slate-500">{planLabel(item.subscriptionPlan, item.billingCycle)}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">{shortDate(item.createdAt) || <EmptyValue />}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="ui-surface overflow-hidden">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-900">Son SMS satışları</h2>
            {data.recentTransactions.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Henüz SMS satışı yok. Satış, klinik dosyasındaki SMS bölümünden yapılır.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.recentTransactions.map((item) => (
                  <li key={item.id}>
                    <Link href={`/superadmin/institutions/${item.institutionId}?tab=sms`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-900">{item.institution}</span>
                        <span className="text-xs text-slate-500">{shortDate(item.createdAt)}</span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-slate-600">{count(item.smsCount)} SMS<br />{money(item.amount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
