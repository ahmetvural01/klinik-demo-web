"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, ChevronDown, ExternalLink, Pencil } from "lucide-react";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Toolbar, ActiveFilters, type ActiveFilter } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Select } from "@/components/ui/Input";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { StatStrip, type StatItem } from "@/components/ui/StatStrip";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Badge } from "@/components/ui/Badge";
import { formatDateText } from "@/components/ui/Money";
import { useDateRangeParam } from "@/lib/use-date-range-param";
import { formatRangeLabel, rangeDayCount, type DatePresetKey } from "@/lib/date-presets";
import { LEDGER_PERIODS as SHARED_LEDGER_PERIODS } from "@/lib/ledger-periods";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { FINANCE_TOOLBAR_CLASS, METHOD_LABELS, doctorLabel, methodLabel, money, sharedValue, shortDate } from "@/components/muhasebe/muhasebe-utils";
import { useLoadWhenActive } from "@/components/muhasebe/finance-hooks";
import type { EditTarget, LedgerExpense, LedgerPayment } from "@/components/muhasebe/EditEntryModal";

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
  /** İptal edilmiş kayıt ("İptal edilenler" görünümü); salt okunur. */
  voided?: boolean;
  voidedAt?: string | null;
  payment?: LedgerPayment;
  expense?: LedgerExpense;
};

type Totals = { tahsilat: number; tahsilatCount: number; gider: number; giderCount: number; net: number; byMethod: Record<string, { in: number; out: number }> };
type LedgerResponse = { rows: LedgerRow[]; total: number; page: number; pageCount: number; take: number; truncated: boolean; totals: Totals; sources: { payments: boolean; expenses: boolean } };

/** "IPTAL": dönemde iptal edilmiş tahsilat ve giderler (salt okunur iz). */
export type LedgerType = "HEPSI" | "TAHSILAT" | "GIDER" | "IPTAL";
export const isLedgerType = (value: string | null | undefined): value is LedgerType =>
  value === "HEPSI" || value === "TAHSILAT" || value === "GIDER" || value === "IPTAL";

/** Dönemler (ortak sözlük, src/lib/ledger-periods.ts). Eski içe aktarmalar için burada da dışa açık. */
export const LEDGER_PERIODS: readonly DatePresetKey[] = SHARED_LEDGER_PERIODS;
const TYPE_OPTIONS: { value: LedgerType; label: string }[] = [
  { value: "HEPSI", label: "Tümü" },
  { value: "TAHSILAT", label: "Tahsilat" },
  { value: "GIDER", label: "Gider" },
  { value: "IPTAL", label: "İptal edilenler" },
];
// Tek kaynaklı kullanıcı (ör. banko yalnız tahsilatları görür): tür ayrımı yok, yalnız iptal izi.
const SINGLE_SOURCE_TYPE_OPTIONS = TYPE_OPTIONS.filter((option) => option.value === "HEPSI" || option.value === "IPTAL");
const TYPE_FILTER_LABEL: Record<Exclude<LedgerType, "HEPSI">, string> = {
  TAHSILAT: "Yalnız tahsilat",
  GIDER: "Yalnız gider",
  IPTAL: "İptal edilenler",
};
const PAGE_SIZE = 50;

const signedMoney = (value: number) => `${value < 0 ? "−" : value > 0 ? "+" : ""}${money(Math.abs(value))}`;

/** Satırın kalın ilk satırı: kimden alındı / neye ödendi. */
function rowTitle(row: LedgerRow) {
  if (row.subtype === "tahsilat") return row.who || "Hasta";
  if (row.subtype === "gider") return row.item;
  if (row.subtype === "firma") return row.who || "Firma ödemesi";
  return row.who || "Hakediş ödemesi";
}

/**
 * İkinci satır: tahsilatta doktor ve not, giderde not ve fatura no, firma ve
 * hakediş ödemesinde türü. Önceden her tahsilatta "Tahsilat", her giderde
 * "Klinik gideri" sabit metni tekrar ediyordu; fatura no hiç görünmüyordu.
 * `hideDoctor`: bütün tahsilatlar aynı doktordaysa ad satırlarda tekrar
 * etmez (özetteki "Tahsilat" ipucunda bir kez yazar).
 */
function rowDetail(row: LedgerRow, hideDoctor = false) {
  const faturaNo = row.expense?.faturaNo ? `Fatura ${row.expense.faturaNo}` : "";
  if (row.subtype === "tahsilat") return [hideDoctor ? "" : doctorLabel(row.doctor), row.note].filter(Boolean).join(" · ");
  if (row.subtype === "gider") return [row.note, faturaNo].filter(Boolean).join(" · ");
  if (row.subtype === "firma") return ["Firma ödemesi", row.note].filter(Boolean).join(" · ");
  return [row.item, row.note].filter(Boolean).join(" · ");
}

const timeText = (value: string) => formatDateText(value, "time");

type Props = {
  /** Sekme ekranda mı (gizli sekme istek atmaz). */
  active: boolean;
  refreshKey: number;
  /** Adres çubuğunda dönem yokken kullanılan dönem. */
  defaultPeriod: DatePresetKey;
  tur: LedgerType;
  onTurChange: (tur: LedgerType) => void;
  /** Tahsilatlar listede (payments:read). */
  showPayments: boolean;
  /** Giderler listede (finance:read); yoksa yalnız tahsilatlar görünür. */
  showExpenses: boolean;
  canWritePayments: boolean;
  canRefundPayments: boolean;
  canWriteFinance: boolean;
  /** Dışa aktarma (finance:export). */
  canExport: boolean;
  onEdit: (target: EditTarget) => void;
  onChanged: () => void;
};

export function LedgerTab({
  active, refreshKey, defaultPeriod, tur, onTurChange, showPayments, showExpenses,
  canWritePayments, canRefundPayments, canWriteFinance, canExport, onEdit, onChanged,
}: Props) {
  const router = useRouter();
  const period = useDateRangeParam(LEDGER_PERIODS, defaultPeriod);
  const [yontem, setYontem] = useState("HEPSI");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // "Yönteme göre dağılım": özetteki nakit hücresine tıklayınca listenin kartının üst satırında açılır.
  const [methodsOpen, setMethodsOpen] = useState(false);
  const sequenceRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const range = period.range;
  // Tür, giderleri göremeyen kullanıcıda "Tümü" ya da "İptal edilenler" (listede zaten yalnız tahsilat var).
  const effectiveTur: LedgerType = showExpenses || tur === "IPTAL" ? tur : "HEPSI";
  const cancelledView = effectiveTur === "IPTAL";
  const query = useMemo(() => {
    if (!range || period.error) return null;
    const params = new URLSearchParams({ from: range.from, to: range.to, tur: effectiveTur, yontem });
    if (debouncedSearch) params.set("q", debouncedSearch);
    return params.toString();
  }, [debouncedSearch, effectiveTur, period.error, range, yontem]);

  // Sayfa numarası süzgece bağlı: süzgeç değişince ek istek atmadan 1. sayfaya döner.
  const [pageState, setPageState] = useState<{ query: string | null; page: number }>({ query: null, page: 1 });
  const page = pageState.query === query ? pageState.page : 1;
  const setPage = (next: number) => setPageState({ query, page: next });

  const load = useCallback(async () => {
    if (!query) return;
    const sequence = ++sequenceRef.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/muhasebe/defter?${query}&page=${page}&take=${PAGE_SIZE}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (sequence !== sequenceRef.current) return;
      if (!response.ok || !Array.isArray(body?.rows)) throw new Error(body?.message || "Gelir ve gider listesi yüklenemedi.");
      setData(body as LedgerResponse);
      setError("");
      if (body.page && body.page !== page) setPageState({ query, page: body.page });
    } catch (loadError) {
      if (sequence !== sequenceRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Gelir ve gider listesi yüklenemedi.");
    } finally {
      if (sequence === sequenceRef.current) setLoading(false);
    }
  }, [page, query]);

  useLoadWhenActive(active, `${query}|${page}|${refreshKey}`, () => void load());

  // İptal edilmiş kayıt salt okunur iz: düzenlenmez, yeniden iptal edilmez.
  const canEdit = (row: LedgerRow) => !row.voided && !row.locked && (row.kind === "TAHSILAT" ? canWritePayments : canWriteFinance);
  const canVoid = (row: LedgerRow) => !row.voided && !row.locked && (row.kind === "TAHSILAT" ? canRefundPayments : canWriteFinance);

  const openRow = (row: LedgerRow) => {
    if (row.voided) return;
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
    if (!(await confirmDialog({ title, message, danger: true, confirmText: isPayment ? "Tahsilatı iptal et" : row.subtype === "hakedis" ? "Ödemeyi iptal et" : "Gideri iptal et", cancelText: "Vazgeç" }))) return;
    const response = await fetch(isPayment ? `/api/payments/${row.id}` : `/api/gider/${row.id}`, { method: "DELETE" }).catch(() => null);
    if (response?.ok) {
      showToastSafe({ message: isPayment ? "Tahsilat iptal edildi." : row.subtype === "hakedis" ? "Hakediş ödemesi iptal edildi." : "Gider iptal edildi.", type: "success" });
      onChanged();
      return;
    }
    const body = await response?.json().catch(() => null);
    showToastSafe({ title: "İptal edilemedi", message: body?.message || body?.error || "Bağlantınızı kontrol edip tekrar deneyin.", type: "error", duration: 6000 });
  };

  // ── Dışa aktarma: seçili dönem ve süzgeçlerin TÜM kayıtları (sunucu finance:export ister).
  const fetchAllRows = async (): Promise<LedgerRow[]> => {
    if (!query) throw new Error("Önce geçerli bir dönem seçin.");
    const response = await fetch(`/api/muhasebe/defter?${query}&all=1`, { cache: "no-store" }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (!response?.ok || !Array.isArray(body?.rows)) throw new Error(body?.message || "Dışa aktarım için liste alınamadı.");
    return body.rows as LedgerRow[];
  };

  const exportRows = (rows: LedgerRow[]) => rows.map((row) => ({
    Tarih: `${shortDate(row.date)}${row.hasTime ? ` ${timeText(row.date)}` : ""}`,
    Kim: row.who || "",
    Kalem: row.voided ? `İptal edildi — ${row.item}` : row.item,
    Doktor: row.doctor || "",
    Açıklama: row.note || "",
    Yöntem: methodLabel(row.method),
    "Fatura no": row.expense?.faturaNo || "",
    Tutar: `${row.kind === "TAHSILAT" ? "" : "-"}${row.amount.toFixed(2).replace(".", ",")}`,
  }));
  const fileBase = range ? `gelir-gider-${range.from}-${range.to}` : "gelir-gider";

  const exportExcel = async () => {
    const rows = await fetchAllRows();
    const { downloadCsv } = await import("@/lib/csv-export");
    downloadCsv(`${fileBase}.csv`, exportRows(rows));
  };

  const exportPdf = async () => {
    const rows = await fetchAllRows();
    const { addPdfSection, addPdfTitle, createPdfDoc, preparePdfFonts } = await import("@/lib/pdf-export");
    // Türkçe yazı tipi oturumun ilk PDF'inde de yüklü olsun (yoksa harfler dönüştürülür).
    await preparePdfFonts();
    const doc = createPdfDoc("l");
    const totals = data?.totals;
    addPdfTitle(
      doc,
      cancelledView ? "İptal edilen kayıtlar" : showExpenses ? "Gelir ve gider" : "Tahsilatlar",
      cancelledView
        ? `${formatRangeLabel(range)} · İptal edilen kayıtlar toplamlara girmez`
        : `${formatRangeLabel(range)} · Tahsilat ${money(totals?.tahsilat)} · Gider ${money(totals?.gider)} · Fark ${money(totals?.net)}`,
    );
    addPdfSection(doc, 28, "Hareketler", ["Tarih", "Kim", "Kalem", "Doktor", "Açıklama", "Yöntem", "Fatura no", "Tutar"],
      exportRows(rows).map((row) => [row.Tarih, row.Kim, row.Kalem, row.Doktor, row.Açıklama, row.Yöntem, row["Fatura no"], row.Tutar]));
    doc.save(`${fileBase}.pdf`);
  };

  // ── Görünüm
  const singleDay = range ? rangeDayCount(range) === 1 : false;
  // Özel aralık hatalıyken (hata seçicinin altında) önceki dönemin toplamları ve satırları
  // ekranda kalmaz: kullanıcı yeni dönemin rakamı sanmasın (canlı H12 ile aynı sınıf).
  const invalidPeriod = Boolean(period.error);

  // İptal edilmiş kayıt: üstü çizili ve soluk (toplamlara girmez).
  const amountCell = (row: LedgerRow) => (
    <span className={`whitespace-nowrap font-bold tabular-nums ${row.voided ? "text-slate-400 line-through" : row.kind === "TAHSILAT" ? "text-emerald-700" : "text-red-700"}`}>
      {row.kind === "TAHSILAT" ? "+" : "−"}{money(row.amount)}
    </span>
  );
  const voidedBadge = (row: LedgerRow) => (row.voided ? (
    <Badge tone="neutral" title={row.voidedAt ? `${shortDate(row.voidedAt)} tarihinde iptal edildi` : undefined}>İptal edildi</Badge>
  ) : null);

  // Satırın "…" menüsü (çerçevesiz). Firma ödemesi de aynı menüden açılır: satırlarda
  // tek tip eylem; telefonda kartın sağ üst köşesinde (ayrı eylem sırası yok).
  const rowMenu = (row: LedgerRow) => {
    if (row.voided) return null;
    if (row.locked) {
      return row.whoId ? (
        <ActionMenu
          label={`${rowTitle(row)} için işlemler`}
          items={[{
            key: "firma",
            label: "Firma ekstresinde aç",
            description: "Firma ödemesi orada düzenlenir ve iptal edilir",
            icon: ExternalLink,
            href: `/firma-detay?id=${encodeURIComponent(row.whoId)}`,
          }]}
        />
      ) : null;
    }
    const items: ActionMenuItem[] = [];
    if (canEdit(row)) items.push({ key: "edit", label: "Düzenle", icon: Pencil, onSelect: () => openRow(row) });
    if (canVoid(row)) {
      items.push({
        key: "void",
        label: row.kind === "TAHSILAT" ? "Tahsilatı iptal et" : row.subtype === "hakedis" ? "Ödemeyi iptal et" : "Gideri iptal et",
        icon: Ban,
        danger: true,
        separatorBefore: items.length > 0,
        onSelect: () => void voidRow(row),
      });
    }
    if (items.length === 0) return null;
    return <ActionMenu items={items} label={`${rowTitle(row)} için işlemler`} />;
  };
  const rowActions = (row: LedgerRow) => {
    const menu = rowMenu(row);
    return menu ? <div className="flex justify-end">{menu}</div> : null;
  };

  // Bütün kayıtlar bu sayfadaysa ve her tahsilat aynı doktora aitse doktor adı
  // satırlarda tekrar etmez; özetteki "Tahsilat" ipucunda bir kez yazar.
  const paymentRows = data && !invalidPeriod && data.pageCount <= 1 && !data.truncated ? data.rows.filter((row) => row.subtype === "tahsilat") : [];
  const sharedDoctor = sharedValue(paymentRows.map((row) => row.doctor));

  const columns: ListTableColumn<LedgerRow>[] = [
    {
      key: "tarih",
      header: singleDay ? "Saat" : "Tarih",
      cellClassName: "whitespace-nowrap",
      render: (row) => (singleDay ? (
        row.hasTime ? <span className="text-sm tabular-nums text-slate-700">{timeText(row.date)}</span> : null
      ) : (
        <div>
          <p className="text-sm tabular-nums text-slate-700">{shortDate(row.date)}</p>
          {row.hasTime && <p className="text-xs tabular-nums text-slate-400">{timeText(row.date)}</p>}
        </div>
      )),
    },
    {
      key: "kayit",
      header: "Kayıt",
      render: (row) => (
        <div className="min-w-0 max-w-[420px]">
          <p className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-800">
            <span className="truncate">{rowTitle(row)}</span>
            {voidedBadge(row)}
          </p>
          {rowDetail(row, Boolean(sharedDoctor)) && <p className="truncate text-xs text-slate-500" title={rowDetail(row, Boolean(sharedDoctor))}>{rowDetail(row, Boolean(sharedDoctor))}</p>}
        </div>
      ),
    },
    { key: "yontem", header: "Yöntem", cellClassName: "whitespace-nowrap text-sm text-slate-600", render: (row) => methodLabel(row.method) },
    { key: "tutar", header: "Tutar", align: "right", render: amountCell },
    { key: "islem", header: "", align: "right", render: rowActions },
  ];

  // ── Özet: yalnız karar verdiren sayılar; değer gelmeden "₺0" yazılmaz.
  // "İptal edilenler" görünümünde özet yok (iptal edilen kayıt toplamlara girmez).
  const totals = data?.totals;
  const showIn = showPayments && effectiveTur !== "GIDER";
  const showOut = showExpenses && effectiveTur !== "TAHSILAT";
  const cash = totals?.byMethod?.NAKIT || { in: 0, out: 0 };
  const methodEntries = totals && !cancelledView
    ? Object.entries(totals.byMethod).filter(([, value]) => value.in > 0 || value.out > 0)
    : [];
  // Birden çok yöntem varsa nakit hücresi "Yönteme göre dağılım"ı açıp kapatır (ayrı kutu yok).
  const canShowMethods = methodEntries.length > 1;
  const showMethods = canShowMethods && methodsOpen;
  const stats: StatItem[] = cancelledView ? [] : [
    // Sıfır tutar işaretsiz ve renksiz ("−₺0,00" kırmızı görünmesin).
    ...(showIn ? [{ key: "in", label: "Tahsilat", value: signedMoney(totals?.tahsilat ?? 0), tone: (totals?.tahsilat ?? 0) > 0 ? "success" as const : "neutral" as const, hint: totals ? [`${totals.tahsilatCount} kayıt`, sharedDoctor ? doctorLabel(sharedDoctor) : ""].filter(Boolean).join(" · ") : undefined }] : []),
    ...(showOut ? [{ key: "out", label: "Gider", value: signedMoney(-(totals?.gider ?? 0)), tone: (totals?.gider ?? 0) > 0 ? "critical" as const : "neutral" as const, hint: totals ? `${totals.giderCount} kayıt` : undefined }] : []),
    ...(showIn && showOut ? [{ key: "net", label: "Fark", value: signedMoney(totals?.net ?? 0), tone: (totals?.net ?? 0) < 0 ? "critical" as const : "neutral" as const }] : []),
    ...(yontem === "HEPSI" ? [{
      key: "cash",
      // Gideri görmeyen (banko) için yalnız kasaya giren nakit; diğerleri için giren − çıkan.
      label: showOut ? "Nakit değişimi" : "Nakit tahsilat",
      value: showOut ? signedMoney(cash.in - cash.out) : money(cash.in),
      // Kısa yazım: telefonda kutuya sığsın; çıkış yoksa değeri tekrar etmez. Birden çok yöntem
      // varsa ipucu dağılımı açar (nakdin giren/çıkanı dağılım satırında yazar).
      hint: canShowMethods ? (
        <span className="inline-flex items-center gap-0.5 font-semibold text-primary">
          Yönteme göre dağılım
          <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${showMethods ? "rotate-180" : ""}`} aria-hidden="true" />
        </span>
      ) : showOut && cash.out > 0 ? `+${money(cash.in)} · −${money(cash.out)}` : undefined,
      ...(canShowMethods ? { onClick: () => setMethodsOpen((open) => !open), active: showMethods } : {}),
    }] : []),
  ];

  const activeFilters: ActiveFilter[] = [
    ...(period.activeFilter ? [period.activeFilter] : []),
    ...(effectiveTur !== "HEPSI" ? [{ key: "tur", label: TYPE_FILTER_LABEL[effectiveTur], onRemove: () => onTurChange("HEPSI") }] : []),
    ...(yontem !== "HEPSI" ? [{ key: "yontem", label: methodLabel(yontem), onRemove: () => setYontem("HEPSI") }] : []),
    ...(debouncedSearch ? [{ key: "q", label: `"${debouncedSearch}"`, onRemove: () => setSearch("") }] : []),
  ];
  const filterCount = activeFilters.filter((filter) => filter.key !== "q").length;
  const narrowed = Boolean(debouncedSearch) || effectiveTur !== "HEPSI" || yontem !== "HEPSI";
  // "İptal edilenler" tek başına süzgeç sayılmaz: boşsa "süzgeci temizle" değil, başka dönem önerilir.
  const plainCancelledView = cancelledView && !debouncedSearch && yontem === "HEPSI";
  const clearFilters = () => { onTurChange("HEPSI"); setYontem("HEPSI"); setSearch(""); };

  return (
    <div className="space-y-3">
      {/* Araç çubuğu çerçevesiz (sayfa zemininde): ayrı kart değil. */}
      <Toolbar
        bare
        className={FINANCE_TOOLBAR_CLASS}
        filterCount={filterCount}
        filters={(
          <>
            {/* Özel aralıkta tarih alanları açılınca seçici ezilmesin: sığmazsa alt satıra iner. */}
            <div className="min-w-0 sm:shrink-0">
              <DateRangeFilter {...period.filterProps} size="sm" />
            </div>
            <ChoiceCards
              label="Kayıt türü"
              labelHidden
              variant="pills"
              value={effectiveTur}
              onChange={onTurChange}
              options={showExpenses && showPayments ? TYPE_OPTIONS : SINGLE_SOURCE_TYPE_OPTIONS}
            />
            <Select aria-label="Ödeme yöntemi" size="sm" value={yontem} onChange={(event) => setYontem(event.target.value)} className="sm:w-auto">
              <option value="HEPSI">Tüm yöntemler</option>
              {Object.entries(METHOD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </>
        )}
        actions={canExport ? (
          <ExportMenu
            disabled={invalidPeriod || !data || data.total === 0}
            disabledReason={invalidPeriod ? "Önce geçerli bir tarih aralığı seçin" : "Dışa aktarılacak kayıt yok"}
            onExcel={exportExcel}
            onPdf={exportPdf}
          />
        ) : undefined}
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={showExpenses ? "Hasta, firma, gider türü veya fatura no ara" : "Hasta, doktor veya açıklama ara"}
          wrapperClassName="flex-1 min-w-[220px]"
        />
      </Toolbar>
      <ActiveFilters filters={activeFilters} onClearAll={() => { period.reset(); clearFilters(); }} />

      {/* Telefonda dönem "Filtreler" içinde gizli: tutarların hangi döneme ait olduğu burada yazar. */}
      {/* Özel aralıkta aynı tarih zaten etkin süzgeç olarak yazar; tekrar edilmez. */}
      {!invalidPeriod && range && period.filterProps.value.preset !== "ozel" && <p className="px-1 text-xs text-slate-500 sm:hidden">Dönem: {formatRangeLabel(range)}</p>}
      {/* İlk yükleme hata verdiyse özet hiç çizilmez (hata listede); bilinmeyen değer "0" görünmez. */}
      {!invalidPeriod && stats.length > 0 && (totals || !error || loading) && <StatStrip items={stats} loading={!totals} aria-label="Dönem özeti" />}
      {!invalidPeriod && cancelledView && (
        <p className="px-1 text-xs text-slate-500">İptal edilen tahsilat ve giderler iz olarak listelenir; toplamlara ve raporlara girmez.</p>
      )}
      {!invalidPeriod && data?.truncated && (
        <Callout tone="warning" compact>Bu dönemde çok fazla kayıt var; listenin tamamı için dönemi daraltın.</Callout>
      )}

      <ListTable
        columns={columns}
        // Yönteme göre dağılım: listenin kartının üst satırı (tek satır, ayrı kutu değil).
        header={!invalidPeriod && showMethods ? (
          <div role="group" aria-label="Yönteme göre dağılım" className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-500">Yönteme göre</span>
            {methodEntries.map(([key, value]) => (
              <span key={key} className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
                <span>{methodLabel(key)}</span>
                <span className="font-semibold tabular-nums">
                  {value.in > 0 && <span className="text-emerald-700">+{money(value.in)}</span>}
                  {value.in > 0 && value.out > 0 && <span className="text-slate-400"> · </span>}
                  {value.out > 0 && <span className="text-red-700">−{money(value.out)}</span>}
                </span>
              </span>
            ))}
          </div>
        ) : undefined}
        rows={invalidPeriod ? [] : data?.rows || []}
        rowKey={(row) => row.key}
        // İlk istek daha başlamadan "kayıt yok" yanıp sönmesin.
        loading={!invalidPeriod && (loading || (!data && !error && Boolean(query)))}
        error={invalidPeriod || data ? null : error || null}
        staleError={!invalidPeriod && data ? error || null : null}
        onRetry={() => void load()}
        onRowClick={openRow}
        isRowClickable={(row) => canEdit(row) || Boolean(!row.voided && row.locked && row.whoId)}
        getRowAriaLabel={(row) => `${rowTitle(row)}, ${money(row.amount)} — ${row.locked ? "firma ekstresinde aç" : "düzenle"}`}
        emptyText={invalidPeriod ? "Tarih aralığını düzeltin" : plainCancelledView ? "Bu dönemde iptal edilen kayıt yok" : narrowed ? "Filtreye uyan kayıt yok" : "Bu dönemde kayıt yok"}
        emptyDescription={invalidPeriod ? "Liste geçerli bir başlangıç ve bitiş tarihiyle yüklenir." : narrowed && !plainCancelledView ? "Filtreleri temizleyip tekrar deneyin." : "Başka bir dönem seçin."}
        emptyAction={!invalidPeriod && narrowed && !plainCancelledView ? <Button size="sm" variant="secondary" onClick={clearFilters}>Filtreleri temizle</Button> : undefined}
        // Telefon kartı iki satır: kim/ne + tutar; tarih · yöntem · açıklama. "…" sağ üst köşede.
        mobileCard={(row) => {
          const meta = [
            singleDay ? (row.hasTime ? timeText(row.date) : "") : `${shortDate(row.date)}${row.hasTime ? ` ${timeText(row.date)}` : ""}`,
            methodLabel(row.method),
            rowDetail(row, Boolean(sharedDoctor)),
          ].filter(Boolean).join(" · ");
          return (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-900">
                  <span className="truncate">{rowTitle(row)}</span>
                  {voidedBadge(row)}
                </p>
                {meta && <p className="truncate text-xs text-slate-500" title={meta}>{meta}</p>}
              </div>
              <div className="shrink-0">{amountCell(row)}</div>
            </div>
          );
        }}
        mobileCardActions={rowMenu}
        pager={!invalidPeriod && data && data.total > PAGE_SIZE ? {
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
