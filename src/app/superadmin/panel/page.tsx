"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hourglass, LifeBuoy, Lock, MessageSquare, Plus, Receipt } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Section } from "@/components/ui/Section";
import { SettingsList, SettingsRow } from "@/components/ui/SettingsList";
import { StatStrip, type StatItem } from "@/components/ui/StatStrip";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { EmptyValue } from "@/components/ui/ListTable";
import type { InvoiceSummary } from "@/components/superadmin/invoice-status";
import { auditActionLabel, auditWho, planLabel, type AuditPerson } from "@/components/superadmin/sa-labels";
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
    actor?: AuditPerson;
  }[];
};

type TodoItem = {
  key: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
  action: string;
  tone: "critical" | "warning" | "info";
  badge: string;
};

/**
 * Kontrol Paneli — "bugün neyle ilgilenmeliyim?" sorusunun cevabı en üstte,
 * tek satırlık iş listesi (gecikmiş fatura, kısıtlı klinik, destek, biten
 * demo, azalan SMS); her satır ilgili filtreli listeye götürür. Altında
 * yalnız karar verdiren dört sayı. Önceden iş kartları ve sayaç kartları
 * aynı sayıları iki kez gösteriyordu (gecikmiş fatura, biten SMS stoğu) ve
 * "Son işlemler" kliniklerin rutin işlemleriyle doluyordu.
 */
export default function SuperadminPanelPage() {
  const router = useRouter();
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
      description="Bugün ilgilenmeniz gerekenler."
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
        <PageSkeleton header={false} stats={4} body="table" rows={4} columns={2} label="Kontrol paneli yükleniyor" />
      </section>
    );
  }

  const inv = data.invoices;
  const todo: TodoItem[] = [];
  if (inv.overdueCount > 0) {
    todo.push({ key: "overdue", icon: Receipt, title: `${count(inv.overdueCount)} gecikmiş fatura · ${money(inv.overdueAmount)}`, description: "Tahsilatı kaydedin ya da hatırlatma gönderin.", href: "/superadmin/invoices?status=OVERDUE", action: "Faturalar", tone: "critical", badge: "Gecikti" });
  }
  if (data.blockedInstitutions > 0) {
    todo.push({ key: "blocked", icon: Lock, title: `${count(data.blockedInstitutions)} klinik kısıtlı veya kilitli`, description: "Askıda, salt okunur, kısıtlı ya da ödeme kilidinde.", href: "/superadmin/institutions?durum=sorunlu", action: "Listeyi aç", tone: "critical", badge: "Erişim" });
  }
  if (data.openSupport > 0) {
    todo.push({ key: "support", icon: LifeBuoy, title: `${count(data.openSupport)} destek talebi yanıt bekliyor`, description: "Kliniklerin sorularını yanıtlayın.", href: "/superadmin/support", action: "Yanıtla", tone: "warning", badge: "Destek" });
  }
  if (data.demoEndingSoon > 0) {
    todo.push({ key: "demo", icon: Hourglass, title: `${count(data.demoEndingSoon)} demo 7 gün içinde bitiyor`, description: "Satışa dönüştürmek için klinikle görüşün.", href: "/superadmin/institutions?durum=demo", action: "Listeyi aç", tone: "warning", badge: "Demo" });
  }
  if (data.lowSmsCount > 0) {
    const names = data.lowSmsInstitutions.slice(0, 3).map((item) => `${item.name} (${count(item.smsBalance)})`).join(", ");
    todo.push({ key: "sms", icon: MessageSquare, title: `${count(data.lowSmsCount)} klinikte SMS ${data.lowSmsThreshold}'nin altında`, description: names, href: "/superadmin/institutions?durum=sms-az", action: "Listeyi aç", tone: "info", badge: "SMS" });
  }

  // Sayılar bir kez: gecikme iş listesinde, stok bitti uyarısı stok sayısının
  // altında (ayrı bir iş kartı olarak tekrar edilmez).
  const stockEmpty = data.platformSmsStock <= 0;
  const stats: StatItem[] = [
    { key: "active", label: "Aktif klinik", value: count(data.activeInstitutions), hint: `Toplam ${count(data.totalInstitutions)} klinik`, href: "/superadmin/institutions" },
    // Bağlantısız: Faturalar'da ay süzgeci yok; kart tıklanınca bütün ödenmiş
    // faturalar açılıyor, bu ayın tutarıyla eşleşmiyordu.
    { key: "paid", label: "Bu ay tahsil edilen", value: money(inv.paidThisMonthAmount), hint: `${count(inv.paidThisMonthCount)} fatura`, tone: "success" },
    { key: "open", label: "Açık alacak", value: money(inv.openAmount), hint: `${count(inv.openCount)} fatura`, href: "/superadmin/invoices" },
    {
      key: "stock",
      label: "Platform SMS stoğu",
      value: count(data.platformSmsStock),
      hint: stockEmpty ? "Bitti — paket satılamaz" : `Kliniklerde ${count(data.totalSmsBalance)} SMS`,
      tone: stockEmpty ? "warning" : "neutral",
      href: "/superadmin/sms?tab=stok",
    },
  ];

  return (
    <section className="space-y-4">
      {header}

      <Section title="Bugün ilgilenilecekler" padding={todo.length > 0 ? "none" : "md"}>
        {todo.length === 0 ? (
          <Callout tone="success" title="Bekleyen iş yok">Gecikmiş fatura, kısıtlı klinik veya yanıt bekleyen talep bulunmuyor.</Callout>
        ) : (
          <SettingsList aria-label="Bugün ilgilenilecekler">
            {todo.map((item) => (
              <SettingsRow
                key={item.key}
                icon={item.icon}
                title={item.title}
                description={item.description}
                status={<Badge tone={item.tone}>{item.badge}</Badge>}
                actions={<Button size="sm" variant="secondary" href={item.href}>{item.action}</Button>}
                onOpen={() => router.push(item.href)}
              />
            ))}
          </SettingsList>
        )}
      </Section>

      <StatStrip items={stats} columns={4} aria-label="Platform özeti" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          className="lg:col-span-2"
          title="Son platform işlemleri"
          padding="none"
          actions={<Link href="/superadmin/audit" className="text-xs font-semibold text-primary hover:underline">Denetim Günlüğü</Link>}
        >
          {data.latestLogs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Son 30 günde platform işlemi yok.</p>
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
                    <span>{auditWho(log)}</span>
                    {log.user?.institution && (
                      <Link href={`/superadmin/institutions/${log.user.institution.id}`} className="font-semibold text-primary hover:underline">{log.user.institution.name}</Link>
                    )}
                    {log.isGhost && <Badge tone="warning">Gizli giriş</Badge>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="space-y-4">
          <Section title="Son açılan klinikler" padding="none">
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
          </Section>

          <Section title="Son SMS satışları" padding="none">
            {data.recentTransactions.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Henüz SMS satışı yok. Satış klinik dosyasının SMS sekmesinden yapılır.</p>
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
          </Section>
        </div>
      </div>
    </section>
  );
}
