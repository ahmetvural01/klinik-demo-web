"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Plus, User, XCircle } from "lucide-react";
import { showToastSafe } from "@/lib/toast-client";
import { cachedGet } from "@/lib/client-cache";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";

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

function getStatusTone(status: StaffTask["status"]): BadgeTone {
  if (status === "BEKLEMEDE") return "warning";
  if (status === "TAMAMLANDI") return "success";
  return "critical"; // IPTAL
}

function getPriorityTone(priority: number): BadgeTone {
  if (priority >= 3) return "critical";
  if (priority === 2) return "warning";
  return "info";
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
  const [status, setStatus] = useState<"ACIK" | "BEKLEMEDE" | "TAMAMLANDI" | "IPTAL" | "TUMU">("TUMU");
  const [tasks, setTasks] = useState<StaffTask[]>(() => readCachedTasks("mine", "TUMU"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [role, setRole] = useState("");

  // Yeni görev oluşturma
  const [showCreate, setShowCreate] = useState(false);
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
    cachedGet<unknown>("/api/staff", 60_000)
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
      const [me, taskRes] = await Promise.all([
        cachedGet<{ role?: string } | null>("/api/auth/me", 60_000),
        fetch(`/api/clinic-tasks?take=300&scope=${scope}${status !== "TUMU" ? `&status=${status}` : ""}`, { cache: "no-store" }),
      ]);

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
    // Basit mantık: bir görev ya "yapılmadı" (aksiyon bekliyor) ya "yapıldı"
    // (Tamamlandı) ya da "yapılmayacak" (İptal). Açık/Beklemede ayrımı
    // kullanıcıyı karıştırdığı için sıralamada ikisi de aynı "yapılmadı"
    // grubunda üstte, Tamamlandı/İptal altta gösterilir.
    const isDone = (t: StaffTask) => t.status === "TAMAMLANDI" || t.status === "IPTAL";
    return [...tasks].sort((a, b) => {
      if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ad - bd;
    });
  }, [tasks]);

  const taskColumns: ListTableColumn<StaffTask>[] = [
    {
      key: "title",
      header: "Görev",
      cellClassName: "max-w-[340px]",
      render: (task) => (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-semibold text-slate-900">{task.title}</span>
            <Badge tone="neutral">{TASK_TYPE_LABELS[task.type]}</Badge>
          </div>
          {task.details ? <p className="mt-0.5 truncate text-xs text-slate-500">{task.details}</p> : null}
        </>
      ),
    },
    {
      key: "patient",
      header: "Hasta",
      render: (task) => task.patient?.id ? (
        <Link href={`/hasta-detay?id=${task.patient.id}`} className="text-xs font-semibold text-slate-800 hover:text-primary">{task.patient.fullName}</Link>
      ) : <span className="text-xs text-slate-400">-</span>,
    },
    {
      key: "assignees",
      header: "Atanan",
      cellClassName: "max-w-[220px]",
      render: (task) => (
        <span className="block truncate text-xs text-slate-500">{task.assignees && task.assignees.length > 0 ? task.assignees.map((a) => a.user.fullName).join(", ") : "-"}</span>
      ),
    },
    {
      key: "status",
      header: "Durum",
      render: (task) => (
        <div className="flex flex-wrap gap-1.5">
          {/* "Açık" (yapılmadı) varsayılan/beklenen durumdur, rozet gerektirmez —
              sadece gerçekten bilgi taşıyan durumlar (Tamamlandı/İptal/eski
              Beklemede kayıtları) işaretlenir. */}
          {task.status !== "ACIK" && <Badge tone={getStatusTone(task.status)}>{TASK_STATUS_LABELS[task.status]}</Badge>}
          <Badge tone={getPriorityTone(task.priority)}>Öncelik {task.priority}</Badge>
        </div>
      ),
    },
    {
      key: "dueAt",
      header: "Termin",
      render: (task) => <span className="text-xs text-slate-500">{task.dueAt ? new Date(task.dueAt).toLocaleString("tr-TR") : "-"}</span>,
    },
    {
      key: "islem",
      header: "İşlem",
      align: "right",
      render: (task) => (
        <div className="flex flex-wrap items-center justify-end gap-1">
          {task.patient?.id ? (
            <IconButton icon={User} title="Hasta kartını aç" tone="neutral" href={`/hasta-detay?id=${task.patient.id}`} />
          ) : null}
          {task.status !== "TAMAMLANDI" && task.status !== "IPTAL" && (
            <Button size="sm" variant="primary" disabled={busyId === task.id} onClick={() => void updateStatus(task.id, "TAMAMLANDI")}>Tamamla</Button>
          )}
          {task.status !== "TAMAMLANDI" && task.status !== "IPTAL" && (
            <IconButton icon={XCircle} title="Görevi iptal et" tone="danger" disabled={busyId === task.id} onClick={() => void updateStatus(task.id, "IPTAL")} />
          )}
        </div>
      ),
    },
  ];

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
            <option value="TUMU">Tüm Görevler</option>
            <option value="ACIK">Yapılmadı</option>
            <option value="TAMAMLANDI">Tamamlandı</option>
            <option value="IPTAL">İptal</option>
          </select>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{sorted.length} kayıt</span>
          {sorted.some((task) => task.priority >= 4) && (
            <Badge tone="critical">Yüksek öncelik</Badge>
          )}
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => void load()} className="ml-auto">Yenile</Button>
          <Button size="sm" icon={Plus} onClick={() => setShowCreate(true)}>Görev Oluştur</Button>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <ListTable<StaffTask>
        columns={taskColumns}
        rows={sorted}
        rowKey={(t) => t.id}
        loading={loading}
        emptyText="Gösterilecek görev bulunmadı."
      />

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Yeni Görev"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>İptal</Button>
            <Button onClick={() => void createTask()} disabled={!taskTitle.trim()} loading={taskSaving}>Görevi Kaydet</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Görev Başlığı" required>
            <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="örn. Diş taslağı sipariş et" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </FormField>
          <FormField label="Hasta (opsiyonel)">
            <div className="relative">
              <input
                value={selectedPatient ? selectedPatient.fullName : patientSearch}
                onChange={(e) => { setPatientSearch(e.target.value); setSelectedPatient(null); }}
                placeholder="Ad, telefon veya TC ile ara"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              />
              {selectedPatient && (
                <button type="button" onClick={() => { setSelectedPatient(null); setPatientSearch(""); }} className="absolute right-2 top-2.5 text-xs font-semibold text-slate-400 hover:text-slate-600">Değiştir</button>
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
          </FormField>
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
      </Modal>
    </section>
  );
}
