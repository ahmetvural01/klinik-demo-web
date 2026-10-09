"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardList, Pause, Plus, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { Modal } from "@/components/ui/Modal";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SearchableListbox, type SearchableListboxOption } from "@/components/ui/SearchableListbox";
import { formatDateText } from "@/components/ui/Money";
import { cachedGet } from "@/lib/client-cache";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { roleLabel } from "@/lib/staff-roles";
import { turkeyDateTimeLocalValue, turkeyLocalDateTimeToUtc } from "@/lib/tz";
import { usePatientFile } from "./PatientFileContext";
import {
  errorMessageOf,
  newIdempotencyKey,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONE,
  TASK_TYPE_LABELS,
  type ClinicTask,
} from "./patient-file-shared";

type StaffMember = { id: string; fullName: string; role: string; isActive?: boolean };
type TaskForm = { title: string; type: ClinicTask["type"]; priority: number; assignees: string[]; dueAt: string; vendor: string; details: string };
const EMPTY_FORM: TaskForm = { title: "", type: "ARAMA", priority: 2, assignees: [], dueAt: "", vendor: "", details: "" };

const isOpenTask = (task: ClinicTask) => task.status === "ACIK" || task.status === "BEKLEMEDE";
const isOverdue = (task: ClinicTask) => isOpenTask(task) && Boolean(task.dueAt) && new Date(String(task.dueAt)).getTime() < Date.now();
const assigneeNames = (task: ClinicTask) =>
  task.assignees && task.assignees.length > 0
    ? task.assignees.map((item) => (item.user.isActive === false ? `${item.user.fullName} (pasif)` : item.user.fullName)).join(", ")
    : task.assignedTo?.fullName || "";

export function TasksTab() {
  const { patientId, clinicTasks, tasksLoaded, reload, can, data } = usePatientFile();
  const canWrite = can("clinictasks:write");
  const canCancel = can("clinictasks:delete");
  const [busyId, setBusyId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const rows = useMemo(() => [...clinicTasks].sort((a, b) => {
    const openDiff = Number(isOpenTask(b)) - Number(isOpenTask(a));
    if (openDiff !== 0) return openDiff;
    const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (isOpenTask(a)) return dueA - dueB;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }), [clinicTasks]);

  const setStatus = async (task: ClinicTask, status: ClinicTask["status"]) => {
    if (busyId) return;
    if (status === "IPTAL" && !(await confirmDialog({ message: `"${task.title}" görevi iptal edilsin mi? Görev geçmişte görünmeye devam eder.`, danger: true, confirmText: "Görevi iptal et" }))) return;
    setBusyId(task.id);
    try {
      const response = await fetch(`/api/clinic-tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessageOf(body, "Görev güncellenemedi."));
      showToastSafe({ type: "success", icon: "clipboard", message: `Görev: ${TASK_STATUS_LABELS[status]}.` });
      void reload(true);
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Görev güncellenemedi." });
    } finally {
      setBusyId("");
    }
  };

  const rowActions = (task: ClinicTask) => {
    if (!canWrite) return null;
    const busy = busyId === task.id;
    return (
      <div className="flex justify-end gap-1.5">
        {isOpenTask(task) && <IconButton icon={Check} title="Tamamlandı olarak işaretle" tone="primary" size="sm" disabled={busy} onClick={() => void setStatus(task, "TAMAMLANDI")} />}
        {task.status === "ACIK" && <IconButton icon={Pause} title="Beklemeye al" size="sm" disabled={busy} onClick={() => void setStatus(task, "BEKLEMEDE")} />}
        {!isOpenTask(task) || task.status === "BEKLEMEDE" ? <IconButton icon={RotateCcw} title="Yeniden aç" size="sm" disabled={busy} onClick={() => void setStatus(task, "ACIK")} /> : null}
        {canCancel && isOpenTask(task) && <IconButton icon={XCircle} title="Görevi iptal et" tone="danger" size="sm" disabled={busy} onClick={() => void setStatus(task, "IPTAL")} />}
      </div>
    );
  };

  const titleCell = (task: ClinicTask) => (
    <div className="min-w-0">
      <p className={`font-semibold ${isOpenTask(task) ? "text-slate-800" : "text-slate-500 line-through decoration-slate-300"}`}>{task.title}</p>
      {(task.details || task.vendorName) && (
        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{[task.vendorName ? `Firma: ${task.vendorName}` : "", task.details || ""].filter(Boolean).join(" · ")}</p>
      )}
    </div>
  );

  const dueCell = (task: ClinicTask) => task.dueAt
    ? <span className={`whitespace-nowrap tabular-nums ${isOverdue(task) ? "font-semibold text-red-700" : ""}`}>{formatDateText(task.dueAt, "datetime")}{isOverdue(task) ? " · gecikti" : ""}</span>
    : <EmptyValue />;

  const columns: ListTableColumn<ClinicTask>[] = [
    { key: "title", header: "Görev", render: titleCell },
    { key: "type", header: "Tür", render: (task) => <span className="whitespace-nowrap">{TASK_TYPE_LABELS[task.type] || task.type}{task.priority >= 3 ? <Badge tone="critical" className="ml-1.5">{TASK_PRIORITY_LABELS[3]}</Badge> : null}</span> },
    { key: "assignee", header: "Sorumlu", render: (task) => assigneeNames(task) || <EmptyValue /> },
    { key: "due", header: "Son tarih", render: dueCell },
    { key: "status", header: "Durum", render: (task) => <Badge tone={TASK_STATUS_TONE[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge> },
    ...(canWrite ? [{ key: "actions", header: "", align: "right" as const, render: rowActions }] : []),
  ];

  const openCount = clinicTasks.filter(isOpenTask).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {clinicTasks.length === 0 ? `${data.fullName} için görev yok.` : `${openCount} açık görev${clinicTasks.length > openCount ? ` · ${clinicTasks.length - openCount} kapanmış` : ""}.`} Bütün görevler <Link href="/gorevler" className="font-semibold text-primary hover:underline">Görevler</Link> sayfasında.
        </p>
        {canWrite && <Button variant="secondary" icon={Plus} onClick={() => setCreateOpen(true)}>Yeni görev</Button>}
      </div>

      <ListTable
        columns={columns}
        rows={rows}
        rowKey={(task) => task.id}
        loading={!tasksLoaded}
        rowClassName={(task) => (isOpenTask(task) ? "" : "opacity-70")}
        emptyIcon={ClipboardList}
        emptyText="Bu hasta için görev yok"
        emptyDescription="Ör. parça siparişi, hastayı arama veya evrak takibi için görev açın."
        emptyAction={canWrite ? <Button size="sm" variant="secondary" icon={Plus} onClick={() => setCreateOpen(true)}>Yeni görev</Button> : undefined}
        mobileCard={(task) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              {titleCell(task)}
              <Badge tone={TASK_STATUS_TONE[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge>
            </div>
            <p className="text-xs text-slate-500">{[TASK_TYPE_LABELS[task.type], assigneeNames(task)].filter(Boolean).join(" · ")}</p>
            <div className="flex items-center justify-between gap-2 text-xs">
              {dueCell(task)}
              {rowActions(task)}
            </div>
          </div>
        )}
      />

      {canWrite && <TaskCreateModal open={createOpen} onClose={() => setCreateOpen(false)} patientId={patientId} patientName={data.fullName} onCreated={() => void reload(true)} />}
    </div>
  );
}

function TaskCreateModal({ open, onClose, patientId, patientName, onCreated }: { open: boolean; onClose: () => void; patientId: string; patientName: string; onCreated: () => void }) {
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const requestKeyRef = useRef("");

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setErrors({});
    setError("");
    requestKeyRef.current = "";
  }, [open]);

  useEffect(() => {
    if (!open || staff) return;
    let active = true;
    cachedGet<StaffMember[]>("/api/staff", 60_000, { throwOnError: true })
      .then((list) => { if (active) setStaff((Array.isArray(list) ? list : []).filter((member) => member.isActive !== false)); })
      .catch(() => { if (active) setStaff([]); });
    return () => { active = false; };
  }, [open, staff]);

  const staffOptions = useMemo<SearchableListboxOption[]>(() => (staff || []).map((member) => ({
    id: member.id,
    label: member.fullName,
    meta: roleLabel(member.role),
    keywords: member.role,
  })), [staff]);

  const set = <K extends keyof TaskForm>(key: K, value: TaskForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const save = async () => {
    const next: Record<string, string> = {};
    if (form.title.trim().length < 2) next.title = "Görevi kısaca yazın (en az 2 harf).";
    if (form.dueAt) {
      const due = turkeyLocalDateTimeToUtc(form.dueAt.slice(0, 10), form.dueAt.slice(11, 16));
      if (due.getTime() < Date.now() - 5 * 60 * 1000) next.dueAt = "Son tarih geçmişte olamaz.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || saving) return;
    setSaving(true);
    setError("");
    try {
      if (!requestKeyRef.current) requestKeyRef.current = newIdempotencyKey("task");
      const response = await fetch("/api/clinic-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current },
        body: JSON.stringify({
          patientId,
          title: form.title.trim(),
          type: form.type,
          priority: form.priority,
          assignedToIds: form.assignees,
          vendorName: form.vendor.trim() || undefined,
          dueAt: form.dueAt ? turkeyLocalDateTimeToUtc(form.dueAt.slice(0, 10), form.dueAt.slice(11, 16)).toISOString() : undefined,
          details: form.details.trim() || undefined,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessageOf(body, "Görev oluşturulamadı."));
      showToastSafe({ type: "success", icon: "clipboard", message: "Görev eklendi." });
      requestKeyRef.current = "";
      onClose();
      onCreated();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Görev oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  };

  const showVendor = form.type === "PARCA_SIPARIS" || form.type === "LAB" || Boolean(form.vendor);

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      module="clipboard"
      title="Yeni görev"
      description={`${patientName} için`}
      size="md"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button>
          <Button onClick={() => void save()} loading={saving}>Kaydet</Button>
        </>
      )}
    >
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <FormErrorBanner message={error} />
        <FormField label="Görev" htmlFor="hd-task-title" required error={errors.title}>
          <Input id="hd-task-title" maxLength={180} value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="Örn. Hastayı kontrol için ara" data-autofocus />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Tür" htmlFor="hd-task-type">
            <Select id="hd-task-type" value={form.type} onChange={(event) => set("type", event.target.value as ClinicTask["type"])}>
              {(Object.keys(TASK_TYPE_LABELS) as ClinicTask["type"][]).map((key) => <option key={key} value={key}>{TASK_TYPE_LABELS[key]}</option>)}
            </Select>
          </FormField>
          <FormField label="Öncelik" htmlFor="hd-task-priority">
            <Select id="hd-task-priority" value={form.priority} onChange={(event) => set("priority", Number(event.target.value))}>
              {[1, 2, 3].map((value) => <option key={value} value={value}>{TASK_PRIORITY_LABELS[value]}</option>)}
            </Select>
          </FormField>
        </div>
        <FormField label="Kime verilsin?" hint="Boş bırakırsanız görev kimseye atanmaz; Görevler sayfasında herkes görür.">
          <SearchableListbox
            multiple
            options={staffOptions}
            value={form.assignees}
            onChange={(ids) => set("assignees", ids)}
            placeholder="Personel seçin"
            searchPlaceholder="İsim veya görevle ara"
            selectedLabel="kişi seçildi"
            allSelectedLabel="Tüm personel"
            emptyText="Aktif personel bulunamadı"
            loading={!staff}
          />
        </FormField>
        <FormField label="Son tarih" htmlFor="hd-task-due" error={errors.dueAt} hint="İsteğe bağlı.">
          <Input id="hd-task-due" type="datetime-local" min={turkeyDateTimeLocalValue()} value={form.dueAt} onChange={(event) => set("dueAt", event.target.value)} />
        </FormField>
        {showVendor && (
          <FormField label="Firma / tedarikçi" htmlFor="hd-task-vendor" hint="İsteğe bağlı.">
            <Input id="hd-task-vendor" maxLength={180} value={form.vendor} onChange={(event) => set("vendor", event.target.value)} />
          </FormField>
        )}
        <FormField label="Ayrıntı" htmlFor="hd-task-details" hint="İsteğe bağlı.">
          <Textarea id="hd-task-details" rows={2} maxLength={3000} value={form.details} onChange={(event) => set("details", event.target.value)} />
        </FormField>
      </form>
    </Modal>
  );
}
