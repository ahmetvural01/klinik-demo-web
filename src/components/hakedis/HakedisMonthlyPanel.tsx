"use client";

import { useCallback, useRef, useState } from "react";
import { Wallet } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { StatStrip } from "@/components/ui/StatStrip";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { ExportMenu } from "@/components/ui/ExportMenu";
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

type DetailTab = "hesap" | "tedavi" | "tahsilat" | "lab" | "odeme";
const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: "hesap", label: "Hesap" },
  { key: "tedavi", label: "Tedaviler" },
  { key: "tahsilat", label: "Tahsilatlar" },
  { key: "lab", label: "Laboratuvar" },
  { key: "odeme", label: "Ödemeler" },
];

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/** Hesap dökümü kalemi: tutar ve kesinti mi (kesinti eksiyle yazılır). */
type BreakdownItem = { label: string; amount: number; deduction?: boolean };

/** Hesap dökümü kalemleri: ekranda, Excel'de ve PDF'te aynı sözcükler. */
const breakdownItems = (d: HakedisDetail): BreakdownItem[] => [
  { label: "Tedavi tutarı (üretim)", amount: d.breakdown.ciro },
  { label: "Kredi kartıyla alınan tahsilat", amount: d.breakdown.kk },
  { label: `Kredi kartı komisyonu (%${d.rates.kkYuzde})`, amount: d.breakdown.kkMasraf, deduction: true },
  { label: `Genel gider payı (tedavi tutarının %${d.rates.genelYuzde}'i)`, amount: d.breakdown.genelMasraf, deduction: true },
  { label: "Laboratuvar gideri", amount: d.breakdown.labCost, deduction: true },
  { label: "Toplam kesinti", amount: d.breakdown.toplamGider, deduction: true },
  { label: "Kesintiden sonra kalan", amount: d.breakdown.brut },
  { label: `Doktor payı — hakediş (%${d.rates.maasYuzde})`, amount: d.breakdown.hakedilen },
];

/** Ekran ve PDF metni: kesinti "−₺120,00"; sıfır kesinti işaretsiz "₺0,00" (önceden "−₺0,00"). */
const breakdownText = (item: BreakdownItem) => (item.deduction && Math.abs(item.amount) >= 0.005 ? `−${money(item.amount)}` : money(item.amount));

/** Ekrandaki ve PDF'teki satırlar (eski biçim: [kalem, metin]). */
const breakdownRows = (d: HakedisDetail): [string, string][] => breakdownItems(d).map((item) => [item.label, breakdownText(item)]);

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

type DetailRow = { id: string; tarih: string; ad: string; aciklama: string; yontem: string; tutar: number };

export interface HakedisMonthlyPanelProps {
  doctorId: string;
  /** "Öde" düğmesi gösterilsin mi? Doktorun kendi görünümünde false. */
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
 * Doktorun son 12 aylık hakediş dökümü — Muhasebe > Hakediş ile doktorun kendi
 * "Hakedişim" ekranı aynı hesabı (tek kaynak: /api/hakedis) gösterir.
 */
export function HakedisMonthlyPanel({ doctorId, canPay = false, onPay, refreshToken = 0, canExport = false, active = true }: HakedisMonthlyPanelProps) {
  // Aylar hangi doktora ait: doktor değişince öncekinin satırları yeni adla görünmez.
  const [monthsState, setMonthsState] = useState<{ doctorId: string; months: HakedisMonth[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const sequenceRef = useRef(0);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<HakedisDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailTarget, setDetailTarget] = useState<{ year: number; month: number } | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("hesap");

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

  const openDetail = async (year: number, month: number) => {
    setDetailTarget({ year, month });
    setDetailTab("hesap");
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    const response = await fetch(`/api/hakedis/detay?doctorId=${encodeURIComponent(doctorId)}&year=${year}&month=${month}`, { cache: "no-store" }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (response?.ok && body) setDetail(body as HakedisDetail);
    else setDetailError(body?.message || "Hakediş detayı yüklenemedi.");
    setDetailLoading(false);
  };

  const currentKey = todayKey().slice(0, 7);
  const isCurrent = (row: HakedisMonth) => monthKey(row.year, row.month) === currentKey;
  const payable = (months || []).filter((row) => !isCurrent(row) && row.kalan > 0.5);
  const totalPayable = payable.reduce((sum, row) => sum + row.kalan, 0);
  const current = (months || []).find(isCurrent);

  const detailFileName = detail
    ? `hakedis-${detail.doctor.fullName.replace(/\s+/g, "-")}-${monthKey(detail.year, detail.month)}`
    : "hakedis-detay";

  const exportExcel = async () => {
    if (!detail) return;
    const d = detail;
    const rows: Record<string, string>[] = [
      ...breakdownItems(d).map((item) => ({ Bölüm: "Hesap dökümü", Tarih: "", Açıklama: item.label, Yöntem: "", Tutar: csvAmount(item.amount, item.deduction) })),
      ...d.examinations.map((e) => ({ Bölüm: "Tedaviler", Tarih: shortDate(e.tarih), Açıklama: `${e.hasta} — ${e.tedavi}${e.dis ? ` (diş ${e.dis})` : ""}`, Yöntem: "", Tutar: csvAmount(e.tutar) })),
      ...d.patientPayments.map((p) => ({ Bölüm: "Hasta tahsilatları", Tarih: shortDate(p.tarih), Açıklama: p.hasta, Yöntem: methodLabel(p.yontem), Tutar: csvAmount(p.tutar) })),
      ...d.labInvoices.map((i) => ({ Bölüm: "Laboratuvar ücretleri", Tarih: shortDate(i.tarih), Açıklama: `${i.lab} — ${i.kalem}`, Yöntem: "", Tutar: csvAmount(i.tutar) })),
      ...d.payoutExpenses.map((p) => ({ Bölüm: "Doktora yapılan ödemeler", Tarih: shortDate(p.tarih), Açıklama: p.aciklama || "", Yöntem: methodLabel(p.yontem), Tutar: csvAmount(p.tutar) })),
    ];
    const { downloadCsv } = await import("@/lib/csv-export");
    downloadCsv(`${detailFileName}.csv`, rows);
  };

  const exportPdf = async () => {
    if (!detail) return;
    const { addPdfSection, addPdfTitle, createPdfDoc, preparePdfFonts } = await import("@/lib/pdf-export");
    // Türkçe yazı tipi oturumun ilk PDF'inde de yüklü olsun (yoksa harfler dönüştürülür).
    await preparePdfFonts();
    const d = detail;
    const doc = createPdfDoc("l");
    addPdfTitle(doc, `Hakediş — ${d.doctor.fullName}`,
      `${monthName(d.year, d.month)} · Hakediş: ${money(d.summary.hakedilen)} · Ödenen: ${money(d.summary.odenen)} · Kalan: ${money(d.summary.kalan)}`);
    let y = 28;
    y = addPdfSection(doc, y, "Hesap dökümü", ["Kalem", "Tutar"], breakdownRows(d));
    y = addPdfSection(doc, y, "Tedaviler", ["Tarih", "Hasta", "Tedavi", "Diş", "Tutar"],
      d.examinations.map((e) => [shortDate(e.tarih), e.hasta, e.tedavi, e.dis || "", money(e.tutar)]));
    y = addPdfSection(doc, y, "Hasta tahsilatları", ["Tarih", "Hasta", "Yöntem", "Tutar"],
      d.patientPayments.map((p) => [shortDate(p.tarih), p.hasta, methodLabel(p.yontem), money(p.tutar)]));
    y = addPdfSection(doc, y, "Laboratuvar ücretleri", ["Tarih", "Laboratuvar", "Kalem", "Tutar"],
      d.labInvoices.map((i) => [shortDate(i.tarih), i.lab, i.kalem, money(i.tutar)]));
    addPdfSection(doc, y, "Doktora yapılan ödemeler", ["Tarih", "Açıklama", "Yöntem", "Tutar"],
      d.payoutExpenses.map((p) => [shortDate(p.tarih), p.aciklama || "", methodLabel(p.yontem), money(p.tutar)]));
    doc.save(`${detailFileName}.pdf`);
  };

  const statusBadge = (row: HakedisMonth) => {
    const status = monthStatus(row, isCurrent(row));
    if (!status) return null;
    if (status.plain) return <span className="text-xs text-slate-500">{status.label}</span>;
    return <Badge tone={status.tone} title={status.hint || undefined}>{status.label}</Badge>;
  };

  // Telefon: ödeme kartın sağ üst köşesindeki "…" menüsünde (ayrı eylem sırası yok).
  const payMenu = (row: HakedisMonth) => (canPay && onPay && !isCurrent(row) && row.kalan > 0.5 ? (
    <ActionMenu
      label={`${monthName(row.year, row.month)} için işlemler`}
      items={[{ key: "pay", label: `${monthName(row.year, row.month)} hakedişini öde`, icon: Wallet, onSelect: () => onPay(doctorId, row.year, row.month, row.kalan) }]}
    />
  ) : null);

  const payButton = (row: HakedisMonth) => (canPay && onPay && !isCurrent(row) && row.kalan > 0.5 ? (
    <Button size="sm" variant="secondary" icon={Wallet} onClick={() => onPay(doctorId, row.year, row.month, row.kalan)} aria-label={`${monthName(row.year, row.month)} hakedişini öde`}>
      Öde
    </Button>
  ) : null);

  const columns: ListTableColumn<HakedisMonth>[] = [
    { key: "ay", header: "Ay", render: (row) => <span className="font-semibold text-slate-900">{monthName(row.year, row.month)}</span> },
    {
      key: "hakedilen",
      header: "Hakediş",
      headerHint: "O ayın tedavilerinden doktor payı: kart komisyonu, genel gider payı ve laboratuvar gideri düşüldükten sonra.",
      align: "right",
      render: (row) => <span className={`tabular-nums ${row.hakedilen < 0 ? "text-red-700" : "text-slate-700"}`}>{money(row.hakedilen)}</span>,
    },
    // Ödeme yoksa hücre boş ("—" her satırda tekrar etmez).
    { key: "odenen", header: "Ödenen", align: "right", render: (row) => (row.odenen > 0 ? <span className="tabular-nums text-slate-700">{money(row.odenen)}</span> : null) },
    {
      key: "kalan",
      header: "Kalan",
      align: "right",
      // İçinde bulunulan ayın kalanı henüz ödenemez; durum sütunu "Ay sürüyor" der.
      render: (row) => (isCurrent(row)
        ? null
        : <span className={`font-bold tabular-nums ${row.kalan > 0.5 ? "text-slate-900" : "text-slate-500"}`}>{money(row.kalan)}</span>),
    },
    { key: "durum", header: "Durum", render: statusBadge },
    ...(canPay && onPay ? [{ key: "islem", header: "", align: "right" as const, render: payButton }] : []),
  ];

  const detailColumns = (tone: string, withMethod: boolean): ListTableColumn<DetailRow>[] => [
    { key: "tarih", header: "Tarih", cellClassName: "whitespace-nowrap text-sm text-slate-600", render: (row) => shortDate(row.tarih) },
    {
      key: "ad",
      header: "Kayıt",
      render: (row) => (
        <div className="min-w-0">
          {row.ad ? <p className="text-sm font-semibold text-slate-800">{row.ad}</p> : null}
          {row.aciklama ? <p className="text-xs text-slate-500">{row.aciklama}</p> : null}
          {!row.ad && !row.aciklama && <EmptyValue />}
        </div>
      ),
    },
    ...(withMethod ? [{ key: "yontem", header: "Yöntem", cellClassName: "text-sm text-slate-600", render: (row: DetailRow) => row.yontem || <EmptyValue /> }] : []),
    { key: "tutar", header: "Tutar", align: "right", render: (row) => <span className={`font-semibold tabular-nums ${tone}`}>{money(row.tutar)}</span> },
  ];

  const detailList = (rows: DetailRow[], tone: string, withMethod: boolean, emptyText: string) => (
    <ListTable
      columns={detailColumns(tone, withMethod)}
      rows={rows}
      rowKey={(row) => row.id}
      emptyText={emptyText}
      mobileCard={(row) => (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">{row.ad || row.aciklama || "—"}</p>
            <p className="text-xs text-slate-500">{[shortDate(row.tarih), row.ad ? row.aciklama : "", row.yontem].filter(Boolean).join(" · ")}</p>
          </div>
          <span className={`shrink-0 font-semibold tabular-nums ${tone}`}>{money(row.tutar)}</span>
        </div>
      )}
    />
  );

  const detailBody = () => {
    if (!detail) return null;
    if (detailTab === "hesap") {
      return (
        <DescriptionList
          layout="rows"
          items={breakdownRows(detail).map(([label, value], index, list) => ({
            key: label,
            label,
            value: <span className="tabular-nums">{value}</span>,
            emphasis: index === list.length - 1,
          }))}
        />
      );
    }
    if (detailTab === "tedavi") {
      return detailList(detail.examinations.map((e) => ({ id: e.id, tarih: e.tarih, ad: e.hasta, aciklama: [e.tedavi, e.dis ? `diş ${e.dis}` : ""].filter(Boolean).join(" · "), yontem: "", tutar: e.tutar })), "text-slate-900", false, "Bu ay tedavi kaydı yok");
    }
    if (detailTab === "tahsilat") {
      return detailList(detail.patientPayments.map((p) => ({ id: p.id, tarih: p.tarih, ad: p.hasta, aciklama: "", yontem: methodLabel(p.yontem), tutar: p.tutar })), "text-emerald-700", true, "Bu ay hasta tahsilatı yok");
    }
    if (detailTab === "lab") {
      return detailList(detail.labInvoices.map((i) => ({ id: i.id, tarih: i.tarih, ad: i.lab, aciklama: i.kalem, yontem: "", tutar: i.tutar })), "text-red-700", false, "Bu ay laboratuvar ücreti yok");
    }
    return detailList(detail.payoutExpenses.map((p) => ({ id: p.id, tarih: p.tarih, ad: "", aciklama: p.aciklama || "Hakediş ödemesi", yontem: methodLabel(p.yontem), tutar: p.tutar })), "text-slate-900", true, "Bu ay için doktora ödeme yapılmadı");
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
          <ListTable
            columns={columns}
            rows={months || []}
            rowKey={(row) => monthKey(row.year, row.month)}
            loading={loading || (!months && !loadError)}
            staleError={months ? loadError || null : null}
            onRetry={() => setReloadKey((value) => value + 1)}
            onRowClick={(row) => void openDetail(row.year, row.month)}
            getRowAriaLabel={(row) => `${monthName(row.year, row.month)} dökümünü aç`}
            emptyText="Bu doktor için son 12 ayda hakediş yok"
            emptyDescription="Doktorun tedavi kaydı oluştukça aylık hakediş burada görünür."
            // Telefon kartı iki satır: ay + durum, hakediş · ödenen; kalan sağda, ödeme sağ üstte "…".
            mobileCard={(row) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold text-slate-900">{monthName(row.year, row.month)}</span>
                    {statusBadge(row)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Hakediş {money(row.hakedilen)}{row.odenen > 0 ? ` · Ödenen ${money(row.odenen)}` : ""}
                  </p>
                </div>
                {!isCurrent(row) && row.kalan > 0.5 && <span className="shrink-0 font-bold tabular-nums text-slate-900">{money(row.kalan)}</span>}
              </div>
            )}
            mobileCardActions={canPay && onPay ? payMenu : undefined}
          />
        </>
      )}

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detail ? `${detail.doctor.fullName} — ${monthName(detail.year, detail.month)}` : detailTarget ? `Hakediş — ${monthName(detailTarget.year, detailTarget.month)}` : "Hakediş dökümü"}
        description={detail ? `Hakediş ${money(detail.summary.hakedilen)} · Ödenen ${money(detail.summary.odenen)} · Kalan ${money(detail.summary.kalan)}` : undefined}
        size="xl"
        module="hakediş"
        trackFormChanges={false}
        footer={(
          <>
            {canExport && <ExportMenu onExcel={exportExcel} onPdf={exportPdf} disabled={!detail} disabledReason="Döküm hazırlanıyor" />}
            <Button variant="secondary" onClick={() => setDetailOpen(false)}>Kapat</Button>
          </>
        )}
      >
        {detailLoading ? (
          <ListRowSkeleton variant="row" rows={6} />
        ) : detailError || !detail ? (
          <LoadErrorState message={detailError || "Hakediş detayı yüklenemedi."} onRetry={detailTarget ? () => void openDetail(detailTarget.year, detailTarget.month) : undefined} />
        ) : (
          <div className="space-y-3">
            <Tabs ariaLabel="Döküm bölümleri" size="sm" items={DETAIL_TABS} value={detailTab} onChange={setDetailTab} />
            {detailBody()}
          </div>
        )}
      </Modal>
    </div>
  );
}
