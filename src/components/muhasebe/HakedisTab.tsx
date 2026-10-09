"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileText, Wallet } from "lucide-react";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { HakedisMonthlyPanel } from "@/components/hakedis/HakedisMonthlyPanel";
import { FinanceDoctorSelect } from "@/components/muhasebe/FinanceDoctorSelect";
import { money, monthName } from "@/components/muhasebe/muhasebe-utils";

type OverviewRow = {
  doctor: { id: string; fullName: string; isActive?: boolean };
  odenecek: number;
  odenecekAy: number;
  enEskiOdenmemis: { year: number; month: number; kalan: number } | null;
  negatifAy: number;
  buAy: { ciro: number; hakedilen: number; odenen: number; kalan: number };
};

type Props = {
  selectedDoctorId: string;
  onSelectDoctor: (doctorId: string) => void;
  canPay: boolean;
  onPay: (doctorId: string, year: number, month: number, kalan: number) => void;
  refreshKey: number;
};

/**
 * Muhasebe > Hakediş. Genel bakış "kime ne ödenecek" sorusunu cevaplar:
 * kapanmış ayların ödenmemiş kalanı ve en eski ödenmemiş ay. İçinde
 * bulunulan ay yalnız bilgi olarak (soluk) gösterilir; ay kapanınca ödenir.
 */
export function HakedisTab({ selectedDoctorId, onSelectDoctor, canPay, onPay, refreshKey }: Props) {
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/hakedis/ozet", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body?.doctors)) throw new Error(body?.message || "Hakediş özeti yüklenemedi.");
      setRows(body.doctors as OverviewRow[]);
    } catch (loadError) {
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : "Hakediş özeti yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!selectedDoctorId) void load(); }, [load, selectedDoctorId, refreshKey]);

  if (selectedDoctorId) {
    return (
      <div className="space-y-3">
        <div className="ui-toolbar flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center">
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => onSelectDoctor("")}>Tüm doktorlar</Button>
          <div className="sm:w-72">
            <FinanceDoctorSelect value={selectedDoctorId} onChange={(id) => onSelectDoctor(id)} size="sm" aria-label="Doktor" />
          </div>
        </div>
        <HakedisMonthlyPanel doctorId={selectedDoctorId} canPay={canPay} onPay={onPay} refreshToken={refreshKey} />
      </div>
    );
  }

  const totalPayable = rows.reduce((sum, row) => sum + (row.odenecek || 0), 0);
  const payableDoctors = rows.filter((row) => row.odenecek > 0.5).length;

  const payOldest = (row: OverviewRow) => {
    if (!row.enEskiOdenmemis) return;
    onPay(row.doctor.id, row.enEskiOdenmemis.year, row.enEskiOdenmemis.month, row.enEskiOdenmemis.kalan);
  };

  const actions = (row: OverviewRow) => (
    <div className="flex items-center justify-end gap-1.5">
      <IconButton icon={FileText} size="sm" title={`${row.doctor.fullName} — aylık dökümü aç`} onClick={() => onSelectDoctor(row.doctor.id)} />
      {canPay && row.enEskiOdenmemis && (
        <Button size="sm" variant="secondary" icon={Wallet} onClick={() => payOldest(row)}>
          {monthName(row.enEskiOdenmemis.year, row.enEskiOdenmemis.month).split(" ")[0]} öde
        </Button>
      )}
    </div>
  );

  const doctorCell = (row: OverviewRow) => (
    <div className="min-w-0">
      <p className="font-semibold text-slate-900">
        {row.doctor.fullName}
        {row.doctor.isActive === false && <Badge tone="neutral" className="ml-1.5 align-middle">Ayrıldı</Badge>}
      </p>
      {row.negatifAy > 0 && <p className="text-xs text-slate-500">{row.negatifAy} ayda laboratuvar gideri doktor payını aştı</p>}
    </div>
  );

  const columns: ListTableColumn<OverviewRow>[] = [
    { key: "doktor", header: "Doktor", render: doctorCell },
    {
      key: "odenecek",
      header: "Ödenecek",
      align: "right",
      render: (row) => (row.odenecek > 0.5 ? (
        <div className="text-right">
          <p className="font-bold tabular-nums text-slate-900">{money(row.odenecek)}</p>
          <p className="text-xs text-slate-400">{row.odenecekAy} kapanmış ay</p>
        </div>
      ) : <span className="text-sm text-slate-500">Borç yok</span>),
    },
    {
      key: "enEski",
      header: "En eski ödenmemiş ay",
      render: (row) => (row.enEskiOdenmemis
        ? <span className="text-sm text-slate-700">{monthName(row.enEskiOdenmemis.year, row.enEskiOdenmemis.month)} · {money(row.enEskiOdenmemis.kalan)}</span>
        : <EmptyValue />),
    },
    {
      key: "buAy",
      header: "Bu ay biriken",
      align: "right",
      render: (row) => <span className="text-sm tabular-nums text-slate-500" title="İçinde bulunulan ay; ay kapanınca ödenir.">{money(row.buAy?.hakedilen ?? 0)}</span>,
    },
    { key: "islem", header: "", align: "right", render: actions },
  ];

  return (
    <ListTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.doctor.id}
      loading={loading}
      error={error || null}
      onRetry={() => void load()}
      onRowClick={(row) => onSelectDoctor(row.doctor.id)}
      getRowAriaLabel={(row) => `${row.doctor.fullName} hakediş dökümünü aç`}
      header={(
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-slate-100 px-4 py-3 text-sm">
          {loading && rows.length === 0 ? (
            <span className="text-slate-400">Hakedişler hesaplanıyor…</span>
          ) : (
            <span className="text-slate-500">
              Toplam ödenecek <b className="tabular-nums text-slate-900">{money(totalPayable)}</b>
              {payableDoctors > 0 && <span className="ml-1 text-xs text-slate-400">({payableDoctors} doktor)</span>}
            </span>
          )}
          <span className="text-xs text-slate-400">Yalnız kapanmış aylar ödenir; içinde bulunulan ay bilgi amaçlıdır.</span>
        </div>
      )}
      emptyText="Hakediş hesaplanacak doktor yok"
      emptyDescription="Personel ekranında doktor tanımlandığında burada görünür."
      mobileCard={(row) => (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {doctorCell(row)}
            <p className="mt-0.5 text-xs text-slate-500">
              {row.enEskiOdenmemis ? `En eski: ${monthName(row.enEskiOdenmemis.year, row.enEskiOdenmemis.month)}` : "Ödenmemiş ay yok"}
              {" · "}Bu ay {money(row.buAy?.hakedilen ?? 0)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className={`font-bold tabular-nums ${row.odenecek > 0.5 ? "text-slate-900" : "text-slate-400"}`}>{money(row.odenecek)}</span>
            {actions(row)}
          </div>
        </div>
      )}
    />
  );
}
