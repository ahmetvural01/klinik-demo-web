"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, ExternalLink, Pencil, Plus } from "lucide-react";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { Toolbar, ActiveFilters, type ActiveFilter } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Input, Select } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { downloadCsv } from "@/lib/csv-export";
import { turkeyDateKey } from "@/lib/tz";
import { METHOD_LABELS, methodLabel, money, shortDate, todayKey } from "@/components/muhasebe/muhasebe-utils";
import { ExportMenu } from "@/components/muhasebe/ExportMenu";
import type { EditTarget, LedgerExpense, LedgerPayment } from "@/components/muhasebe/EditEntryModal";
import type { EntryKind } from "@/components/muhasebe/EntryModal";

export type LedgerRow = {
  key: string;
  id: string;
  kind: "TAHSILAT" | "GIDER";
  subtype: "tahsilat" | "gider" | "hakedis" | "firma";
  date: string;
  hasTime: boolean;
  who: string | null;
  whoId: string | null;
  item: string;
  note: string;
  doctor: string | null;
  method: string;
  amount: number;
  locked: boolean;
  payment?: LedgerPayment;
  expense?: LedgerExpense;
};

type Totals = { tahsilat: number; tahsilatCount: number; gider: number; giderCount: number; net: number; byMethod: Record<string, { in: number; out: number }> };
type LedgerResponse = { rows: LedgerRow[]; total: number; page: number; pageCount: number; take: number; truncated: boolean; totals: Totals; sources: { payments: boolean; expenses: boolean } };

export type PeriodKey = "bugun" | "hafta" | "ay" | "gecen-ay" | "3ay" | "yil" | "ozel";
const PERIOD_LABELS: Record<PeriodKey, string> = {
  bugun: "Bugün",
  hafta: "Bu hafta",
  ay: "Bu ay",
  "gecen-ay": "Geçen ay",
  "3ay": "Son 3 ay",
  yil: "Bu yıl",
  ozel: "Tarih aralığı seç",
};
const TYPE_ITEMS = [
  { key: "HEPSI" as const, label: "Tümü" },
  { key: "TAHSILAT" as const, label: "Tahsilat" },
  { key: "GIDER" as const, label: "Gider" },
];
const SUBTYPE_LABEL: Record<LedgerRow["subtype"], string> = { tahsilat: "Tahsilat", gider: "Gider", hakedis: "Hakediş ödemesi", firma: "Firma ödemesi" };
const PAGE_SIZE = 50;

/** Seçili dönem → gün aralığı (Türkiye takvimi). */
export function periodRange(period: PeriodKey, custom?: { from: string; to: string }): { from: string; to: string } {
  const today = todayKey();
  const day = (offsetDays: number, base = today) => {
    const date = new Date(`${base}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  };
  if (period === "bugun") return { from: today, to: today };
  if (period === "hafta") {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
    return { from: day(1 - weekday), to: today };
  }
  if (period === "gecen-ay") {
    const firstThis = `${today.slice(0, 7)}-01`;
    const lastPrev = day(-1, firstThis);
    return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
  }
  if (period === "3ay") return { from: day(-89), to: today };
  if (period === "yil") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (period === "ozel" && custom?.from && custom?.to) return custom;
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

type Props = {
  canWritePayments: boolean;
  canRefundPayments: boolean;
  canWriteFinance: boolean;
  refreshKey: number;
  initial?: { period?: PeriodKey; from?: string; to?: string; tur?: "HEPSI" | "TAHSILAT" | "GIDER" };
  onEdit: (target: EditTarget) => void;
  onNew: (kind: EntryKind) => void;
  onChanged: () => void;
};

function timeText(value: string) {
  return new Date(value).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}

export function LedgerTab({ canWritePayments, canRefundPayments, canWriteFinance, refreshKey, initial, onEdit, onNew, onChanged }: Props) {
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodKey>(initial?.period || (initial?.from && initial?.to ? "ozel" : "ay"));
  const [customFrom, setCustomFrom] = useState(initial?.from || `${todayKey().slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(initial?.to || todayKey());
  const [tur, setTur] = useState<"HEPSI" | "TAHSILAT" | "GIDER">(initial?.tur || "HEPSI");
  const [yontem, setYontem] = useState("HEPSI");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sequenceRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const range = useMemo(() => periodRange(period, { from: customFrom, to: customTo }), [period, customFrom, customTo]);
  const rangeInvalid = period === "ozel" && (!customFrom || !customTo || customFrom > customTo);

  const buildParams = useCallback((extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ from: range.from, to: range.to, tur, yontem, ...extra });
    if (debouncedSearch) params.set("q", debouncedSearch);
    return params;
  }, [debouncedSearch, range.from, range.to, tur, yontem]);

  const load = useCallback(async () => {
    if (rangeInvalid) return;
    const sequence = ++sequenceRef.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/muhasebe/defter?${buildParams({ page: String(page), take: String(PAGE_SIZE) }).toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (sequence !== sequenceRef.current) return;
      if (!response.ok || !Array.isArray(body?.rows)) throw new Error(body?.message || "Gelir ve gider listesi yüklenemedi.");
      setData(body as LedgerResponse);
      if (body?.page && body.page !== page) setPage(body.page);
    } catch (loadError) {
      if (sequence !== sequenceRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Gelir ve gider listesi yüklenemedi.");
    } finally {
      if (sequence === sequenceRef.current) setLoading(false);
    }
  }, [buildParams, page, rangeInvalid]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => { setPage(1); }, [range.from, range.to, tur, yontem, debouncedSearch]);

  const canEdit = (row: LedgerRow) => !row.locked && (row.kind === "TAHSILAT" ? canWritePayments : canWriteFinance);
  const canVoid = (row: LedgerRow) => !row.locked && (row.kind === "TAHSILAT" ? canRefundPayments : canWriteFinance);

  const openRow = (row: LedgerRow) => {
    if (row.locked) {
      if (row.whoId) router.push(`/firma-detay?id=${encodeURIComponent(row.whoId)}`);
      return;
    }
    if (!canEdit(row)) return;
    if (row.kind === "TAHSILAT" && row.payment) onEdit({ kind: "TAHSILAT", payment: row.payment });
    if (row.kind === "GIDER" && row.expense) onEdit({ kind: "GIDER", expense: row.expense });
  };

  const voidRow = async (row: LedgerRow) => {
    const isPayment = row.kind === "TAHSILAT";
    const title = isPayment ? "Tahsilat iptal edilsin mi?" : row.subtype === "hakedis" ? "Hakediş ödemesi iptal edilsin mi?" : "Gider iptal edilsin mi?";
    const message = isPayment
      ? `${row.who || "Hasta"} — ${money(row.amount)} tahsilatı iptal edilir. Hastanın borcu ve varsa taksit ödemesi geri açılır; kayıt geçmişte iz olarak kalır.`
      : row.subtype === "hakedis"
        ? `${row.who || "Doktor"} — ${row.item}, ${money(row.amount)} iptal edilir; o ayın kalan hakedişi geri açılır.`
        : `${row.item} — ${money(row.amount)} gideri iptal edilir ve raporlardan çıkar.`;
    if (!(await confirmDialog({ title, message, danger: true, confirmText: isPayment ? "Tahsilatı iptal et" : "Gideri iptal et", cancelText: "Vazgeç" }))) return;
    const response = await fetch(isPayment ? `/api/payments/${row.id}` : `/api/gider/${row.id}`, { method: "DELETE" }).catch(() => null);
    if (response?.ok) {
      showToastSafe({ message: isPayment ? "Tahsilat iptal edildi." : "Gider iptal edildi.", type: "success" });
      onChanged();
      void load();
      return;
    }
    const body = await response?.json().catch(() => null);
    showToastSafe({ title: "İptal edilemedi", message: body?.message || body?.error || "Bağlantınızı kontrol edip tekrar deneyin.", type: "error", duration: 6000 });
  };

  const fetchAllRows = async (): Promise<LedgerRow[] | null> => {
    const response = await fetch(`/api/muhasebe/defter?${buildParams({ all: "1" }).toString()}`, { cache: "no-store" }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (!response?.ok || !Array.isArray(body?.rows)) {
      showToastSafe({ message: body?.message || "Dışa aktarım için liste alınamadı.", type: "error" });
      return null;
    }
    return body.rows as LedgerRow[];
  };

  const exportRows = (rows: LedgerRow[]) => rows.map((row) => ({
    Tarih: `${shortDate(row.date)}${row.hasTime ? ` ${timeText(row.date)}` : ""}`,
    Kim: row.who || "",
    Kalem: row.item,
    Doktor: row.doctor || "",
    Açıklama: row.note || "",
    Yöntem: methodLabel(row.method),
    Tutar: `${row.kind === "TAHSILAT" ? "" : "-"}${row.amount.toFixed(2).replace(".", ",")}`,
  }));

  const exportExcel = async () => {
    const rows = await fetchAllRows();
    if (!rows) return;
    downloadCsv(`gelir-gider-${range.from}-${range.to}.csv`, exportRows(rows));
  };

  const exportPdf = async () => {
    const rows = await fetchAllRows();
    if (!rows) return;
    const { addPdfSection, addPdfTitle, createPdfDoc } = await import("@/lib/pdf-export");
    const doc = createPdfDoc("l");
    const totals = data?.totals;
    addPdfTitle(doc, "Gelir ve gider", `${shortDate(range.from)} – ${shortDate(range.to)} · Tahsilat ${money(totals?.tahsilat)} · Gider ${money(totals?.gider)} · Fark ${money(totals?.net)}`);
    addPdfSection(doc, 28, "Hareketler", ["Tarih", "Kim", "Kalem", "Doktor", "Açıklama", "Yöntem", "Tutar"],
      exportRows(rows).map((row) => [row.Tarih, row.Kim, row.Kalem, row.Doktor, row.Açıklama, row.Yöntem, row.Tutar]));
    doc.save(`gelir-gider-${range.from}-${range.to}.pdf`);
  };

  const amountCell = (row: LedgerRow) => (
    <span className={`whitespace-nowrap font-bold tabular-nums ${row.kind === "TAHSILAT" ? "text-emerald-700" : "text-red-700"}`}>
      {row.kind === "TAHSILAT" ? "+" : "−"}{money(row.amount)}
    </span>
  );

  const secondLine = (row: LedgerRow) => [row.doctor ? `Dr. ${row.doctor}` : "", row.note].filter(Boolean).join(" · ");

  const rowActions = (row: LedgerRow) => (
    <div className="flex justify-end gap-1">
      {row.locked ? (
        row.whoId ? <IconButton icon={ExternalLink} title="Firma ekstresinde aç" href={`/firma-detay?id=${encodeURIComponent(row.whoId)}`} size="sm" /> : null
      ) : (
        <>
          {canEdit(row) && <IconButton icon={Pencil} title="Düzenle" size="sm" onClick={() => openRow(row)} />}
          {canVoid(row) && <IconButton icon={Ban} title={row.kind === "TAHSILAT" ? "Tahsilatı iptal et" : "Gideri iptal et"} tone="danger" size="sm" onClick={() => void voidRow(row)} />}
        </>
      )}
    </div>
  );

  const columns: ListTableColumn<LedgerRow>[] = [
    {
      key: "tarih",
      header: "Tarih",
      cellClassName: "whitespace-nowrap",
      render: (row) => (
        <div>
          <p className="text-sm text-slate-700">{shortDate(row.date)}</p>
          {row.hasTime && <p className="text-xs text-slate-400">{timeText(row.date)}</p>}
        </div>
      ),
    },
    {
      key: "kim",
      header: "Kim",
      render: (row) => row.who
        ? (row.subtype === "firma" && row.whoId
          ? <Link href={`/firma-detay?id=${encodeURIComponent(row.whoId)}`} className="font-semibold text-slate-800 hover:text-primary hover:underline">{row.who}</Link>
          : <span className="font-semibold text-slate-800">{row.who}</span>)
        : <span className="text-sm text-slate-500">Klinik gideri</span>,
    },
    {
      key: "kalem",
      header: "Kalem",
      render: (row) => (
        <div className="min-w-0 max-w-[340px]">
          <p className="truncate text-sm text-slate-800">
            {row.item}
            {row.locked && <Badge tone="neutral" className="ml-1.5 align-middle" title="Firma ekranından yönetilir">Firmadan</Badge>}
          </p>
          {secondLine(row) && <p className="truncate text-xs text-slate-500" title={secondLine(row)}>{secondLine(row)}</p>}
        </div>
      ),
    },
    { key: "yontem", header: "Yöntem", cellClassName: "whitespace-nowrap text-sm text-slate-600", render: (row) => methodLabel(row.method) || <EmptyValue /> },
    { key: "tutar", header: "Tutar", align: "right", render: amountCell },
    { key: "islem", header: "", align: "right", render: rowActions },
  ];

  const totals = data?.totals;
  const methodSummary = totals
    ? Object.entries(totals.byMethod)
        .filter(([, value]) => value.in > 0 || value.out > 0)
        .map(([key, value]) => `${METHOD_LABELS[key] || key}: ${value.in > 0 ? `+${money(value.in)}` : ""}${value.in > 0 && value.out > 0 ? " / " : ""}${value.out > 0 ? `−${money(value.out)}` : ""}`)
    : [];
  const cash = totals?.byMethod?.NAKIT;

  const activeFilters: ActiveFilter[] = [
    ...(period !== "ay" ? [{ key: "period", label: period === "ozel" ? `${shortDate(range.from)} – ${shortDate(range.to)}` : PERIOD_LABELS[period], onRemove: () => setPeriod("ay") }] : []),
    ...(tur !== "HEPSI" ? [{ key: "tur", label: tur === "TAHSILAT" ? "Yalnız tahsilat" : "Yalnız gider", onRemove: () => setTur("HEPSI") }] : []),
    ...(yontem !== "HEPSI" ? [{ key: "yontem", label: methodLabel(yontem), onRemove: () => setYontem("HEPSI") }] : []),
    ...(debouncedSearch ? [{ key: "q", label: `"${debouncedSearch}"`, onRemove: () => setSearch("") }] : []),
  ];
  const filterCount = activeFilters.filter((filter) => filter.key !== "q").length;

  const summary = (
    <div className="border-b border-slate-100 px-4 py-3">
      {totals ? (
        <>
          <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-slate-500">Tahsilat</dt>
              <dd className="font-bold tabular-nums text-emerald-700">+{money(totals.tahsilat)}</dd>
              <dd className="text-xs text-slate-400">({totals.tahsilatCount})</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-slate-500">Gider</dt>
              <dd className="font-bold tabular-nums text-red-700">−{money(totals.gider)}</dd>
              <dd className="text-xs text-slate-400">({totals.giderCount})</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-slate-500">Fark</dt>
              <dd className={`font-extrabold tabular-nums ${totals.net >= 0 ? "text-slate-900" : "text-red-700"}`}>{totals.net >= 0 ? "" : "−"}{money(Math.abs(totals.net))}</dd>
            </div>
            {cash && (cash.in > 0 || cash.out > 0) && (
              <div className="flex items-baseline gap-1.5" title="Nakit tahsilat eksi nakit ödenen gider">
                <dt className="text-slate-500">Kasadaki nakit değişimi</dt>
                <dd className="font-bold tabular-nums text-slate-800">{cash.in - cash.out >= 0 ? "+" : "−"}{money(Math.abs(cash.in - cash.out))}</dd>
              </div>
            )}
          </dl>
          {methodSummary.length > 1 && <p className="mt-1 text-xs text-slate-500">{methodSummary.join(" · ")}</p>}
          {data?.truncated && <p className="mt-1 text-xs font-semibold text-amber-700">Bu dönemde çok fazla kayıt var; listenin tamamı için dönemi daraltın.</p>}
          {data && !data.sources.expenses && <p className="mt-1 text-xs text-slate-500">Giderleri görme yetkiniz yok; yalnız tahsilatlar listelenir.</p>}
        </>
      ) : (
        <p className="text-sm text-slate-400">{loading ? "Toplamlar hesaplanıyor…" : " "}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <Toolbar
        actions={(
          <ExportMenu onExcel={exportExcel} onPdf={exportPdf} disabled={!data || data.total === 0} />
        )}
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Hasta, firma, gider türü veya açıklama ara"
          wrapperClassName="flex-1 min-w-[220px]"
        />
        <Button
          variant="secondary"
          size="sm"
          className="sm:hidden"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((value) => !value)}
        >
          {filtersOpen ? "Filtreleri gizle" : `Filtrele${filterCount ? ` (${filterCount})` : ""}`}
        </Button>
        <div className={`${filtersOpen ? "flex" : "hidden"} flex-col gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center`}>
          <Select aria-label="Dönem" size="sm" value={period} onChange={(event) => setPeriod(event.target.value as PeriodKey)} className="sm:w-auto">
            {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => <option key={key} value={key}>{PERIOD_LABELS[key]}</option>)}
          </Select>
          {period === "ozel" && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                Başlangıç
                <Input type="date" size="sm" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} className="w-auto" />
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                Bitiş
                <Input type="date" size="sm" value={customTo} min={customFrom || undefined} max={turkeyDateKey()} onChange={(event) => setCustomTo(event.target.value)} className="w-auto" />
              </label>
            </div>
          )}
          <Tabs ariaLabel="Kayıt türü" size="sm" items={TYPE_ITEMS} value={tur} onChange={setTur} />
          <Select aria-label="Ödeme yöntemi" size="sm" value={yontem} onChange={(event) => setYontem(event.target.value)} className="sm:w-auto">
            <option value="HEPSI">Tüm yöntemler</option>
            {Object.entries(METHOD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
        </div>
      </Toolbar>
      <ActiveFilters
        filters={activeFilters}
        onClearAll={() => { setPeriod("ay"); setTur("HEPSI"); setYontem("HEPSI"); setSearch(""); }}
      />
      {rangeInvalid && <p className="text-sm font-semibold text-red-600">Başlangıç tarihi bitiş tarihinden sonra olamaz.</p>}

      <ListTable
        columns={columns}
        rows={data?.rows || []}
        rowKey={(row) => row.key}
        loading={loading}
        error={error || null}
        onRetry={() => void load()}
        header={summary}
        emptyText={debouncedSearch || tur !== "HEPSI" || yontem !== "HEPSI" ? "Aramaya uyan kayıt yok" : "Bu dönemde kayıt yok"}
        emptyDescription={debouncedSearch || tur !== "HEPSI" || yontem !== "HEPSI" ? "Filtreleri temizleyip tekrar deneyin." : "Dönemi değiştirin ya da yeni bir tahsilat veya gider ekleyin."}
        emptyAction={canWritePayments && !debouncedSearch ? <Button size="sm" variant="secondary" icon={Plus} onClick={() => onNew("gelir")}>Tahsilat al</Button> : undefined}
        getRowAriaLabel={(row) => `${SUBTYPE_LABEL[row.subtype]}: ${row.who || row.item}, ${money(row.amount)}`}
        mobileCard={(row) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{row.who || row.item}</p>
              <p className="truncate text-xs text-slate-500">
                {shortDate(row.date)}{row.hasTime ? ` ${timeText(row.date)}` : ""} · {row.who ? row.item : "Klinik gideri"} · {methodLabel(row.method)}
              </p>
              {secondLine(row) && <p className="truncate text-xs text-slate-400">{secondLine(row)}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {amountCell(row)}
              {rowActions(row)}
            </div>
          </div>
        )}
        pager={data && data.total > PAGE_SIZE ? {
          page: data.page,
          pageCount: data.pageCount,
          pageSize: PAGE_SIZE,
          total: data.total,
          onPageChange: setPage,
          loading,
        } : undefined}
      />
    </div>
  );
}
