"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { showToastSafe } from "@/lib/toast-client";

const MONEY = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 });
const fmt = (n: number | string | null | undefined) => MONEY.format(Number(n) || 0);
const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString("tr-TR"); } catch { return d; } };
const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const METHOD_LABELS: Record<string, string> = {
  NAKIT: "Nakit", KREDI_KARTI: "Kredi Kartı", HAVALE: "Havale/EFT", MAIL_ORDER: "Mail Order", DIGER: "Diğer",
};

const showToast = (type: "success" | "error", message: string) => showToastSafe({ type, message });

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

const escapeCell = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const hakedisBreakdownRows = (d: HakedisDetail): (string | number)[][] => [
  ["Toplam Ciro (Muayene/Tedavi, KDV dahil tutar)", fmt(d.breakdown.ciro)],
  [`Kredi Kartı Tahsilatı (KK masrafı %${d.rates.kkYuzde} üzerinden hesaplanır)`, fmt(d.breakdown.kk)],
  [`KK Masrafı (Kredi Kartı Tahsilatı × %${d.rates.kkYuzde})`, "-" + fmt(d.breakdown.kkMasraf)],
  [`Genel Gider Payı (Ciro × %${d.rates.genelYuzde})`, "-" + fmt(d.breakdown.genelMasraf)],
  ["Laboratuvar Gideri", "-" + fmt(d.breakdown.labCost)],
  ["Toplam Gider", "-" + fmt(d.breakdown.toplamGider)],
  ["Brüt Kâr (Ciro - Toplam Gider)", fmt(d.breakdown.brut)],
  [`Hakediş (Brüt Kâr × %${d.rates.maasYuzde})`, fmt(d.breakdown.hakedilen)],
];

export interface HakedisMonthlyPanelProps {
  doctorId: string;
  /** Muhasebe rolü için "Öde" butonu gösterilsin mi? Doktorun kendi görünümünde false. */
  canPay?: boolean;
  onPay?: (doctorId: string, year: number, month: number, kalan: number) => void;
  /** Bir "Öde" işlemi sonrası veya dışarıdan tetiklenen yenilemede artan sayaç. */
  refreshToken?: number;
}

export function HakedisMonthlyPanel({ doctorId, canPay = false, onPay, refreshToken }: HakedisMonthlyPanelProps) {
  const [months, setMonths] = useState<HakedisMonth[]>([]);
  const [loading, setLoading] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<HakedisDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!doctorId) { setMonths([]); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/hakedis?doctorId=${doctorId}&months=12`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { if (!cancelled) setMonths(data.months || []); })
      .catch(() => { if (!cancelled) showToast("error", "Hakediş dökümü yüklenemedi"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [doctorId, refreshToken]);

  const openDetail = async (year: number, month: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    const r = await fetch(`/api/hakedis/detay?doctorId=${doctorId}&year=${year}&month=${month}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setDetail(await r.json());
    else showToast("error", "Hakediş detayı yüklenemedi");
    setDetailLoading(false);
  };

  const detailFileName = detail
    ? `hakedis-${detail.doctor.fullName.replace(/\s+/g, "-")}-${detail.year}-${String(detail.month).padStart(2, "0")}`
    : "hakedis-detay";

  const exportExcel = () => {
    if (!detail) return;
    const d = detail;
    const section = (title: string, headers: string[], rows: (string | number)[][]) => `
      <p style="font-weight:700;font-size:13pt;margin:16px 0 6px">${escapeCell(title)}</p>
      <table><thead><tr>${headers.map(h => `<th>${escapeCell(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.length === 0
        ? `<tr><td colspan="${headers.length}">Kayıt yok</td></tr>`
        : rows.map(row => `<tr>${row.map((c, i) => `<td class="${i === row.length - 1 ? "amount" : ""}">${escapeCell(c)}</td>`).join("")}</tr>`).join("")
      }</tbody></table>`;
    const html = `
      <html><head><meta charset="UTF-8" />
      <style>
        table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:10pt;width:100%;margin-bottom:8px}
        th{background:#111827;color:#fff;text-align:left;padding:6px;border:1px solid #d1d5db}
        td{padding:6px;border:1px solid #d1d5db;mso-number-format:"\\@";}
        .amount{text-align:right;font-weight:700}
        .title{font-size:16pt;font-weight:700}
        .meta{color:#475569;margin-bottom:10px}
      </style></head><body>
      <div class="title">Hakediş Detayı — ${escapeCell(d.doctor.fullName)}</div>
      <div class="meta">${AY_ADLARI[d.month - 1]} ${d.year} · Hakedilen: ${fmt(d.summary.hakedilen)} · Ödenen: ${fmt(d.summary.odenen)} · Kalan: ${fmt(d.summary.kalan)}</div>
      ${section("Hakediş Hesaplama Dökümü", ["Kalem", "Tutar"], hakedisBreakdownRows(d))}
      ${section("Muayeneler / Tedaviler", ["Tarih", "Hasta", "Tedavi", "Diş", "Tutar"], d.examinations.map(e => [fmtDate(e.tarih), e.hasta, e.tedavi, e.dis || "-", fmt(e.tutar)]))}
      ${section("Hasta Ödemeleri", ["Tarih", "Hasta", "Yöntem", "Tutar"], d.patientPayments.map(p => [fmtDate(p.tarih), p.hasta, METHOD_LABELS[p.yontem] || p.yontem, fmt(p.tutar)]))}
      ${section("Laboratuvar Faturaları", ["Tarih", "Lab", "Kalem", "Tutar"], d.labInvoices.map(i => [fmtDate(i.tarih), i.lab, i.kalem, fmt(i.tutar)]))}
      ${section("Doktora Yapılan Hakediş Ödemeleri", ["Tarih", "Açıklama", "Yöntem", "Tutar"], d.payoutExpenses.map(p => [fmtDate(p.tarih), p.aciklama || "-", METHOD_LABELS[p.yontem] || p.yontem, fmt(p.tutar)]))}
      </body></html>`;
    const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${detailFileName}.xls`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportPdf = async () => {
    if (!detail) return;
    const { addPdfSection, addPdfTitle, createPdfDoc } = await import("@/lib/pdf-export");
    const d = detail;
    const doc = createPdfDoc("l");
    addPdfTitle(doc, `Hakediş Detayı — ${d.doctor.fullName}`,
      `${AY_ADLARI[d.month - 1]} ${d.year} · Hakedilen: ${fmt(d.summary.hakedilen)} · Ödenen: ${fmt(d.summary.odenen)} · Kalan: ${fmt(d.summary.kalan)}`);
    let y = 28;
    y = addPdfSection(doc, y, "Dönem Özeti", ["Kalem", "Tutar"], [
      ["Toplam hakediş", fmt(d.summary.hakedilen)],
      ["Ödenen", fmt(d.summary.odenen)],
      ["Kalan", fmt(d.summary.kalan)],
      ["Muayene / tedavi kaydı", d.examinations.length],
      ["Hasta ödeme kaydı", d.patientPayments.length],
      ["Laboratuvar faturası", d.labInvoices.length],
    ]);
    y = addPdfSection(doc, y, "Hakediş Hesaplama Dökümü", ["Kalem", "Tutar"], hakedisBreakdownRows(d));
    y = addPdfSection(doc, y, "Muayeneler / Tedaviler", ["Tarih", "Hasta", "Tedavi", "Diş", "Tutar"],
      d.examinations.map(e => [fmtDate(e.tarih), e.hasta, e.tedavi, e.dis || "-", fmt(e.tutar)]));
    y = addPdfSection(doc, y, "Hasta Ödemeleri", ["Tarih", "Hasta", "Yöntem", "Tutar"],
      d.patientPayments.map(p => [fmtDate(p.tarih), p.hasta, METHOD_LABELS[p.yontem] || p.yontem, fmt(p.tutar)]));
    y = addPdfSection(doc, y, "Laboratuvar Faturaları", ["Tarih", "Lab", "Kalem", "Tutar"],
      d.labInvoices.map(i => [fmtDate(i.tarih), i.lab, i.kalem, fmt(i.tutar)]));
    addPdfSection(doc, y, "Doktora Yapılan Hakediş Ödemeleri", ["Tarih", "Açıklama", "Yöntem", "Tutar"],
      d.payoutExpenses.map(p => [fmtDate(p.tarih), p.aciklama || "-", METHOD_LABELS[p.yontem] || p.yontem, fmt(p.tutar)]));
    doc.save(`${detailFileName}.pdf`);
  };

  const totalKalan = months.reduce((s, m) => s + m.kalan, 0);
  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-black text-slate-900">Aylık Hakediş Dökümü (son 12 ay)</h3>
            <p className="mt-0.5 text-xs text-slate-500">Hakedilen: o ayki cirodan hesaplanan hakediş tutarı. Ödenen: o aya etiketlenmiş gider kayıtlarının toplamı. Kalan: hakedilen − ödenen.</p>
          </div>
          {months.length > 0 && (
            <span className={`rounded-full px-3 py-1 text-xs font-black ${totalKalan > 0.5 ? "bg-amber-100 text-amber-700" : totalKalan < -0.5 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>
              Toplam kalan: {fmt(totalKalan)}
            </span>
          )}
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Yükleniyor…</div>
        ) : months.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Bu doktor için hakediş verisi yok</div>
        ) : (
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 text-left">Ay</th>
              <th className="px-4 py-3 text-right">Hakedilen</th>
              <th className="px-4 py-3 text-right">Ödenen</th>
              <th className="px-4 py-3 text-right">Kalan</th>
              <th className="px-4 py-3 text-right">İşlem</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {months.map(m => {
                const isCurrentMonth = m.year === now.getFullYear() && m.month === now.getMonth() + 1;
                const isPayable = canPay && !isCurrentMonth && m.kalan > 0.5;
                return (
                  <tr key={`${m.year}-${m.month}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-800">
                      {AY_ADLARI[m.month - 1]} {m.year}
                      {isCurrentMonth && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">devam ediyor</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700">{fmt(m.hakedilen)}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-700">{fmt(m.odenen)}</td>
                    <td className={`px-4 py-3 text-right font-black ${isCurrentMonth ? "text-slate-400" : m.kalan > 0.5 ? "text-amber-700" : m.kalan < -0.5 ? "text-red-700" : "text-emerald-600"}`}>
                      {isCurrentMonth ? "—" : (
                        <span className="inline-flex items-center gap-1">
                          {fmt(m.kalan)}
                          {m.kalan > 0.5 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">borçlu</span>}
                          {m.kalan < -0.5 && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">fazla ödendi</span>}
                          {Math.abs(m.kalan) <= 0.5 && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">kapandı</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => openDetail(m.year, m.month)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50">Detay</button>
                        {isPayable && onPay && (
                          <button onClick={() => onPay(doctorId, m.year, m.month, m.kalan)} className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20">Öde</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={`Hakediş Detayı${detail ? ` — ${detail.doctor.fullName}` : ""}`}
        description={detail ? `${AY_ADLARI[detail.month - 1]} ${detail.year}` : undefined}
        size="xl"
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button onClick={exportExcel} disabled={!detail} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Excel</button>
          <button onClick={exportPdf} disabled={!detail} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50">PDF</button>
        </div>

        {detailLoading ? (
          <div className="py-16 text-center text-sm text-slate-400">Yükleniyor…</div>
        ) : !detail ? (
          <div className="py-16 text-center text-sm text-slate-400">Detay yüklenemedi</div>
        ) : (
          <div className="mt-4 space-y-5">
            <div className="grid divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="p-4">
                <p className="text-xs font-bold uppercase text-slate-500">Hakedilen</p>
                <p className="mt-1 text-xl font-black text-primary">{fmt(detail.summary.hakedilen)}</p>
              </div>
              <div className="p-4">
                <p className="text-xs font-bold uppercase text-slate-500">Ödenen</p>
                <p className="mt-1 text-xl font-black text-emerald-700">{fmt(detail.summary.odenen)}</p>
              </div>
              <div className="p-4">
                <p className="text-xs font-bold uppercase text-slate-500">Kalan</p>
                <p className="mt-1 text-xl font-black text-amber-700">{fmt(detail.summary.kalan)}</p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-black text-slate-900">Hakediş Hesaplama Dökümü</h3>
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-slate-100">
                    {hakedisBreakdownRows(detail).map(([label, value], i, arr) => (
                      <tr key={label} className={i === arr.length - 1 ? "bg-primary/10" : ""}>
                        <td className="px-4 py-2 text-slate-600">{label}</td>
                        <td className={`px-4 py-2 text-right font-bold ${i === arr.length - 1 ? "text-primary" : "text-slate-800"}`}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-black text-slate-900">Muayeneler / Tedaviler ({detail.examinations.length})</h3>
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 text-left">Tarih</th><th className="px-3 py-2 text-left">Hasta</th><th className="px-3 py-2 text-left">Tedavi</th><th className="px-3 py-2 text-left">Diş</th><th className="px-3 py-2 text-right">Tutar</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.examinations.length === 0
                      ? <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">Kayıt yok</td></tr>
                      : detail.examinations.map(e => (
                        <tr key={e.id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmtDate(e.tarih)}</td>
                          <td className="px-3 py-2 font-medium text-slate-700">{e.hasta}</td>
                          <td className="px-3 py-2 text-slate-600">{e.tedavi}</td>
                          <td className="px-3 py-2 text-slate-500">{e.dis || "—"}</td>
                          <td className="px-3 py-2 text-right font-bold text-slate-900">{fmt(e.tutar)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-black text-slate-900">Hasta Ödemeleri ({detail.patientPayments.length})</h3>
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 text-left">Tarih</th><th className="px-3 py-2 text-left">Hasta</th><th className="px-3 py-2 text-left">Yöntem</th><th className="px-3 py-2 text-right">Tutar</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.patientPayments.length === 0
                      ? <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">Kayıt yok</td></tr>
                      : detail.patientPayments.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmtDate(p.tarih)}</td>
                          <td className="px-3 py-2 font-medium text-slate-700">{p.hasta}</td>
                          <td className="px-3 py-2 text-slate-600">{METHOD_LABELS[p.yontem] || p.yontem}</td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmt(p.tutar)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-black text-slate-900">Laboratuvar Faturaları ({detail.labInvoices.length})</h3>
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 text-left">Tarih</th><th className="px-3 py-2 text-left">Lab</th><th className="px-3 py-2 text-left">Kalem</th><th className="px-3 py-2 text-right">Tutar</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.labInvoices.length === 0
                      ? <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">Kayıt yok</td></tr>
                      : detail.labInvoices.map(i => (
                        <tr key={i.id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmtDate(i.tarih)}</td>
                          <td className="px-3 py-2 font-medium text-slate-700">{i.lab}</td>
                          <td className="px-3 py-2 text-slate-600">{i.kalem}</td>
                          <td className="px-3 py-2 text-right font-bold text-red-700">{fmt(i.tutar)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-black text-slate-900">Doktora Yapılan Hakediş Ödemeleri ({detail.payoutExpenses.length})</h3>
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 text-left">Tarih</th><th className="px-3 py-2 text-left">Açıklama</th><th className="px-3 py-2 text-left">Yöntem</th><th className="px-3 py-2 text-right">Tutar</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.payoutExpenses.length === 0
                      ? <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">Kayıt yok</td></tr>
                      : detail.payoutExpenses.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmtDate(p.tarih)}</td>
                          <td className="px-3 py-2 text-slate-600">{p.aciklama || "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{METHOD_LABELS[p.yontem] || p.yontem}</td>
                          <td className="px-3 py-2 text-right font-bold text-primary">{fmt(p.tutar)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
