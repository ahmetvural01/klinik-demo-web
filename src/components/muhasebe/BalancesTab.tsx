"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { ListTable, EmptyValue, type ListSort, type ListTableColumn } from "@/components/ui/ListTable";
import { Toolbar } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { downloadCsv } from "@/lib/csv-export";
import { formatPhoneNumber } from "@/lib/format";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import { money, shortDate } from "@/components/muhasebe/muhasebe-utils";
import { ExportMenu } from "@/components/muhasebe/ExportMenu";

type BalanceRow = {
  id: string;
  fullName: string;
  phone: string;
  netTedavi: number;
  odenen: number;
  bakiye: number;
  discountRate: number;
  doctors: { id: string; fullName: string }[];
  lastDoctorId: string | null;
  lastPaymentAt: string | null;
  lastTreatmentAt: string | null;
  plan: { kalan: number; nextDueDate: string | null; nextDueAmount: number; overdueCount: number; doctorId: string | null; planCount: number } | null;
};

type View = "borclu" | "avans";
const PAGE_SIZE = 50;

function daysAgo(value: string | null) {
  if (!value) return "";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "Bugün";
  if (days === 1) return "Dün";
  if (days < 60) return `${days} gün önce`;
  return shortDate(value);
}

const lastMovement = (row: BalanceRow) => {
  const payment = row.lastPaymentAt ? new Date(row.lastPaymentAt).getTime() : 0;
  const treatment = row.lastTreatmentAt ? new Date(row.lastTreatmentAt).getTime() : 0;
  if (!payment && !treatment) return { at: null as string | null, label: "" };
  return payment >= treatment ? { at: row.lastPaymentAt, label: "son ödeme" } : { at: row.lastTreatmentAt, label: "son tedavi" };
};

type Props = {
  canWritePayments: boolean;
  canReadPatients: boolean;
  canSeePatientPhone: boolean;
  canReadInstallments: boolean;
  refreshKey: number;
  onCollect: (patient: PickedPatient, doctorId?: string) => void;
  onOpenPlans: (patientName: string) => void;
};

export function BalancesTab({ canWritePayments, canReadPatients, canSeePatientPhone, canReadInstallments, refreshKey, onCollect, onOpenPlans }: Props) {
  const [view, setView] = useState<View>("borclu");
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ListSort>({ key: "bakiye", dir: "desc" });
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/muhasebe/alacaklar${view === "avans" ? "?durum=avans" : ""}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Hasta bakiyeleri yüklenemedi.");
      setRows(Array.isArray(body?.rows) ? body.rows : []);
    } catch (loadError) {
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : "Hasta bakiyeleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => { setPage(1); }, [search, view, sort]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    const list = q
      ? rows.filter((row) =>
          row.fullName.toLocaleLowerCase("tr").includes(q)
          || (row.phone || "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "\u0000")
          || row.doctors.some((doctor) => doctor.fullName.toLocaleLowerCase("tr").includes(q)))
      : rows;
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.key === "son") {
        const at = (row: BalanceRow) => { const value = lastMovement(row).at; return value ? new Date(value).getTime() : 0; };
        return (at(a) - at(b)) * direction;
      }
      if (sort.key === "hasta") return a.fullName.localeCompare(b.fullName, "tr") * direction;
      return (Math.abs(a.bakiye) - Math.abs(b.bakiye)) * direction;
    });
  }, [rows, search, sort]);

  const total = filtered.reduce((sum, row) => sum + Math.abs(row.bakiye), 0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const collect = (row: BalanceRow) => onCollect(
    { id: row.id, fullName: row.fullName, phone: row.phone || null },
    row.plan?.doctorId || row.lastDoctorId || (row.doctors.length === 1 ? row.doctors[0].id : undefined),
  );

  const nameCell = (row: BalanceRow) => (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        {canReadPatients
          ? <Link href={`/hasta-detay?id=${encodeURIComponent(row.id)}&tab=odeme`} className="font-semibold text-slate-900 hover:text-primary hover:underline">{row.fullName}</Link>
          : <span className="font-semibold text-slate-900">{row.fullName}</span>}
        {row.discountRate > 0 && <Badge tone="success">%{row.discountRate} indirim</Badge>}
      </div>
      {canSeePatientPhone && row.phone && <p className="text-xs text-slate-500">{formatPhoneNumber(row.phone)}</p>}
    </div>
  );

  const planCell = (row: BalanceRow) => {
    if (!row.plan) return <EmptyValue />;
    const content = (
      <span className="text-left">
        <span className="block text-sm text-slate-700">Kalan {money(row.plan.kalan)}</span>
        <span className="block text-xs text-slate-500">
          {row.plan.nextDueDate ? `Sonraki vade ${shortDate(row.plan.nextDueDate)}` : "Vade yok"}
          {row.plan.overdueCount > 0 && <Badge tone="critical" className="ml-1.5">{row.plan.overdueCount} gecikmiş</Badge>}
        </span>
      </span>
    );
    return canReadInstallments
      ? <button type="button" onClick={() => onOpenPlans(row.fullName)} className="rounded-md text-left hover:bg-slate-50" title="Bu hastanın taksit planını aç">{content}</button>
      : content;
  };

  const actionsCell = (row: BalanceRow) => (
    view === "borclu" && canWritePayments
      ? <div className="flex justify-end"><IconButton icon={Wallet} title={`${row.fullName} için tahsilat al`} tone="primary" size="sm" onClick={() => collect(row)} /></div>
      : null
  );

  const columns: ListTableColumn<BalanceRow>[] = [
    { key: "hasta", header: "Hasta", sortKey: "hasta", render: nameCell },
    {
      key: "hekim",
      header: "Doktor",
      render: (row) => row.doctors.length
        ? <span className="line-clamp-2 text-sm text-slate-600">{row.doctors.map((doctor) => doctor.fullName).join(", ")}</span>
        : <EmptyValue />,
    },
    {
      key: "bakiye",
      header: view === "avans" ? "Fazla ödeme" : "Kalan borç",
      align: "right",
      sortKey: "bakiye",
      render: (row) => (
        <div className="text-right">
          <p className={`font-bold tabular-nums ${view === "avans" ? "text-emerald-700" : "text-slate-900"}`}>{money(Math.abs(row.bakiye))}</p>
          <p className="text-xs text-slate-400">Ödenen {money(row.odenen)} / {money(row.netTedavi)}</p>
        </div>
      ),
    },
    ...(canReadInstallments ? [{ key: "plan", header: "Taksit planı", render: planCell }] : []),
    {
      key: "son",
      header: "Son hareket",
      sortKey: "son",
      render: (row) => {
        const last = lastMovement(row);
        return last.at
          ? <div><p className="text-sm text-slate-700">{daysAgo(last.at)}</p><p className="text-xs text-slate-400">{last.label}</p></div>
          : <EmptyValue />;
      },
    },
    { key: "islem", header: "", align: "right", render: actionsCell },
  ];

  const exportExcel = () => {
    downloadCsv(view === "avans" ? "fazla-odeme-yapan-hastalar.csv" : "hasta-alacaklari.csv", filtered.map((row) => ({
      Hasta: row.fullName,
      Telefon: canSeePatientPhone ? row.phone || "" : "",
      Doktor: row.doctors.map((doctor) => doctor.fullName).join(" / "),
      "Tedavi (indirimli)": row.netTedavi.toFixed(2).replace(".", ","),
      Ödenen: row.odenen.toFixed(2).replace(".", ","),
      [view === "avans" ? "Fazla ödeme" : "Kalan borç"]: Math.abs(row.bakiye).toFixed(2).replace(".", ","),
      "Taksit planı kalanı": row.plan ? row.plan.kalan.toFixed(2).replace(".", ",") : "",
      "Son hareket": lastMovement(row).at ? shortDate(lastMovement(row).at) : "",
    })));
  };

  return (
    <div className="space-y-3">
      <Toolbar actions={<ExportMenu onExcel={exportExcel} disabled={filtered.length === 0} />}>
        <SearchInput value={search} onChange={setSearch} placeholder="Hasta adı, telefon veya doktor ara" wrapperClassName="flex-1 min-w-[220px]" />
        <Select aria-label="Gösterilecek hastalar" size="sm" value={view} onChange={(event) => setView(event.target.value as View)} className="sm:w-auto">
          <option value="borclu">Borcu olan hastalar</option>
          <option value="avans">Fazla ödeme yapan hastalar</option>
        </Select>
      </Toolbar>
      <ListTable
        columns={columns}
        rows={pageRows}
        rowKey={(row) => row.id}
        loading={loading}
        error={error || null}
        onRetry={() => void load()}
        sort={sort}
        onSortChange={(key) => setSort((current) => ({ key, dir: current.key === key && current.dir === "desc" ? "asc" : "desc" }))}
        header={(
          <div className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
            {loading && rows.length === 0 ? "Bakiyeler hesaplanıyor…" : (
              <>
                <b className="text-slate-900">{filtered.length}</b> hasta · {view === "avans" ? "Toplam fazla ödeme" : "Toplam alacak"} <b className={`tabular-nums ${view === "avans" ? "text-emerald-700" : "text-slate-900"}`}>{money(total)}</b>
                <span className="ml-2 hidden text-xs text-slate-400 sm:inline">Kalan borç = indirimli tedavi tutarı − alınan tahsilatlar (taksit tahsilatları dahil).</span>
              </>
            )}
          </div>
        )}
        emptyText={search ? "Aramaya uyan hasta yok" : view === "avans" ? "Fazla ödeme yapan hasta yok" : "Borcu olan hasta yok"}
        emptyDescription={search ? "Arama metnini değiştirip tekrar deneyin." : undefined}
        emptyAction={search ? <Button size="sm" variant="secondary" onClick={() => setSearch("")}>Aramayı temizle</Button> : undefined}
        mobileCard={(row) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {nameCell(row)}
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {row.doctors.map((doctor) => doctor.fullName).join(", ") || "Doktor yok"}
                {lastMovement(row).at ? ` · ${daysAgo(lastMovement(row).at)}` : ""}
              </p>
              {row.plan && (
                <p className="mt-0.5 text-xs text-slate-500">
                  Taksit kalanı {money(row.plan.kalan)}
                  {row.plan.overdueCount > 0 && <Badge tone="critical" className="ml-1.5">{row.plan.overdueCount} gecikmiş</Badge>}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className={`font-bold tabular-nums ${view === "avans" ? "text-emerald-700" : "text-slate-900"}`}>{money(Math.abs(row.bakiye))}</span>
              {view === "borclu" && canWritePayments && (
                <Button size="sm" variant="secondary" icon={Wallet} onClick={() => collect(row)}>Tahsilat al</Button>
              )}
            </div>
          </div>
        )}
        pager={filtered.length > PAGE_SIZE ? { page, pageCount, pageSize: PAGE_SIZE, total: filtered.length, onPageChange: setPage } : undefined}
      />
    </div>
  );
}
