"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { ActiveFilters, Toolbar } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyValue, ListTable, type ListSort, type ListTableColumn } from "@/components/ui/ListTable";
import { createModuleEmptyIcon } from "@/components/ui/ModuleIcon";
import { useLatestRequest } from "@/lib/use-latest-request";
import { InvoiceCreateModal } from "@/components/superadmin/InvoiceCreateModal";
import { InvoiceRowActions } from "@/components/superadmin/InvoiceRowActions";
import { EMPTY_INVOICE_SUMMARY, type InvoiceSummary, type InvoiceViewStatus } from "@/components/superadmin/invoice-status";
import { INVOICE_STATUS_META } from "@/components/superadmin/sa-labels";
import { count, daysUntil, money, shortDate } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet } from "@/components/superadmin/sa-fetch";

const InvoiceEmptyIcon = createModuleEmptyIcon("hakediş");
const PAGE_SIZE = 25;

type Invoice = {
  id: string;
  invoiceNo: string;
  amount: number;
  status: InvoiceViewStatus;
  description: string | null;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
  institutionId: string;
  institution: { id: string; name: string; subscriptionPlan: string; billingCycle: string } | null;
  lastReminderAt: string | null;
  reminderCount: number;
};

const STATUS_KEYS = ["OPEN", "OVERDUE", "PENDING", "PAID", "CANCELLED", "ALL"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

/**
 * Faturalar — kliniklere kesilen platform faturaları. Varsayılan görünüm iş
 * kuyruğu: ödenmemiş (bekleyen + gecikmiş) faturalar, vadesi en eski üstte.
 * Durum, Kontrol Paneli ve klinik dosyasıyla AYNI kuraldan türetilir; iptal
 * edilen fatura hiçbir borç toplamına girmez. Satır eylemleri (Tahsil edildi,
 * Hatırlat, İptal et) yalnız açık faturada görünür.
 */
export default function InvoicesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const institutionId = searchParams.get("institutionId") || "";
  const [status, setStatus] = useTabParam(STATUS_KEYS, "OPEN", "status");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary>(EMPTY_INVOICE_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ListSort>({ key: "dueDate", dir: "asc" });
  const [createOpen, setCreateOpen] = useState(false);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const beginLoad = useLatestRequest();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => { setPage(1); }, [debouncedQuery, status, institutionId]);

  // Paneldeki "Yeni fatura" ve kısayollar (?yeni=1) formu açar.
  useEffect(() => {
    if (searchParams.get("yeni") === "1") {
      setCreateOpen(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("yeni");
      router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
    }
  }, [pathname, router, searchParams]);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const request = beginLoad();
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (institutionId) params.set("institutionId", institutionId);
    saGet<{ invoices: Invoice[]; summary: InvoiceSummary }>(`/api/superadmin/invoices?${params.toString()}`, "Faturalar yüklenemedi.", request.signal)
      .then((data) => {
        if (!request.isLatest()) return;
        const list = Array.isArray(data?.invoices) ? data.invoices : [];
        setInvoices(list);
        setSummary(data?.summary ?? EMPTY_INVOICE_SUMMARY);
        if (institutionId && list[0]?.institution?.name) setClinicName(list[0].institution.name);
      })
      .catch((error) => {
        if (isAbort(error) || !request.isLatest()) return;
        setLoadError(errorMessage(error, "Faturalar yüklenemedi."));
      })
      .finally(() => {
        if (request.isLatest()) setLoading(false);
      });
  }, [beginLoad, debouncedQuery, institutionId, status, reloadKey]);

  // Klinik filtresiyle gelindiyse ve listede o kliniğin faturası yoksa adını ayrıca öğren.
  useEffect(() => {
    if (!institutionId) {
      setClinicName(null);
      return;
    }
    const controller = new AbortController();
    saGet<{ name: string }>(`/api/superadmin/institutions/${institutionId}`, "", controller.signal)
      .then((data) => setClinicName(data?.name ?? null))
      .catch(() => undefined);
    return () => controller.abort();
  }, [institutionId]);

  const clearInstitution = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("institutionId");
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  };

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const time = (value: string | null) => (value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER);
    return [...invoices].sort((a, b) => {
      if (sort.key === "amount") return (a.amount - b.amount) * dir;
      if (sort.key === "createdAt") return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      return (time(a.dueDate) - time(b.dueDate)) * dir;
    });
  }, [invoices, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const rows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const changeSort = (key: string) => setSort((current) => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }));

  const dueCell = (row: Invoice) => {
    const date = shortDate(row.dueDate);
    if (!date) return <EmptyValue />;
    const days = daysUntil(row.dueDate);
    const open = row.status === "PENDING" || row.status === "OVERDUE";
    return (
      <div>
        <p className="tabular-nums">{date}</p>
        {open && days != null && (
          <p className={`text-xs ${days < 0 ? "font-semibold text-red-700" : days <= 7 ? "text-amber-700" : "text-slate-500"}`}>
            {days < 0 ? `${-days} gün geçti` : days === 0 ? "Bugün" : `${days} gün kaldı`}
          </p>
        )}
      </div>
    );
  };

  const statusCell = (row: Invoice) => (
    <div>
      <Badge tone={INVOICE_STATUS_META[row.status].tone}>{INVOICE_STATUS_META[row.status].label}</Badge>
      {row.status === "PAID" && row.paidAt && <p className="mt-0.5 text-xs text-slate-500">{shortDate(row.paidAt)}</p>}
      {(row.status === "PENDING" || row.status === "OVERDUE") && row.reminderCount > 0 && (
        <p className="mt-0.5 text-xs text-slate-500">{row.reminderCount} hatırlatma · son {shortDate(row.lastReminderAt)}</p>
      )}
    </div>
  );

  const actions = (row: Invoice) => (
    <InvoiceRowActions
      invoice={{ id: row.id, invoiceNo: row.invoiceNo, amount: row.amount, status: row.status, institutionName: row.institution?.name, lastReminderAt: row.lastReminderAt, reminderCount: row.reminderCount }}
      onChanged={reload}
    />
  );

  const columns: ListTableColumn<Invoice>[] = [
    {
      key: "clinic",
      header: "Klinik",
      render: (row) => (
        <div className="min-w-0">
          {row.institution ? (
            <Link href={`/superadmin/institutions/${row.institution.id}?tab=faturalar`} className="font-semibold text-slate-900 hover:text-primary hover:underline">{row.institution.name}</Link>
          ) : <EmptyValue />}
          <p className="truncate text-xs text-slate-500">{row.description || "Platform faturası"} · {row.invoiceNo}</p>
        </div>
      ),
    },
    { key: "amount", header: "Tutar", align: "right", sortKey: "amount", render: (row) => <span className="font-semibold tabular-nums">{money(row.amount)}</span> },
    { key: "dueDate", header: "Vade", sortKey: "dueDate", render: dueCell },
    { key: "status", header: "Durum", render: statusCell },
    { key: "actions", header: "", align: "right", render: actions },
  ];

  const tabItems = [
    { key: "OPEN" as const, label: "Ödenmemiş", count: summary.openCount },
    { key: "OVERDUE" as const, label: "Gecikmiş", count: summary.overdueCount, countTone: "critical" as const },
    { key: "PENDING" as const, label: "Vadesi gelmemiş", count: summary.upcomingCount },
    { key: "PAID" as const, label: "Ödendi", count: summary.paidCount },
    { key: "CANCELLED" as const, label: "İptal", count: summary.cancelledCount },
    { key: "ALL" as const, label: "Tümü" },
  ];

  const filters = institutionId ? [{ key: "clinic", label: `Klinik: ${clinicName || "seçili klinik"}`, onRemove: clearInstitution }] : [];
  const emptyText = debouncedQuery || institutionId ? "Bu aramaya uyan fatura yok" : status === "OPEN" ? "Ödenmemiş fatura yok" : status === "OVERDUE" ? "Gecikmiş fatura yok" : "Fatura yok";

  return (
    <section className="space-y-4">
      <PageHeader
        icon="hakediş"
        title="Faturalar"
        description="Kliniklere kesilen platform faturaları: tahsilat, hatırlatma ve iptal."
        stats={[
          { label: "Gecikmiş", value: money(summary.overdueAmount), color: summary.overdueAmount > 0 ? "text-red-700" : undefined },
          { label: "Vadesi gelmemiş", value: money(summary.upcomingAmount) },
          { label: "Bu ay tahsil edilen", value: money(summary.paidThisMonthAmount), color: "text-emerald-700" },
        ]}
        actions={<Button icon={Plus} onClick={() => setCreateOpen(true)}>Yeni fatura</Button>}
      />

      <Tabs ariaLabel="Fatura durumu" size="sm" items={tabItems} value={status as StatusKey} onChange={setStatus} />

      <ListTable<Invoice>
        header={
          <>
            <Toolbar>
              <SearchInput value={query} onChange={setQuery} placeholder="Klinik adı, fatura no veya açıklama" slashShortcut wrapperClassName="flex-1 min-w-[220px]" />
            </Toolbar>
            {filters.length > 0 && <div className="px-3 pb-2.5"><ActiveFilters filters={filters} /></div>}
          </>
        }
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading}
        error={loadError}
        onRetry={reload}
        sort={sort}
        onSortChange={changeSort}
        rowClassName={(row) => (row.status === "CANCELLED" ? "opacity-60" : "")}
        emptyText={emptyText}
        emptyDescription={status === "OPEN" && !debouncedQuery ? "Tüm faturalar ödenmiş ya da iptal edilmiş." : undefined}
        emptyIcon={InvoiceEmptyIcon}
        emptyIllustrative
        pager={{ page, pageCount, pageSize: PAGE_SIZE, total: sorted.length, onPageChange: setPage }}
        mobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{row.institution?.name || "—"}</p>
                <p className="truncate text-xs text-slate-500">{row.description || "Platform faturası"}</p>
              </div>
              <Badge tone={INVOICE_STATUS_META[row.status].tone}>{INVOICE_STATUS_META[row.status].label}</Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold tabular-nums text-slate-900">{money(row.amount)}</p>
                <p className="text-xs text-slate-500">Vade {shortDate(row.dueDate) || "—"}{row.reminderCount > 0 ? ` · ${count(row.reminderCount)} hatırlatma` : ""}</p>
              </div>
              {actions(row)}
            </div>
          </div>
        )}
      />

      <InvoiceCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={reload}
        existingInvoices={invoices.map((row) => ({ institutionId: row.institutionId, description: row.description, status: row.status, invoiceNo: row.invoiceNo }))}
      />
    </section>
  );
}
