"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Wallet } from "lucide-react";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { StatStrip } from "@/components/ui/StatStrip";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { Section } from "@/components/ui/Section";
import { Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { methodLabel, money, monthName, shortDate, todayKey } from "@/components/muhasebe/muhasebe-utils";
import { useLoadWhenActive } from "@/components/muhasebe/finance-hooks";

type HakedisMonth = { year: number; month: number; hakedilen: number; odenen: number; kalan: number };

type HakedisDetail = {
  doctor: { id: string; fullName: string };
  year: number; month: number;
  rates: { kkYuzde: number; genelYuzde: number; maasYuzde: number };
  summary: { hakedilen: number; odenen: number; kalan: number };
  breakdown: { ciro: number; kk: number; kkMasraf: number; genelMasraf: number; labCost: number; toplamGider: number; brut: number; hakedilen: number };
  examinations: { id: string; tarih: string; hasta: string; tedavi: string; dis: string | null; tutar: number }[];
  patientPayments: { id: string; tarih: string; hasta: string; yontem: string; tutar: number }[];
  labInvoices: { id: string; tarih: string; lab: string; kalem: string; tutar: number }[];
  payoutExpenses: { id: string; tarih: string; tutar: number; aciklama: string | null; yontem: string }[];
};

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/** Hesap kalemi: tutar; kesinti mi (eksiyle yazılır); sonuç satırı mı (kalın). */
type StatementItem = { label: string; amount: number; deduction?: boolean; result?: boolean };

/**
 * Bir ayın hesabı, üretimden kalana kadar TEK sütunda; ekranda, Excel'de ve
 * PDF'te aynı sözcükler. Her kesintinin neyin yüzdesi olduğu satırda yazar
 * (kart komisyonu kartlı tahsilattan, genel gider payı tedavi tutarından);
 * hakediş ve kalan kalın. Satırlar toplanınca kalan çıkar: kural
 * değişmeden önce ödenmiş ayda hakediş ödenenle kapatıldıysa aradaki fark ayrı
 * satırda yazar (yoksa hesap tutmaz görünürdü).
 */
function statementItems(d: HakedisDetail): StatementItem[] {
  const closedDifference = d.breakdown.hakedilen - d.summary.hakedilen;
  return [
    { label: `Tedavi tutarı (${d.examinations.length} tedavi)`, amount: d.breakdown.ciro },
    { label: `Kredi kartı komisyonu (${money(d.breakdown.kk)} kartlı tahsilat × %${d.rates.kkYuzde})`, amount: d.breakdown.kkMasraf, deduction: true },
    { label: `Genel gider payı (tedavi tutarı × %${d.rates.genelYuzde})`, amount: d.breakdown.genelMasraf, deduction: true },
    { label: `Laboratuvar gideri${d.labInvoices.length > 0 ? ` (${d.labInvoices.length} kalem)` : ""}`, amount: d.breakdown.labCost, deduction: true },
    { label: "Toplam kesinti", amount: d.breakdown.toplamGider, deduction: true },
    { label: "Kesintiden sonra kalan", amount: d.breakdown.brut },
    { label: `Hakediş (doktor payı %${d.rates.maasYuzde})`, amount: d.breakdown.hakedilen, result: true },
    ...(Math.abs(closedDifference) >= 0.005
      ? [{ label: "Eski hesapla ödenip kapatılan fark", amount: closedDifference, deduction: true }]
      : []),
    { label: "Doktora ödenen", amount: d.summary.odenen, deduction: true },
    d.summary.kalan < -0.005
      ? { label: "Fazla ödenen", amount: -d.summary.kalan, result: true }
      : { label: "Kalan", amount: d.summary.kalan, result: true },
  ];
}

/** Ekran ve PDF metni: kesinti "−₺120,00"; sıfır kesinti işaretsiz "₺0,00". */
const itemText = (item: StatementItem) => (item.deduction && Math.abs(item.amount) >= 0.005 ? `−${money(item.amount)}` : money(item.amount));

/**
 * CSV tutarı: Excel'in toplayabileceği sayı — "22880,00", eksi ASCII "-"
 * (Gelir ve gider CSV'siyle aynı biçim). Ekran metni ("₺22.880,00", U+2212
 * eksi) CSV'de sayı olarak okunmuyordu.
 */
const csvAmount = (value: number, negative = false) => {
  const signed = negative ? -value : value;
  return (Math.abs(signed) < 0.005 ? 0 : signed).toFixed(2).replace(".", ",");
};

/**
 * Ay satırının durumu: kim kime ne borçlu, sade sözcükle. `plain`: olağan
 * durum ("Ödendi") renkli rozet değil, soluk metin — 12 ayın 11'inde aynı
 * rozet tekrar etmesin; istisnalar (Ödenecek, Ay sürüyor…) rozetle öne çıkar.
 * Hakedişi ve ödemesi olmayan ayda durum yazılmaz.
 */
function monthStatus(row: HakedisMonth, isCurrent: boolean) {
  if (isCurrent) return { label: "Ay sürüyor", tone: "info" as const, hint: "Ay kapanınca ödenebilir.", plain: false };
  if (row.kalan > 0.5) return { label: "Ödenecek", tone: "warning" as const, hint: "", plain: false };
  if (row.odenen > Math.max(row.hakedilen, 0) + 0.5) return { label: "Fazla ödendi", tone: "critical" as const, hint: "Bu ay için hakedişten fazla ödeme yapılmış.", plain: false };
  if (row.hakedilen < -0.5) return { label: "Eksi hakediş", tone: "neutral" as const, hint: "Laboratuvar gideri bu ayın doktor payını aştı.", plain: false };
  if (Math.abs(row.hakedilen) < 0.5 && row.odenen < 0.5) return null;
  return { label: "Ödendi", tone: "success" as const, hint: "", plain: true };
}

/** Dökümün bir bölümündeki satır: tarih, kim/ne, ayrıntı, tutar. */
type StatementLine = { id: string; date: string; primary: string; secondary: string; amount: number };
type StatementGroup = {
  key: string;
  title: string;
  /** PDF sütun adları: [birincil, ayrıntı]. */
  columns: [string, string];
  /** Boşken tek cümlede geçen ad ("laboratuvar gideri"). */
  emptyLabel: string;
  /** Ekranda tutar rengi. */
  tone: string;
  lines: StatementLine[];
};

/**
 * Hakedişe giren bütün kayıtlar, hesaptaki sırasıyla: üretim (tedaviler),
 * kimden ne alındı (hasta tahsilatları), ne masraf düşüldü (laboratuvar),
 * doktora ne ödendi. Ekranda ve PDF'te aynı bölümler ve sözcükler.
 */
function statementGroups(d: HakedisDetail): StatementGroup[] {
  return [
    {
      key: "tedavi", title: "Tedaviler", columns: ["Hasta", "Tedavi"], emptyLabel: "tedavi", tone: "text-slate-900",
      lines: d.examinations.map((e) => ({ id: e.id, date: e.tarih, primary: e.hasta, secondary: [e.tedavi, e.dis ? `diş ${e.dis}` : ""].filter(Boolean).join(" · "), amount: e.tutar })),
    },
    {
      key: "tahsilat", title: "Hasta tahsilatları", columns: ["Hasta", "Yöntem"], emptyLabel: "hasta tahsilatı", tone: "text-emerald-700",
      lines: d.patientPayments.map((p) => ({ id: p.id, date: p.tarih, primary: p.hasta, secondary: methodLabel(p.yontem), amount: p.tutar })),
    },
    {
      key: "lab", title: "Laboratuvar giderleri", columns: ["Laboratuvar", "Kalem"], emptyLabel: "laboratuvar gideri", tone: "text-red-700",
      lines: d.labInvoices.map((i) => ({ id: i.id, date: i.tarih, primary: i.lab, secondary: i.kalem, amount: i.tutar })),
    },
    {
      key: "odeme", title: "Doktora yapılan ödemeler", columns: ["Açıklama", "Yöntem"], emptyLabel: "doktora ödeme", tone: "text-slate-900",
      lines: d.payoutExpenses.map((p) => ({ id: p.id, date: p.tarih, primary: p.aciklama || "Hakediş ödemesi", secondary: methodLabel(p.yontem), amount: p.tutar })),
    },
  ];
}

const groupTotal = (group: StatementGroup) => group.lines.reduce((sum, line) => sum + line.amount, 0);

/** Boş bölümler ayrı ayrı "kayıt yok" kutusu açmaz; tek cümle: "Bu ay laboratuvar gideri ve doktora ödeme yok." */
function emptyGroupsNote(groups: StatementGroup[]) {
  const empty = groups.filter((group) => group.lines.length === 0).map((group) => group.emptyLabel);
  if (empty.length === 0) return "";
  const list = empty.length === 1 ? empty[0] : `${empty.slice(0, -1).join(", ")} ve ${empty[empty.length - 1]}`;
  return `Bu ay ${list} yok.`;
}

/**
 * Bir ayın hakediş dökümü, yukarıdan aşağı okunur: hesap (üretimden kalana)
 * → hesaba giren kayıtlar. Doktor "hakedişim eksik" dediğinde her şey aynı
 * yerde gösterilir; önceden ayrı pencerede beş sekmeye bölünmüştü.
 */
function HakedisStatement({ detail }: { detail: HakedisDetail }) {
  const groups = statementGroups(detail);
  const note = emptyGroupsNote(groups);
  const items = statementItems(detail);
  return (
    <div className="space-y-5">
      {/* Tutarlar sağda alt alta: hesap şeridi gibi okunur; kesinti kırmızı, hakediş ve kalan kalın. */}
      <dl className="divide-y divide-slate-100 text-sm" aria-label="Hesap">
        {items.map((item) => {
          const negative = item.deduction && Math.abs(item.amount) >= 0.005;
          return (
            <div key={item.label} className={`flex items-baseline justify-between gap-4 py-2 first:pt-0 ${item.result ? "border-t border-slate-300 font-extrabold text-slate-900" : ""}`}>
              <dt className={item.result ? "" : "text-slate-600"}>{item.label}</dt>
              <dd className={`shrink-0 tabular-nums ${negative ? "text-red-700" : item.result ? "" : "text-slate-900"}`}>{itemText(item)}</dd>
            </div>
          );
        })}
      </dl>
      {groups.filter((group) => group.lines.length > 0).map((group) => (
        <section key={group.key} aria-label={group.title}>
          <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 pb-1.5">
            <h3 className="text-sm font-extrabold text-slate-900">
              {group.title} <span className="font-semibold text-slate-400">· {group.lines.length}</span>
            </h3>
            <span className="text-sm font-bold tabular-nums text-slate-900">{money(groupTotal(group))}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {group.lines.map((line) => (
              <li key={line.id} className="flex items-start gap-3 py-2 text-sm">
                <span className="w-[5.25rem] shrink-0 tabular-nums text-slate-500">{shortDate(line.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-800">{line.primary}</span>
                  {line.secondary && <span className="block text-xs text-slate-500">{line.secondary}</span>}
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${group.tone}`}>{money(line.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </div>
  );
}

export interface HakedisMonthlyPanelProps {
  doctorId: string;
  /** "Kalanı öde" gösterilsin mi? Doktorun kendi görünümünde false. */
  canPay?: boolean;
  onPay?: (doctorId: string, year: number, month: number, kalan: number) => void;
  /** Bir ödeme sonrası veya dışarıdan tetiklenen yenilemede artan sayaç. */
  refreshToken?: number;
  /** Ay dökümünü Excel/PDF indirme (Muhasebe'de finance:export; doktorun kendi ekranında açık). */
  canExport?: boolean;
  /** Panel ekranda mı (gizli sekmede istek atılmaz). */
  active?: boolean;
}

/**
 * Doktorun hakedişi TEK ekranda: solda son 12 ay (hakediş, kalan, durum),
 * sağda seçili ayın tam dökümü (hesap ve hesaba giren bütün kayıtlar), dışa
 * aktarma ve ödeme aynı yerde. Telefonda ay seçici üstte, döküm altında.
 * Açılışta ödenmemiş en eski ay seçilir (yoksa hareketi olan en yeni ay).
 * Muhasebe › Hakediş ile doktorun kendi "Hakedişim" ekranı aynı hesabı (tek
 * kaynak: /api/hakedis ve /api/hakedis/detay) gösterir.
 */
export function HakedisMonthlyPanel({ doctorId, canPay = false, onPay, refreshToken = 0, canExport = false, active = true }: HakedisMonthlyPanelProps) {
  // Aylar hangi doktora ait: doktor değişince öncekinin satırları yeni adla görünmez.
  const [monthsState, setMonthsState] = useState<{ doctorId: string; months: HakedisMonth[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const sequenceRef = useRef(0);

  // Kullanıcının seçtiği ay (doktora bağlı: doktor değişince varsayılana döner).
  const [picked, setPicked] = useState<{ doctorId: string; key: string } | null>(null);
  // Döküm hangi doktor ve aya ait: ay değişince eski ayın dökümü yeni ayın başlığıyla görünmez.
  const [detailState, setDetailState] = useState<{ key: string; detail: HakedisDetail | null; error: string } | null>(null);
  const [detailReload, setDetailReload] = useState(0);
  const detailSequence = useRef(0);

  const load = useCallback(async () => {
    if (!doctorId) return;
    const sequence = ++sequenceRef.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/hakedis?doctorId=${encodeURIComponent(doctorId)}&months=12`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (sequence !== sequenceRef.current) return;
      if (!response.ok) throw new Error(body?.message || "Hakediş dökümü yüklenemedi.");
      // En yeni ay üstte: kullanıcı önce güncel durumu görür.
      const list: HakedisMonth[] = Array.isArray(body?.months) ? body.months : [];
      setMonthsState({ doctorId, months: [...list].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month)) });
      setLoadError("");
    } catch (error) {
      if (sequence !== sequenceRef.current) return;
      setLoadError(error instanceof Error ? error.message : "Hakediş dökümü yüklenemedi.");
    } finally {
      if (sequence === sequenceRef.current) setLoading(false);
    }
  }, [doctorId]);

  useLoadWhenActive(active && Boolean(doctorId), `${doctorId}|${refreshToken}|${reloadKey}`, () => void load());

  const months = monthsState && monthsState.doctorId === doctorId ? monthsState.months : null;
  const currentKey = todayKey().slice(0, 7);
  const isCurrent = (row: HakedisMonth) => monthKey(row.year, row.month) === currentKey;
  const payable = (months || []).filter((row) => !isCurrent(row) && row.kalan > 0.5);
  const totalPayable = payable.reduce((sum, row) => sum + row.kalan, 0);
  const current = (months || []).find(isCurrent);

  // Açılışta gösterilecek ay: ödenmemiş en eski kapanmış ay (ödenecek olan);
  // yoksa hakedişi ya da ödemesi olan en yeni ay; o da yoksa bu ay.
  const defaultKey = useMemo(() => {
    if (!months || months.length === 0) return "";
    const unpaid = months.filter((row) => monthKey(row.year, row.month) !== currentKey && row.kalan > 0.5);
    const oldestUnpaid = unpaid[unpaid.length - 1];
    const withActivity = months.find((row) => Math.abs(row.hakedilen) >= 0.005 || row.odenen > 0.005);
    const target = oldestUnpaid || withActivity || months[0];
    return monthKey(target.year, target.month);
  }, [months, currentKey]);
  const pickedKey = picked && picked.doctorId === doctorId && (months || []).some((row) => monthKey(row.year, row.month) === picked.key) ? picked.key : "";
  const selectedKey = pickedKey || defaultKey;
  const selectedRow = (months || []).find((row) => monthKey(row.year, row.month) === selectedKey) || null;

  const loadDetail = useCallback(async (key: string) => {
    const [year, month] = key.split("-").map(Number);
    const sequence = ++detailSequence.current;
    const stateKey = `${doctorId}|${key}`;
    const response = await fetch(`/api/hakedis/detay?doctorId=${encodeURIComponent(doctorId)}&year=${year}&month=${month}`, { cache: "no-store" }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (sequence !== detailSequence.current) return;
    setDetailState(response?.ok && body
      ? { key: stateKey, detail: body as HakedisDetail, error: "" }
      : { key: stateKey, detail: null, error: body?.message || "Hakediş dökümü yüklenemedi." });
  }, [doctorId]);

  useLoadWhenActive(active && Boolean(selectedKey), `${doctorId}|${selectedKey}|${refreshToken}|${detailReload}`, () => void loadDetail(selectedKey));

  const shown = detailState && detailState.key === `${doctorId}|${selectedKey}` ? detailState : null;
  const detail = shown?.detail || null;

  const detailFileName = detail
    ? `hakedis-${detail.doctor.fullName.replace(/\s+/g, "-")}-${monthKey(detail.year, detail.month)}`
    : "hakedis-dokumu";

  const exportExcel = async () => {
    if (!detail) return;
    const d = detail;
    // Ekran ve PDF ile aynı bölümler ve sözcükler: Hesap, sonra hesaba giren kayıtlar.
    const rows: Record<string, string>[] = [
      ...statementItems(d).map((item) => ({ Bölüm: "Hesap", Tarih: "", Kayıt: item.label, Ayrıntı: "", Tutar: csvAmount(item.amount, item.deduction) })),
      ...statementGroups(d).flatMap((group) => group.lines.map((line) => ({
        Bölüm: group.title, Tarih: shortDate(line.date), Kayıt: line.primary, Ayrıntı: line.secondary, Tutar: csvAmount(line.amount),
      }))),
    ];
    const { downloadCsv } = await import("@/lib/csv-export");
    downloadCsv(`${detailFileName}.csv`, rows);
  };

  const exportPdf = async () => {
    if (!detail) return;
    const { addPdfFacts, addPdfNote, addPdfSection, addPdfSignatures, addPdfTitle, createPdfDoc, preparePdfFonts } = await import("@/lib/pdf-export");
    // Türkçe yazı tipi ve klinik anteti oturumun ilk PDF'inde de hazır olsun.
    await preparePdfFonts();
    const d = detail;
    // Ekrandaki dökümün aynısı, tek akışta: hesap → kayıtlar → imza.
    const doc = createPdfDoc();
    let y = addPdfTitle(doc, "Hakediş dökümü",
      `Hekim: ${d.doctor.fullName} · Dönem: ${monthName(d.year, d.month)} · Hakediş oranı %${d.rates.maasYuzde} · Kart komisyonu %${d.rates.kkYuzde} · Genel gider payı %${d.rates.genelYuzde}`);
    const items = statementItems(d);
    y = addPdfFacts(doc, y, "Hesap", items.map((item): [string, string] => [item.label, itemText(item)]), {
      emphasize: items.flatMap((item, index) => (item.result ? [index] : [])),
    });
    const groups = statementGroups(d);
    for (const group of groups) {
      if (group.lines.length === 0) continue;
      const rows = group.lines.map((line) => [shortDate(line.date), line.primary, line.secondary, money(line.amount)]);
      // Tek kayıtta toplam satırı tekrar olur; birden çoksa bölüm toplamı altta.
      if (group.lines.length > 1) rows.push(["Toplam", "", "", money(groupTotal(group))]);
      y = addPdfSection(doc, y, group.title, ["Tarih", ...group.columns, "Tutar"], rows);
    }
    const note = emptyGroupsNote(groups);
    if (note) y = addPdfNote(doc, y, note);
    addPdfSignatures(doc, y + 4, [{ title: "Hazırlayan" }, { title: "Hekim", name: d.doctor.fullName }]);
    doc.save(`${detailFileName}.pdf`);
  };

  const statusBadge = (row: HakedisMonth) => {
    const status = monthStatus(row, isCurrent(row));
    if (!status) return null;
    if (status.plain) return <span className="text-xs text-slate-500">{status.label}</span>;
    return <Badge tone={status.tone} title={status.hint || undefined}>{status.label}</Badge>;
  };

  const selectMonth = (row: HakedisMonth) => setPicked({ doctorId, key: monthKey(row.year, row.month) });
  const isSelected = (row: HakedisMonth) => monthKey(row.year, row.month) === selectedKey;

  const monthCell = (row: HakedisMonth) => (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className={`font-semibold ${isSelected(row) ? "text-primary-strong" : "text-slate-900"}`}>{monthName(row.year, row.month)}</span>
        {statusBadge(row)}
      </p>
      <p className="text-xs text-slate-500">
        Hakediş {money(row.hakedilen)}{row.odenen > 0 ? ` · Ödenen ${money(row.odenen)}` : ""}
      </p>
    </div>
  );
  const kalanCell = (row: HakedisMonth) => (!isCurrent(row) && row.kalan > 0.5
    ? <span className="font-bold tabular-nums text-slate-900">{money(row.kalan)}</span>
    : null);

  const columns: ListTableColumn<HakedisMonth>[] = [
    { key: "ay", header: "Ay", render: monthCell },
    { key: "kalan", header: "Kalan", align: "right", headerHint: "Kapanmış ayın ödenmemiş kısmı. İçinde bulunulan ay, ay kapanınca ödenir.", render: kalanCell },
  ];

  const monthOptionLabel = (row: HakedisMonth) => {
    const status = monthStatus(row, isCurrent(row));
    const kalan = !isCurrent(row) && row.kalan > 0.5 ? ` ${money(row.kalan)}` : "";
    return `${monthName(row.year, row.month)}${status ? ` — ${status.label}${status.label === "Ödenecek" ? kalan : ""}` : ""}`;
  };

  const canPaySelected = Boolean(canPay && onPay && detail && selectedRow && !isCurrent(selectedRow) && detail.summary.kalan > 0.5);

  const statementBody = () => {
    if (shown?.error) {
      return <LoadErrorState message={shown.error} onRetry={() => setDetailReload((value) => value + 1)} />;
    }
    if (!detail) return <ListRowSkeleton variant="row" rows={6} />;
    return <HakedisStatement detail={detail} />;
  };

  return (
    <div className="space-y-3">
      {loadError && !months ? (
        <LoadErrorState message={loadError} onRetry={() => setReloadKey((value) => value + 1)} />
      ) : (
        <>
          <StatStrip
            loading={!months}
            aria-label="Hakediş özeti"
            items={[
              { key: "odenecek", label: "Ödenecek", value: money(totalPayable), hint: !months ? undefined : payable.length > 0 ? `${payable.length} kapanmış ay` : "Ödenecek ay yok", tone: totalPayable > 0.5 ? "warning" : "neutral" },
              { key: "buay", label: "Bu ay biriken", value: money(current?.hakedilen ?? 0), hint: "Ay kapanınca ödenir" },
            ]}
          />
          {months && months.length === 0 ? (
            <ListTable
              columns={columns}
              rows={[]}
              rowKey={(row) => monthKey(row.year, row.month)}
              emptyText="Bu doktor için son 12 ayda hakediş yok"
              emptyDescription="Doktorun tedavi kaydı oluştukça aylık hakediş burada görünür."
            />
          ) : (
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
              {/* Aylar: geniş ekranda solda liste (seçili ay vurgulu); telefonda dökümün üstünde seçici. */}
              <div className="hidden lg:block">
                <ListTable
                  columns={columns}
                  rows={months || []}
                  rowKey={(row) => monthKey(row.year, row.month)}
                  loading={loading || (!months && !loadError)}
                  staleError={months ? loadError || null : null}
                  onRetry={() => setReloadKey((value) => value + 1)}
                  onRowClick={selectMonth}
                  getRowAriaLabel={(row) => `${monthName(row.year, row.month)} dökümünü göster`}
                  rowClassName={(row) => (isSelected(row) ? "bg-primary/[0.07] shadow-[inset_3px_0_0_rgb(var(--color-primary))]" : "")}
                  mobileCard={(row) => (
                    <div className="flex items-start justify-between gap-3">
                      {monthCell(row)}
                      {kalanCell(row)}
                    </div>
                  )}
                />
              </div>
              {months && (
                <div className="lg:hidden">
                  <Select aria-label="Ay" value={selectedKey} onChange={(event) => setPicked({ doctorId, key: event.target.value })}>
                    {months.map((row) => (
                      <option key={monthKey(row.year, row.month)} value={monthKey(row.year, row.month)}>{monthOptionLabel(row)}</option>
                    ))}
                  </Select>
                </div>
              )}
              <Section
                title={selectedRow ? `${monthName(selectedRow.year, selectedRow.month)} hakediş dökümü` : "Hakediş dökümü"}
                badge={selectedRow ? statusBadge(selectedRow) : null}
                description={detail ? `Hakediş oranı %${detail.rates.maasYuzde} · kart komisyonu %${detail.rates.kkYuzde} · genel gider payı %${detail.rates.genelYuzde}` : undefined}
                actions={(canExport || canPaySelected) ? (
                  <>
                    {canExport && <ExportMenu onExcel={exportExcel} onPdf={exportPdf} disabled={!detail} disabledReason="Döküm hazırlanıyor" />}
                    {canPaySelected && detail && onPay && (
                      <Button size="sm" icon={Wallet} onClick={() => onPay(doctorId, detail.year, detail.month, detail.summary.kalan)}>
                        Kalanı öde
                      </Button>
                    )}
                  </>
                ) : undefined}
              >
                {statementBody()}
              </Section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
