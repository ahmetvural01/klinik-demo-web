"use client";

import { useEffect, useState } from "react";

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

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🔍</span>
        <h2 className="text-2xl font-bold text-gray-900">Denetim Günlüğü</h2>
      </div>

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <input
            type="text"
            placeholder="İşlem, kullanıcı veya klinik ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-sm rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Tarih</th>
                  <th className="px-4 py-3 text-left">Kullanıcı</th>
                  <th className="px-4 py-3 text-left">Klinik</th>
                  <th className="px-4 py-3 text-left">İşlem</th>
                  <th className="px-4 py-3 text-left">Detay</th>
                  <th className="px-4 py-3 text-left">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Kayıt bulunamadı</td>
                  </tr>
                ) : (
                  filtered.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {new Date(log.createdAt).toLocaleString("tr-TR")}
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {log.user?.fullName ?? "—"}
                        {log.isGhost && (
                          <span className="ml-1.5 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            Ghost
                          </span>
                        )}
                        {!log.isGhost && log.actorRole === "SUPERADMIN" && (
                          <span className="ml-1.5 inline-flex rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                            Superadmin
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{log.institution?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-700">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{log.detail ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{log.ip ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            {filtered.length} kayıt
          </div>
        )}
      </div>
    </section>
  );
}
