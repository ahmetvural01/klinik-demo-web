"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { FormSkeleton } from "@/components/ui/PageSkeleton";
import { Money, formatDateText } from "@/components/ui/Money";
import { Section } from "@/components/ui/Section";

type InvoiceStatus = "PENDING" | "OVERDUE" | "PAID" | "CANCELLED";
type InvoiceRow = { id: string; description: string | null; amount: number; status: InvoiceStatus; dueDate: string | null; paidAt: string | null; createdAt: string };
type BillingData = {
  plan: { label: string; cycle: "AYLIK" | "YILLIK"; price: number | null; unitPrice: number | null; branchCount: number; isDemo: boolean };
  invoices: InvoiceRow[];
  openTotal: number;
  paymentInstructions: string;
};

const STATUS: Record<InvoiceStatus, { label: string; tone: "warning" | "critical" | "success" | "neutral" }> = {
  PENDING: { label: "Ödenecek", tone: "warning" },
  OVERDUE: { label: "Gecikti", tone: "critical" },
  PAID: { label: "Ödendi", tone: "success" },
  CANCELLED: { label: "İptal", tone: "neutral" },
};

/**
 * Ayarlar › Abonelik (yalnız klinik yöneticisi): plan ücreti, platform
 * faturaları (aylık abonelik, SMS paketi) ve nasıl ödeneceği. Önceden klinik
 * yalnız "ödeme süreniz doluyor" uyarısını görüyor, neyi ne kadar ödeyeceğini
 * hiçbir ekranda göremiyordu.
 */
export default function AbonelikTab() {
  const [data, setData] = useState<BillingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/billing", { cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.message || "Abonelik bilgisi yüklenemedi");
      setData(json as BillingData);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Abonelik bilgisi yüklenemedi");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (error && !data) return <LoadErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <FormSkeleton fields={4} columns={2} footer={false} />;

  const { plan } = data;
  const yearly = plan.cycle === "YILLIK";
  const columns: ListTableColumn<InvoiceRow>[] = [
    { key: "description", header: "Açıklama", render: (row) => <span className="font-medium text-slate-900">{row.description || "Platform faturası"}</span> },
    { key: "amount", header: "Tutar", align: "right", render: (row) => <Money value={row.amount} className="font-semibold" /> },
    { key: "dueDate", header: "Son ödeme", render: (row) => (row.dueDate ? formatDateText(row.dueDate) : "—") },
    {
      key: "status",
      header: "Durum",
      render: (row) => (
        <span className="inline-flex items-center gap-2">
          <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
          {row.status === "PAID" && row.paidAt && <span className="text-xs text-slate-500">{formatDateText(row.paidAt)}</span>}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Section title="Plan">
        <DescriptionList
          layout="rows"
          items={[
            { key: "plan", label: "Plan", value: `${plan.label} · ${yearly ? "yıllık" : "aylık"}` },
            {
              key: "price",
              label: yearly ? "Yıllık ücret" : "Aylık ücret",
              hidden: plan.isDemo,
              value: plan.price === null
                ? "Size özel teklif"
                : (
                  <>
                    <Money value={plan.price} className="font-semibold" />
                    {plan.branchCount > 1 && plan.unitPrice !== null && <span className="text-xs text-slate-500"> ({plan.branchCount} şube)</span>}
                  </>
                ),
            },
            {
              key: "when",
              label: "Fatura",
              hidden: plan.isDemo || plan.price === null,
              value: yearly ? "Yılda bir, dönem başında kesilir; 7 gün içinde ödenir." : "Her ayın 1'inde kesilir; 7 gün içinde ödenir.",
            },
            { key: "demo", label: "Durum", hidden: !plan.isDemo, value: "Deneme hesabı — fatura kesilmez" },
            {
              key: "open",
              label: "Ödenecek",
              value: data.openTotal > 0 ? <Money value={data.openTotal} className="font-semibold text-amber-700" /> : <span className="text-emerald-700">Borç yok</span>,
            },
          ]}
        />
      </Section>

      <Section title="Nasıl ödenir">
        {data.paymentInstructions ? (
          <p className="whitespace-pre-line text-sm text-slate-800">{data.paymentInstructions}</p>
        ) : (
          <p className="text-sm text-slate-600">
            Ödeme bilgisi için{" "}
            <Link href="/destek?yeni=1&konu=Fatura" className="font-semibold text-primary hover:underline">Destek&apos;e yazın</Link>.
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">Açıklamaya klinik adınızı yazın. Ödeme işlendiğinde fatura “Ödendi” olur ve uyarı kalkar.</p>
      </Section>

      <ListTable
        title="Faturalar"
        subtitle="Ödenecek faturaların hepsi ve kapanan son 12 fatura"
        columns={columns}
        rows={data.invoices}
        rowKey={(row) => row.id}
        emptyText="Henüz fatura yok"
        rowClassName={(row) => (row.status === "CANCELLED" ? "opacity-60" : "")}
        mobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-semibold text-slate-900">{row.description || "Platform faturası"}</p>
              <Money value={row.amount} className="shrink-0 font-semibold" />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>Son ödeme {row.dueDate ? formatDateText(row.dueDate) : "—"}</span>
              <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
            </div>
          </div>
        )}
      />
    </div>
  );
}
