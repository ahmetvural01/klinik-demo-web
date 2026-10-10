"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FileText, RotateCcw, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards, type ChoiceOption } from "@/components/ui/ChoiceCards";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Input";
import { SearchInput } from "@/components/ui/SearchInput";
import { Toolbar, ActiveFilters, type ActiveFilter } from "@/components/ui/Toolbar";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { formatDateText } from "@/components/ui/Money";
import { DispatchStatusBadge } from "@/components/sms/CommunicationBadges";
import {
  EVENT_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  channelLabel,
  dateTimeStamp,
  eventLabel,
} from "@/components/sms/communication-labels";
import { DATE_PRESET_LABELS, type DatePresetKey } from "@/lib/date-presets";
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

type Period = "7" | "30" | "90" | "tum";
const PERIODS = ["7", "30", "90", "tum"] as const satisfies readonly DatePresetKey[];
const PAGE_SIZES = [25, 50, 100];

const isPeriod = (value: string | null): value is Period => Boolean(value) && (PERIODS as readonly string[]).includes(value as string);

/**
 * Gönderim geçmişi — hastaya giden ya da gitmeyen HER mesaj (otomatik
 * hatırlatmalar, kutlamalar, izin SMS'leri, elle ve toplu gönderimler).
 * Kaynak: api/sms/dispatches. Satıra tıklayınca neden ve yapılabilecek
 * işlem (izin SMS'ini yeniden gönder, hasta dosyası) görünür.
 * Adres çubuğu: ?durum=gonderildi|gonderilmedi|basarisiz|bekliyor, ?paket=<toplu gönderim>,
 * ?tur=, ?kanal=, ?donem=7|90|tum (varsayılan 30 gün yazılmaz). Adres sunucuya
 * gitmeden güncellenir (history.replaceState); süzgeç anında değişir.
 */
export default function HistoryTab({ showChannel, canResendConsent }: { showChannel: boolean; canResendConsent: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("durum") || "";
  const status = STATUS_FILTER_OPTIONS.some((option) => option.value === statusParam) ? statusParam : "";
  const batch = (searchParams.get("paket") || "").trim();
  const eventParam = searchParams.get("tur") || "";
  const event = EVENT_FILTER_OPTIONS.some((option) => option.value === eventParam) ? eventParam : "";
  const channelParam = (searchParams.get("kanal") || "").toUpperCase();
  const channel = showChannel && (channelParam === "SMS" || channelParam === "WHATSAPP") ? channelParam : "";
  // Tek bir toplu gönderime bakılırken varsayılan dönem "tüm zamanlar".
  const defaultPeriod: Period = batch ? "tum" : "30";
  const periodParam = searchParams.get("donem");
  const period: Period = isPeriod(periodParam) ? periodParam : defaultPeriod;

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<DispatchRow | null>(null);
  const [resending, setResending] = useState(false);
  const beginRequest = useLatestRequest();

  // router.replace her süzgeç değişiminde sunucuya tur atıyordu (0,25–6,5 sn).
  const setParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const next = params.toString();
    window.history.replaceState(null, "", next ? `${pathname}?${next}` : pathname);
  }, [pathname]);

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
      const params = new URLSearchParams({ page: String(page), take: String(pageSize), period: period === "tum" ? "all" : period });
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
      setLoadedOnce(true);
    } catch (loadError) {
      if (isAbortError(loadError) || !request.isLatest()) return;
      // Ekrandaki liste korunur; üstte "Liste yenilenemedi" şeridi çıkar.
      setError(loadError instanceof Error ? loadError.message : "Gönderim geçmişi yüklenemedi.");
    } finally {
      if (request.isLatest()) setLoading(false);
    }
  }, [batch, beginRequest, channel, debouncedQuery, event, page, pageSize, period, status]);

  useEffect(() => { void load(); }, [load]);

  const periodValue = { preset: period as DatePresetKey };
  const activeFilters: ActiveFilter[] = [
    ...(event ? [{ key: "tur", label: EVENT_FILTER_OPTIONS.find((option) => option.value === event)?.label || event, onRemove: () => setParams({ tur: "" }) }] : []),
    ...(channel ? [{ key: "kanal", label: `Yalnız ${channelLabel(channel)}`, onRemove: () => setParams({ kanal: "" }) }] : []),
    ...(period !== defaultPeriod ? [{ key: "donem", label: DATE_PRESET_LABELS[period], onRemove: () => setParams({ donem: "" }) }] : []),
    ...(batch ? [{ key: "paket", label: "Tek bir toplu gönderim", onRemove: () => setParams({ paket: "", donem: "" }) }] : []),
  ];
  const filterCount = (event ? 1 : 0) + (channel ? 1 : 0) + (period !== defaultPeriod ? 1 : 0);

  // Durum süzgeci TEK yerde: sayılı düğmeler (önceden ayrıca "Sonuç" seçimi ve etiket vardı).
  const statusOptions: ChoiceOption<string>[] = [
    { value: "tum", label: "Tümü" },
    { value: "gonderildi", label: "Gönderildi", count: summary?.sent },
    { value: "gonderilmedi", label: "Gitmedi", count: summary?.notSent, countTone: "warning" },
    { value: "basarisiz", label: "Hata", count: summary?.failed, countTone: "critical" },
    ...(summary?.pending || status === "bekliyor" ? [{ value: "bekliyor", label: "Sonuç bekleniyor", count: summary?.pending, countTone: "info" as const }] : []),
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
      message: `${row.patient.fullName} hastasına SMS izni isteyen mesaj yeniden gönderilir (1 kredi). Hasta onaylayınca mesajlar gitmeye başlar.`,
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
  const hasFilters = activeFilters.length > 0 || Boolean(debouncedQuery) || Boolean(status);

  return (
    <section className="space-y-3" aria-label="Gönderim geçmişi">
      <ChoiceCards<string>
        label="Gönderim sonucu"
        labelHidden
        variant="pills"
        options={statusOptions}
        value={status || "tum"}
        onChange={(value) => setParams({ durum: value === "tum" ? "" : value })}
      />

      <Toolbar
        filterCount={filterCount}
        filters={(
          <>
            <Select aria-label="Mesaj türü" value={event} onChange={(e) => setParams({ tur: e.target.value })} className="sm:w-56">
              <option value="">Tüm mesaj türleri</option>
              {EVENT_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            {showChannel && (
              <Select aria-label="Kanal" value={channel} onChange={(e) => setParams({ kanal: e.target.value })} className="sm:w-44">
                <option value="">Tüm kanallar</option>
                <option value="SMS">Yalnız SMS</option>
                <option value="WHATSAPP">Yalnız WhatsApp</option>
              </Select>
            )}
            <DateRangeFilter
              presets={PERIODS}
              value={periodValue}
              onChange={(value) => setParams({ donem: value.preset === defaultPeriod ? "" : value.preset })}
            />
          </>
        )}
      >
        <SearchInput value={query} onChange={setQuery} placeholder="Hasta adı veya telefonun son 4 hanesi" wrapperClassName="flex-1 min-w-[220px]" />
      </Toolbar>
      <ActiveFilters
        filters={activeFilters}
        onClearAll={() => setParams({ tur: "", kanal: "", donem: "", paket: "" })}
      />

      <ListTable<DispatchRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading && !loadedOnce}
        error={loadedOnce ? null : error || null}
        staleError={loadedOnce ? error || null : null}
        onRetry={() => void load()}
        emptyText={hasFilters ? "Bu ölçütlere uyan gönderim yok" : `${DATE_PRESET_LABELS[period]} içinde gönderim yok`}
        emptyDescription={hasFilters ? "Süzgeçleri kaldırarak tüm gönderimleri görebilirsiniz." : "Otomatik ya da elle gönderilen mesajlar burada listelenir."}
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
          <div className="space-y-3">
            <DescriptionList
              layout="rows"
              items={[
                { key: "sonuc", label: "Sonuç", value: <DispatchStatusBadge status={detail.status} /> },
                // İzin eksikliği aşağıdaki tek cümlede anlatılır; neden iki kez yazılmaz.
                { key: "neden", label: "Neden", value: detail.lastError, hidden: !detail.lastError || consentMissing },
                { key: "kanal", label: "Kanal", value: channelLabel(detail.channel), hidden: !showChannel },
                { key: "telefon", label: "Telefon", value: detail.phoneMasked },
                { key: "kayit", label: "Kayıt zamanı", value: formatDateText(detail.createdAt, "datetime") },
                { key: "gonderim", label: "Gönderim", value: detail.sentAt ? formatDateText(detail.sentAt, "datetime") : null, hidden: !detail.sentAt },
                { key: "teslim", label: "Teslim", value: detail.deliveredAt ? formatDateText(detail.deliveredAt, "datetime") : null, hidden: !detail.deliveredAt },
                { key: "okunma", label: "Okunma", value: detail.readAt ? formatDateText(detail.readAt, "datetime") : null, hidden: !detail.readAt },
                { key: "gonderen", label: "Gönderen", value: detail.createdByName || "Otomatik (sistem)" },
              ]}
            />
            {consentMissing && (
              <Callout tone="warning" compact>
                SMS izni yok, kredi harcanmadı.
                {canResendConsent ? "" : " İzin SMS'ini gönderebilecek bir yetkiliye başvurun."}
              </Callout>
            )}
            {detail.batchId && (
              <Button
                variant="ghost"
                size="sm"
                icon={Users}
                className="-ml-2"
                onClick={() => {
                  setDetail(null);
                  setParams({ paket: detail.batchId || "", donem: "" });
                }}
              >
                Bu toplu gönderimin tüm alıcıları
              </Button>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
