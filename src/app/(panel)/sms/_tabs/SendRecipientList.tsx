"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { SearchInput } from "@/components/ui/SearchInput";
import { Toolbar } from "@/components/ui/Toolbar";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { SmsConsentBadge, WhatsappConsentBadge } from "@/components/sms/CommunicationBadges";
import { isAbortError, useLatestRequest } from "@/lib/use-latest-request";

export type Recipient = {
  id: string;
  fullName: string;
  birthYear: number | null;
  hasPhone: boolean;
  smsConsent: string;
  whatsappConsent: boolean;
};

type RecipientListProps = {
  selected: Map<string, Recipient>;
  onChange: (next: Map<string, Recipient>) => void;
  showWhatsapp: boolean;
};

const PAGE_SIZE = 25;

/**
 * Toplu mesajda alıcı seçme listesi: satıra tıklamak seçer, başlıktaki kutu
 * görünen sayfanın tümünü seçer, seçilenler ayrıca listelenebilir. Her
 * satırda SMS (ve WhatsApp) izni görünür; kime mesaj GİTMEYECEĞİ baştan
 * bellidir. Telefon numarası bilerek gösterilmez (kullanıcı geri bildirimi);
 * aynı adlı hastalar doğum yılıyla ayrılır.
 */
export function SendRecipientList({ selected, onChange, showWhatsapp }: RecipientListProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [consent, setConsent] = useState<"all" | "sms" | "none">("all");
  const [onlySelected, setOnlySelected] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Recipient[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const beginRequest = useLatestRequest();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => { setPage(1); }, [debouncedQuery, consent]);
  useEffect(() => { if (selected.size === 0) setOnlySelected(false); }, [selected.size]);

  const load = useCallback(async () => {
    const request = beginRequest();
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), take: String(PAGE_SIZE), consent });
      if (debouncedQuery) params.set("q", debouncedQuery);
      const response = await fetch(`/api/sms/recipients?${params.toString()}`, { cache: "no-store", signal: request.signal });
      const data = await response.json().catch(() => null);
      if (!request.isLatest()) return;
      if (!response.ok) throw new Error(data?.message || "Hasta listesi yüklenemedi.");
      setRows(Array.isArray(data?.patients) ? data.patients : []);
      setTotal(Number(data?.total) || 0);
      setPageCount(Number(data?.pageCount) || 1);
    } catch (loadError) {
      if (isAbortError(loadError) || !request.isLatest()) return;
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : "Hasta listesi yüklenemedi.");
    } finally {
      if (request.isLatest()) setLoading(false);
    }
  }, [beginRequest, consent, debouncedQuery, page]);

  useEffect(() => { void load(); }, [load]);

  const visibleRows = onlySelected ? [...selected.values()] : rows;

  const columns = useMemo<ListTableColumn<Recipient>[]>(() => [
    {
      key: "name",
      header: "Hasta",
      render: (row) => (
        <span className="flex flex-col">
          <span className="font-semibold text-slate-900">{row.fullName}</span>
          {row.birthYear && <span className="text-xs text-slate-500">Doğum yılı {row.birthYear}</span>}
        </span>
      ),
    },
    {
      key: "consent",
      header: "İzin",
      render: (row) => (
        <span className="flex flex-wrap gap-1">
          {row.hasPhone ? <SmsConsentBadge status={row.smsConsent} /> : <span className="text-xs font-semibold text-red-700">Telefon yok</span>}
          {showWhatsapp && row.hasPhone && <WhatsappConsentBadge granted={row.whatsappConsent} />}
        </span>
      ),
    },
  ], [showWhatsapp]);

  return (
    <div className="space-y-2">
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Hasta adı veya telefon ara" wrapperClassName="flex-1 min-w-[200px]" disabled={onlySelected} />
        <Select aria-label="İzin durumu" value={consent} onChange={(e) => setConsent(e.target.value as typeof consent)} className="sm:w-48" disabled={onlySelected}>
          <option value="all">Tüm hastalar</option>
          <option value="sms">SMS izni olanlar</option>
          <option value="none">SMS izni olmayanlar</option>
        </Select>
      </Toolbar>
      <ListTable<Recipient>
        columns={columns}
        rows={visibleRows}
        rowKey={(row) => row.id}
        loading={!onlySelected && loading}
        error={onlySelected ? null : error || null}
        onRetry={() => void load()}
        emptyText={onlySelected ? "Seçili hasta yok" : debouncedQuery ? "Bu aramaya uyan hasta yok" : "Bu şubede hasta yok"}
        getRowAriaLabel={(row) => row.fullName}
        selection={{
          selectedIds: [...selected.keys()],
          onChange: (ids) => {
            const pool = new Map([...selected, ...rows.map((row) => [row.id, row] as const)]);
            const next = new Map<string, Recipient>();
            for (const id of ids) {
              const row = pool.get(id);
              if (row) next.set(id, row);
            }
            onChange(next);
          },
        }}
        header={(
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-sm">
            <span className="font-semibold text-slate-800">{selected.size > 0 ? `${selected.size} hasta seçildi` : "Listeden hasta seçin"}</span>
            {selected.size > 0 && (
              <span className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setOnlySelected((value) => !value)}>
                  {onlySelected ? "Tüm listeyi göster" : "Yalnız seçilenleri göster"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onChange(new Map())}>Temizle</Button>
              </span>
            )}
          </div>
        )}
        mobileCard={(row) => (
          <div className="space-y-1">
            <p className="font-semibold text-slate-900">{row.fullName}{row.birthYear ? <span className="ml-1 text-xs font-normal text-slate-500">({row.birthYear})</span> : null}</p>
            <div className="flex flex-wrap gap-1">
              {row.hasPhone ? <SmsConsentBadge status={row.smsConsent} /> : <span className="text-xs font-semibold text-red-700">Telefon yok</span>}
              {showWhatsapp && row.hasPhone && <WhatsappConsentBadge granted={row.whatsappConsent} />}
            </div>
          </div>
        )}
        pager={onlySelected ? undefined : {
          page,
          pageCount,
          pageSize: PAGE_SIZE,
          total,
          loading,
          onPageChange: setPage,
        }}
      />
    </div>
  );
}
