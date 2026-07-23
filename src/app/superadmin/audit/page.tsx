"use client";

import { useEffect, useState } from "react";
import { Search, Download, Eye, Copy } from "lucide-react";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { showToastSafe } from "@/lib/toast-client";

type AuditEntry = {
  id: string;
  action: string;
  detail?: string;
  ip?: string;
  actorRole?: string;
  isGhost?: boolean;
  user?: { fullName: string; role?: string; institution?: { name: string } | null };
  createdAt: string;
};

const PAGE_SIZE = 50;

function formatEntryText(log: AuditEntry): string {
  return [
    `Tarih: ${new Date(log.createdAt).toLocaleString("tr-TR")}`,
    `Kullanıcı: ${log.user?.fullName ?? "—"}`,
    `Klinik: ${log.user?.institution?.name ?? "—"}`,
    `Rol: ${log.actorRole ?? log.user?.role ?? "—"}`,
    `İşlem: ${log.action}`,
    `Detay: ${log.detail ?? "—"}`,
    `IP: ${log.ip ?? "—"}`,
    `Ghost: ${log.isGhost ? "Evet" : "Hayır"}`,
  ].join("\n");
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [detailEntry, setDetailEntry] = useState<AuditEntry | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, startDate, endDate]);

  const buildParams = (withPage: boolean) => {
    const params = new URLSearchParams();
    if (withPage) params.set("page", String(page));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    return params;
  };

  useEffect(() => {
    setLoading(true);
    fetch(`/api/superadmin/audit?${buildParams(true).toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setLogs(Array.isArray(d) ? d : d.logs ?? []);
        setTotal(d.total ?? 0);
        setTotalPages(d.totalPages ?? 1);
      })
      .catch(() => {
        setLogs([]);
        setTotal(0);
        setTotalPages(1);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, startDate, endDate]);

  const copyEntry = async (log: AuditEntry) => {
    try {
      await navigator.clipboard.writeText(formatEntryText(log));
      showToastSafe({ title: "Kopyalandı", message: "Kayıt panoya kopyalandı", type: "success" });
    } catch {
      showToastSafe({ title: "Hata", message: "Kopyalanamadı", type: "error" });
    }
  };

  const exportCsv = () => {
    window.open(`/api/superadmin/audit/export?${buildParams(false).toString()}`, "_blank");
  };

  const columns: ListTableColumn<AuditEntry>[] = [
    {
      key: "createdAt",
      header: "Tarih",
      render: (log) => (
        <span className="whitespace-nowrap text-xs text-slate-500">
          {new Date(log.createdAt).toLocaleString("tr-TR")}
        </span>
      ),
    },
    {
      key: "user",
      header: "Kullanıcı",
      render: (log) => (
        <span className="inline-flex flex-wrap items-center gap-1.5 text-slate-800">
          {log.user?.fullName ?? "—"}
          {log.isGhost && <Badge tone="warning" size="sm">Ghost</Badge>}
          {!log.isGhost && log.actorRole === "SUPERADMIN" && <Badge tone="info" size="sm">Superadmin</Badge>}
        </span>
      ),
    },
    {
      key: "institution",
      header: "Klinik",
      render: (log) => <span className="text-slate-600">{log.user?.institution?.name ?? "—"}</span>,
    },
    {
      key: "action",
      header: "İşlem",
      render: (log) => (
        <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
          {log.action}
        </span>
      ),
    },
    {
      key: "detail",
      header: "Detay",
      cellClassName: "max-w-xs truncate",
      render: (log) => <span className="text-slate-600">{log.detail ?? "—"}</span>,
    },
    {
      key: "ip",
      header: "IP",
      render: (log) => <span className="font-mono text-xs text-slate-400">{log.ip ?? "—"}</span>,
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-20",
      render: (log) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton icon={Eye} title="Detay" tone="neutral" onClick={() => setDetailEntry(log)} />
          <IconButton icon={Copy} title="Kopyala" tone="neutral" onClick={() => void copyEntry(log)} />
        </div>
      ),
    },
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black text-slate-900">Denetim Günlüğü</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{total} kayıt</span>
        </div>
        <Button variant="secondary" size="sm" icon={Download} onClick={exportCsv}>
          CSV Olarak İndir
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="İşlem veya detay ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-3 text-sm placeholder-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
        />
        <span className="text-xs text-slate-400">—</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <ListTable
        columns={columns}
        rows={logs}
        rowKey={(log) => log.id}
        loading={loading}
        emptyText="Kayıt bulunamadı"
        onRowClick={(log) => setDetailEntry(log)}
        pager={{
          page,
          pageCount: totalPages,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: setPage,
          loading,
        }}
      />

      <Modal
        open={!!detailEntry}
        onClose={() => setDetailEntry(null)}
        title="Denetim Kaydı Detayı"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetailEntry(null)}>Kapat</Button>
            <Button icon={Copy} onClick={() => detailEntry && void copyEntry(detailEntry)}>Kopyala</Button>
          </>
        }
      >
        {detailEntry && (
          <dl className="space-y-2.5 text-sm">
            {[
              ["Tarih", new Date(detailEntry.createdAt).toLocaleString("tr-TR")],
              ["Kullanıcı", detailEntry.user?.fullName ?? "—"],
              ["Klinik", detailEntry.user?.institution?.name ?? "—"],
              ["Rol", detailEntry.actorRole ?? detailEntry.user?.role ?? "—"],
              ["İşlem", detailEntry.action],
              ["IP", detailEntry.ip ?? "—"],
              ["Ghost", detailEntry.isGhost ? "Evet" : "Hayır"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
                <dt className="shrink-0 font-bold text-slate-500">{label}</dt>
                <dd className="text-right text-slate-800">{value}</dd>
              </div>
            ))}
            <div>
              <dt className="mb-1 font-bold text-slate-500">Detay</dt>
              <dd className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-slate-700">
                {detailEntry.detail ?? "—"}
              </dd>
            </div>
          </dl>
        )}
      </Modal>
    </section>
  );
}
