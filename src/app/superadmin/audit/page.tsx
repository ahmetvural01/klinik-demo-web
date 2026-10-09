"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Copy, Download } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { ActiveFilters, Toolbar } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { showToastSafe } from "@/lib/toast-client";
import { roleLabel } from "@/lib/staff-roles";
import { auditActionLabel } from "@/components/superadmin/sa-labels";
import { dateTime } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet } from "@/components/superadmin/sa-fetch";

type AuditEntry = {
  id: string;
  action: string;
  detail?: string | null;
  ip?: string | null;
  actorRole?: string | null;
  isGhost?: boolean;
  user?: { fullName: string; role?: string; institution?: { id: string; name: string } | null } | null;
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

function entryText(log: AuditEntry): string {
  return [
    `Tarih: ${dateTime(log.createdAt)}`,
    `İşlem: ${auditActionLabel(log.action, log.detail)} (${log.action})`,
    `Kullanıcı: ${log.user?.fullName ?? "—"} (${roleLabel(log.actorRole ?? log.user?.role ?? "") || "—"})`,
    `Klinik: ${log.user?.institution?.name ?? "—"}`,
    `Gizli giriş: ${log.isGhost ? "Evet" : "Hayır"}`,
    `IP: ${log.ip ?? "—"}`,
    `Detay: ${log.detail ?? "—"}`,
  ].join("\n");
}

/**
 * Denetim Günlüğü — "bu klinikte kim, ne zaman, ne yaptı?". Filtreler:
 * klinik, işlem grubu, kim yaptı, Türkiye saatine göre tarih aralığı. İşlem
 * kodları Türkçe adla görünür; IP ve kopyala yalnız ayrıntı penceresinde.
 * Klinik dosyasındaki "Bu kliniğin işlem kayıtları" ?institutionId= ile gelir.
 */
export default function AuditPage() {
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [institutionId, setInstitutionId] = useState(searchParams.get("institutionId") || "");
  const [group, setGroup] = useState(searchParams.get("group") || "");
  const [actor, setActor] = useState(searchParams.get("actor") || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [detailEntry, setDetailEntry] = useState<AuditEntry | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, institutionId, group, actor, startDate, endDate]);

  useEffect(() => {
    saGet<Clinic[]>("/api/superadmin/institutions", "")
      .then((data) => setClinics((Array.isArray(data) ? data : []).map((item) => ({ id: item.id, name: item.name })).sort((a, b) => a.name.localeCompare(b.name, "tr"))))
      .catch(() => undefined);
  }, []);

  const params = useMemo(() => {
    const next = new URLSearchParams();
    if (debouncedSearch) next.set("search", debouncedSearch);
    if (institutionId) next.set("institutionId", institutionId);
    if (group) next.set("group", group);
    if (actor) next.set("actor", actor);
    if (startDate) next.set("startDate", startDate);
    if (endDate) next.set("endDate", endDate);
    return next;
  }, [debouncedSearch, institutionId, group, actor, startDate, endDate]);

  useEffect(() => {
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
  }, [params, page, reloadKey]);

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
    ...(institutionId ? [{ key: "clinic", label: `Klinik: ${clinicName || "seçili"}`, onRemove: () => setInstitutionId("") }] : []),
    ...(group ? [{ key: "group", label: GROUPS[group] || group, onRemove: () => setGroup("") }] : []),
    ...(actor ? [{ key: "actor", label: ACTORS[actor] || actor, onRemove: () => setActor("") }] : []),
    ...(startDate ? [{ key: "start", label: `Başlangıç: ${startDate.split("-").reverse().join(".")}`, onRemove: () => setStartDate("") }] : []),
    ...(endDate ? [{ key: "end", label: `Bitiş: ${endDate.split("-").reverse().join(".")}`, onRemove: () => setEndDate("") }] : []),
  ];

  const who = (log: AuditEntry) => (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-slate-800">{log.user?.fullName ?? "Sistem"}</span>
      <span className="text-xs text-slate-500">{roleLabel(log.actorRole ?? log.user?.role ?? "")}</span>
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
        icon="log"
        title="Denetim Günlüğü"
        description="Klinik kullanıcılarının ve platform yöneticilerinin yaptığı işlemler."
        stats={[{ label: "Kayıt", value: total.toLocaleString("tr-TR") }]}
        actions={<Button variant="secondary" icon={Download} onClick={() => window.open(`/api/superadmin/audit/export?${params.toString()}`, "_blank")}>Excel&apos;e aktar</Button>}
      />

      <ListTable<AuditEntry>
        header={
          <>
            <Toolbar>
              <SearchInput value={search} onChange={setSearch} placeholder="İşlem metninde ara (ör. fatura, hasta adı)" wrapperClassName="flex-1 min-w-[220px]" />
              <Select aria-label="Klinik" value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} className="sm:w-48">
                <option value="">Tüm klinikler</option>
                {clinics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
              <Select aria-label="İşlem grubu" value={group} onChange={(event) => setGroup(event.target.value)} className="sm:w-44">
                <option value="">Tüm işlemler</option>
                {Object.entries(GROUPS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
              <Select aria-label="Kim yaptı" value={actor} onChange={(event) => setActor(event.target.value)} className="sm:w-44">
                <option value="">Herkes</option>
                {Object.entries(ACTORS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                Başlangıç
                <Input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} className="w-auto" />
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                Bitiş
                <Input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} className="w-auto" />
              </label>
            </Toolbar>
            {filters.length > 0 && (
              <div className="px-3 pb-2.5">
                <ActiveFilters filters={filters} onClearAll={() => { setInstitutionId(""); setGroup(""); setActor(""); setStartDate(""); setEndDate(""); }} />
              </div>
            )}
          </>
        }
        columns={columns}
        rows={logs}
        rowKey={(log) => log.id}
        loading={loading}
        error={loadError}
        onRetry={() => setReloadKey((value) => value + 1)}
        emptyText={filters.length || debouncedSearch ? "Bu filtrelere uyan kayıt yok" : "Henüz kayıt yok"}
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
          <dl className="space-y-2 text-sm">
            {([
              ["Tarih", dateTime(detailEntry.createdAt)],
              ["İşlem", auditActionLabel(detailEntry.action, detailEntry.detail)],
              ["Kim", `${detailEntry.user?.fullName ?? "Sistem"}${detailEntry.user ? ` (${roleLabel(detailEntry.actorRole ?? detailEntry.user.role ?? "")})` : ""}`],
              ["Klinik", detailEntry.user?.institution?.name ?? "—"],
              ["Gizli giriş", detailEntry.isGhost ? "Evet — platform yöneticisi klinik hesabıyla işlem yaptı" : "Hayır"],
              ["IP adresi", detailEntry.ip ?? "—"],
              ["Sistem kodu", detailEntry.action],
            ] as const).map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
                <dt className="shrink-0 font-semibold text-slate-500">{label}</dt>
                <dd className="text-right text-slate-800">{value}</dd>
              </div>
            ))}
            <div>
              <dt className="mb-1 font-semibold text-slate-500">Ayrıntı</dt>
              <dd className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-slate-700">{detailEntry.detail ?? "—"}</dd>
            </div>
          </dl>
        )}
      </Modal>
    </section>
  );
}
