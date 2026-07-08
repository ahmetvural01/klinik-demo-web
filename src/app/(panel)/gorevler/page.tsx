"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { showToastSafe } from "@/lib/toast-client";

type StaffTask = {
  id: string;
  title: string;
  details?: string | null;
  type: "PARCA_SIPARIS" | "LAB" | "ARAMA" | "EVRAK" | "DIGER";
  priority: number;
  status: "ACIK" | "BEKLEMEDE" | "TAMAMLANDI" | "IPTAL";
  dueAt?: string | null;
  patient?: { id: string; fullName: string; phone?: string | null } | null;
  assignees?: Array<{ userId: string; user: { id: string; fullName: string; role: string } }>;
  createdBy?: { id: string; fullName: string } | null;
  createdAt: string;
};

const TASK_STATUS_LABELS: Record<StaffTask["status"], string> = {
  ACIK: "Açık",
  BEKLEMEDE: "Beklemede",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal",
};

const TASK_TYPE_LABELS: Record<StaffTask["type"], string> = {
  PARCA_SIPARIS: "Parça Sipariş",
  LAB: "Laboratuvar",
  ARAMA: "Arama",
  EVRAK: "Evrak",
  DIGER: "Diğer",
};

function getStatusBadge(status: StaffTask["status"]) {
  if (status === "ACIK") return "bg-emerald-100 text-emerald-700";
  if (status === "BEKLEMEDE") return "bg-amber-100 text-amber-700";
  if (status === "TAMAMLANDI") return "bg-slate-200 text-slate-700";
  return "bg-rose-100 text-rose-700";
}

function getPriorityBadge(priority: number) {
  if (priority >= 3) return "bg-rose-100 text-rose-700";
  if (priority === 2) return "bg-amber-100 text-amber-700";
  return "bg-sky-100 text-sky-700";
}

function readCachedTasks(scope: string, status: string) {
  if (typeof window === "undefined") return [] as StaffTask[];
  const cacheKey = `clinic-tasks:list:${scope}:${status}`;
  const raw = sessionStorage.getItem(cacheKey);
  if (!raw) return [] as StaffTask[];
  try {
    const cached = JSON.parse(raw) as { tasks?: StaffTask[] };
    return Array.isArray(cached?.tasks) ? cached.tasks : [];
  } catch {
    return [] as StaffTask[];
  }
}

export default function GorevlerPage() {
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [status, setStatus] = useState<"ACIK" | "BEKLEMEDE" | "TAMAMLANDI" | "IPTAL" | "TUMU">("ACIK");
  const [tasks, setTasks] = useState<StaffTask[]>(() => readCachedTasks("mine", "ACIK"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [role, setRole] = useState("");

  const canSeeAll = role === "YONETICI" || role === "SUPERADMIN";

  const load = async () => {
    const cacheKey = `clinic-tasks:list:${scope}:${status}`;
    let hadCached = false;
    if (typeof window !== "undefined") {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        try {
          const cached = JSON.parse(raw) as { role?: string; tasks?: StaffTask[] };
          if (Array.isArray(cached?.tasks)) {
            setTasks(cached.tasks);
            if (cached.role) setRole(cached.role);
            hadCached = true;
          }
        } catch {}
      }
    }

    setLoading(!hadCached);
    setError("");
    try {
      const [meRes, taskRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/clinic-tasks?take=300&scope=${scope}${status !== "TUMU" ? `&status=${status}` : ""}`),
      ]);

      const me = await meRes.json().catch(() => ({}));
      const rows = await taskRes.json().catch(() => []);
      setRole(String(me?.role || ""));
      const nextTasks = Array.isArray(rows) ? rows : [];
      setTasks(nextTasks);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(cacheKey, JSON.stringify({ role: String(me?.role || ""), tasks: nextTasks }));
      }
    } catch {
      const msg = "Görevler yüklenemedi.";
      setError(msg);
      try { showToastSafe({ title: 'Hata', message: msg, type: 'error' }); } catch {}
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void load();
  }, [scope, status]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [scope, status]);

  const updateStatus = async (taskId: string, next: StaffTask["status"]) => {
    setBusyId(taskId);
    setError("");
    try {
      const res = await fetch(`/api/clinic-tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.message || "Durum güncellenemedi.";
        setError(msg);
        try { showToastSafe({ title: 'Hata', message: msg, type: 'error' }); } catch {}
        return;
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? (json as StaffTask) : t)));
    } catch {
      const msg = "Durum güncellenirken hata oluştu.";
      setError(msg);
      try { showToastSafe({ title: 'Hata', message: msg, type: 'error' }); } catch {}
    } finally {
      setBusyId("");
    }
  };

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.status !== b.status) return a.status === "ACIK" ? -1 : 1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ad - bd;
    });
  }, [tasks]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black tracking-tight text-slate-900">Görevler</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{sorted.length} kayıt</span>
          {sorted.some((task) => task.priority >= 4) && (
            <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">Yüksek öncelik var</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canSeeAll && (
            <select value={scope} onChange={(e) => setScope(e.target.value as "mine" | "all")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="mine">Bana Atananlar</option>
              <option value="all">Tüm Görevler</option>
            </select>
          )}
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="ACIK">Açık</option>
            <option value="BEKLEMEDE">Beklemede</option>
            <option value="TAMAMLANDI">Tamamlandı</option>
            <option value="IPTAL">İptal</option>
            <option value="TUMU">Tümü</option>
          </select>
          <button onClick={() => void load()} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Yenile</button>
          <Link href="/hasta-takip" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">Hasta Takipten Görev Oluştur</Link>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {sorted.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">Gösterilecek görev bulunmadı.</div>
        ) : (
          <div className="space-y-2 p-3">
            {sorted.map((task) => (
              <div key={task.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                      <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + getStatusBadge(task.status)}>{TASK_STATUS_LABELS[task.status]}</span>
                      <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + getPriorityBadge(task.priority)}>Öncelik {task.priority}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{TASK_TYPE_LABELS[task.type]}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {task.patient?.fullName ? `Hasta: ${task.patient.fullName}` : "Hasta bağı yok"}
                      {task.assignees && task.assignees.length > 0 ? ` · Atanan: ${task.assignees.map((a) => a.user.fullName).join(", ")}` : ""}
                      {task.dueAt ? ` · Termin: ${new Date(task.dueAt).toLocaleString("tr-TR")}` : ""}
                    </p>
                    {task.details ? <p className="mt-1 text-xs text-slate-700">{task.details}</p> : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {task.patient?.id ? (
                      <Link href={`/hasta-detay?id=${task.patient.id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Hasta</Link>
                    ) : null}
                    {task.status !== "BEKLEMEDE" && (
                      <button disabled={busyId === task.id} onClick={() => void updateStatus(task.id, "BEKLEMEDE")} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Beklet</button>
                    )}
                    {task.status !== "TAMAMLANDI" && (
                      <button disabled={busyId === task.id} onClick={() => void updateStatus(task.id, "TAMAMLANDI")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">Tamamla</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
