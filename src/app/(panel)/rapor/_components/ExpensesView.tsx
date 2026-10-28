"use client";

import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/PageSkeleton";
import { Section } from "@/components/ui/Section";
import type { ExpensesReport } from "@/lib/report-center-types";
import { BarList, BarListSkeleton, money } from "./report-ui";

function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return <Button variant="ghost" size="sm" href={href} icon={ArrowRight} iconPosition="right">{children}</Button>;
}

function TotalLine({ amount }: { amount: number }) {
  return (
    <p className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-slate-600">Toplam</span>
      <b className="tabular-nums text-slate-900">{money(amount)}</b>
    </p>
  );
}

type Props = {
  /** null: ilk yükleme (iskelet). */
  data: ExpensesReport | null;
  /** Muhasebe'de bu dönemin giderleri (finance:center + finance:read). */
  expensesHref?: string;
  /** Satın alma sayfası (finance:read). */
  purchasesHref?: string;
};

/** Giderler: kliniğin geneli (doktora göre ayrılmaz) — gider türleri ve tedarikçi alımları, her biri toplamıyla. */
export function ExpensesView({ data, expensesHref, purchasesHref }: Props) {
  const loading = !data;
  const showExpenses = loading || data.expenseByCategory.length > 0;
  const showPurchases = loading || data.purchasesBySupplier.length > 0;

  if (!showExpenses && !showPurchases) {
    return <Section><EmptyState title="Bu dönemde gider yok" compact /></Section>;
  }

  return (
    <div className={`grid gap-3 ${showExpenses && showPurchases ? "lg:grid-cols-2" : ""}`}>
      {showExpenses && (
        <Section
          title="Gider türleri"
          actions={expensesHref ? <SectionLink href={expensesHref}>Giderleri listele</SectionLink> : undefined}
          footer={loading ? <Skeleton className="h-5 w-full" /> : <TotalLine amount={data.expenseTotal} />}
        >
          {loading ? <BarListSkeleton /> : (
            <BarList tone="neutral" rows={data.expenseByCategory.map((row) => ({ label: row.name, value: row.amount, display: money(row.amount) }))} />
          )}
        </Section>
      )}
      {showPurchases && (
        <Section
          title="Tedarikçi alımları"
          actions={purchasesHref ? <SectionLink href={purchasesHref}>Satın alma</SectionLink> : undefined}
          footer={loading ? <Skeleton className="h-5 w-full" /> : <TotalLine amount={data.purchaseTotal} />}
        >
          {loading ? <BarListSkeleton rows={3} /> : (
            <BarList tone="neutral" rows={data.purchasesBySupplier.map((row) => ({ label: row.name, value: row.amount, display: money(row.amount) }))} />
          )}
        </Section>
      )}
    </div>
  );
}
