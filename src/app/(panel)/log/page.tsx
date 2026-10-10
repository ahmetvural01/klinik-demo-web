"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ScrollText } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { Button } from "@/components/ui/Button";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { DescriptionList, type DescriptionItem } from "@/components/ui/DescriptionList";
import { Disclosure } from "@/components/ui/Disclosure";
import { Select } from "@/components/ui/Input";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Modal } from "@/components/ui/Modal";
import { formatDateText } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { SearchInput } from "@/components/ui/SearchInput";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { ActiveFilters, Toolbar, type ActiveFilter } from "@/components/ui/Toolbar";
import { AUDIT_CATEGORIES, auditActionLabel, auditCategoryLabel, auditCategoryOf, type AuditCategoryKey } from "@/lib/audit-log-taxonomy";
import { cachedGet } from "@/lib/client-cache";
import { addDaysToKey, DATE_PRESET_SETS, todayKey } from "@/lib/date-presets";
import { roleLabel } from "@/lib/staff-roles";
import { turkeyDateKey } from "@/lib/tz";
import { useDateRangeParam } from "@/lib/use-date-range-param";
import { isAbortError, useLatestRequest } from "@/lib/use-latest-request";
import { RecordCheckTab } from "./_components/RecordCheckTab";

type Log = {
  id: string;
  createdAt: string;
  user: { id?: string; fullName: string; role?: string } | null;
  action: string;
  detail: string | null;
  ip?: string | null;
};

type StaffOption = { id: string; fullName: string; role: string };
type PageTab = "kayitlar" | "kontrol";
const PAGE_TABS: readonly PageTab[] = ["kayitlar", "kontrol"];
const PAGE_SIZES = [25, 50, 100];

/**
 * Zaman sütunu: aynı günün onlarca satırında tam tarih tekrarlanmasın —
 * "Bugün 14:32", "Dün 09:10", eskiler "08.10.2026 16:05" (Türkiye saati).
 * Satırlar istemcide yüklendiği için sunucu/istemci farkı oluşmaz.
 */
function shortWhen(value: string, today: string) {
  const day = turkeyDateKey(new Date(value));
  if (day === today) return `Bugün ${formatDateText(value, "time")}`;
  if (day === addDaysToKey(today, -1)) return `Dün ${formatDateText(value, "time")}`;
  return formatDateText(value, "datetime");
}

const BEFORE_PATTERN = /de[gğ]i[sş]iklik\s+[oö]ncesi\s*:/i;
const AFTER_PATTERN = /de[gğ]i[sş]iklik\s+sonras[ıi]\s*:/i;

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
  const beforeLine = lines.find((line) => BEFORE_PATTERN.test(line));
  const afterLine = lines.find((line) => AFTER_PATTERN.test(line));
  const split = (line: string | undefined, pattern: RegExp) => (line ? line.replace(pattern, "").split("|").map((part) => part.trim()).filter(Boolean) : []);
  return {
    summary,
    before: split(beforeLine, BEFORE_PATTERN),
    after: split(afterLine, AFTER_PATTERN),
    extra: lines.filter((line) => line !== summary && line !== beforeLine && line !== afterLine),
  };
}

// Kayıt kimliği (cuid) parantezi: "(cmv28np8t00fh3axbx3ilos5d)". Listede okunmaz;
// ayrıntı penceresinde özet olduğu gibi durur.
const RECORD_ID_PATTERN = /\s*\(c[a-z0-9]{20,}\)/g;
const normalized = (text: string) => text.toLocaleLowerCase("tr-TR").replace(/[.\s]+$/, "");
/** Özet işlem adının aynısı ya da kısa yeniden söylenişi mi ("Gider güncellendi" ~ "Gider kaydı güncellendi"). */
const sameText = (summary: string, label: string) => {
  const a = normalized(summary);
  const b = normalized(label);
  if (a === b) return true;
  const words = a.split(/\s+/);
  return words.length <= 3 && words[words.length - 1] === b.split(/\s+/).pop();
};
// Özetin başındaki işlem cümlesi ("Randevu oluşturuldu: Hakan Çelik · …"):
// en çok dört sözcük, geçmiş zaman fiiliyle biter. Üst satırdaki işlem adını tekrar eder.
const ACTION_PREFIX_PATTERN = /^(?:\S+\s){0,3}\S+(?:dı|di|du|dü|tı|ti|tu|tü):\s+(?=\S)/u;
const capitalize = (text: string) => (text ? text.charAt(0).toLocaleUpperCase("tr-TR") + text.slice(1) : "");

/**
 * Listedeki ikinci satır (sadelik K4): teknik kayıt kimliği atılır; "Kim"
 * sütununda zaten yazan "<ad> tarafından" öneki ve üst satırdaki işlem adını
 * tekrar eden "… oluşturuldu:" öneki düşer; işlem adının aynısıysa hiç
 * gösterilmez. Tam özet ayrıntı penceresinde kalır — bilgi kaybolmaz.
 */
function listSummary(log: Log) {
  let text = parseDetail(log.detail).summary.replace(RECORD_ID_PATTERN, "").trim();
  const name = log.user?.fullName?.trim();
  if (name && text.startsWith(`${name} tarafından `)) {
    text = capitalize(text.slice(name.length + " tarafından ".length).trim());
  }
  text = text.replace(ACTION_PREFIX_PATTERN, "");
  return sameText(text, auditActionLabel(log.action, log.detail)) ? "" : text;
}

type ChangeRow = { field: string; before: string; after: string };

const CHANGE_COLUMNS: ListTableColumn<ChangeRow>[] = [
  { key: "field", header: "Alan", cellClassName: "text-sm font-medium text-slate-600", render: (row) => row.field },
  { key: "before", header: "Önce", cellClassName: "text-sm text-slate-700", render: (row) => row.before || <EmptyValue /> },
  {
    key: "after",
    header: "Sonra",
    cellClassName: "text-sm",
    render: (row) => <span className={row.before !== row.after ? "font-semibold text-slate-900" : "text-slate-700"}>{row.after || <EmptyValue />}</span>,
  },
];

/**
 * "Önceki hali" / "Yeni hali" maddeleri "Alan: değer" biçimindedir; alan adına
 * göre eşlenip tek tabloda (Alan · Önce · Sonra) gösterilir. Eşlenemeyen madde
 * olduğu gibi listelenir — hiçbir bilgi düşmez.
 */
function pairChanges(before: string[], after: string[]) {
  const split = (item: string) => {
    const index = item.indexOf(":");
    return index > 0 ? { field: item.slice(0, index).trim(), value: item.slice(index + 1).trim() } : null;
  };
  const rows: ChangeRow[] = [];
  const loose: string[] = [];
  const byField = new Map<string, ChangeRow>();
  for (const [side, items] of [["before", before], ["after", after]] as const) {
    for (const item of items) {
      const parts = split(item);
      if (!parts) { loose.push(`${side === "before" ? "Önce" : "Sonra"}: ${item}`); continue; }
      const row = byField.get(parts.field) || { field: parts.field, before: "", after: "" };
      row[side] = parts.value;
      if (!byField.has(parts.field)) { byField.set(parts.field, row); rows.push(row); }
    }
  }
  return { rows, loose };
}

function LogsTab() {
  const { can } = usePermissions();
  // Boolean bağımlılık: izin yoklaması her turda yeni `can` üretse de personel listesi yeniden çekilmez.
  const canReadStaff = can("staff:read");
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // Kayıt listeleri bugünden geriye kayan pencereyle süzülür; varsayılan son 30 gün.
  const period = useDateRangeParam(DATE_PRESET_SETS.gecmis, "30");
  const [category, setCategory] = useState<AuditCategoryKey | "">("");
  const [userId, setUserId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [detailLog, setDetailLog] = useState<Log | null>(null);
  const [today, setToday] = useState("");
  const startLogsRequest = useLatestRequest();

  // "Bugün/Dün" yazımı için gün etkide alınır (render sırasında saat okunmaz).
  useEffect(() => { setToday(todayKey()); }, [logs]);

  // Her harfte istek atılmasın; kullanıcı yazmayı bırakınca aranır.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const range = period.range;
  // Filtre değişince ilk sayfaya dönülür. Önceden 2. sayfadayken arama
  // yapılınca liste "kayıt yok" diyor, sayfalama kayboluyordu.
  useEffect(() => { setPage(1); }, [range, category, userId, debouncedSearch, pageSize]);

  // Personel süzgeci: hekim seçicileriyle aynı 60 sn önbellekli liste (aynı sayfada ikinci istek yok).
  useEffect(() => {
    if (!canReadStaff) return;
    let active = true;
    cachedGet<StaffOption[]>("/api/staff", 60_000)
      .then((data) => {
        if (!active || !Array.isArray(data)) return;
        setStaff(data
          .map((person) => ({ id: person.id, fullName: person.fullName, role: person.role }))
          .sort((a, b) => a.fullName.localeCompare(b.fullName, "tr")));
      })
      .catch(() => { /* Personel süzgeci isteğe bağlıdır; yüklenemezse gizli kalır. */ });
    return () => { active = false; };
  }, [canReadStaff]);

  const fetchLogs = useCallback(async () => {
    // Geçersiz özel aralıkta istek atılmaz; hata tarih alanlarının altında yazar.
    if (period.error || !range) return;
    const request = startLogsRequest();
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), from: range.from, to: range.to });
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (category) params.set("category", category);
      if (userId) params.set("userId", userId);
      const response = await fetch(`/api/logs?${params.toString()}`, { signal: request.signal });
      const data = await response.json().catch(() => null);
      if (!request.isLatest()) return;
      // Hata olunca eldeki liste korunur (üstte "yenilenemedi" şeridi).
      if (!response.ok || !data) {
        setLoadError(data?.message || "İşlem kayıtları yüklenemedi.");
        return;
      }
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setTotal(Number(data.total) || 0);
      setLoaded(true);
    } catch (error) {
      if (isAbortError(error) || !request.isLatest()) return;
      setLoadError("İşlem kayıtları yüklenemedi. Bağlantınızı kontrol edin.");
    } finally {
      if (request.isLatest()) setLoading(false);
    }
  }, [category, debouncedSearch, page, pageSize, period.error, range, startLogsRequest, userId]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const clearFilters = () => {
    period.reset();
    setCategory("");
    setUserId("");
    setSearch("");
  };

  const staffLabel = (person: StaffOption) => `${person.fullName} (${roleLabel(person.role) || person.role})`;
  const activeFilters: ActiveFilter[] = [
    ...(period.activeFilter ? [period.activeFilter] : []),
    ...(category ? [{ key: "bolum", label: auditCategoryLabel(category), onRemove: () => setCategory("") }] : []),
    ...(userId ? [{ key: "kisi", label: staff.find((person) => person.id === userId)?.fullName || "Seçili personel", onRemove: () => setUserId("") }] : []),
  ];
  const hasFilters = activeFilters.length > 0 || Boolean(debouncedSearch);

  const columns: ListTableColumn<Log>[] = useMemo(() => [
    {
      key: "date",
      header: "Zaman",
      cellClassName: "whitespace-nowrap text-sm tabular-nums text-slate-600",
      render: (log) => (today ? shortWhen(log.createdAt, today) : formatDateText(log.createdAt, "datetime")),
    },
    {
      key: "user",
      header: "Kim",
      // Tek satır: ad. Rol her satırda tekrar ediyordu; ayrıntı penceresinde ve "Kim yaptı" süzgecinde yazar.
      render: (log) => log.user ? <span className="text-sm font-medium text-slate-800">{log.user.fullName}</span> : <EmptyValue />,
    },
    {
      key: "action",
      header: "Ne yaptı",
      render: (log) => {
        const summary = listSummary(log);
        return (
          <div className="min-w-0 max-w-xl">
            <p className="text-sm font-semibold text-slate-900">{auditActionLabel(log.action, log.detail)}</p>
            {summary && <p className="truncate text-xs text-slate-500">{summary}</p>}
          </div>
        );
      },
    },
    {
      key: "scope",
      header: "Bölüm",
      // Düz soluk metin: her satırda çerçeveli rozet kutu kalabalığı yapıyordu.
      cellClassName: "whitespace-nowrap text-xs text-slate-500",
      render: (log) => auditCategoryLabel(auditCategoryOf(log.action, log.detail)),
    },
  ], [today]);

  const detail = detailLog ? parseDetail(detailLog.detail) : null;
  const changes = detail ? pairChanges(detail.before, detail.after) : null;
  const detailItems: DescriptionItem[] = detailLog && detail ? [
    {
      key: "kim",
      label: "Kim",
      value: detailLog.user ? <>{detailLog.user.fullName}{detailLog.user.role && <span className="text-slate-500"> · {roleLabel(detailLog.user.role)}</span>}</> : null,
    },
    { key: "zaman", label: "Zaman", value: <span className="tabular-nums">{formatDateText(detailLog.createdAt, "datetime")}</span> },
    { key: "bolum", label: "Bölüm", value: auditCategoryLabel(auditCategoryOf(detailLog.action, detailLog.detail)) },
    { key: "ozet", label: "Özet", value: detail.summary, hidden: !detail.summary },
    {
      key: "ek",
      label: "Ek bilgi",
      hidden: detail.extra.length === 0 && (changes?.loose.length || 0) === 0,
      value: (
        <ul className="list-disc space-y-0.5 pl-4 text-slate-700">
          {[...detail.extra, ...(changes?.loose || [])].map((item, index) => <li key={`e-${index}`}>{item}</li>)}
        </ul>
      ),
    },
  ] : [];

  return (
    <div className="space-y-3">
      {/* Arama ve süzgeçler listenin kartının üst şeridinde (sadelik K1: ayrı süzgeç kartı yok). */}
      <ListTable<Log>
        toolbar={(
          <>
            <Toolbar
              filters={(
                <>
                  <DateRangeFilter {...period.filterProps} />
                  <Select aria-label="Bölüm" value={category} onChange={(event) => setCategory(event.target.value as AuditCategoryKey | "")} className="sm:w-52">
                    <option value="">Tüm bölümler</option>
                    {AUDIT_CATEGORIES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </Select>
                  {staff.length > 0 && (
                    <Select aria-label="Kim yaptı" value={userId} onChange={(event) => setUserId(event.target.value)} className="sm:w-56">
                      <option value="">Tüm personel</option>
                      {staff.map((person) => <option key={person.id} value={person.id}>{staffLabel(person)}</option>)}
                    </Select>
                  )}
                </>
              )}
              filterCount={activeFilters.length}
            >
              <SearchInput value={search} onChange={setSearch} placeholder="Hasta, personel veya işlem ara" slashShortcut wrapperClassName="flex-1 min-w-[220px]" />
            </Toolbar>
            <ActiveFilters filters={activeFilters} onClearAll={clearFilters} />
          </>
        )}
        columns={columns}
        rows={logs}
        rowKey={(log) => log.id}
        loading={loading && !period.error}
        error={loaded ? null : loadError}
        staleError={loaded ? loadError : null}
        onRetry={() => void fetchLogs()}
        emptyIcon={ScrollText}
        emptyText={hasFilters ? "Bu filtrelerle kayıt yok" : "Bu dönemde kayıt yok"}
        emptyDescription={hasFilters ? "Tarih aralığını genişletin veya filtreleri kaldırın." : "Seçili tarihlerde klinikte kayıtlı işlem yok."}
        emptyAction={hasFilters ? <Button variant="secondary" onClick={clearFilters}>Filtreleri temizle</Button> : undefined}
        onRowClick={setDetailLog}
        getRowAriaLabel={(log) => `${auditActionLabel(log.action, log.detail)} ayrıntısını aç`}
        // Geçersiz tarih aralığında eldeki satırlar soluklaşır (süzgeç şeridi soluklaşmaz; hata orada okunur).
        rowClassName={() => (period.error ? "opacity-50" : "")}
        mobileCard={(log) => {
          const summary = listSummary(log);
          return (
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-slate-900">{auditActionLabel(log.action, log.detail)}</p>
              {summary && <p className="truncate text-xs text-slate-600">{summary}</p>}
              <p className="text-xs text-slate-400">{today ? shortWhen(log.createdAt, today) : formatDateText(log.createdAt, "datetime")}{log.user ? ` · ${log.user.fullName}` : ""}</p>
            </div>
          );
        }}
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
        size="lg"
        trackFormChanges={false}
        footer={<Button variant="secondary" onClick={() => setDetailLog(null)}>Kapat</Button>}
      >
        {detailLog && detail && (
          <div className="space-y-4">
            <DescriptionList layout="rows" items={detailItems} />
            {changes && changes.rows.length > 0 && (
              // Ortak liste: masaüstünde Alan · Önce · Sonra tablosu, telefonda alan başına kart.
              <ListTable<ChangeRow>
                columns={CHANGE_COLUMNS}
                rows={changes.rows}
                rowKey={(row) => row.field}
                mobileCard={(row) => (
                  <div className="space-y-0.5 text-sm">
                    <p className="font-medium text-slate-600">{row.field}</p>
                    <p className="text-slate-700"><span className="text-xs text-slate-500">Önce: </span>{row.before || <EmptyValue />}</p>
                    <p className={row.before !== row.after ? "font-semibold text-slate-900" : "text-slate-700"}><span className="text-xs font-normal text-slate-500">Sonra: </span>{row.after || <EmptyValue />}</p>
                  </div>
                )}
              />
            )}
            {/* İşlem kodu ve IP güvenlik denetimi için korunur; gündelik okumada gizli. */}
            <Disclosure title="Teknik ayrıntı">
              <DescriptionList
                layout="rows"
                items={[
                  { key: "kod", label: "İşlem kodu", value: <span className="font-mono text-xs">{detailLog.action}</span> },
                  { key: "ip", label: "IP adresi", value: detailLog.ip ? <span className="font-mono text-xs">{detailLog.ip}</span> : null },
                ]}
              />
            </Disclosure>
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * İşlem kayıtları: "Kayıtlar" (kim, ne zaman, ne yaptı) ve "Kayıt kontrolü"
 * (eski /sistem-izleme — kayıtların birbiriyle uyumu) tek sayfada.
 * ?tab=kayitlar|kontrol; eski /sistem-izleme adresi buraya yönlenir. Kayıt
 * kontrolü ağır bir tarama olduğu için yalnız o sekme açılınca çalışır; açılan
 * sekme bağlı kalır (geri dönüşte süzgeçler ve liste yerinde durur).
 */
function LogContent() {
  const [tab, setTab] = useTabParam<PageTab>(PAGE_TABS, "kayitlar");
  const [visited, setVisited] = useState<ReadonlySet<PageTab>>(() => new Set([tab]));
  useEffect(() => {
    setVisited((current) => (current.has(tab) ? current : new Set([...current, tab])));
  }, [tab]);

  return (
    <section className="space-y-3">
      <PageHeader icon="log" title="İşlem kayıtları" />
      <Tabs
        ariaLabel="İşlem kayıtları bölümleri"
        items={[
          { key: "kayitlar", label: "Kayıtlar" },
          { key: "kontrol", label: "Kayıt kontrolü" },
        ]}
        value={tab}
        onChange={setTab}
        panelIdPrefix="log-panel"
      />
      {visited.has("kayitlar") && (
        <div id="log-panel-kayitlar" role="tabpanel" hidden={tab !== "kayitlar"}>
          <LogsTab />
        </div>
      )}
      {visited.has("kontrol") && (
        <div id="log-panel-kontrol" role="tabpanel" hidden={tab !== "kontrol"}>
          <RecordCheckTab />
        </div>
      )}
    </section>
  );
}

export default function LogPage() {
  return (
    <Suspense fallback={<PageSkeleton headerAction={false} tabs={2} toolbar body="table" rows={8} columns={4} label="İşlem kayıtları yükleniyor" />}>
      <LogContent />
    </Suspense>
  );
}
