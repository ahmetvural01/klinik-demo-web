"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ScrollText } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { ActiveFilters, Toolbar, type ActiveFilter } from "@/components/ui/Toolbar";
import { AUDIT_CATEGORIES, auditActionLabel, auditCategoryLabel, auditCategoryOf, type AuditCategoryKey } from "@/lib/audit-log-taxonomy";
import { roleLabel } from "@/lib/staff-roles";
import { turkeyDateKey } from "@/lib/tz";
import { isAbortError, useLatestRequest } from "@/lib/use-latest-request";

type Log = {
  id: string;
  createdAt: string;
  user: { id?: string; fullName: string; role?: string } | null;
  action: string;
  detail: string | null;
  ip?: string | null;
};

type StaffOption = { id: string; fullName: string; role: string };
type RangeKey = "bugun" | "7" | "30" | "ozel";

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: "bugun", label: "Bugün" },
  { value: "7", label: "Son 7 gün" },
  { value: "30", label: "Son 30 gün" },
  { value: "ozel", label: "Tarih aralığı seç" },
];

const PAGE_SIZES = [25, 50, 100];

function daysAgoKey(days: number) {
  const date = new Date(`${turkeyDateKey()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return turkeyDateKey(date);
}

function rangeDates(range: RangeKey, customFrom: string, customTo: string) {
  const today = turkeyDateKey();
  if (range === "bugun") return { from: today, to: today };
  if (range === "7") return { from: daysAgoKey(6), to: today };
  if (range === "30") return { from: daysAgoKey(29), to: today };
  return { from: customFrom, to: customTo };
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function parseDetail(detail: string | null | undefined) {
  const raw = (detail || "").trim();
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      const flat = Array.isArray(parsed) ? parsed.map(String) : Object.entries(parsed).map(([key, value]) => `${key}: ${String(value)}`);
      return { summary: flat[0] || "", before: [] as string[], after: [] as string[], extra: flat.slice(1) };
    } catch {
      // Eski metin biçimi olarak devam et.
    }
  }
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const summary = lines[0] || "";
  const beforeLine = lines.find((line) => /de[gğ]i[sş]iklik\s+[oö]ncesi\s*:/i.test(line));
  const afterLine = lines.find((line) => /de[gğ]i[sş]iklik\s+sonras[ıi]\s*:/i.test(line));
  const split = (line?: string, pattern?: RegExp) => (line && pattern ? line.replace(pattern, "").split("|").map((part) => part.trim()).filter(Boolean) : []);
  return {
    summary,
    before: split(beforeLine, /de[gğ]i[sş]iklik\s+[oö]ncesi\s*:/i),
    after: split(afterLine, /de[gğ]i[sş]iklik\s+sonras[ıi]\s*:/i),
    extra: lines.filter((line) => line !== summary && line !== beforeLine && line !== afterLine),
  };
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[110px_1fr] sm:gap-3">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800">{children}</dd>
    </div>
  );
}

export default function LogPage() {
  const { can } = usePermissions();
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [range, setRange] = useState<RangeKey>("30");
  const [customFrom, setCustomFrom] = useState(() => daysAgoKey(29));
  const [customTo, setCustomTo] = useState(() => turkeyDateKey());
  const [category, setCategory] = useState<AuditCategoryKey | "">("");
  const [userId, setUserId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [detailLog, setDetailLog] = useState<Log | null>(null);
  const startLogsRequest = useLatestRequest();

  // Her harfte istek atılmasın; kullanıcı yazmayı bırakınca aranır.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Filtre değişince ilk sayfaya dönülür. Önceden 2. sayfadayken arama
  // yapılınca liste "kayıt yok" diyor, sayfalama kayboluyordu.
  useEffect(() => { setPage(1); }, [range, customFrom, customTo, category, userId, debouncedSearch, pageSize]);

  useEffect(() => {
    if (!can("staff:read")) return;
    const controller = new AbortController();
    fetch("/api/staff", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        if (!Array.isArray(data)) return;
        setStaff(data
          .map((person: StaffOption) => ({ id: person.id, fullName: person.fullName, role: person.role }))
          .sort((a: StaffOption, b: StaffOption) => a.fullName.localeCompare(b.fullName, "tr")));
      })
      .catch(() => { /* Personel filtresi isteğe bağlıdır; yüklenemezse gizli kalır. */ });
    return () => controller.abort();
  }, [can]);

  const { from, to } = rangeDates(range, customFrom, customTo);
  const rangeInvalid = range === "ozel" && (!customFrom || !customTo || customFrom > customTo);

  const fetchLogs = useCallback(async () => {
    if (rangeInvalid) return;
    const request = startLogsRequest();
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), from, to });
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (category) params.set("category", category);
      if (userId) params.set("userId", userId);
      const response = await fetch(`/api/logs?${params.toString()}`, { signal: request.signal });
      if (!request.isLatest()) return;
      const data = await response.json().catch(() => null);
      if (!request.isLatest()) return;
      if (!response.ok || !data) {
        setLoadError(data?.message || "İşlem kayıtları yüklenemedi.");
        setLogs([]);
        setTotal(0);
        return;
      }
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setTotal(Number(data.total) || 0);
    } catch (error) {
      if (isAbortError(error) || !request.isLatest()) return;
      setLoadError("İşlem kayıtları yüklenemedi. Bağlantınızı kontrol edin.");
    } finally {
      if (request.isLatest()) setLoading(false);
    }
  }, [category, debouncedSearch, from, page, pageSize, rangeInvalid, startLogsRequest, to, userId]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const clearFilters = () => {
    setRange("30");
    setCategory("");
    setUserId("");
    setSearch("");
  };

  const activeFilters: ActiveFilter[] = [
    ...(range !== "30" ? [{ key: "tarih", label: range === "ozel" ? `${customFrom} – ${customTo}` : RANGE_OPTIONS.find((option) => option.value === range)?.label || "", onRemove: () => setRange("30") }] : []),
    ...(category ? [{ key: "tur", label: auditCategoryLabel(category), onRemove: () => setCategory("") }] : []),
    ...(userId ? [{ key: "kisi", label: staff.find((person) => person.id === userId)?.fullName || "Seçili personel", onRemove: () => setUserId("") }] : []),
  ];
  const hasFilters = activeFilters.length > 0 || Boolean(search);

  const columns: ListTableColumn<Log>[] = useMemo(() => [
    {
      key: "date",
      header: "Tarih",
      cellClassName: "whitespace-nowrap text-sm tabular-nums text-slate-600",
      render: (log) => formatDateTime(log.createdAt),
    },
    {
      key: "user",
      header: "Kim",
      render: (log) => log.user ? (
        <div>
          <p className="text-sm font-medium text-slate-800">{log.user.fullName}</p>
          {log.user.role && <p className="text-xs text-slate-500">{roleLabel(log.user.role)}</p>}
        </div>
      ) : <EmptyValue />,
    },
    {
      key: "action",
      header: "Ne yaptı",
      render: (log) => (
        <div className="min-w-0 max-w-xl">
          <p className="text-sm font-semibold text-slate-900">{auditActionLabel(log.action, log.detail)}</p>
          {parseDetail(log.detail).summary && <p className="truncate text-xs text-slate-500">{parseDetail(log.detail).summary}</p>}
        </div>
      ),
    },
    {
      key: "scope",
      header: "Bölüm",
      render: (log) => <Badge tone="neutral">{auditCategoryLabel(auditCategoryOf(log.action, log.detail))}</Badge>,
    },
  ], []);

  const detail = detailLog ? parseDetail(detailLog.detail) : null;

  return (
    <section className="space-y-3">
      <PageHeader
        icon="log"
        title="İşlem Kayıtları"
        description="Klinikte kim, ne zaman, ne yaptı. Bir kayda tıklayınca ayrıntısı açılır."
      />

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Hasta, personel veya işlem ara" slashShortcut wrapperClassName="flex-1 min-w-[220px]" />
        <Select aria-label="Tarih" value={range} onChange={(event) => setRange(event.target.value as RangeKey)} className="sm:w-44">
          {RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
        {range === "ozel" && (
          <div className="flex items-center gap-2">
            <Input type="date" aria-label="Başlangıç tarihi" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} className="sm:w-40" />
            <span className="text-slate-400" aria-hidden="true">–</span>
            <Input type="date" aria-label="Bitiş tarihi" value={customTo} min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} className="sm:w-40" />
          </div>
        )}
        <Select aria-label="İşlem türü" value={category} onChange={(event) => setCategory(event.target.value as AuditCategoryKey | "")} className="sm:w-52">
          <option value="">Tüm işlemler</option>
          {AUDIT_CATEGORIES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </Select>
        {staff.length > 0 && (
          <Select aria-label="Kim yaptı" value={userId} onChange={(event) => setUserId(event.target.value)} className="sm:w-48">
            <option value="">Tüm personel</option>
            {staff.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
          </Select>
        )}
      </Toolbar>
      <ActiveFilters filters={activeFilters} onClearAll={clearFilters} />
      {rangeInvalid && (
        <p role="alert" className="text-sm font-medium text-red-600">Başlangıç tarihi bitiş tarihinden sonra olamaz.</p>
      )}

      <ListTable<Log>
        columns={columns}
        rows={logs}
        rowKey={(log) => log.id}
        loading={loading}
        error={loadError}
        onRetry={() => void fetchLogs()}
        emptyIcon={ScrollText}
        emptyText="Bu filtrelerle kayıt yok"
        emptyDescription={hasFilters ? "Tarih aralığını genişletin veya filtreleri kaldırın." : "Seçili tarihlerde klinikte kayıtlı işlem yok."}
        emptyAction={hasFilters ? <Button variant="secondary" onClick={clearFilters}>Filtreleri temizle</Button> : undefined}
        onRowClick={setDetailLog}
        getRowAriaLabel={(log) => `${auditActionLabel(log.action, log.detail)} ayrıntısını aç`}
        mobileCard={(log) => (
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-slate-900">{auditActionLabel(log.action, log.detail)}</p>
            {parseDetail(log.detail).summary && <p className="truncate text-xs text-slate-600">{parseDetail(log.detail).summary}</p>}
            <p className="text-xs text-slate-400">{formatDateTime(log.createdAt)}{log.user ? ` · ${log.user.fullName}` : ""}</p>
          </div>
        )}
        pager={{
          page,
          pageCount,
          pageSize,
          pageSizeOptions: PAGE_SIZES,
          total,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
          loading,
        }}
      />

      <Modal
        open={Boolean(detailLog)}
        onClose={() => setDetailLog(null)}
        title={detailLog ? auditActionLabel(detailLog.action, detailLog.detail) : "İşlem ayrıntısı"}
        description={detailLog ? formatDateTime(detailLog.createdAt) : undefined}
        size="lg"
        trackFormChanges={false}
        footer={<Button variant="secondary" onClick={() => setDetailLog(null)}>Kapat</Button>}
      >
        {detailLog && detail && (
          <dl className="space-y-3">
            <DetailRow label="Kim">
              {detailLog.user?.fullName || <EmptyValue />}
              {detailLog.user?.role && <span className="text-slate-500"> · {roleLabel(detailLog.user.role)}</span>}
            </DetailRow>
            <DetailRow label="Bölüm">{auditCategoryLabel(auditCategoryOf(detailLog.action, detailLog.detail))}</DetailRow>
            {detail.summary && <DetailRow label="Özet">{detail.summary}</DetailRow>}
            {detail.before.length > 0 && (
              <DetailRow label="Önceki hali">
                <ul className="list-disc space-y-0.5 pl-4 text-slate-700">{detail.before.map((item, index) => <li key={`b-${index}`}>{item}</li>)}</ul>
              </DetailRow>
            )}
            {detail.after.length > 0 && (
              <DetailRow label="Yeni hali">
                <ul className="list-disc space-y-0.5 pl-4 text-slate-700">{detail.after.map((item, index) => <li key={`a-${index}`}>{item}</li>)}</ul>
              </DetailRow>
            )}
            {detail.extra.length > 0 && (
              <DetailRow label="Ek bilgi">
                <ul className="list-disc space-y-0.5 pl-4 text-slate-700">{detail.extra.map((item, index) => <li key={`e-${index}`}>{item}</li>)}</ul>
              </DetailRow>
            )}
            <div className="border-t border-slate-100 pt-3 text-xs text-slate-400">
              İşlem kodu: <span className="font-mono">{detailLog.action}</span>
              {detailLog.ip ? <> · IP: <span className="font-mono">{detailLog.ip}</span></> : null}
            </div>
          </dl>
        )}
      </Modal>
    </section>
  );
}
