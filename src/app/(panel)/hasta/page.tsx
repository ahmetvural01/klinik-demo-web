"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Patient = {
  id: string;
  tcNo: string;
  fullName: string;
  phone: string;
  gender: string;
  birthDate?: string | null;
  insurance?: string | null;
};

function HastaContent() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState<keyof Patient | "">("fullName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [userRole, setUserRole] = useState("");

  const hidePhone = userRole === "DOKTOR" || userRole === "ASISTAN";

  useEffect(() => {
    const applyRole = async () => {
      const preview = typeof window !== "undefined" ? sessionStorage.getItem("dev-preview-role") : null;
      if (preview) {
        setUserRole(preview);
        return;
      }
      try {
        const meRes = await fetch("/api/auth/me");
        const me = await meRes.json().catch(() => ({}));
        if (me?.role) setUserRole(me.role);
      } catch {}
    };

    void applyRole();
    const onPreview = () => {
      const preview = sessionStorage.getItem("dev-preview-role") || "";
      if (preview) setUserRole(preview);
    };
    window.addEventListener("preview-role-change", onPreview);
    return () => window.removeEventListener("preview-role-change", onPreview);
  }, []);

  const load = useCallback(async () => {
    const cacheKey = `patients:list:${query.trim().toLocaleLowerCase("tr-TR")}`;
    let hadCached = false;
    if (typeof window !== "undefined") {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        try {
          const cached = JSON.parse(raw);
          if (Array.isArray(cached)) {
            setPatients(cached);
            hadCached = true;
          }
        } catch {}
      }
    }

    setLoading(!hadCached);
    setError(null);
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/giris";
          return;
        }
        throw new Error(json?.message || "Hastalar alınamadı");
      }
      const rows = Array.isArray(json) ? json : (json?.patients || []);
      setPatients(rows);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(cacheKey, JSON.stringify(rows));
      }
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRealtime = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void load();
      }, 300);
    };

    window.addEventListener("ks:realtime-sync", onRealtime);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", onRealtime);
    };
  }, [load]);

  const sorted = useMemo(() => {
    if (!sortKey) return patients;
    return [...patients].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = String(av).localeCompare(String(bv), "tr");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [patients, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const viewRows = useMemo(() => sorted.slice((page - 1) * pageSize, page * pageSize), [sorted, page, pageSize]);

  const toggleSort = (key: keyof Patient) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const remove = async (id: string) => {
    const patient = patients.find(p => p.id === id);
    if (!window.confirm(`"${patient?.fullName || "Hasta"}" kaydı kalıcı olarak silinecek.\n\nBu işlemle birlikte aşağıdaki kayıtlar da silinecektir:\n• Randevular\n• Muayeneler\n• Ödemeler\n• Taksit planları\n• Reçeteler\n• Lab siparişleri\n\nBu işlem geri alınamaz. Devam etmek istiyor musunuz?`)) return;
    const res = await fetch(`/api/patients/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Silme işlemi başarısız");
      return;
    }
    await load();
  };

  const pageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
    else {
      pages.push(1);
      if (page > 4) pages.push("...");
      for (let i = Math.max(2, page - 2); i <= Math.min(totalPages - 1, page + 2); i++) pages.push(i);
      if (page < totalPages - 3) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const SortTh = ({ col, label }: { col: keyof Patient; label: string }) => (
    <th
      className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 hover:text-slate-800 transition"
      onClick={() => toggleSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        <span className="text-slate-300">
          {sortKey === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  );

  return (
    <section>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900">Hasta Listesi</h1>
          <p className="mt-0.5 text-xs text-slate-500">{sorted.length} kayıtlı hasta</p>
        </div>
        <Link
          href="/hasta-ekle"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Yeni Hasta
        </Link>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <div className="relative flex-1 min-w-52">
          <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ad, TC kimlik veya telefon ile ara…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm placeholder-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Sayfa başına:</span>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-primary focus:outline-none">
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-16 text-sm text-slate-400">Yükleniyor…</div>}
      {error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      {!loading && (
        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-100">
                  <th className="w-10 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">#</th>
                  <SortTh col="fullName" label="Adı Soyadı" />
                  <SortTh col="tcNo" label="TC Kimlik" />
                  {!hidePhone && <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Telefon</th>}
                  <SortTh col="gender" label="Cinsiyet" />
                  <SortTh col="birthDate" label="Doğum Tarihi" />
                  <SortTh col="insurance" label="Sigorta" />
                  <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {viewRows.length === 0 && (
                  <tr>
                    <td colSpan={hidePhone ? 7 : 8} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <svg className="h-10 w-10 text-slate-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                        </svg>
                        <p className="text-sm">Hasta bulunamadı</p>
                      </div>
                    </td>
                  </tr>
                )}
                {viewRows.map((p, idx) => (
                  <tr key={p.id} className="group hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">{(page - 1) * pageSize + idx + 1}</td>
                    <td className="px-4 py-3">
                      <Link href={`/hasta-detay?id=${p.id}`} className="font-semibold text-slate-900 hover:text-primary transition">
                        {p.fullName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.tcNo}</td>
                    {!hidePhone && <td className="px-4 py-3 text-slate-600">{p.phone || "—"}</td>}
                    <td className="px-4 py-3">
                      {p.gender ? (
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          p.gender.toUpperCase() === "ERKEK" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                        }`}>
                          {p.gender.toUpperCase() === "ERKEK" ? "Erkek" : "Kadın"}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {p.birthDate ? new Date(p.birthDate).toLocaleDateString("tr-TR") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {p.insurance ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">{p.insurance}</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5 opacity-0 transition group-hover:opacity-100">
                        <Link href={`/hasta-detay?id=${p.id}`} title="Detay" className="rounded-lg bg-primary/10 p-1.5 text-primary transition hover:bg-primary hover:text-white">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </Link>
                        <Link href={`/hasta-ekle?id=${p.id}`} title="Düzenle" className="rounded-lg bg-slate-100 p-1.5 text-slate-600 transition hover:bg-slate-200">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </Link>
                        <button onClick={() => remove(p.id)} title="Sil" className="rounded-lg bg-red-50 p-1.5 text-red-500 transition hover:bg-red-100">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <span className="text-xs text-slate-500">
              {sorted.length > 0 ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, sorted.length)} / ${sorted.length} kayıt gösteriliyor` : "0 kayıt"}
            </span>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
                ‹ Önceki
              </button>
              {pageNumbers().map((n, i) =>
                n === "..." ? <span key={`d-${i}`} className="px-1.5 text-slate-400">…</span> : (
                  <button key={n} onClick={() => setPage(n as number)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${page === n ? "border-primary bg-primary text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{n}</button>
                )
              )}
              <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
                Sonraki ›
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function HastaPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-sm text-slate-400">Yükleniyor…</div>}>
      <HastaContent />
    </Suspense>
  );
}
