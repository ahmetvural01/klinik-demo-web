"use client";

import { useEffect, useState } from "react";
import { FormModal } from "@/components/ui/FormModal";
import { Callout } from "@/components/ui/Callout";
import { DescriptionList, type DescriptionItem } from "@/components/ui/DescriptionList";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { FormSkeleton } from "@/components/ui/PageSkeleton";
import { formatDateText } from "@/components/ui/Money";
import { formatCurrency } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/payment-methods";
import { escapeHtml, letterheadFooterHtml, letterheadHtml, loadPrintClinic, printDocument } from "@/lib/print-letterhead";
import { turkeyDateKey } from "@/lib/tz";

type Totals = {
  tahsilat: number;
  tahsilatCount: number;
  gider: number;
  giderCount: number;
  byMethod: Record<string, { in: number; out: number }>;
  byPos: { id: string; name: string; in: number; count: number }[];
  /** Tahsilatı kaydedene göre: kim ne kadar (ve ne kadar nakit) aldı. */
  byCollector?: { name: string; in: number; cash: number; count: number }[];
};

const METHOD_ORDER = ["NAKIT", "KREDI_KARTI", "MAIL_ORDER", "HAVALE_EFT", "DIGER"];

function summaryRows(totals: Totals) {
  const methods = METHOD_ORDER.filter((method) => (totals.byMethod[method]?.in || 0) > 0);
  const cashIn = totals.byMethod.NAKIT?.in || 0;
  const cashOut = totals.byMethod.NAKIT?.out || 0;
  const cashInDrawer = cashIn - cashOut;
  // Nakit gider nakit tahsilatı aştıysa fark kasadaki açılış parasından çıkmıştır:
  // "Kasada olması gereken: −₺90" yerine ne olduğu düz yazılır, tutar artı gösterilir.
  const cashLabel = cashInDrawer < -0.005 ? "Kasadan eksilen nakit (açılış parasından)" : "Kasada olması gereken nakit";
  return { methods, cashIn, cashOut, cashInDrawer, cashLabel };
}

/**
 * Gün sonu özeti (tek tık, yazdırılabilir): günün tahsilatı yönteme göre,
 * kartlı tahsilat POS'a göre (hangi bankaya ne geçecek), giderler ve kasada
 * olması gereken nakit (nakit tahsilat − nakitle ödenen gider). Rakamlar
 * Muhasebe › Gelir ve gider ile aynı kaynaktan (api/muhasebe/defter).
 */
export function DayEndModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [date, setDate] = useState(() => turkeyDateKey());
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !date) return;
    let cancelled = false;
    setTotals(null);
    setError(null);
    fetch(`/api/muhasebe/defter?from=${date}&to=${date}&take=1`, { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(json?.message || "Gün sonu özeti yüklenemedi.");
        return json?.totals as Totals;
      })
      .then((next) => { if (!cancelled) setTotals(next); })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : "Gün sonu özeti yüklenemedi."); });
    return () => { cancelled = true; };
  }, [open, date]);

  const dayLabel = formatDateText(`${date}T12:00:00.000Z`, "long");

  const print = async () => {
    if (!totals) return;
    const clinic = await loadPrintClinic();
    const { methods, cashIn, cashOut, cashInDrawer, cashLabel } = summaryRows(totals);
    const line = (label: string, value: string, strong = false) => `<tr${strong ? ' class="strong"' : ""}><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`;
    const body = `
      ${letterheadHtml(clinic, { title: "Gün sonu özeti", date: dayLabel, meta: [`Yazdırma: ${formatDateText(new Date(), "datetime")}`] })}
      <h3>Tahsilat</h3>
      <table>${methods.map((method) => line(paymentMethodLabel(method), formatCurrency(totals.byMethod[method].in))).join("")}
        ${line(`Toplam tahsilat (${totals.tahsilatCount} işlem)`, formatCurrency(totals.tahsilat), true)}</table>
      ${totals.byPos.length > 0 ? `<h3>Kartlı tahsilat · POS'a göre</h3><table>${totals.byPos.map((pos) => line(`${pos.name} (${pos.count} işlem)`, formatCurrency(pos.in))).join("")}</table>` : ""}
      ${(totals.byCollector || []).length > 0 ? `<h3>Kaydedene göre</h3><table>${(totals.byCollector || []).map((row) => line(`${row.name} (${row.count} işlem)`, `${formatCurrency(row.in)}${row.cash > 0 ? ` · nakit ${formatCurrency(row.cash)}` : ""}`)).join("")}</table>` : ""}
      <h3>Gider</h3>
      <table>${line(`Toplam gider (${totals.giderCount} kayıt)`, formatCurrency(totals.gider))}${cashOut > 0 ? line("Bunun nakit ödenen kısmı", formatCurrency(cashOut)) : ""}</table>
      <h3>Kasa</h3>
      <table>${line("Nakit tahsilat", formatCurrency(cashIn))}${line("Nakit ödenen gider", formatCurrency(cashOut))}${line(cashLabel, formatCurrency(Math.abs(cashInDrawer)), true)}</table>
      <div class="signs"><div>Kasayı teslim eden</div><div>Teslim alan</div></div>
      ${letterheadFooterHtml(clinic, "Kasa açılış bakiyesi bu özete dahil değildir.")}`;
    printDocument(`Gün sonu ${date}`, body, `
      h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #1e3a5f; margin: 14px 0 4px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      td { padding: 5px 0; border-bottom: 1px solid #e2e8f0; }
      td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
      tr.strong td { font-weight: 800; color: #0f172a; border-bottom: 1.5px solid #94a3b8; }
      .signs { display: flex; gap: 24px; margin-top: 36px; }
      .signs div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 3px; font-size: 9px; color: #64748b; text-align: center; }
    `);
  };

  const items: DescriptionItem[] = [];
  if (totals) {
    const { methods, cashIn, cashOut, cashInDrawer, cashLabel } = summaryRows(totals);
    for (const method of methods) items.push({ key: method, label: paymentMethodLabel(method), value: formatCurrency(totals.byMethod[method].in) });
    for (const pos of totals.byPos) items.push({ key: `pos-${pos.id}`, label: `· ${pos.name}`, value: `${formatCurrency(pos.in)} (${pos.count})` });
    items.push({ key: "tahsilat", label: `Toplam tahsilat (${totals.tahsilatCount})`, value: formatCurrency(totals.tahsilat), emphasis: true });
    // Kasa sorusu ("kim aldı?"): tahsilatı kaydeden personele göre.
    for (const row of totals.byCollector || []) {
      items.push({ key: `kaydeden-${row.name}`, label: `Kaydeden: ${row.name}`, value: `${formatCurrency(row.in)}${row.cash > 0 ? ` · nakit ${formatCurrency(row.cash)}` : ""}` });
    }
    items.push({ key: "gider", label: `Toplam gider (${totals.giderCount})`, value: formatCurrency(totals.gider) });
    if (cashOut > 0 || cashIn > 0) items.push({ key: "kasa", label: cashLabel, value: formatCurrency(Math.abs(cashInDrawer)), emphasis: true });
  }

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Gün sonu özeti"
      description={dayLabel}
      size="md"
      onSubmit={() => void print()}
      submitLabel="Yazdır"
      cancelLabel="Kapat"
      submitDisabled={!totals}
    >
      <FormField label="Gün" htmlFor="day-end-date">
        <Input id="day-end-date" type="date" max={turkeyDateKey()} value={date} onChange={(event) => setDate(event.target.value)} />
      </FormField>
      {error ? (
        <Callout tone="critical" compact>{error}</Callout>
      ) : !totals ? (
        <FormSkeleton fields={4} columns={1} footer={false} />
      ) : totals.tahsilatCount === 0 && totals.giderCount === 0 ? (
        <Callout tone="info" compact>Bu gün tahsilat ya da gider kaydı yok.</Callout>
      ) : (
        <DescriptionList layout="rows" items={items} />
      )}
      <p className="text-xs text-slate-500">Kasa açılış bakiyesi dahil değildir; kasada olması gereken = nakit tahsilat − nakitle ödenen gider.</p>
    </FormModal>
  );
}
