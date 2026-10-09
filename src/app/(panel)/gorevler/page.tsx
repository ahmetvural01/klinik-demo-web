"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Plus, RotateCcw, XCircle } from "lucide-react";
import { cachedGet } from "@/lib/client-cache";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { formatDateText } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { ActiveFilters, Toolbar, type ActiveFilter } from "@/components/ui/Toolbar";
import { DueLabel, PriorityBadge, dueState } from "@/components/takip/takip-labels";
import {
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  TaskFormModal,
  isOpenTask,
  type ClinicTask,
  type TaskStatus,
} from "@/components/takip/TaskFormModal";

type StaffMember = { id: string; fullName: string; isActive: boolean };

const SCOPE_KEYS = ["benim", "ekip"] as const;
type ScopeKey = (typeof SCOPE_KEYS)[number];

type StatusView = "yapilacak" | "tamamlanan" | "iptal" | "hepsi";
const STATUS_VIEWS: Array<{ value: StatusView; label: string }> = [
  { value: "yapilacak", label: "Yapılacaklar" },
  { value: "tamamlanan", label: "Tamamlananlar" },
  { value: "iptal", label: "İptal edilenler" },
  { value: "hepsi", label: "Hepsi" },
];

function matchesStatus(task: ClinicTask, view: StatusView) {
  if (view === "yapilacak") return isOpenTask(task);
  if (view === "tamamlanan") return task.status === "TAMAMLANDI";
  if (view === "iptal") return task.status === "IPTAL";
  return true;
}

function assigneeNames(task: ClinicTask) {
  return (task.assignees || []).map((assignee) => (assignee.user.isActive === false ? `${assignee.user.fullName} (pasif)` : assignee.user.fullName));
}

function GorevlerContent() {
  const { can } = usePermissions();
  const searchParams = useSearchParams();
  const canSeeAll = can("clinictasks:read-all");
  const canWriteTasks = can("clinictasks:write");
  const canCancelTasks = can("clinictasks:delete");

  // Yönetici açınca ekibin tüm işlerini görür; diğer roller kendi işlerini
  // (kendisine atanan ya da kendi açtığı). Önceden yönetici de varsayılan
  // olarak boş "Bana Atananlar" görüyordu (denetim HL-05).
  const [scope, setScope] = useTabParam<ScopeKey>(SCOPE_KEYS, canSeeAll ? "ekip" : "benim", "kapsam");
  const effectiveScope: ScopeKey = canSeeAll ? scope : "benim";
  const [statusView, setStatusView] = useState<StatusView>("yapilacak");
  const [query, setQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [tasks, setTasks] = useState<ClinicTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ClinicTask | null>(null);
  const loadSequenceRef = useRef(0);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const load = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    setLoading(true);
    setError("");
    try {
      // Durumlar istemcide süzülür: sekme sayaçları ve "gecikmiş" sayısı her görünümde doğru kalır.
      const response = await fetch(`/api/clinic-tasks?take=500&scope=${effectiveScope === "ekip" ? "all" : "involved"}`, { cache: "no-store" });
      const rows = await response.json().catch(() => null);
      if (!response.ok) throw new Error(rows?.message || "Görevler yüklenemedi.");
      if (!Array.isArray(rows)) throw new Error("Görev listesi beklenmeyen biçimde döndü.");
      if (sequence !== loadSequenceRef.current) return;
      setTasks(rows as ClinicTask[]);
      setLoaded(true);
      setNowTick(Date.now());
    } catch (loadError) {
      if (sequence !== loadSequenceRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Görevler yüklenemedi.");
    } finally {
      if (sequence === loadSequenceRef.current) setLoading(false);
    }
  }, [effectiveScope]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (document.hidden) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 300);
    };
    window.addEventListener("ks:realtime-sync", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ks:realtime-sync", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  useEffect(() => {
    if (!canSeeAll) return;
    cachedGet<StaffMember[]>("/api/staff", 60_000)
      .then((rows) => { if (Array.isArray(rows)) setStaff(rows.filter((member) => member.isActive).sort((a, b) => a.fullName.localeCompare(b.fullName, "tr"))); })
      .catch(() => {});
  }, [canSeeAll]);

  const openCreate = useCallback(() => {
    setEditingTask(null);
    setFormOpen(true);
  }, []);

  // Üst bardaki ortak "Yeni > Görev" bağlantısı (?yeni=1) görev formunu açar;
  // parametre hemen silinir ki sayfa yenilenince form tekrar açılmasın.
  const handledOpenRequestRef = useRef(false);
  const openRequested = searchParams.get("yeni") === "1";
  useEffect(() => {
    if (!openRequested) {
      handledOpenRequestRef.current = false;
      return;
    }
    if (!canWriteTasks || handledOpenRequestRef.current) return;
    handledOpenRequestRef.current = true;
    openCreate();
    const params = new URLSearchParams(window.location.search);
    params.delete("yeni");
    window.history.replaceState(null, "", window.location.pathname + (params.toString() ? `?${params.toString()}` : ""));
  }, [openRequested, canWriteTasks, openCreate]);

  /** Durum değişikliği; başarılıysa true. İptal onay ister, geri alınabilir değildir. */
  const changeStatus = async (task: ClinicTask, next: TaskStatus): Promise<boolean> => {
    if (busyId) return false;
    if (next === "IPTAL") {
      if (!canCancelTasks) return false;
      const confirmed = await confirmDialog({
        title: `"${task.title}" iptal edilsin mi?`,
        message: "Görev yapılmayacak olarak işaretlenir; geçmişi korunur.",
        danger: true,
        confirmText: "İptal et",
      });
      if (!confirmed) return false;
    }
    const previous = task;
    setBusyId(task.id);
    setTasks((current) => current.map((row) => (row.id === task.id ? { ...row, status: next } : row)));
    try {
      const response = await fetch(`/api/clinic-tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Görev güncellenemedi.");
      setTasks((current) => current.map((row) => (row.id === task.id ? (data as ClinicTask) : row)));
      showToastSafe({
        title: next === "TAMAMLANDI" ? "Görev tamamlandı" : next === "IPTAL" ? "Görev iptal edildi" : "Görev yeniden açıldı",
        message: next === "TAMAMLANDI" ? `"${task.title}" Tamamlananlar listesine taşındı; gerekirse oradan yeniden açabilirsiniz.` : `"${task.title}"`,
        type: "success",
        icon: "clipboard",
      });
      return true;
    } catch (statusError) {
      setTasks((current) => current.map((row) => (row.id === task.id ? previous : row)));
      showToastSafe({ title: "Görev güncellenemedi", message: statusError instanceof Error ? statusError.message : "Lütfen tekrar deneyin.", type: "error" });
      return false;
    } finally {
      setBusyId("");
    }
  };

  const onSaved = (saved: ClinicTask, mode: "create" | "edit") => {
    setFormOpen(false);
    setEditingTask(null);
    setTasks((current) => (mode === "create" ? [saved, ...current.filter((task) => task.id !== saved.id)] : current.map((task) => (task.id === saved.id ? saved : task))));
    if (mode === "create") {
      const assignedToOthers = (saved.assignees || []).length > 0;
      showToastSafe({
        title: "Görev kaydedildi",
        message: assignedToOthers ? `Sorumlu: ${assigneeNames(saved).join(", ")}` : "Kimseye atanmadı; görev sizin listenizde duruyor.",
        type: "success",
        icon: "clipboard",
      });
      setStatusView("yapilacak");
    } else {
      showToastSafe({ title: "Görev güncellendi", message: `"${saved.title}"`, type: "success", icon: "clipboard" });
    }
    void load();
  };

  const scoped = useMemo(() => tasks.filter((task) => {
    if (assigneeFilter && !(task.assignees || []).some((assignee) => assignee.userId === assigneeFilter)) return false;
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (q) {
      const haystack = [task.title, task.details, task.patient?.fullName, ...assigneeNames(task), TASK_TYPE_LABELS[task.type]]
        .filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
      if (!haystack.includes(q)) return false;
    }
    return true;
  }), [tasks, assigneeFilter, query]);

  const counts = useMemo(() => ({
    yapilacak: scoped.filter(isOpenTask).length,
    gecikmis: tasks.filter((task) => dueState(task.dueAt, isOpenTask(task), new Date(nowTick)) === "overdue").length,
  }), [scoped, tasks, nowTick]);

  const rows = useMemo(() => {
    const now = new Date(nowTick);
    const rank = (task: ClinicTask) => {
      if (!isOpenTask(task)) return 3;
      const state = dueState(task.dueAt, true, now);
      return state === "overdue" ? 0 : state === "today" ? 1 : 2;
    };
    return scoped.filter((task) => matchesStatus(task, statusView)).sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      if (!isOpenTask(a)) return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      if (a.priority !== b.priority) return b.priority - a.priority;
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });
  }, [scoped, statusView, nowTick]);

  const openEdit = (task: ClinicTask) => {
    setEditingTask(task);
    setFormOpen(true);
  };

  const rowActions = (task: ClinicTask) => (
    <div className="flex items-center justify-end gap-1.5">
      {canWriteTasks && isOpenTask(task) && (
        <IconButton icon={CheckCircle2} title="Tamamlandı olarak işaretle" tone="primary" disabled={busyId === task.id} onClick={() => void changeStatus(task, "TAMAMLANDI")} />
      )}
      {canWriteTasks && !isOpenTask(task) && (
        <IconButton icon={RotateCcw} title="Yeniden aç" disabled={busyId === task.id} onClick={() => void changeStatus(task, "ACIK")} />
      )}
      {canCancelTasks && isOpenTask(task) && (
        <IconButton icon={XCircle} title="Görevi iptal et" tone="danger" disabled={busyId === task.id} onClick={() => void changeStatus(task, "IPTAL")} />
      )}
    </div>
  );

  const titleCell = (task: ClinicTask) => (
    <div className="min-w-0 max-w-[360px]">
      <p className={`font-semibold ${task.status === "IPTAL" ? "text-slate-400 line-through" : "text-slate-900"}`}>{task.title}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <span>{TASK_TYPE_LABELS[task.type]}</span>
        {task.status === "BEKLEMEDE" && <Badge tone="warning">Beklemede</Badge>}
        {statusView === "hepsi" && !isOpenTask(task) && <Badge tone={task.status === "TAMAMLANDI" ? "success" : "neutral"}>{TASK_STATUS_LABELS[task.status]}</Badge>}
        <PriorityBadge value={task.priority} />
      </div>
      {task.details && <p className="mt-0.5 truncate text-xs text-slate-500" title={task.details}>{task.details}</p>}
    </div>
  );

  const columns: ListTableColumn<ClinicTask>[] = [
    { key: "title", header: "Görev", render: titleCell },
    {
      key: "patient",
      header: "Hasta",
      render: (task) => task.patient?.id ? (
        <Link href={`/hasta-detay?id=${task.patient.id}`} className="text-sm font-semibold text-slate-800 hover:text-primary hover:underline">{task.patient.fullName}</Link>
      ) : <EmptyValue />,
    },
    {
      key: "assignees",
      header: "Sorumlu",
      cellClassName: "max-w-[220px]",
      render: (task) => assigneeNames(task).length > 0
        ? <span className="block truncate text-sm text-slate-700" title={assigneeNames(task).join(", ")}>{assigneeNames(task).join(", ")}</span>
        : <span className="text-xs text-slate-400">Atanmadı</span>,
    },
    {
      key: "due",
      header: statusView === "tamamlanan" ? "Tamamlandı" : "Son tarih",
      render: (task) => statusView === "tamamlanan"
        ? (task.completedAt ? <span className="text-sm tabular-nums text-slate-600">{formatDateText(task.completedAt, "datetime")}</span> : <EmptyValue />)
        : <DueLabel at={task.dueAt} open={isOpenTask(task)} now={new Date(nowTick)} />,
    },
    { key: "islem", header: "İşlem", align: "right", render: rowActions },
  ];

  const mobileCard = (task: ClinicTask) => (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-2">
        <p className={`min-w-0 font-semibold ${task.status === "IPTAL" ? "text-slate-400 line-through" : "text-slate-900"}`}>{task.title}</p>
        <PriorityBadge value={task.priority} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{TASK_TYPE_LABELS[task.type]}</span>
        {task.patient && <span className="font-semibold text-slate-700">{task.patient.fullName}</span>}
        {assigneeNames(task).length > 0 && <span>{assigneeNames(task).join(", ")}</span>}
      </div>
      <div className="flex items-center gap-2 pt-0.5">
        {isOpenTask(task) ? <DueLabel at={task.dueAt} open now={new Date(nowTick)} /> : <Badge tone={task.status === "TAMAMLANDI" ? "success" : "neutral"}>{TASK_STATUS_LABELS[task.status]}</Badge>}
        <span className="flex-1" />
        {rowActions(task)}
      </div>
    </div>
  );

  const assigneeName = staff.find((member) => member.id === assigneeFilter)?.fullName;
  const activeFilters: ActiveFilter[] = assigneeFilter
    ? [{ key: "assignee", label: `Sorumlu: ${assigneeName || "Seçili kişi"}`, onRemove: () => setAssigneeFilter("") }]
    : [];
  const isFiltered = Boolean(query.trim() || assigneeFilter);

  return (
    <section className="space-y-3">
      <PageHeader
        icon="clipboard"
        title="Görevler"
        description="Ekip içi işler: sipariş, evrak, laboratuvar ve diğer yapılacaklar. Hastayı arama işleri Hasta Takip'te."
        stats={loaded && counts.gecikmis > 0 ? [{ label: "Gecikmiş", value: counts.gecikmis, color: "text-red-700" }] : undefined}
        actions={canWriteTasks ? <Button icon={Plus} onClick={openCreate}>Yeni Görev</Button> : undefined}
      />

      {canSeeAll && (
        <Tabs
          ariaLabel="Görev kapsamı"
          value={scope}
          onChange={(next) => { setScope(next); setAssigneeFilter(""); }}
          items={[
            { key: "benim", label: "Benim işlerim" },
            { key: "ekip", label: "Tüm ekip" },
          ]}
        />
      )}

      <Toolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Görev, hasta veya kişi ara"
          wrapperClassName="flex-1 min-w-[220px]"
        />
        <Select aria-label="Görev durumu" value={statusView} onChange={(event) => setStatusView(event.target.value as StatusView)} className="sm:w-48">
          {STATUS_VIEWS.map((view) => (
            <option key={view.value} value={view.value}>
              {view.value === "yapilacak" && loaded ? `${view.label} (${counts.yapilacak})` : view.label}
            </option>
          ))}
        </Select>
        {canSeeAll && effectiveScope === "ekip" && (
          <Select aria-label="Sorumlu kişi" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className="sm:w-52">
            <option value="">Tüm sorumlular</option>
            {staff.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}
          </Select>
        )}
      </Toolbar>
      <ActiveFilters filters={activeFilters} />

      <ListTable<ClinicTask>
        columns={columns}
        rows={rows}
        rowKey={(task) => task.id}
        loading={loading && !loaded}
        error={error && !loaded ? error : null}
        onRetry={() => void load()}
        onRowClick={openEdit}
        getRowAriaLabel={(task) => `${task.title} görevini aç`}
        mobileCard={mobileCard}
        emptyText={isFiltered ? "Aramanıza uyan görev yok" : statusView === "yapilacak" ? "Yapılacak görev yok" : "Bu listede görev yok"}
        emptyDescription={!isFiltered && statusView === "yapilacak" ? "Yeni bir iş çıktığında “Yeni Görev” ile ekleyin." : undefined}
        emptyAction={isFiltered
          ? <Button size="sm" variant="secondary" onClick={() => { setQuery(""); setAssigneeFilter(""); }}>Aramayı temizle</Button>
          : canWriteTasks && statusView === "yapilacak" ? <Button size="sm" icon={Plus} onClick={openCreate}>Yeni Görev</Button> : undefined}
        header={error && loaded ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-800">
            <span>Liste yenilenemedi: {error}</span>
            <Button size="sm" variant="secondary" onClick={() => void load()}>Yeniden dene</Button>
          </div>
        ) : undefined}
      />

      {formOpen && (
        <TaskFormModal
          key={editingTask?.id || "new"}
          open
          task={editingTask}
          onClose={() => { setFormOpen(false); setEditingTask(null); }}
          onSaved={onSaved}
          onStatusChange={changeStatus}
          canCancel={canCancelTasks}
          readOnly={!canWriteTasks}
        />
      )}
    </section>
  );
}

export default function GorevlerPage() {
  return (
    <Suspense fallback={<div className="py-20" aria-hidden="true" />}>
      <GorevlerContent />
    </Suspense>
  );
}
