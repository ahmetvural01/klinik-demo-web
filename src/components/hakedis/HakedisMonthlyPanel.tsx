"use client";

import { useEffect, useState } from "react";
import { FileText, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { downloadCsv } from "@/lib/csv-export";
import { ExportMenu } from "@/components/muhasebe/ExportMenu";
import { methodLabel, money, monthName, shortDate, todayKey } from "@/components/muhasebe/muhasebe-utils";

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

/** Hesap dökümü satırları: ekranda, Excel'de ve PDF'te aynı sözcükler. */
const breakdownRows = (d: HakedisDetail): [string, string][] => [
  ["Tedavi tutarı (üretim)", money(d.breakdown.ciro)],
  [`Kredi kartıyla alınan tahsilat`, money(d.breakdown.kk)],
  [`Kredi kartı komisyonu (%${d.rates.kkYuzde})`, `−${money(d.breakdown.kkMasraf)}`],
  [`Genel gider payı (tedavi tutarının %${d.rates.genelYuzde}'i)`, `−${money(d.breakdown.genelMasraf)}`],
  ["Laboratuvar gideri", `−${money(d.breakdown.labCost)}`],
  ["Toplam kesinti", `−${money(d.breakdown.toplamGider)}`],
  ["Kesintiden sonra kalan", money(d.breakdown.brut)],
  [`Doktor payı — hakediş (%${d.rates.maasYuzde})`, money(d.breakdown.hakedilen)],
];

/** Ay satırının durumu: kim kime ne borçlu, sade sözcükle. */
function monthStatus(row: HakedisMonth, isCurrent: boolean) {
  if (isCurrent) return { label: "Ay sürüyor", tone: "info" as const, hint: "Ay kapanınca ödenebilir." };
  if (row.kalan > 0.5) return { label: "Ödenecek", tone: "warning" as const, hint: "" };
  if (row.odenen > Math.max(row.hakedilen, 0) + 0.5) return { label: "Fazla ödendi", tone: "critical" as const, hint: "Bu ay için hakedişten fazla ödeme yapılmış." };
  if (row.hakedilen < -0.5) return { label: "Eksi hakediş", tone: "neutral" as const, hint: "Laboratuvar gideri bu ayın doktor payını aştı." };
  return { label: "Ödendi", tone: "success" as const, hint: "" };
}

export interface HakedisMonthlyPanelProps {
  doctorId: string;
  /** "Öde" düğmesi gösterilsin mi? Doktorun kendi görünümünde false. */
  canPay?: boolean;
  onPay?: (doctorId: string, year: number, month: number, kalan: number) => void;
  /** Bir ödeme sonrası veya dışarıdan tetiklenen yenilemede artan sayaç. */
  refreshToken?: number;
}

/**
 * Doktorun son 12 aylık hakediş dökümü — Muhasebe > Hakediş ile doktorun kendi
 * "Hakedişim" ekranı aynı hesabı (tek kaynak: /api/hakedis) gösterir.
 */
export function HakedisMonthlyPanel({ doctorId, canPay = false, onPay, refreshToken }: HakedisMonthlyPanelProps) {
  const [months, setMonths] = useState<HakedisMonth[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<HakedisDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailTarget, setDetailTarget] = useState<{ year: number; month: number } | null>(null);

  useEffect(() => {
    if (!doctorId) { setMonths([]); return; }
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    fetch(`/api/hakedis?doctorId=${encodeURIComponent(doctorId)}&months=12`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (cancelled) return;
        // En yeni ay üstte: kullanıcı önce güncel durumu görür.
        const list: HakedisMonth[] = Array.isArray(data?.months) ? data.months : [];
        setMonths([...list].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month)));
      })
      .catch(() => {
        if (!cancelled) {
          setMonths([]);
          setLoadError("Hakediş dökümü yüklenemedi.");
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [doctorId, refreshToken, reloadKey]);

  const openDetail = async (year: number, month: number) => {
    setDetailTarget({ year, month });
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    const response = await fetch(`/api/hakedis/detay?doctorId=${encodeURIComponent(doctorId)}&year=${year}&month=${month}`, { cache: "no-store" }).catch(() => null);
    if (response?.ok) setDetail(await response.json());
    else setDetailError("Hakediş detayı yüklenemedi.");
    setDetailLoading(false);
  };

  const currentKey = todayKey().slice(0, 7);
  const isCurrent = (row: HakedisMonth) => monthKey(row.year, row.month) === currentKey;
  const payable = months.filter((row) => !isCurrent(row) && row.kalan > 0.5);
  const totalPayable = payable.reduce((sum, row) => sum + row.kalan, 0);
  const current = months.find(isCurrent);

  const detailFileName = detail
    ? `hakedis-${detail.doctor.fullName.replace(/\s+/g, "-")}-${monthKey(detail.year, detail.month)}`
    : "hakedis-detay";

  const exportExcel = () => {
    if (!detail) return;
    const d = detail;
    const rows: Record<string, string>[] = [
      ...breakdownRows(d).map(([label, value]) => ({ Bölüm: "Hesap dökümü", Tarih: "", Açıklama: label, Yöntem: "", Tutar: value })),
      ...d.examinations.map((e) => ({ Bölüm: "Tedaviler", Tarih: shortDate(e.tarih), Açıklama: `${e.hasta} — ${e.tedavi}${e.dis ? ` (diş ${e.dis})` : ""}`, Yöntem: "", Tutar: money(e.tutar) })),
      ...d.patientPayments.map((p) => ({ Bölüm: "Hasta tahsilatları", Tarih: shortDate(p.tarih), Açıklama: p.hasta, Yöntem: methodLabel(p.yontem), Tutar: money(p.tutar) })),
      ...d.labInvoices.map((i) => ({ Bölüm: "Laboratuvar faturaları", Tarih: shortDate(i.tarih), Açıklama: `${i.lab} — ${i.kalem}`, Yöntem: "", Tutar: money(i.tutar) })),
      ...d.payoutExpenses.map((p) => ({ Bölüm: "Doktora yapılan ödemeler", Tarih: shortDate(p.tarih), Açıklama: p.aciklama || "", Yöntem: methodLabel(p.yontem), Tutar: money(p.tutar) })),
    ];
    downloadCsv(`${detailFileName}.csv`, rows);
  };

  const exportPdf = async () => {
    if (!detail) return;
    const { addPdfSection, addPdfTitle, createPdfDoc } = await import("@/lib/pdf-export");
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
    y = addPdfSection(doc, y, "Laboratuvar faturaları", ["Tarih", "Laboratuvar", "Kalem", "Tutar"],
      d.labInvoices.map((i) => [shortDate(i.tarih), i.lab, i.kalem, money(i.tutar)]));
    addPdfSection(doc, y, "Doktora yapılan ödemeler", ["Tarih", "Açıklama", "Yöntem", "Tutar"],
      d.payoutExpenses.map((p) => [shortDate(p.tarih), p.aciklama || "", methodLabel(p.yontem), money(p.tutar)]));
    doc.save(`${detailFileName}.pdf`);
  };

  const pay = (row: HakedisMonth) => {
    if (!onPay) return;
    onPay(doctorId, row.year, row.month, row.kalan);
  };

  const statusBadge = (row: HakedisMonth) => {
    const status = monthStatus(row, isCurrent(row));
    return <Badge tone={status.tone} title={status.hint || undefined}>{status.label}</Badge>;
  };

  const rowActions = (row: HakedisMonth) => (
    <div className="flex items-center justify-end gap-1.5">
      <IconButton icon={FileText} title={`${monthName(row.year, row.month)} dökümünü aç`} size="sm" onClick={() => void openDetail(row.year, row.month)} />
      {canPay && onPay && !isCurrent(row) && row.kalan > 0.5 && (
        <Button size="sm" variant="secondary" icon={Wallet} onClick={() => pay(row)}>Öde</Button>
      )}
    </div>
  );

  const columns: ListTableColumn<HakedisMonth>[] = [
    {
      key: "ay",
      header: "Ay",
      render: (row) => <span className="font-semibold text-slate-900">{monthName(row.year, row.month)}</span>,
    },
    { key: "hakedilen", header: "Hakediş", align: "right", render: (row) => <span className={`tabular-nums ${row.hakedilen < 0 ? "text-red-700" : "text-slate-700"}`}>{money(row.hakedilen)}</span> },
    { key: "odenen", header: "Ödenen", align: "right", render: (row) => (row.odenen > 0 ? <span className="tabular-nums text-slate-700">{money(row.odenen)}</span> : <EmptyValue />) },
    {
      key: "kalan",
      header: "Kalan",
      align: "right",
      render: (row) => (isCurrent(row)
        ? <span className="text-xs text-slate-400">Ay kapanınca</span>
        : <span className={`font-bold tabular-nums ${row.kalan > 0.5 ? "text-slate-900" : "text-slate-500"}`}>{money(row.kalan)}</span>),
    },
    { key: "durum", header: "Durum", render: statusBadge },
    { key: "islem", header: "", align: "right", render: rowActions },
  ];

  const summary = months.length > 0 ? (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-slate-100 px-4 py-3 text-sm">
      <span className="text-slate-500">
        Ödenecek{" "}
        <b className={`tabular-nums ${totalPayable > 0.5 ? "text-slate-900" : "text-slate-500"}`}>{money(totalPayable)}</b>
        {payable.length > 0 && <span className="ml-1 text-xs text-slate-400">({payable.length} kapanmış ay)</span>}
      </span>
      {current && (
        <span className="text-slate-500">
          Bu ay biriken <b className="tabular-nums text-slate-700">{money(current.hakedilen)}</b>
          <span className="ml-1 text-xs text-slate-400">(ay kapanınca ödenir)</span>
        </span>
      )}
    </div>
  ) : null;

  const detailSections = detail ? [
    {
      title: `Tedaviler (${detail.examinations.length})`,
      rows: detail.examinations.map((e) => ({ id: e.id, tarih: e.tarih, ad: e.hasta, aciklama: [e.tedavi, e.dis ? `diş ${e.dis}` : ""].filter(Boolean).join(" · "), yontem: "", tutar: e.tutar })),
      tone: "text-slate-900",
    },
    {
      title: `Hasta tahsilatları (${detail.patientPayments.length})`,
      rows: detail.patientPayments.map((p) => ({ id: p.id, tarih: p.tarih, ad: p.hasta, aciklama: "", yontem: methodLabel(p.yontem), tutar: p.tutar })),
      tone: "text-emerald-700",
    },
    {
      title: `Laboratuvar faturaları (${detail.labInvoices.length})`,
      rows: detail.labInvoices.map((i) => ({ id: i.id, tarih: i.tarih, ad: i.lab, aciklama: i.kalem, yontem: "", tutar: i.tutar })),
      tone: "text-red-700",
    },
    {
      title: `Doktora yapılan ödemeler (${detail.payoutExpenses.length})`,
      rows: detail.payoutExpenses.map((p) => ({ id: p.id, tarih: p.tarih, ad: "", aciklama: p.aciklama || "", yontem: methodLabel(p.yontem), tutar: p.tutar })),
      tone: "text-slate-900",
    },
  ] : [];

  type DetailRow = { id: string; tarih: string; ad: string; aciklama: string; yontem: string; tutar: number };
  const detailColumns = (tone: string): ListTableColumn<DetailRow>[] => [
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
    { key: "yontem", header: "Yöntem", cellClassName: "text-sm text-slate-600", render: (row) => row.yontem || <EmptyValue /> },
    { key: "tutar", header: "Tutar", align: "right", render: (row) => <span className={`font-semibold tabular-nums ${tone}`}>{money(row.tutar)}</span> },
  ];

  return (
    <div className="space-y-4">
      {loadError ? (
        <LoadErrorState message={loadError} onRetry={() => setReloadKey((value) => value + 1)} />
      ) : (
        <ListTable
          columns={columns}
          rows={months}
          rowKey={(row) => monthKey(row.year, row.month)}
          loading={loading}
          header={summary}
          emptyText="Bu doktor için son 12 ayda hakediş yok"
          emptyDescription="Doktorun tedavi kaydı oluştukça aylık hakediş burada görünür."
          rowClassName={(row) => (isCurrent(row) ? "bg-slate-50/60" : "")}
          mobileCard={(row) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{monthName(row.year, row.month)}</p>
                <p className="text-xs text-slate-500">Hakediş {money(row.hakedilen)} · Ödenen {money(row.odenen)}</p>
                <div className="mt-1">{statusBadge(row)}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {!isCurrent(row) && <span className="font-bold tabular-nums text-slate-900">{money(row.kalan)}</span>}
                {rowActions(row)}
              </div>
            </div>
          )}
        />
      )}
      <p className="px-1 text-xs text-slate-500">
        Hakediş: o ayın tedavilerinden doktorun payı (kart komisyonu, genel gider payı ve laboratuvar gideri düşüldükten sonra). Ödenen: o ay için doktora yapılan ödemeler.
      </p>

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
            <ExportMenu onExcel={exportExcel} onPdf={exportPdf} disabled={!detail} />
            <Button variant="secondary" onClick={() => setDetailOpen(false)}>Kapat</Button>
          </>
        )}
      >
        {detailLoading ? (
          <p className="py-12 text-center text-sm text-slate-500">Döküm hazırlanıyor…</p>
        ) : detailError || !detail ? (
          <LoadErrorState message={detailError || "Hakediş detayı yüklenemedi."} onRetry={detailTarget ? () => void openDetail(detailTarget.year, detailTarget.month) : undefined} />
        ) : (
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-sm font-bold text-slate-900">Hesap dökümü</h3>
              <dl className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
                {breakdownRows(detail).map(([label, value], index, list) => (
                  <div key={label} className={`flex items-center justify-between gap-3 px-4 py-2 ${index === list.length - 1 ? "bg-primary/5 font-bold text-primary" : "text-slate-700"}`}>
                    <dt>{label}</dt>
                    <dd className="tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            {detailSections.map((section) => (
              <section key={section.title}>
                <h3 className="mb-2 text-sm font-bold text-slate-900">{section.title}</h3>
                <ListTable
                  columns={detailColumns(section.tone)}
                  rows={section.rows}
                  rowKey={(row) => row.id}
                  emptyText="Kayıt yok"
                  mobileCard={(row) => (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{row.ad || row.aciklama || "—"}</p>
                        <p className="text-xs text-slate-500">{[shortDate(row.tarih), row.ad ? row.aciklama : "", row.yontem].filter(Boolean).join(" · ")}</p>
                      </div>
                      <span className={`shrink-0 font-semibold tabular-nums ${section.tone}`}>{money(row.tutar)}</span>
                    </div>
                  )}
                />
              </section>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
