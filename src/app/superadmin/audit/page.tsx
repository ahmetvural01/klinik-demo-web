"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Badge } from "@/components/ui/Badge";

type AuditEntry = {
  id: string;
  action: string;
  detail?: string;
  ip?: string;
  actorRole?: string;
  isGhost?: boolean;
  user?: { fullName: string; identityNo: string; role?: string };
  institution?: { name: string };
  createdAt: string;
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/superadmin/audit")
      .then((r) => r.json())
      .then((d) => setLogs(Array.isArray(d) ? d : d.logs ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = logs.filter(
    (l) =>
      l.action?.toLowerCase().includes(search.toLowerCase()) ||
      l.user?.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      l.institution?.name?.toLowerCase().includes(search.toLowerCase())
  );

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
      render: (log) => <span className="text-slate-600">{log.institution?.name ?? "—"}</span>,
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
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black text-slate-900">Denetim Günlüğü</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{filtered.length} kayıt</span>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="İşlem, kullanıcı veya klinik ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-3 text-sm placeholder-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <ListTable
        columns={columns}
        rows={filtered}
        rowKey={(log) => log.id}
        loading={loading}
        emptyText="Kayıt bulunamadı"
      />
    </section>
  );
}
