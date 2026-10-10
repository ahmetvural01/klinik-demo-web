"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { DueLabel, PriorityBadge, TASK_STATUS_LABELS, TASK_TYPE_LABELS, isOpenTask } from "@/components/takip/takip-labels";
import { showToastSafe } from "@/lib/toast-client";
import { usePatientFile } from "./PatientFileContext";
import type { ClinicTask } from "./patient-file-shared";

const assigneeNames = (task: ClinicTask) =>
  task.assignees && task.assignees.length > 0
    ? task.assignees.map((item) => (item.user.isActive === false ? `${item.user.fullName} (pasif)` : item.user.fullName)).join(", ")
    : task.assignedTo?.fullName || "";

/**
 * Hastaya bağlı görevler — Özet'te, ayrı sekme yerine. Görev açma ve düzenleme
 * Görevler sayfasıyla aynı penceredir (components/takip/TaskFormModal):
 * aynı alanlar, aynı varsayılanlar (tür "Diğer", sorumlu açan kişi), aynı
 * durum adları. Satıra tıklamak görevi açar; satırda yalnız "Tamamlandı".
 */
export function TasksSection() {
  const { clinicTasks, tasksLoaded, tasksError, loadTasks, can, openTaskForm, reload } = usePatientFile();
  const canWrite = can("clinictasks:write");
  const [showClosed, setShowClosed] = useState(false);
  const [busyId, setBusyId] = useState("");

  // Görevler yalnız bu bölüm görününce okunur (dosya başka sekmede açıldıysa).
  useEffect(() => { loadTasks(); }, [loadTasks]);

  const { open, closed } = useMemo(() => {
    const due = (task: ClinicTask) => (task.dueAt ? new Date(task.dueAt).getTime() : Number.MAX_SAFE_INTEGER);
    return {
      open: clinicTasks.filter(isOpenTask).sort((a, b) => due(a) - due(b)),
      closed: clinicTasks.filter((task) => !isOpenTask(task)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    };
  }, [clinicTasks]);
  const rows = showClosed ? [...open, ...closed] : open;

  const complete = async (task: ClinicTask) => {
    if (busyId) return;
    setBusyId(task.id);
    try {
      const response = await fetch(`/api/clinic-tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "TAMAMLANDI" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error((body && typeof body.message === "string" && body.message) || "Görev güncellenemedi.");
      showToastSafe({ type: "success", icon: "clipboard", message: "Görev tamamlandı." });
      void reload(true);
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Görev güncellenemedi." });
    } finally {
      setBusyId("");
    }
  };

  const titleCell = (task: ClinicTask) => (
    <div className="min-w-0">
      <p className={`font-semibold ${isOpenTask(task) ? "text-slate-800" : "text-slate-500 line-through decoration-slate-300"}`}>{task.title}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <span>{TASK_TYPE_LABELS[task.type] || task.type}</span>
        <PriorityBadge value={task.priority} />
        {!isOpenTask(task) && <Badge tone={task.status === "TAMAMLANDI" ? "success" : "neutral"}>{TASK_STATUS_LABELS[task.status]}</Badge>}
      </p>
      {(task.details || task.vendorName) && (
        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{[task.vendorName ? `Firma: ${task.vendorName}` : "", task.details || ""].filter(Boolean).join(" · ")}</p>
      )}
    </div>
  );

  const action = (task: ClinicTask) => (canWrite && isOpenTask(task)
    ? <IconButton icon={Check} title="Tamamlandı olarak işaretle" tone="primary" size="sm" disabled={busyId === task.id} onClick={() => void complete(task)} />
    : null);

  const columns: ListTableColumn<ClinicTask>[] = [
    { key: "title", header: "Görev", render: titleCell },
    { key: "assignee", header: "Sorumlu", render: (task) => assigneeNames(task) || <EmptyValue /> },
    { key: "due", header: "Son tarih", render: (task) => <DueLabel at={task.dueAt} open={isOpenTask(task)} /> },
    ...(canWrite ? [{ key: "actions", header: "", align: "right" as const, render: action }] : []),
  ];

  // Hastaya bağlı görev yoksa bölüm çizilmez: üstteki "Yapılacaklar" zaten
  // "bekleyen iş yok" diyor, boş "Görevler" tablosu aynı şeyi ikinci kez
  // söylüyordu. Yeni görev "İşlem ekle > Yeni görev"den açılır. Görevler
  // gelene kadar da yer ayrılmaz (bölüm sütunun en altında; ekran kaymaz).
  if (!tasksLoaded || (!tasksError && clinicTasks.length === 0)) return null;

  return (
    <div className="space-y-2">
      <ListTable
        title="Görevler"
        titleAs="h2"
        actions={canWrite ? <Button size="sm" variant="secondary" icon={Plus} onClick={() => openTaskForm()}>Yeni görev</Button> : undefined}
        columns={columns}
        rows={rows}
        rowKey={(task) => task.id}
        loading={!tasksLoaded}
        // Okunamadıysa "görev yok" yazılmaz: liste boşsa hata, eldeyse "yenilenemedi" şeridi.
        error={tasksError && clinicTasks.length === 0 ? "Hastanın görevleri yüklenemedi." : null}
        // Şerit kendi cümlesini ekler ("… Son yüklenen liste gösteriliyor.").
        staleError={tasksError && clinicTasks.length > 0 ? "Görevler yenilenemedi." : null}
        onRetry={() => loadTasks(true)}
        skeletonRows={2}
        onRowClick={(task) => openTaskForm(task)}
        getRowAriaLabel={(task) => `${task.title} görevini aç`}
        rowClassName={(task) => (isOpenTask(task) ? "" : "opacity-70")}
        emptyIcon={ClipboardList}
        emptyText={closed.length > 0 ? "Açık görev yok" : "Bu hasta için görev yok"}
        mobileCard={(task) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              {titleCell(task)}
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                {assigneeNames(task) && <span>{assigneeNames(task)}</span>}
                {task.dueAt && <DueLabel at={task.dueAt} open={isOpenTask(task)} />}
              </p>
            </div>
            {action(task)}
          </div>
        )}
      />
      {closed.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setShowClosed((current) => !current)} aria-expanded={showClosed}>
          {showClosed ? "Kapanmış görevleri gizle" : `Kapanmış görevleri göster (${closed.length})`}
        </Button>
      )}
    </div>
  );
}
