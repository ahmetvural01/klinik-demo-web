"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowLeft, Wallet } from "lucide-react";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Toolbar } from "@/components/ui/Toolbar";
import { StatStrip, type StatItem } from "@/components/ui/StatStrip";
import { Callout } from "@/components/ui/Callout";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { HakedisMonthlyPanel } from "@/components/hakedis/HakedisMonthlyPanel";
import { FinanceDoctorSelect } from "@/components/muhasebe/FinanceDoctorSelect";
import { money, monthName } from "@/components/muhasebe/muhasebe-utils";
import { useLoadWhenActive } from "@/components/muhasebe/finance-hooks";

type OverviewRow = {
  doctor: { id: string; fullName: string; isActive?: boolean };
  odenecek: number;
  odenecekAy: number;
  enEskiOdenmemis: { year: number; month: number; kalan: number } | null;
  negatifAy: number;
  buAy: { ciro: number; hakedilen: number; odenen: number; kalan: number };
};

type Props = {
  /** Sekme ekranda mı (gizliyken istek atılmaz). */
  active: boolean;
  refreshKey: number;
  selectedDoctorId: string;
  onSelectDoctor: (doctorId: string) => void;
  canPay: boolean;
  /**
   * Doktorun aylık dökümü `earnings:read` ister. Bu izin yoksa (varsayılan
   * muhasebe rolü) satır döküm açmaz; ödeme genel listeden yapılır.
   */
  canOpenStatement: boolean;
  /** Döküm dışa aktarma (finance:export). */
  canExport: boolean;
  onPay: (doctorId: string, year: number, month: number, kalan: number) => void;
};

/**
 * Muhasebe › Hakediş. Genel bakış "kime ne ödenecek" sorusunu cevaplar:
 * kapanmış ayların ödenmemiş kalanı (en eski ay ödenir). İçinde bulunulan ay
 * yalnız bilgi olarak gösterilir; ay kapanınca ödenir.
 */
export function HakedisTab({ active, refreshKey, selectedDoctorId, onSelectDoctor, canPay, canOpenStatement, canExport, onPay }: Props) {
  const [rows, setRows] = useState<OverviewRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sequenceRef = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++sequenceRef.current;
    setLoading(true);
    try {
      const response = await fetch("/api/hakedis/ozet", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (sequence !== sequenceRef.current) return;
      if (!response.ok || !Array.isArray(body?.doctors)) throw new Error(body?.message || "Hakediş özeti yüklenemedi.");
      setRows(body.doctors as OverviewRow[]);
      setError("");
    } catch (loadError) {
      if (sequence !== sequenceRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Hakediş özeti yüklenemedi.");
    } finally {
      if (sequence === sequenceRef.current) setLoading(false);
    }
  }, []);

  // Genel bakış yalnız ekrandayken (doktor dökümü açık değilken) yüklenir.
  useLoadWhenActive(active && !selectedDoctorId, String(refreshKey), () => void load());

  if (selectedDoctorId) {
    return (
      <div className="space-y-3">
        {/* Çerçevesiz: dönüş ve doktor seçici sayfa zemininde (ayrı kart değil). */}
        <Toolbar bare>
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => onSelectDoctor("")}>Tüm doktorlar</Button>
          {canOpenStatement && (
            <div className="sm:w-72">
              <FinanceDoctorSelect value={selectedDoctorId} onChange={(id) => onSelectDoctor(id)} size="sm" aria-label="Doktor" />
            </div>
          )}
        </Toolbar>
        {canOpenStatement ? (
          <HakedisMonthlyPanel doctorId={selectedDoctorId} canPay={canPay} onPay={onPay} refreshToken={refreshKey} canExport={canExport} active={active} />
        ) : (
          <Callout tone="info" title="Aylık döküm için hakediş görüntüleme yetkisi gerekiyor">
            Ödenecek tutarlar ve ödeme, Tüm doktorlar listesinde.
          </Callout>
        )}
      </div>
    );
  }

  const allRows = rows || [];
  // Ödenecek ya da biriken hakedişi olmayan kişi (ör. hekimlik yapmayan yönetici)
  // listede boş satır olarak durmaz; sayısı tablonun altında tek satırla yazar.
  const list = allRows.filter((row) => row.odenecek > 0.5 || (row.buAy?.hakedilen || 0) > 0.5 || Boolean(row.enEskiOdenmemis));
  const hiddenCount = allRows.length - list.length;
  const totalPayable = list.reduce((sum, row) => sum + (row.odenecek || 0), 0);
  const payableDoctors = list.filter((row) => row.odenecek > 0.5).length;
  const currentTotal = list.reduce((sum, row) => sum + (row.buAy?.hakedilen || 0), 0);

  const payOldest = (row: OverviewRow) => {
    if (!row.enEskiOdenmemis) return;
    onPay(row.doctor.id, row.enEskiOdenmemis.year, row.enEskiOdenmemis.month, row.enEskiOdenmemis.kalan);
  };

  // Telefon: ödeme kartın sağ üst köşesindeki "…" menüsünde (ayrı eylem sırası yok).
  const payMenu = (row: OverviewRow) => (canPay && row.enEskiOdenmemis ? (
    <ActionMenu
      label={`${row.doctor.fullName} için işlemler`}
      items={[{
        key: "pay",
        label: `${monthName(row.enEskiOdenmemis.year, row.enEskiOdenmemis.month)} hakedişini öde`,
        icon: Wallet,
        onSelect: () => payOldest(row),
      }]}
    />
  ) : null);

  // "Ayrıntı": doktorun ay ay dökümü (her ayda kimden ne alındı, hangi tedavi,
  // hangi masraf düşüldü). Önceden yalnız satıra tıklayınca açılıyordu; satırda
  // bunu gösteren bir düğme olmadığı için bulunmuyordu.
  const payButton = (row: OverviewRow) => (
    <div className="flex items-center justify-end gap-1.5">
      {canOpenStatement && (
        <Button size="sm" variant="ghost" onClick={() => onSelectDoctor(row.doctor.id)} aria-label={`${row.doctor.fullName} hakediş ayrıntısı`}>
          Ayrıntı
        </Button>
      )}
      {canPay && row.enEskiOdenmemis && (
        <Button
          size="sm"
          variant="secondary"
          icon={Wallet}
          onClick={() => payOldest(row)}
          aria-label={`${row.doctor.fullName} — ${monthName(row.enEskiOdenmemis.year, row.enEskiOdenmemis.month)} hakedişini öde`}
        >
          Öde
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

  const payableCell = (row: OverviewRow) => (row.odenecek > 0.5 ? (
    <div className="text-right">
      <p className="font-bold tabular-nums text-slate-900">{money(row.odenecek)}</p>
      <p className="text-xs text-slate-500">
        {row.odenecekAy} ay{row.enEskiOdenmemis ? ` · en eskisi ${monthName(row.enEskiOdenmemis.year, row.enEskiOdenmemis.month)}` : ""}
      </p>
    </div>
  ) : null); // Ödenecek yoksa hücre boş (her satırda "Ödenecek yok" tekrar etmez).

  const columns: ListTableColumn<OverviewRow>[] = [
    { key: "doktor", header: "Doktor", render: doctorCell },
    {
      key: "odenecek",
      header: "Ödenecek",
      headerHint: "Kapanmış ayların ödenmemiş kalanı. İçinde bulunulan ay, ay kapanınca ödenir.",
      align: "right",
      render: payableCell,
    },
    {
      key: "buAy",
      header: "Bu ay biriken",
      headerHint: "İçinde bulunulan ayın hakedişi; yalnız bilgi.",
      align: "right",
      // Sıfır ise boş: yalnız biriken tutar göze çarpar.
      render: (row) => (Math.abs(row.buAy?.hakedilen ?? 0) >= 0.005
        ? <span className="text-sm tabular-nums text-slate-500">{money(row.buAy.hakedilen)}</span>
        : null),
    },
    ...(canPay || canOpenStatement ? [{ key: "islem", header: "", align: "right" as const, render: payButton }] : []),
  ];

  const stats: StatItem[] = [
    { key: "odenecek", label: "Ödenecek toplam", value: money(totalPayable), hint: !rows ? undefined : payableDoctors > 0 ? `${payableDoctors} doktor` : "Ödenecek hakediş yok" },
    { key: "buay", label: "Bu ay biriken", value: money(currentTotal), hint: "Ay kapanınca ödenir" },
  ];

  return (
    <div className="space-y-3">
      {(rows || !error || loading) && <StatStrip items={stats} loading={!rows} aria-label="Hakediş özeti" />}
      <ListTable
        columns={columns}
        rows={list}
        rowKey={(row) => row.doctor.id}
        loading={loading || (!rows && !error)}
        error={rows ? null : error || null}
        staleError={rows ? error || null : null}
        onRetry={() => void load()}
        onRowClick={canOpenStatement ? (row) => onSelectDoctor(row.doctor.id) : undefined}
        getRowAriaLabel={(row) => `${row.doctor.fullName} hakediş dökümünü aç`}
        emptyText="Hakediş hesaplanacak doktor yok"
        emptyDescription="Personel ekranında doktor tanımlandığında burada görünür."
        // Telefon kartı: yalnız istisna olan bilgi (en eski ödenmemiş ay, bu ay biriken > 0); ödeme sağ üstte "…".
        mobileCard={(row) => {
          const meta = [
            row.enEskiOdenmemis ? `En eski: ${monthName(row.enEskiOdenmemis.year, row.enEskiOdenmemis.month)}` : "",
            Math.abs(row.buAy?.hakedilen ?? 0) >= 0.005 ? `Bu ay ${money(row.buAy.hakedilen)}` : "",
          ].filter(Boolean).join(" · ");
          return (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {doctorCell(row)}
                {meta && <p className="mt-0.5 text-xs text-slate-500">{meta}</p>}
              </div>
              {row.odenecek > 0.5 && <span className="shrink-0 font-bold tabular-nums text-slate-900">{money(row.odenecek)}</span>}
            </div>
          );
        }}
        mobileCardActions={canPay ? payMenu : undefined}
      />
      {rows && hiddenCount > 0 && (
        <p className="px-1 text-xs text-slate-500">{hiddenCount} kişinin bu dönem ödenecek ya da biriken hakedişi yok.</p>
      )}
    </div>
  );
}
