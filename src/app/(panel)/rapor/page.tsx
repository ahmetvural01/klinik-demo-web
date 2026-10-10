"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowRight, FileSpreadsheet, FileText } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { DescriptionList, type DescriptionItem } from "@/components/ui/DescriptionList";
import { Disclosure } from "@/components/ui/Disclosure";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton, Skeleton } from "@/components/ui/PageSkeleton";
import { Section } from "@/components/ui/Section";
import { StatStrip, type StatItem } from "@/components/ui/StatStrip";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Toolbar } from "@/components/ui/Toolbar";
import { METHOD_LABELS, money } from "@/components/muhasebe/muhasebe-utils";
import { DATE_PRESET_SETS, formatRangeLabel, todayKey, writeDateRangeParams, type DateRange, type DateRangeValue } from "@/lib/date-presets";
import { useDateRangeParam } from "@/lib/use-date-range-param";
import { isAbortError, useLatestRequest } from "@/lib/use-latest-request";
import { isLedgerPreset } from "@/lib/ledger-periods";
import { INCOME_TAX_TARIFF_YEAR, incomeTaxBracketRows } from "@/lib/tax-brackets";

type Stats = {
  totalRevenue: number;
  totalExpenses: number;
  totalLabCost: number;
  totalFirmaAlim: number;
  netCash: number;
  newPatients: number;
  totalExaminations: number;
  cash: number;
  card: number;
  transfer: number;
  mailOrder: number;
  other: number;
  expenseByCategory: { category: string; amount: number }[];
  firmaByName: { name: string; amount: number }[];
  topExaminations: { treatmentName: string; count: number }[];
  topTeeth: { tooth: string; count: number }[];
  outputVAT: number;
  inputVAT: number;
  netVAT: number;
  periodNetProfit: number;
  annualNetProfit: number;
  gelirVergisi: number;
  /** Uygulanan gelir vergisi tarifesinin yılı (sunucu; eski yanıtta yok). */
  taxTariffYear?: number;
  dayClose: { cashNet?: number; unpaidTreatmentPatientCount: number } | null;
};

const EMPTY: Stats = {
  totalRevenue: 0, totalExpenses: 0, totalLabCost: 0, totalFirmaAlim: 0,
  netCash: 0, newPatients: 0, totalExaminations: 0,
  cash: 0, card: 0, transfer: 0, mailOrder: 0, other: 0,
  expenseByCategory: [], firmaByName: [], topExaminations: [], topTeeth: [],
  outputVAT: 0, inputVAT: 0, netVAT: 0,
  periodNetProfit: 0, annualNetProfit: 0, gelirVergisi: 0,
  dayClose: null,
};

// "giderler" eski adresi: giderler artık Özet'te; bilinmeyen sekme Özet'i açar.
type Tab = "genel" | "islemler" | "vergi";
const TAB_KEYS: readonly Tab[] = ["genel", "islemler", "vergi"];

// Sunucunun gelir vergisi hesabıyla aynı tarife — tek kaynak src/lib/tax-brackets.ts.
const TAX_BRACKETS = incomeTaxBracketRows();

const count = (value: number) => (value || 0).toLocaleString("tr-TR");
const signed = (value: number) => `${value < 0 ? "−" : ""}${money(Math.abs(value))}`;
const csvAmount = (value: number) => (value || 0).toFixed(2).replace(".", ",");

function ledgerHref(value: DateRangeValue, range: DateRange, tur?: "TAHSILAT" | "GIDER") {
  const params = new URLSearchParams({ tab: "defter" });
  if (tur) params.set("tur", tur);
  // Defterin tanıdığı hazır dönem adıyla taşınır (src/lib/ledger-periods.ts); ötekiler
  // (ör. "Dün") defterde varsayılana dönmesin diye gün aralığı olarak.
  const carried: DateRangeValue = isLedgerPreset(value.preset) ? { preset: value.preset } : { preset: "ozel", from: range.from, to: range.to };
  // Defterin varsayılan dönemi role göre değişir (banko: Bugün); dönem her zaman açıkça yazılır.
  writeDateRangeParams(params, carried, "ozel");
  return `/muhasebe?${params.toString()}`;
}

function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return <Button variant="ghost" size="sm" href={href} icon={ArrowRight} iconPosition="right">{children}</Button>;
}

/** Yatay çubuk listesi (tutar/adet dağılımı). */
function BarList({ rows, tone = "primary" }: { rows: { label: string; value: number; display: string }[]; tone?: "primary" | "neutral" }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-sm">
          {/* Uzun gider/tedarikçi adı ("Doktor hakediş ödemesi") kesilmesin: en fazla iki satır. */}
          <span className="line-clamp-2 break-words leading-snug text-slate-600" title={row.label}>{row.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <span className={`block h-full rounded-full ${tone === "primary" ? "bg-primary" : "bg-slate-400"}`} style={{ width: `${Math.max(3, Math.round((row.value / max) * 100))}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums text-slate-800">{row.display}</span>
        </li>
      ))}
    </ul>
  );
}

function BarListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Etiket altında soluk açıklama ("Gider ve alım faturalarından"). */
function HintLabel({ label, hint }: { label: string; hint: string }) {
  return (
    <span>
      {label}
      <span className="block font-normal text-slate-400">{hint}</span>
    </span>
  );
}

function RaporContent() {
  const { can } = usePermissions();
  const canExport = can("reports:export");
  const canLedger = can("finance:center");
  const canFinance = can("finance:read");
  const canPaymentsList = canLedger && (can("payments:read") || canFinance);
  const startReportRequest = useLatestRequest();
  const [tab, setTab] = useTabParam<Tab>(TAB_KEYS, "genel");
  // Dönem adres çubuğunda (?donem=…); varsayılan "Bu ay", bitiş bugünü geçemez.
  const period = useDateRangeParam(DATE_PRESET_SETS.takvim, "ay");
  // Rakamlar hangi döneme aitse o dönemle birlikte tutulur (etiket ve dışa aktarım ona göre).
  const [data, setData] = useState<{ stats: Stats; range: DateRange } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const range = period.range;
  const load = useCallback(async () => {
    // Geçersiz aralıkta istek atılmaz; hata tarih alanlarının altında görünür.
    if (period.error || !range) return;
    const request = startReportRequest();
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ from: `${range.from}T00:00`, to: `${range.to}T23:59` });
      const res = await fetch(`/api/reports?${params.toString()}`, { signal: request.signal });
      const body = await res.json().catch(() => null);
      if (!request.isLatest()) return;
      if (!res.ok || !body) throw new Error(body?.message || "Rapor verileri yüklenemedi.");
      setData({ stats: { ...EMPTY, ...body }, range });
    } catch (error) {
      if (isAbortError(error) || !request.isLatest()) return;
      setLoadError(error instanceof Error ? error.message : "Rapor verileri yüklenemedi.");
    } finally {
      if (request.isLatest()) setLoading(false);
    }
  }, [period.error, range, startReportRequest]);

  useEffect(() => { void load(); }, [load]);

  // Dönem değişirken eski rakamlar soluk kalır (yeni dönemin rakamı sanılmasın);
  // ilk yüklemede iskelet. Bilinmeyen tutar hiçbir zaman ₺0 görünmez.
  const firstLoad = !data;
  const stale = Boolean(data) && (loading || Boolean(period.error));
  const showError = Boolean(loadError) && !loading;
  const stats = data?.stats ?? EMPTY;
  const dataRange = data?.range ?? range;
  const rangeLabel = formatRangeLabel(dataRange);
  const vatPayable = stats.netVAT >= 0;
  const taxYear = Number((dataRange?.from || todayKey()).slice(0, 4));
  // Sunucu yıllık kârı seçilen başlangıç tarihinin yılının tamamı için hesaplar.
  const currentYear = taxYear === Number(todayKey().slice(0, 4));

  const strip: StatItem[] = [
    { key: "in", label: "Tahsilat", value: money(stats.totalRevenue), tone: stats.totalRevenue > 0 ? "success" : "neutral" },
    { key: "out", label: "Gider", value: money(stats.totalExpenses), tone: stats.totalExpenses > 0 ? "critical" : "neutral", hint: "Hakediş, tedarikçi dahil" },
    { key: "net", label: "Net", value: signed(stats.netCash), tone: stats.netCash < 0 ? "critical" : "neutral", hint: "Tahsilat − gider" },
    { key: "patients", label: "Yeni hasta", value: count(stats.newPatients) },
  ];

  const methodRows = [
    { key: "NAKIT", value: stats.cash },
    { key: "KREDI_KARTI", value: stats.card },
    { key: "HAVALE_EFT", value: stats.transfer },
    { key: "MAIL_ORDER", value: stats.mailOrder },
    { key: "DIGER", value: stats.other },
  ].filter((row) => row.value > 0).map((row) => ({ label: METHOD_LABELS[row.key] || row.key, value: row.value, display: money(row.value) }));
  const cashNet = stats.dayClose?.cashNet ?? stats.cash;
  const unpaidPatients = stats.dayClose?.unpaidTreatmentPatientCount ?? 0;

  const vatItems: DescriptionItem[] = [
    { key: "out", label: <HintLabel label="Hesaplanan KDV" hint="KDV dahil tahsilatın içindeki %10" />, value: <span className="tabular-nums">{money(stats.outputVAT)}</span> },
    { key: "in", label: <HintLabel label="İndirilecek KDV" hint="Gider ve alım faturalarından" />, value: <span className="tabular-nums">−{money(stats.inputVAT)}</span> },
    { key: "net", emphasis: true, label: vatPayable ? "Ödenecek KDV" : "Devreden KDV (sonraki döneme)", value: <span className={`tabular-nums ${vatPayable ? "text-red-700" : "text-emerald-700"}`}>{money(Math.abs(stats.netVAT))}</span> },
  ];
  const incomeTaxItems: DescriptionItem[] = [
    { key: "period", label: <HintLabel label="Dönem kârı (KDV hariç)" hint="Tahsilat − gider" />, value: <span className={`tabular-nums ${stats.periodNetProfit < 0 ? "text-red-700" : ""}`}>{signed(stats.periodNetProfit)}</span> },
    { key: "year", label: <HintLabel label={`${taxYear} yılı kârı`} hint={currentYear ? "Yıl başından bugüne" : "Yılın tamamı"} />, value: <span className={`tabular-nums ${stats.annualNetProfit < 0 ? "text-red-700" : ""}`}>{signed(stats.annualNetProfit)}</span> },
    { key: "tax", emphasis: true, label: "Hesaplanan gelir vergisi", value: <span className="tabular-nums text-red-700">{money(stats.gelirVergisi)}</span> },
  ];

  // ── Dışa aktarma (reports:export): ekranda görünen özet, mali müşavire gönderilecek biçimde.
  const exportRows = () => {
    const rows: Array<{ Bölüm: string; Kalem: string; Değer: string }> = [];
    const add = (section: string, label: string, value: string) => rows.push({ Bölüm: section, Kalem: label, Değer: value });
    add("Özet", "Dönem", rangeLabel);
    add("Özet", "Tahsilat", csvAmount(stats.totalRevenue));
    add("Özet", "Gider", csvAmount(stats.totalExpenses));
    add("Özet", "Net (tahsilat − gider)", csvAmount(stats.netCash));
    add("Özet", "Yeni hasta", String(stats.newPatients));
    add("Özet", "Tedavi kalemi", String(stats.totalExaminations));
    for (const row of methodRows) add("Tahsilat yöntemleri", row.label, csvAmount(row.value));
    add("Tahsilat yöntemleri", "Nakit değişimi", csvAmount(cashNet));
    for (const row of stats.expenseByCategory) add("Giderler", row.category, csvAmount(row.amount));
    for (const row of stats.firmaByName) add("Tedarikçi alım faturaları", row.name, csvAmount(row.amount));
    if (stats.totalFirmaAlim > 0) add("Tedarikçi alım faturaları", "Toplam alım", csvAmount(stats.totalFirmaAlim));
    if (stats.totalLabCost > 0) add("Tedarikçi alım faturaları", "Laboratuvar faturaları", csvAmount(stats.totalLabCost));
    add("KDV (tahmini)", "Hesaplanan KDV", csvAmount(stats.outputVAT));
    add("KDV (tahmini)", "İndirilecek KDV", csvAmount(stats.inputVAT));
    add("KDV (tahmini)", vatPayable ? "Ödenecek KDV" : "Devreden KDV", csvAmount(Math.abs(stats.netVAT)));
    add("Gelir vergisi (tahmini)", "Dönem kârı (KDV hariç)", csvAmount(stats.periodNetProfit));
    add("Gelir vergisi (tahmini)", `${taxYear} yılı kârı`, csvAmount(stats.annualNetProfit));
    add("Gelir vergisi (tahmini)", "Hesaplanan gelir vergisi", csvAmount(stats.gelirVergisi));
    for (const row of stats.topExaminations) add("En çok yapılan tedaviler", row.treatmentName, String(row.count));
    for (const row of stats.topTeeth) add("En çok işlem gören dişler", `Diş ${row.tooth}`, String(row.count));
    return rows;
  };
  const fileBase = `rapor-${dataRange?.from || ""}-${dataRange?.to || ""}`;
  const exportExcel = async () => {
    const { downloadCsv } = await import("@/lib/csv-export");
    downloadCsv(fileBase, exportRows());
  };
  const exportPdf = async () => {
    const { addPdfSection, addPdfTitle, createPdfDoc, preparePdfFonts } = await import("@/lib/pdf-export");
    // Türkçe yazı tipi oturumun ilk PDF'inde de yüklü olsun (yoksa harfler dönüştürülür).
    await preparePdfFonts();
    const rows = exportRows();
    const doc = createPdfDoc();
    addPdfTitle(doc, "Rapor", `${rangeLabel} · Tahmini KDV ve gelir vergisi; resmi beyan için mali müşavire danışın.`);
    let y = 30;
    for (const section of Array.from(new Set(rows.map((row) => row.Bölüm)))) {
      y = addPdfSection(doc, y, section, ["Kalem", "Değer"], rows.filter((row) => row.Bölüm === section).map((row) => [row.Kalem, row.Değer]));
    }
    doc.save(`${fileBase}.pdf`);
  };

  const content = (() => {
    const busy = firstLoad;
    if (tab === "islemler") {
      return (
        <div className="grid gap-3 lg:grid-cols-2">
          <Section title="En çok yapılan tedaviler" description={busy ? undefined : `Bu dönemde ${count(stats.totalExaminations)} tedavi kalemi işlendi.`}>
            {busy ? <BarListSkeleton /> : stats.topExaminations.length > 0
              ? <BarList rows={stats.topExaminations.map((row) => ({ label: row.treatmentName, value: row.count, display: `${count(row.count)} kez` }))} />
              : <EmptyState title="Bu dönemde tedavi kaydı yok" compact />}
          </Section>
          <Section title="En çok işlem gören dişler">
            {busy ? <BarListSkeleton /> : stats.topTeeth.length > 0
              ? <BarList rows={stats.topTeeth.map((row) => ({ label: `Diş ${row.tooth}`, value: row.count, display: `${count(row.count)} kez` }))} />
              : <EmptyState title="Bu dönemde diş kaydı yok" compact />}
          </Section>
        </div>
      );
    }
    if (tab === "vergi") {
      return (
        <div className="space-y-3">
          <Callout tone="neutral" role="note">Tahmini hesaplamadır. Resmi beyan için mali müşavirinize danışın.</Callout>
          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="KDV">
              {busy ? <BarListSkeleton rows={3} /> : <DescriptionList layout="rows" items={vatItems} />}
            </Section>
            <Section title={`Gelir vergisi (${taxYear})`}>
              {busy ? <BarListSkeleton rows={3} /> : (
                <div className="space-y-3">
                  <DescriptionList layout="rows" items={incomeTaxItems} />
                  <Disclosure title={`Vergi dilimleri (${stats.taxTariffYear ?? INCOME_TAX_TARIFF_YEAR} tarifesi)`}>
                    <ul className="space-y-1 text-sm text-slate-600">
                      {TAX_BRACKETS.map(([label, rate]) => (
                        <li key={label} className="flex justify-between gap-3"><span>{label}</span><span className="font-semibold tabular-nums">{rate}</span></li>
                      ))}
                    </ul>
                  </Disclosure>
                </div>
              )}
            </Section>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-2">
          <Section
            title="Tahsilat yöntemleri"
            actions={canPaymentsList && range ? <SectionLink href={ledgerHref(period.value, range, "TAHSILAT")}>Tahsilatları listele</SectionLink> : undefined}
            footer={busy ? undefined : (
              <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-slate-600">
                <span>Nakit değişimi <span className="text-xs text-slate-400">(nakit tahsilat − nakit gider)</span></span>
                <b className={`tabular-nums ${cashNet < 0 ? "text-red-700" : "text-slate-900"}`}>{signed(cashNet)}</b>
              </p>
            )}
          >
            {busy ? <BarListSkeleton /> : methodRows.length > 0
              ? <BarList rows={methodRows} />
              : <EmptyState title="Bu dönemde tahsilat yok" compact />}
          </Section>

          <Section
            title="Gider türleri"
            actions={canLedger && canFinance && range ? <SectionLink href={ledgerHref(period.value, range, "GIDER")}>Giderleri listele</SectionLink> : undefined}
          >
            {busy ? <BarListSkeleton /> : stats.expenseByCategory.length > 0
              ? <BarList tone="neutral" rows={stats.expenseByCategory.map((row) => ({ label: row.category, value: row.amount, display: money(row.amount) }))} />
              : <EmptyState title="Bu dönemde gider yok" compact />}
          </Section>

          <Section
            title="Tedarikçi alım faturaları"
            description="Faturadır; tedarikçiye ödendikçe giderlere yansır."
            actions={canFinance ? <SectionLink href="/firma">Satın alma</SectionLink> : undefined}
            footer={!busy && (stats.totalFirmaAlim > 0 || stats.totalLabCost > 0) ? (
              // Dönemin toplam alım faturası başka hiçbir yerde yazmıyor (şeritteki Gider ödenen tutardır).
              <div className="space-y-1.5">
                {stats.totalFirmaAlim > 0 && (
                  <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-slate-600">
                    <span>Toplam alım</span>
                    <b className="tabular-nums text-slate-900">{money(stats.totalFirmaAlim)}</b>
                  </p>
                )}
                {stats.totalLabCost > 0 && (
                  <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-slate-600">
                    <span>Laboratuvar faturaları <span className="text-xs text-slate-400">(doktor hakedişinden düşülür)</span></span>
                    <b className="tabular-nums text-slate-900">{money(stats.totalLabCost)}</b>
                  </p>
                )}
              </div>
            ) : undefined}
          >
            {busy ? <BarListSkeleton rows={3} /> : stats.firmaByName.length > 0
              ? <BarList tone="neutral" rows={stats.firmaByName.map((row) => ({ label: row.name, value: row.amount, display: money(row.amount) }))} />
              : <EmptyState title="Bu dönemde tedarikçi alımı yok" compact />}
          </Section>
        </div>

        {!busy && unpaidPatients > 0 && (
          <Callout
            tone="info"
            action={canLedger && canFinance ? <SectionLink href="/muhasebe?tab=alacaklar&gorunum=hastalar">Alacaklar</SectionLink> : undefined}
          >
            Bu dönemde tedavi görüp bugün itibarıyla borcu kalan <b>{count(unpaidPatients)}</b> hasta var.
          </Callout>
        )}
      </div>
    );
  })();

  return (
    <section className="space-y-3">
      <PageHeader icon="rapor" title="Raporlar" />

      <Tabs
        ariaLabel="Rapor bölümleri"
        items={[
          { key: "genel", label: "Özet" },
          { key: "islemler", label: "Tedaviler" },
          { key: "vergi", label: "Vergi (tahmini)" },
        ]}
        value={tab}
        onChange={setTab}
      />

      <Toolbar
        actions={canExport ? (
          <ExportMenu
            disabled={!data || loading || Boolean(period.error)}
            disabledReason={period.error ? "Önce geçerli bir dönem seçin" : "Rapor hazırlanıyor"}
            items={[
              { key: "excel", label: "Excel (CSV)", icon: FileSpreadsheet, onSelect: exportExcel },
              { key: "pdf", label: "PDF", icon: FileText, onSelect: exportPdf },
            ]}
          />
        ) : undefined}
      >
        <DateRangeFilter {...period.filterProps} showRange />
      </Toolbar>

      {showError ? (
        <LoadErrorState message={loadError || "Rapor verileri yüklenemedi."} onRetry={() => void load()} />
      ) : firstLoad && period.error ? null : (
        // Dönemin özeti tüm sekmelerde aynı yerde ve bir kez; sekmeler bu sayıları tekrar etmez.
        <div className={`space-y-3 transition-opacity ${stale ? "opacity-50" : ""}`} aria-busy={loading || undefined}>
          <StatStrip items={strip} loading={firstLoad} columns={4} aria-label="Dönem özeti" />
          {content}
        </div>
      )}
    </section>
  );
}

export default function RaporPage() {
  return (
    <Suspense fallback={<PageSkeleton headerAction={false} toolbar stats={4} tabs={3} body="cards" rows={4} columns={2} label="Raporlar yükleniyor" />}>
      <RaporContent />
    </Suspense>
  );
}
