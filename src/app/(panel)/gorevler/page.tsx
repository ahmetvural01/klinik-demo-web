"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { showToastSafe } from "@/lib/toast-client";
import { TableRowsSkeleton } from "@/components/ui/ListSkeleton";
import { backdropClose, useEscapeClose } from "@/lib/use-modal-dismiss";

type Staff = { id: string; fullName: string; role: string };
type PatientOption = { id: string; fullName: string; phone?: string | null };

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

  // Yeni görev oluşturma
  const [showCreate, setShowCreate] = useState(false);
  useEscapeClose(() => setShowCreate(false), showCreate);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<PatientOption[]>([]);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState<StaffTask["type"]>("DIGER");
  const [taskPriority, setTaskPriority] = useState<1 | 2 | 3>(2);
  const [taskDueAt, setTaskDueAt] = useState("");
  const [taskDetails, setTaskDetails] = useState("");
  const [taskAssigneeIds, setTaskAssigneeIds] = useState<string[]>([]);
  const [taskSaving, setTaskSaving] = useState(false);

  useEffect(() => {
    if (!showCreate || staff.length > 0) return;
    fetch("/api/staff", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setStaff(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [showCreate]);

  useEffect(() => {
    if (patientSearch.trim().length < 2) { setPatientResults([]); setPatientSearchLoading(false); return; }
    const timer = setTimeout(() => {
      setPatientSearchLoading(true);
      fetch(`/api/patients?q=${encodeURIComponent(patientSearch.trim())}&take=8`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          const rows = Array.isArray(d?.patients) ? d.patients : Array.isArray(d) ? d : [];
          setPatientResults(rows.map((p: PatientOption) => ({ id: p.id, fullName: p.fullName, phone: p.phone })));
        })
        .catch(() => setPatientResults([]))
        .finally(() => setPatientSearchLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [patientSearch]);

  const resetCreateForm = () => {
    setSelectedPatient(null);
    setPatientSearch("");
    setPatientResults([]);
    setTaskTitle("");
    setTaskType("DIGER");
    setTaskPriority(2);
    setTaskDueAt("");
    setTaskDetails("");
    setTaskAssigneeIds([]);
  };

  const createTask = async () => {
    if (!taskTitle.trim()) {
      showToastSafe({ title: "Eksik bilgi", message: "Görev başlığı zorunlu.", type: "error" });
      return;
    }
    setTaskSaving(true);
    try {
      const res = await fetch("/api/clinic-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatient?.id || undefined,
          title: taskTitle.trim(),
          details: taskDetails.trim() || undefined,
          type: taskType,
          priority: taskPriority,
          dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : undefined,
          assignedToIds: taskAssigneeIds,
          status: "ACIK",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToastSafe({ title: "Görev oluşturulamadı", message: data?.message || "Lütfen bilgileri kontrol edin.", type: "error" });
        return;
      }
      setTasks((prev) => [data as StaffTask, ...prev]);
      resetCreateForm();
      setShowCreate(false);
      showToastSafe({ title: "Görev oluşturuldu", message: "Görev listeye eklendi.", type: "success" });
    } catch {
      showToastSafe({ title: "Görev oluşturulamadı", message: "Bağlantı hatası oluştu.", type: "error" });
    } finally {
      setTaskSaving(false);
    }
  };

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
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch(`/api/clinic-tasks?take=300&scope=${scope}${status !== "TUMU" ? `&status=${status}` : ""}`, { cache: "no-store" }),
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

  // Sekmeye geri dönüldüğünde (arka planda kaçırılmış olabilecek olayları) tazele.
  useEffect(() => {
    const refreshVisible = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [scope, status]);

  const updateStatus = async (taskId: string, next: StaffTask["status"]) => {
    const previous = tasks.find((t) => t.id === taskId);
    if (!previous) return;

    // Optimistic: sunucu yanıtını beklemeden anında güncelle, hata olursa geri al.
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: next } : t)));
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
        setTasks((prev) => prev.map((t) => (t.id === taskId ? previous : t)));
        setError(msg);
        try { showToastSafe({ title: 'Hata', message: msg, type: 'error' }); } catch {}
        return;
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? (json as StaffTask) : t)));
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? previous : t)));
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
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-white px-2 py-2 shadow-sm">
          {canSeeAll && (
            <select value={scope} onChange={(e) => setScope(e.target.value as "mine" | "all")} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="mine">Bana Atananlar</option>
              <option value="all">Tüm Görevler</option>
            </select>
          )}
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="ACIK">Açık</option>
            <option value="BEKLEMEDE">Beklemede</option>
            <option value="TAMAMLANDI">Tamamlandı</option>
            <option value="IPTAL">İptal</option>
            <option value="TUMU">Tümü</option>
          </select>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{sorted.length} kayıt</span>
          {sorted.some((task) => task.priority >= 4) && (
            <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">Yüksek öncelik</span>
          )}
          <button onClick={() => void load()} className="ml-auto h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Yenile</button>
          <button onClick={() => setShowCreate(true)} className="h-9 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ Görev Oluştur</button>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading && sorted.length === 0 ? (
          <table className="min-w-full text-left text-sm">
            <tbody>
              <TableRowsSkeleton rows={6} columns={6} />
            </tbody>
          </table>
        ) : sorted.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">Gösterilecek görev bulunmadı.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Görev</th>
                  <th className="px-3 py-3">Hasta</th>
                  <th className="px-3 py-3">Atanan</th>
                  <th className="px-3 py-3">Durum</th>
                  <th className="px-3 py-3">Termin</th>
                  <th className="px-3 py-3 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((task) => (
                  <tr key={task.id} className="transition hover:bg-slate-50">
                    <td className="max-w-[340px] px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-semibold text-slate-900">{task.title}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{TASK_TYPE_LABELS[task.type]}</span>
                      </div>
                      {task.details ? <p className="mt-0.5 truncate text-xs text-slate-500">{task.details}</p> : null}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      {task.patient?.id ? (
                        <Link href={`/hasta-detay?id=${task.patient.id}`} className="font-semibold text-slate-800 hover:text-primary">{task.patient.fullName}</Link>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="max-w-[220px] px-3 py-3 text-xs text-slate-500">
                      <span className="block truncate">{task.assignees && task.assignees.length > 0 ? task.assignees.map((a) => a.user.fullName).join(", ") : "-"}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + getStatusBadge(task.status)}>{TASK_STATUS_LABELS[task.status]}</span>
                        <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + getPriorityBadge(task.priority)}>Öncelik {task.priority}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{task.dueAt ? new Date(task.dueAt).toLocaleString("tr-TR") : "-"}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {task.patient?.id ? (
                          <Link href={`/hasta-detay?id=${task.patient.id}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Hasta</Link>
                        ) : null}
                        {task.status !== "BEKLEMEDE" && task.status !== "TAMAMLANDI" && task.status !== "IPTAL" && (
                          <button disabled={busyId === task.id} onClick={() => void updateStatus(task.id, "BEKLEMEDE")} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Beklet</button>
                        )}
                        {task.status !== "TAMAMLANDI" && task.status !== "IPTAL" && (
                          <button disabled={busyId === task.id} onClick={() => void updateStatus(task.id, "TAMAMLANDI")} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">Tamamla</button>
                        )}
                        {task.status !== "TAMAMLANDI" && task.status !== "IPTAL" && (
                          <button disabled={busyId === task.id} onClick={() => void updateStatus(task.id, "IPTAL")} className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">İptal</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" {...backdropClose(() => setShowCreate(false))}>
          <div className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Yeni Görev</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Kapat</button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Görev Başlığı *</label>
                <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="örn. Diş taslağı sipariş et" className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
              </div>
              <div className="relative">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Hasta (opsiyonel)</label>
                <input
                  value={selectedPatient ? selectedPatient.fullName : patientSearch}
                  onChange={(e) => { setPatientSearch(e.target.value); setSelectedPatient(null); }}
                  placeholder="Ad, telefon veya TC ile ara"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                />
                {selectedPatient && (
                  <button type="button" onClick={() => { setSelectedPatient(null); setPatientSearch(""); }} className="absolute right-2 top-7 text-xs font-semibold text-slate-400 hover:text-slate-600">Değiştir</button>
                )}
                {!selectedPatient && patientSearchLoading && <p className="mt-1 text-xs text-slate-400">Hasta aranıyor…</p>}
                {!selectedPatient && patientResults.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {patientResults.map((p) => (
                      <button key={p.id} type="button" onClick={() => { setSelectedPatient(p); setPatientResults([]); }} className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 last:border-0">
                        <span>{p.fullName}</span>
                        <span className="text-xs text-slate-400">{p.phone || ""}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[0.9fr_0.6fr_1fr_1fr]">
              <select value={taskType} onChange={(e) => setTaskType(e.target.value as StaffTask["type"])} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <option value="PARCA_SIPARIS">Parça Sipariş</option>
                <option value="LAB">Laboratuvar</option>
                <option value="ARAMA">Arama</option>
                <option value="EVRAK">Evrak</option>
                <option value="DIGER">Diğer</option>
              </select>
              <select value={taskPriority} onChange={(e) => setTaskPriority(Number(e.target.value) as 1 | 2 | 3)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <option value={1}>Düşük</option>
                <option value={2}>Orta</option>
                <option value={3}>Yüksek</option>
              </select>
              <div className="max-h-[84px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm">
                {staff.length === 0 ? <p className="text-xs text-slate-400">Personel yükleniyor…</p> : staff.map((s) => {
                  const checked = taskAssigneeIds.includes(s.id);
                  return (
                    <label key={s.id} className="flex items-center gap-2 py-1 text-xs text-slate-700">
                      <input type="checkbox" checked={checked} onChange={(e) => setTaskAssigneeIds((prev) => e.target.checked ? Array.from(new Set([...prev, s.id])) : prev.filter((id) => id !== s.id))} />
                      <span>{s.fullName}</span>
                    </label>
                  );
                })}
              </div>
              <input type="datetime-local" value={taskDueAt} onChange={(e) => setTaskDueAt(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
            </div>

            <textarea value={taskDetails} onChange={(e) => setTaskDetails(e.target.value)} rows={2} placeholder="Görev detayı (opsiyonel)" className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />

            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">İptal</button>
              <button type="button" onClick={() => void createTask()} disabled={taskSaving || !taskTitle.trim()} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                {taskSaving ? "Ekleniyor…" : "Görevi Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
