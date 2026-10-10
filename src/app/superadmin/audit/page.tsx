"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, Download } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { ActiveFilters, Toolbar } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { showToastSafe } from "@/lib/toast-client";
import type { DatePresetKey } from "@/lib/date-presets";
import { useDateRangeParam } from "@/lib/use-date-range-param";
import { auditActionLabel, auditWho, type AuditPerson } from "@/components/superadmin/sa-labels";
import { dateTime } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet } from "@/components/superadmin/sa-fetch";

type AuditEntry = {
  id: string;
  action: string;
  detail?: string | null;
  ip?: string | null;
  actorRole?: string | null;
  isGhost?: boolean;
  user?: { fullName: string; role: string; institution?: { id: string; name: string } | null } | null;
  /** İşlemi gerçekten yapan kişi (gizli girişte platform yöneticisi); kullanıcıdan farklıysa dolu. */
  actor?: AuditPerson;
  createdAt: string;
};

type Clinic = { id: string; name: string };

const PAGE_SIZE = 50;

const GROUPS: Record<string, string> = {
  giris: "Giriş ve gizli giriş",
  fatura: "Faturalar",
  klinik: "Klinik ayarları",
  sms: "SMS ve kutlama",
  platform: "Platform ayarları",
  hasta: "Hasta ve randevu",
  finans: "Klinik finansı",
};

const ACTORS: Record<string, string> = {
  platform: "Platform yöneticileri",
  klinik: "Klinik kullanıcıları",
};

// Kayıt listesi için geriye kayan dönemler; varsayılan tarih süzgeci yok.
const PERIODS: readonly DatePresetKey[] = ["tum", "bugun", "7", "30", "90", "ozel"];

function entryText(log: AuditEntry): string {
  return [
    `Tarih: ${dateTime(log.createdAt)}`,
    `İşlem: ${auditActionLabel(log.action, log.detail)} (${log.action})`,
    `Kim: ${auditWho({ user: log.user, actor: log.actor, isGhost: log.isGhost })}`,
    `Klinik: ${log.user?.institution?.name ?? "—"}`,
    `Gizli giriş: ${log.isGhost ? "Evet" : "Hayır"}`,
    `IP: ${log.ip ?? "—"}`,
    `Detay: ${log.detail ?? "—"}`,
  ].join("\n");
}

/**
 * Denetim Günlüğü — "bu klinikte kim, ne zaman, ne yaptı?". Gizli girişte
 * gerçek kişi (platform yöneticisi) ve hangi klinik hesabıyla girdiği ayrı
 * yazılır; önceden yalnız klinik kullanıcısının adı platform rolüyle
 * birleşip görünüyordu. Süzgeçler (klinik, işlem grubu, kim, dönem) adres
 * çubuğundadır: yenileyince/geri dönünce kaybolmaz. Telefonda "Süzgeçler"
 * düğmesinin arkasında katlanır. Dönem ortak seçiciyle.
 */
export default function AuditPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const institutionId = searchParams.get("institutionId") || "";
  const group = searchParams.get("group") || "";
  const actor = searchParams.get("actor") || "";
  const period = useDateRangeParam(PERIODS, "tum");
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [detailEntry, setDetailEntry] = useState<AuditEntry | null>(null);

  const setParams = useCallback((changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const range = period.range;
  useEffect(() => { setPage(1); }, [debouncedSearch, institutionId, group, actor, range]);

  useEffect(() => {
    const controller = new AbortController();
    saGet<Clinic[]>("/api/superadmin/institutions?fields=basic", "", controller.signal)
      .then((data) => setClinics((Array.isArray(data) ? data : []).map((item) => ({ id: item.id, name: item.name })).sort((a, b) => a.name.localeCompare(b.name, "tr"))))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const params = useMemo(() => {
    const next = new URLSearchParams();
    if (debouncedSearch) next.set("search", debouncedSearch);
    if (institutionId) next.set("institutionId", institutionId);
    if (group) next.set("group", group);
    if (actor) next.set("actor", actor);
    if (range) {
      next.set("startDate", range.from);
      next.set("endDate", range.to);
    }
    return next;
  }, [debouncedSearch, institutionId, group, actor, range]);

  useEffect(() => {
    // Geçersiz özel aralıkta istek atılmaz; hata tarih alanlarının altında görünür.
    if (period.error) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    const withPage = new URLSearchParams(params);
    withPage.set("page", String(page));
    saGet<{ logs: AuditEntry[]; total: number; totalPages: number }>(`/api/superadmin/audit?${withPage.toString()}`, "Denetim kayıtları yüklenemedi.", controller.signal)
      .then((data) => {
        setLogs(Array.isArray(data?.logs) ? data.logs : []);
        setTotal(data?.total ?? 0);
        setTotalPages(data?.totalPages ?? 1);
      })
      .catch((error) => {
        if (!isAbort(error)) setLoadError(errorMessage(error, "Denetim kayıtları yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [params, page, reloadKey, period.error]);

  const copyEntry = async (log: AuditEntry) => {
    try {
      await navigator.clipboard.writeText(entryText(log));
      showToastSafe({ type: "success", message: "Kayıt panoya kopyalandı.", icon: "log" });
    } catch {
      showToastSafe({ type: "error", message: "Kopyalanamadı." });
    }
  };

  const clinicName = clinics.find((item) => item.id === institutionId)?.name;
  const filters = [
    ...(institutionId ? [{ key: "clinic", label: `Klinik: ${clinicName || "seçili"}`, onRemove: () => setParams({ institutionId: null }) }] : []),
    ...(group ? [{ key: "group", label: GROUPS[group] || group, onRemove: () => setParams({ group: null }) }] : []),
    ...(actor ? [{ key: "actor", label: ACTORS[actor] || actor, onRemove: () => setParams({ actor: null }) }] : []),
    ...(period.activeFilter ? [period.activeFilter] : []),
  ];
  const clearAll = () => setParams({ institutionId: null, group: null, actor: null, donem: null, from: null, to: null });

  const who = (log: AuditEntry) => (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-slate-800">{auditWho({ user: log.user, actor: log.actor, isGhost: log.isGhost })}</span>
      {log.isGhost && <Badge tone="warning">Gizli giriş</Badge>}
    </span>
  );

  const columns: ListTableColumn<AuditEntry>[] = [
    { key: "createdAt", header: "Tarih", render: (log) => <span className="whitespace-nowrap text-sm text-slate-600">{dateTime(log.createdAt)}</span> },
    {
      key: "action",
      header: "İşlem",
      render: (log) => (
        <div className="min-w-0 max-w-md">
          <p className="font-semibold text-slate-900">{auditActionLabel(log.action, log.detail)}</p>
          {log.detail && <p className="truncate text-xs text-slate-500">{log.detail}</p>}
        </div>
      ),
    },
    { key: "user", header: "Kim", render: who },
    {
      key: "institution",
      header: "Klinik",
      render: (log) => log.user?.institution
        ? <Link href={`/superadmin/institutions/${log.user.institution.id}`} className="text-sm font-semibold text-primary hover:underline">{log.user.institution.name}</Link>
        : <EmptyValue />,
    },
  ];

  return (
    <section className="space-y-4">
      <PageHeader
        icon="sa-audit"
        title="Denetim Günlüğü"
        description="Klinik kullanıcılarının ve platform yöneticilerinin yaptığı işlemler."
        actions={<Button variant="secondary" icon={Download} disabled={Boolean(period.error)} onClick={() => window.open(`/api/superadmin/audit/export?${params.toString()}`, "_blank")}>Dışa aktar (CSV)</Button>}
      />

      <ListTable<AuditEntry>
        header={
          <>
            <Toolbar
              filters={(
                <>
                  <Select aria-label="Klinik" value={institutionId} onChange={(event) => setParams({ institutionId: event.target.value || null })} className="sm:w-48">
                    <option value="">Tüm klinikler</option>
                    {clinics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </Select>
                  <Select aria-label="İşlem grubu" value={group} onChange={(event) => setParams({ group: event.target.value || null })} className="sm:w-44">
                    <option value="">Tüm işlemler</option>
                    {Object.entries(GROUPS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                  <Select aria-label="Kim yaptı" value={actor} onChange={(event) => setParams({ actor: event.target.value || null })} className="sm:w-44">
                    <option value="">Herkes</option>
                    {Object.entries(ACTORS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                  <DateRangeFilter {...period.filterProps} />
                </>
              )}
              filterCount={filters.length}
            >
              <SearchInput value={search} onChange={setSearch} placeholder="İşlem metninde ara (ör. fatura, klinik adı)" slashShortcut wrapperClassName="flex-1 min-w-[220px]" />
            </Toolbar>
            {filters.length > 0 && (
              <div className="px-3 pb-2.5">
                <ActiveFilters filters={filters} onClearAll={clearAll} />
              </div>
            )}
          </>
        }
        columns={columns}
        rows={logs}
        rowKey={(log) => log.id}
        loading={loading}
        // Sayfa/süzgeç değişirken istek başarısız olursa eldeki kayıtlar kaybolmaz.
        error={logs.length ? null : loadError}
        staleError={logs.length ? loadError : null}
        onRetry={() => setReloadKey((value) => value + 1)}
        emptyText={filters.length || debouncedSearch ? "Bu süzgeçlere uyan kayıt yok" : "Henüz kayıt yok"}
        onRowClick={setDetailEntry}
        getRowAriaLabel={(log) => `${auditActionLabel(log.action, log.detail)} ayrıntısı`}
        pager={{ page, pageCount: totalPages, pageSize: PAGE_SIZE, total, onPageChange: setPage, loading }}
        mobileCard={(log) => (
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-semibold text-slate-900">{auditActionLabel(log.action, log.detail)}</p>
              <span className="shrink-0 text-xs text-slate-500">{dateTime(log.createdAt)}</span>
            </div>
            {log.detail && <p className="line-clamp-2 text-xs text-slate-600">{log.detail}</p>}
            <div className="text-xs">{who(log)}{log.user?.institution ? <span className="ml-1 text-slate-500">· {log.user.institution.name}</span> : null}</div>
          </div>
        )}
      />

      <Modal
        open={Boolean(detailEntry)}
        onClose={() => setDetailEntry(null)}
        title="İşlem ayrıntısı"
        size="md"
        trackFormChanges={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetailEntry(null)}>Kapat</Button>
            <Button icon={Copy} onClick={() => detailEntry && void copyEntry(detailEntry)}>Kopyala</Button>
          </>
        }
      >
        {detailEntry && (
          <div className="space-y-3">
            <DescriptionList
              layout="rows"
              items={[
                { key: "date", label: "Tarih", value: dateTime(detailEntry.createdAt) },
                { key: "action", label: "İşlem", value: auditActionLabel(detailEntry.action, detailEntry.detail) },
                { key: "who", label: "Kim", value: auditWho({ user: detailEntry.user, actor: detailEntry.actor, isGhost: detailEntry.isGhost }) },
                { key: "clinic", label: "Klinik", value: detailEntry.user?.institution?.name },
                { key: "ghost", label: "Gizli giriş", value: detailEntry.isGhost ? "Evet — platform yöneticisi klinik hesabıyla işlem yaptı" : "Hayır" },
                { key: "ip", label: "IP adresi", value: detailEntry.ip },
                { key: "code", label: "Sistem kodu", value: <code className="text-xs">{detailEntry.action}</code> },
              ]}
            />
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">Ayrıntı</p>
              <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{detailEntry.detail ?? "—"}</p>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
