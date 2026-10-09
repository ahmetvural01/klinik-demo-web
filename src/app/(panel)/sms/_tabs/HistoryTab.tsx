"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, RotateCcw, SlidersHorizontal, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Input";
import { SearchInput } from "@/components/ui/SearchInput";
import { Toolbar, ActiveFilters, type ActiveFilter } from "@/components/ui/Toolbar";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { DispatchStatusBadge } from "@/components/sms/CommunicationBadges";
import {
  EVENT_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  channelLabel,
  dateTimeStamp,
  eventLabel,
  formatCount,
} from "@/components/sms/communication-labels";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { isAbortError, useLatestRequest } from "@/lib/use-latest-request";

type DispatchRow = {
  id: string;
  channel: "SMS" | "WHATSAPP";
  eventType: string;
  purpose: string;
  status: string;
  phoneMasked: string;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  patient: { id: string; fullName: string } | null;
  batchId: string | null;
  createdByName: string | null;
};

type Summary = { sent: number; notSent: number; failed: number; pending: number };

const PERIOD_OPTIONS = [
  { value: "7", label: "Son 7 gün" },
  { value: "30", label: "Son 30 gün" },
  { value: "90", label: "Son 90 gün" },
  { value: "all", label: "Tüm zamanlar" },
] as const;

const PAGE_SIZES = [25, 50, 100];
const STAMP = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-slate-800">{children}</span>
    </div>
  );
}

/**
 * Gönderim Geçmişi — hastaya giden ya da gitmeyen HER mesaj (otomatik
 * hatırlatmalar, kutlamalar, izin SMS'leri, elle ve toplu gönderimler).
 * Kaynak: api/sms/dispatches. Satıra tıklayınca neden ve yapılabilecek
 * işlem (izin SMS'ini yeniden gönder, hasta dosyası) görünür.
 * Adres çubuğu: ?durum=gonderildi|gonderilmedi|basarisiz|bekliyor, ?paket=<toplu gönderim>.
 */
export default function HistoryTab({ showChannel, canResendConsent }: { showChannel: boolean; canResendConsent: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("durum") || "";
  const status = STATUS_FILTER_OPTIONS.some((option) => option.value === statusParam) ? statusParam : "";
  const batch = (searchParams.get("paket") || "").trim();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [event, setEvent] = useState("");
  const [channel, setChannel] = useState("");
  const [period, setPeriod] = useState<string>(batch ? "all" : "30");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<DispatchRow | null>(null);
  const [resending, setResending] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const beginRequest = useLatestRequest();

  const setUrlParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => { setPage(1); }, [debouncedQuery, status, event, channel, period, batch, pageSize]);

  const load = useCallback(async () => {
    const request = beginRequest();
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), take: String(pageSize), period });
      if (debouncedQuery) params.set("q", debouncedQuery);
      const apiStatus = STATUS_FILTER_OPTIONS.find((option) => option.value === status)?.api;
      if (apiStatus) params.set("status", apiStatus);
      if (event) params.set("event", event);
      if (channel) params.set("channel", channel);
      if (batch) params.set("batch", batch);
      const response = await fetch(`/api/sms/dispatches?${params.toString()}`, { cache: "no-store", signal: request.signal });
      const data = await response.json().catch(() => null);
      if (!request.isLatest()) return;
      if (!response.ok) throw new Error(data?.message || "Gönderim geçmişi yüklenemedi.");
      setRows(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total) || 0);
      setPageCount(Number(data?.pageCount) || 1);
      setSummary(data?.summary || null);
    } catch (loadError) {
      if (isAbortError(loadError) || !request.isLatest()) return;
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : "Gönderim geçmişi yüklenemedi.");
    } finally {
      if (request.isLatest()) setLoading(false);
    }
  }, [batch, beginRequest, channel, debouncedQuery, event, page, pageSize, period, status]);

  useEffect(() => { void load(); }, [load]);

  const periodLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label || "";

  const activeFilters: ActiveFilter[] = [
    ...(status ? [{ key: "durum", label: STATUS_FILTER_OPTIONS.find((option) => option.value === status)?.label || status, onRemove: () => setUrlParam("durum", "") }] : []),
    ...(event ? [{ key: "tur", label: EVENT_FILTER_OPTIONS.find((option) => option.value === event)?.label || event, onRemove: () => setEvent("") }] : []),
    ...(channel ? [{ key: "kanal", label: channelLabel(channel), onRemove: () => setChannel("") }] : []),
    ...(batch ? [{ key: "paket", label: "Tek bir toplu gönderim", onRemove: () => setUrlParam("paket", "") }] : []),
  ];

  const columns = useMemo<ListTableColumn<DispatchRow>[]>(() => [
    { key: "time", header: "Zaman", cellClassName: "whitespace-nowrap text-slate-600", render: (row) => dateTimeStamp(row.createdAt) },
    { key: "patient", header: "Hasta", render: (row) => row.patient ? <span className="font-semibold text-slate-900">{row.patient.fullName}</span> : <EmptyValue /> },
    {
      key: "event",
      header: "Mesaj",
      render: (row) => (
        <span className="text-slate-700">
          {eventLabel(row.eventType)}
          {showChannel && <span className="text-slate-400"> · {channelLabel(row.channel)}</span>}
        </span>
      ),
    },
    { key: "status", header: "Sonuç", render: (row) => <DispatchStatusBadge status={row.status} reason={row.lastError} /> },
    { key: "by", header: "Gönderen", cellClassName: "text-slate-600", render: (row) => row.createdByName || "Otomatik" },
  ], [showChannel]);

  const resendConsent = async (row: DispatchRow) => {
    if (!row.patient) return;
    const ok = await confirmDialog({
      title: "İzin SMS'i yeniden gönderilsin mi?",
      message: `${row.patient.fullName} hastasına SMS izni isteyen mesaj yeniden gönderilir. Hasta onaylayınca mesajlar gitmeye başlar.`,
      confirmText: "Yeniden gönder",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    setResending(true);
    try {
      const response = await fetch(`/api/patients/${encodeURIComponent(row.patient.id)}/sms-consent/resend`, { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "İzin SMS'i gönderilemedi.");
      showToastSafe({ message: "İzin SMS'i gönderildi. Hastanın onayı bekleniyor.", type: "success" });
      setDetail(null);
      void load();
    } catch (resendError) {
      showToastSafe({ message: resendError instanceof Error ? resendError.message : "İzin SMS'i gönderilemedi.", type: "error" });
    } finally {
      setResending(false);
    }
  };

  const consentMissing = Boolean(detail?.lastError?.toLocaleLowerCase("tr-TR").includes("sms iletişim izni"));

  return (
    <section className="space-y-3" aria-label="Gönderim geçmişi">
      <p className="text-sm text-slate-600">
        Hastalara giden ve gitmeyen tüm mesajlar: otomatik hatırlatmalar, kutlamalar, izin SMS&apos;leri, elle ve toplu gönderimler.
        Bir satıra tıklayınca nedeni ve yapılacak işlemi görürsünüz.
      </p>

      {summary && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" aria-label={`${periodLabel} özeti`}>
          <span className="text-slate-500">{periodLabel}:</span>
          {([
            ["gonderildi", "gönderildi", summary.sent, "text-emerald-700"],
            ["gonderilmedi", "gönderilmedi", summary.notSent, "text-amber-700"],
            ["basarisiz", "gönderilemedi", summary.failed, "text-red-700"],
            ...(summary.pending ? [["bekliyor", "sonuç bekleniyor", summary.pending, "text-slate-700"] as const] : []),
          ] as const).map(([key, label, count, color]) => (
            <button
              key={key}
              type="button"
              onClick={() => setUrlParam("durum", status === key ? "" : key)}
              aria-pressed={status === key}
              className={`rounded-md px-1.5 py-0.5 font-semibold hover:bg-slate-100 ${status === key ? "bg-slate-100 ring-1 ring-slate-300" : ""}`}
            >
              <span className={`tabular-nums ${color}`}>{formatCount(count)}</span> <span className="font-normal text-slate-600">{label}</span>
            </button>
          ))}
        </div>
      )}

      <Toolbar>
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:min-w-[220px]">
          <SearchInput value={query} onChange={setQuery} placeholder="Hasta adı veya telefonun son 4 hanesi" wrapperClassName="flex-1" />
          <Button
            variant="secondary"
            icon={SlidersHorizontal}
            className="sm:hidden"
            aria-expanded={filtersOpen}
            aria-controls="gecmis-filtreleri"
            onClick={() => setFiltersOpen((value) => !value)}
          >
            Filtre
          </Button>
        </div>
        <div id="gecmis-filtreleri" className={`${filtersOpen ? "flex" : "hidden"} flex-col gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center`}>
        <Select aria-label="Sonuç" value={status} onChange={(e) => setUrlParam("durum", e.target.value)} className="sm:w-56">
          <option value="">Tüm sonuçlar</option>
          {STATUS_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
        <Select aria-label="Mesaj türü" value={event} onChange={(e) => setEvent(e.target.value)} className="sm:w-56">
          <option value="">Tüm mesaj türleri</option>
          {EVENT_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
        {showChannel && (
          <Select aria-label="Kanal" value={channel} onChange={(e) => setChannel(e.target.value)} className="sm:w-44">
            <option value="">Tüm kanallar</option>
            <option value="SMS">Yalnız SMS</option>
            <option value="WHATSAPP">Yalnız WhatsApp</option>
          </Select>
        )}
        <Select aria-label="Dönem" value={period} onChange={(e) => setPeriod(e.target.value)} className="sm:w-40">
          {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
        </div>
      </Toolbar>
      <ActiveFilters
        filters={activeFilters}
        onClearAll={() => {
          setEvent("");
          setChannel("");
          const params = new URLSearchParams(searchParams.toString());
          params.delete("durum");
          params.delete("paket");
          router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        }}
      />

      <ListTable<DispatchRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading}
        error={error || null}
        onRetry={() => void load()}
        emptyText={activeFilters.length || debouncedQuery ? "Bu ölçütlere uyan gönderim yok" : `${periodLabel} içinde gönderim yok`}
        emptyDescription={activeFilters.length || debouncedQuery ? "Filtreleri kaldırarak tüm gönderimleri görebilirsiniz." : "Otomatik ya da elle gönderilen mesajlar burada listelenir."}
        onRowClick={setDetail}
        getRowAriaLabel={(row) => `${row.patient?.fullName || "Hasta"} — ${eventLabel(row.eventType)} ayrıntısı`}
        mobileCard={(row) => (
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-semibold text-slate-900">{row.patient?.fullName || "—"}</span>
              <span className="shrink-0 text-xs text-slate-500">{dateTimeStamp(row.createdAt)}</span>
            </div>
            <p className="text-xs text-slate-600">{eventLabel(row.eventType)}{showChannel ? ` · ${channelLabel(row.channel)}` : ""} · {row.createdByName || "Otomatik"}</p>
            <DispatchStatusBadge status={row.status} reason={row.lastError} />
          </div>
        )}
        pager={{
          page,
          pageCount,
          pageSize,
          pageSizeOptions: PAGE_SIZES,
          total,
          loading,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
        }}
      />

      <Modal
        module="sms"
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? eventLabel(detail.eventType) : "Gönderim"}
        description={detail?.patient?.fullName}
        trackFormChanges={false}
        footer={detail ? (
          <>
            <Button variant="secondary" onClick={() => setDetail(null)}>Kapat</Button>
            {detail.patient && <Button variant="secondary" icon={FileText} href={`/hasta-detay?id=${encodeURIComponent(detail.patient.id)}`}>Hasta dosyası</Button>}
            {consentMissing && canResendConsent && detail.patient && (
              <Button icon={RotateCcw} loading={resending} onClick={() => void resendConsent(detail)}>İzin SMS&apos;ini yeniden gönder</Button>
            )}
          </>
        ) : undefined}
      >
        {detail && (
          <div>
            <DetailRow label="Sonuç"><DispatchStatusBadge status={detail.status} /></DetailRow>
            {detail.lastError && <DetailRow label="Neden">{detail.lastError}</DetailRow>}
            {showChannel && <DetailRow label="Kanal">{channelLabel(detail.channel)}</DetailRow>}
            <DetailRow label="Telefon">{detail.phoneMasked || "—"}</DetailRow>
            <DetailRow label="Kayıt zamanı">{STAMP.format(new Date(detail.createdAt))}</DetailRow>
            {detail.sentAt && <DetailRow label="Gönderim">{STAMP.format(new Date(detail.sentAt))}</DetailRow>}
            {detail.deliveredAt && <DetailRow label="Teslim">{STAMP.format(new Date(detail.deliveredAt))}</DetailRow>}
            {detail.readAt && <DetailRow label="Okunma">{STAMP.format(new Date(detail.readAt))}</DetailRow>}
            <DetailRow label="Gönderen">{detail.createdByName || "Otomatik (sistem)"}</DetailRow>
            {consentMissing && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                Hasta SMS iznini henüz onaylamadığı için mesaj gönderilmedi; kredi harcanmadı.
                {canResendConsent ? " İzin SMS'ini yeniden gönderebilirsiniz." : " İzin SMS'ini hasta dosyasından yeniden gönderebilecek bir yetkiliye başvurun."}
              </p>
            )}
            {detail.batchId && (
              <Button
                variant="ghost"
                size="sm"
                icon={Users}
                className="mt-3"
                onClick={() => {
                  setDetail(null);
                  setPeriod("all");
                  setUrlParam("paket", detail.batchId || "");
                }}
              >
                Bu toplu gönderimin tüm alıcılarını göster
              </Button>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
