"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { getAuditActionLabel, getAuditScopeLabel } from "@/lib/audit-labels";

type Log = {
  id: string;
  createdAt: string;
  user: { fullName: string; role?: string };
  action: string;
  detail: string | null;
  ip?: string | null;
};

const CATEGORY_OPTIONS = [
  { value: "", label: "Tüm işlemler" },
  { value: "hasta", label: "Hasta" },
  { value: "randevu", label: "Randevu" },
  { value: "tedavi", label: "Tedavi / Reçete" },
  { value: "lab", label: "Laboratuvar" },
  { value: "finans", label: "Finans" },
  { value: "stok", label: "Stok" },
  { value: "sms", label: "SMS" },
  { value: "ayar", label: "Ayarlar" },
  { value: "sistem", label: "Sistem" },
];

function parseDetail(detail: string | null | undefined) {
  const raw = (detail || "").trim();
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      const flat = Array.isArray(parsed) ? parsed : Object.entries(parsed).map(([key, value]) => `${key}: ${String(value)}`);
      return {
        summary: flat[0] || "Detay bilgisi bulunmuyor",
        before: "",
        after: "",
        structured: flat.map(String),
        raw,
      };
    } catch {
      // Eski metin formatı olarak devam et
    }
  }
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const summary = lines[0] || "Detay bilgisi bulunmuyor";
  const beforeLine = lines.find((line) => /de[gğ]i[sş]iklik\s+[oö]ncesi\s*:/i.test(line));
  const afterLine = lines.find((line) => /de[gğ]i[sş]iklik\s+sonras[ıi]\s*:/i.test(line));

  return {
    summary,
    before: beforeLine ? beforeLine.replace(/de[gğ]i[sş]iklik\s+[oö]ncesi\s*:/i, "").trim() : "",
    after: afterLine ? afterLine.replace(/de[gğ]i[sş]iklik\s+sonras[ıi]\s*:/i, "").trim() : "",
    structured: lines.filter((line) => line !== summary && line !== beforeLine && line !== afterLine),
    raw,
  };
}

function parseDiffItems(text: string): string[] {
  return text
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function LogPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 30);
    return from.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [detailLog, setDetailLog] = useState<Log | null>(null);
  const [loadError, setLoadError] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (fromDate && toDate) fetchLogs();
  }, [page, pageSize, fromDate, toDate, category]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        from: fromDate,
        to: toDate,
        q: search,
        category,
      });
      const res = await fetch(`/api/logs?${params.toString()}`);
      if (!res.ok) { setLoadError(true); setLogs([]); setTotal(0); return; }
      const data = await res.json();
      setLoadError(false);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const roleLabel: Record<string,string> = { YONETICI:"Yönetici", DOKTOR:"Diş Hekimi", ASISTAN:"Asistan", BANKO:"Banko", MUHASEBE:"Muhasebe" };
  const selectedCategoryLabel = useMemo(
    () => CATEGORY_OPTIONS.find((item) => item.value === category)?.label || "Tüm işlemler",
    [category]
  );

  const logColumns: ListTableColumn<Log>[] = [
    {
      key: "date",
      header: "Tarih",
      cellClassName: "whitespace-nowrap",
      render: (l) => <span className="text-xs text-slate-600">{new Date(l.createdAt).toLocaleDateString("tr-TR")}</span>,
    },
    {
      key: "time",
      header: "Saat",
      render: (l) => <span className="font-mono text-xs text-slate-500">{new Date(l.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>,
    },
    {
      key: "user",
      header: "Personel",
      render: (l) => (
        <>
          <p className="text-sm font-medium text-slate-800">{l.user?.fullName || "-"}</p>
          {l.user?.role && <p className="text-xs text-slate-400">{roleLabel[l.user.role] || l.user.role}</p>}
        </>
      ),
    },
    {
      key: "action",
      header: "İşlem",
      render: (l) => (
        <>
          <p className="text-sm font-medium text-slate-800">{getAuditActionLabel(l.action, l.detail)}</p>
          <p className="max-w-lg truncate text-xs text-slate-500">{parseDetail(l.detail).summary}</p>
        </>
      ),
    },
    {
      key: "scope",
      header: "Kapsam",
      render: (l) => <Badge tone="neutral">{getAuditScopeLabel(l.action, l.detail)}</Badge>,
    },
    {
      key: "islem",
      header: "",
      render: (l) => <Button variant="secondary" size="sm" onClick={() => setDetailLog(l)}>Detay</Button>,
    },
  ];

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-lg font-black text-slate-900">İşlem Kayıtları</h1>
        <p className="mt-0.5 text-sm text-slate-500">Kurum içindeki kritik işlemler, değişiklik detayları ve erişim kayıtları.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center rounded-2xl bg-white border border-slate-100 shadow-sm px-4 py-3">
        <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary focus:outline-none" />
        <span className="text-slate-400">—</span>
        <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary focus:outline-none" />
        <select value={category} onChange={e=>{ setCategory(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary focus:outline-none">
          {CATEGORY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{ if (e.key === "Enter") { setPage(1); void fetchLogs(); } }} placeholder="Personel, işlem veya detay ara…" className="flex-1 min-w-48 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-primary focus:outline-none" />
        <Button size="sm" onClick={() => { setPage(1); void fetchLogs(); }}>Kayıtları Göster</Button>
        <div className="flex items-center gap-1.5 text-sm text-slate-600">
          Göster:
          <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}} className="ml-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm focus:outline-none">
            {[10,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-bold text-slate-900">{selectedCategoryLabel}</p>
            <p className="text-xs text-slate-500">{total} kayıt bulundu</p>
          </div>
          {loading && <Badge tone="neutral">Yükleniyor...</Badge>}
        </div>
        <ListTable<Log>
          columns={logColumns}
          rows={logs}
          rowKey={(l) => l.id}
          loading={loading}
          emptyText={loadError ? "İşlem kayıtları yüklenemedi. Lütfen tekrar deneyin." : "Kayıt bulunamadı"}
          pager={{
            page,
            pageCount: Math.max(1, totalPages),
            pageSize,
            total,
            onPageChange: setPage,
          }}
        />
      </div>

      <Modal
        open={Boolean(detailLog)}
        onClose={() => setDetailLog(null)}
        title="İşlem Detayı"
        description={detailLog?.id}
        size="lg"
      >
        {detailLog && (() => {
              const parsed = parseDetail(detailLog.detail);
              const beforeItems = parseDiffItems(parsed.before);
              const afterItems = parseDiffItems(parsed.after);
              return (
            <dl className="space-y-2.5 text-sm">
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Tarih</dt><dd className="text-slate-700">{new Date(detailLog.createdAt).toLocaleString("tr-TR")}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Personel</dt><dd className="text-slate-700">{detailLog.user?.fullName}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Rol</dt><dd className="text-slate-700">{roleLabel[detailLog.user?.role||""]||detailLog.user?.role}</dd></div>
              {detailLog.ip && (
                <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">IP</dt><dd className="text-slate-700">{detailLog.ip}</dd></div>
              )}
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">İşlem</dt><dd className="text-slate-700">{getAuditActionLabel(detailLog.action, detailLog.detail)}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Özet</dt><dd className="text-slate-700 text-xs">{parsed.summary}</dd></div>
              {beforeItems.length > 0 && (
                <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Öncesi</dt><dd className="text-slate-600 text-xs"><ul className="list-disc pl-4 space-y-0.5">{beforeItems.map((item, idx) => <li key={`b-${idx}`}>{item}</li>)}</ul></dd></div>
              )}
              {afterItems.length > 0 && (
                <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Sonrası</dt><dd className="text-slate-600 text-xs"><ul className="list-disc pl-4 space-y-0.5">{afterItems.map((item, idx) => <li key={`a-${idx}`}>{item}</li>)}</ul></dd></div>
              )}
              {parsed.structured.length > 0 && (
                <div className="flex gap-2"><dt className="w-20 shrink-0 text-xs font-semibold text-slate-500 uppercase">Ek Detay</dt><dd className="text-slate-600 text-xs"><ul className="list-disc pl-4 space-y-0.5">{parsed.structured.map((item, idx) => <li key={`s-${idx}`}>{item}</li>)}</ul></dd></div>
              )}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="mb-1 text-[11px] font-bold uppercase text-slate-400">Ham Kayıt</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{parsed.raw || "-"}</pre>
              </div>
            </dl>
              );
            })()}
      </Modal>
    </section>
  );
}
