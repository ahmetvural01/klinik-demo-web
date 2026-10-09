"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { cachedGet } from "@/lib/client-cache";
import { roleLabel } from "@/lib/staff-roles";
import { showToastSafe } from "@/lib/toast-client";
import { turkeyDateTimeLocalValue, turkeyLocalDateTimeToUtc } from "@/lib/tz";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { formatDateText } from "@/components/ui/Money";
import { SearchableListbox, type SearchableListboxOption } from "@/components/ui/SearchableListbox";
import { PRIORITY_LABELS, type Priority } from "@/components/takip/takip-labels";

export type TaskType = "PARCA_SIPARIS" | "LAB" | "ARAMA" | "EVRAK" | "DIGER";
export type TaskStatus = "ACIK" | "BEKLEMEDE" | "TAMAMLANDI" | "IPTAL";

export type ClinicTask = {
  id: string;
  title: string;
  details?: string | null;
  type: TaskType;
  priority: number;
  status: TaskStatus;
  dueAt?: string | null;
  completedAt?: string | null;
  patient?: { id: string; fullName: string } | null;
  assignees?: Array<{ userId: string; user: { id: string; fullName: string; role: string; isActive?: boolean } }>;
  createdBy?: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt?: string;
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  PARCA_SIPARIS: "Parça siparişi",
  LAB: "Laboratuvar",
  ARAMA: "Arama",
  EVRAK: "Evrak",
  DIGER: "Diğer",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  ACIK: "Yapılacak",
  BEKLEMEDE: "Beklemede",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal edildi",
};

export const isOpenTask = (task: Pick<ClinicTask, "status">) => task.status === "ACIK" || task.status === "BEKLEMEDE";

type StaffMember = { id: string; fullName: string; role: string; isActive: boolean };

type TaskFormModalProps = {
  open: boolean;
  onClose: () => void;
  /** Verilirse görev düzenlenir; verilmezse yeni görev açılır. */
  task?: ClinicTask | null;
  /** Yeni görevde önceden seçili hasta (ör. hasta dosyasından açıldığında). */
  initialPatient?: PickedPatient | null;
  onSaved: (task: ClinicTask, mode: "create" | "edit") => void;
  /** Düzenleme penceresindeki durum düğmeleri (Tamamlandı / Yeniden aç / İptal et). */
  onStatusChange?: (task: ClinicTask, next: TaskStatus) => Promise<boolean>;
  canCancel?: boolean;
  readOnly?: boolean;
};

type FormState = {
  title: string;
  patient: PickedPatient | null;
  type: TaskType;
  priority: Priority;
  assigneeIds: string[];
  dueAt: string;
  details: string;
};

function toLocalInput(iso?: string | null) {
  return iso ? turkeyDateTimeLocalValue(new Date(iso)) : "";
}

function localInputToIso(value: string) {
  return turkeyLocalDateTimeToUtc(value.slice(0, 10), value.slice(11, 16)).toISOString();
}

function initialForm(task: ClinicTask | null | undefined, initialPatient: PickedPatient | null | undefined, currentUserId: string): FormState {
  if (task) {
    return {
      title: task.title,
      patient: task.patient ? { id: task.patient.id, fullName: task.patient.fullName } : null,
      type: task.type,
      priority: (task.priority >= 3 ? 3 : task.priority <= 1 ? 1 : 2) as Priority,
      assigneeIds: (task.assignees || []).map((assignee) => assignee.userId),
      dueAt: toLocalInput(task.dueAt),
      details: task.details || "",
    };
  }
  return {
    title: "",
    patient: initialPatient || null,
    type: "DIGER",
    priority: 2,
    // Yeni görev varsayılan olarak açan kişiye atanır: önceden boş bırakılan
    // görev kimsenin listesinde görünmüyordu (bkz. denetim HL-05). Kullanıcı
    // başka personel seçebilir ya da kendini çıkarabilir.
    assigneeIds: currentUserId ? [currentUserId] : [],
    dueAt: "",
    details: "",
  };
}

/**
 * Görev oluşturma ve düzenleme için TEK form (Görevler sayfası; hasta
 * dosyası da kullanabilir). Düzenlemede başlık, sorumlu, son tarih, öncelik
 * ve tür değiştirilebilir; durum düğmeleri formun üstünde durur.
 */
export function TaskFormModal({ open, onClose, task, initialPatient, onSaved, onStatusChange, canCancel = false, readOnly = false }: TaskFormModalProps) {
  const isEdit = Boolean(task);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  // Pencere her açılışta yeniden kurulur (çağıran koşullu çizer), bu yüzden
  // başlangıç değerleri ve "değişti mi" karşılaştırması ilk çizimde alınır.
  const [form, setForm] = useState<FormState>(() => initialForm(task, initialPatient, ""));
  const snapshotRef = useRef(JSON.stringify(initialForm(task, initialPatient, "")));
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [error, setError] = useState("");
  const [titleError, setTitleError] = useState("");
  const requestKeyRef = useRef("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setStaffLoading(true);
    Promise.all([
      cachedGet<StaffMember[]>("/api/staff", 60_000, { throwOnError: true }).catch(() => null),
      cachedGet<{ id?: string }>("/api/auth/me", 60_000).catch(() => null),
    ]).then(([staffData, me]) => {
      if (!active) return;
      if (Array.isArray(staffData)) setStaff(staffData.filter((member) => member.isActive));
      else showToastSafe({ title: "Personel listesi alınamadı", message: "Sorumlu seçimi için sayfayı yenileyip tekrar deneyin.", type: "error" });
      const meId = me?.id || "";
      setCurrentUserId(meId);
      if (!task) {
        // Yeni görev: kullanıcı henüz bir şey seçmediyse kendisi sorumlu gelir.
        setForm((current) => {
          if (current.assigneeIds.length > 0 || !meId) return current;
          const next = { ...current, assigneeIds: [meId] };
          snapshotRef.current = JSON.stringify(next);
          return next;
        });
      }
    }).finally(() => { if (active) setStaffLoading(false); });
    return () => { active = false; };
  }, [open, task]);

  const staffOptions = useMemo<SearchableListboxOption[]>(() => {
    const options = staff.map((member) => ({
      id: member.id,
      label: member.id === currentUserId ? `${member.fullName} (ben)` : member.fullName,
      meta: roleLabel(member.role),
      keywords: `${member.role} ${roleLabel(member.role)}`,
    }));
    // Düzenlenen görevde artık aktif olmayan sorumlu da listede görünsün (kaybolmasın).
    for (const assignee of task?.assignees || []) {
      if (!options.some((option) => option.id === assignee.userId)) {
        options.push({ id: assignee.userId, label: `${assignee.user.fullName} (pasif)`, meta: roleLabel(assignee.user.role), keywords: assignee.user.role });
      }
    }
    return options;
  }, [staff, currentUserId, task]);

  const dirty = JSON.stringify(form) !== snapshotRef.current;
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setError("");
    if (form.title.trim().length < 2) {
      setTitleError("Görevi kısaca yazın (en az 2 harf).");
      return;
    }
    setTitleError("");
    const dueChanged = form.dueAt !== toLocalInput(task?.dueAt);
    if (form.dueAt && dueChanged && new Date(localInputToIso(form.dueAt)).getTime() < Date.now() - 5 * 60 * 1000) {
      setError("Son tarih geçmişte olamaz.");
      return;
    }
    setSaving(true);
    try {
      const body = isEdit
        ? {
            title: form.title.trim(),
            details: form.details.trim() || null,
            type: form.type,
            priority: form.priority,
            dueAt: form.dueAt ? localInputToIso(form.dueAt) : null,
            assignedToIds: form.assigneeIds,
          }
        : {
            patientId: form.patient?.id || undefined,
            title: form.title.trim(),
            details: form.details.trim() || undefined,
            type: form.type,
            priority: form.priority,
            dueAt: form.dueAt ? localInputToIso(form.dueAt) : undefined,
            assignedToIds: form.assigneeIds,
            status: "ACIK",
          };
      const response = await fetch(isEdit ? `/api/clinic-tasks/${task!.id}` : "/api/clinic-tasks", {
        method: isEdit ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(isEdit ? {} : { "Idempotency-Key": requestKeyRef.current || (requestKeyRef.current = crypto.randomUUID()) }),
        },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.message || "Görev kaydedilemedi. Bilgileri kontrol edin.");
        return;
      }
      onSaved(data as ClinicTask, isEdit ? "edit" : "create");
    } catch {
      setError("Bağlantı kurulamadı. Yazdıklarınız korunuyor; tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (next: TaskStatus) => {
    if (!task || !onStatusChange) return;
    setStatusBusy(true);
    try {
      const ok = await onStatusChange(task, next);
      if (ok) onClose();
    } finally {
      setStatusBusy(false);
    }
  };

  const taskOpen = task ? isOpenTask(task) : true;
  const showCallHint = form.type === "ARAMA" && form.patient;

  return (
    <Modal
      open={open}
      onClose={onClose}
      isDirty={dirty}
      title={isEdit ? "Görev" : "Yeni Görev"}
      description={isEdit && task
        ? `${task.createdBy?.fullName ? `${task.createdBy.fullName} açtı` : "Açılış"} · ${formatDateText(task.createdAt, "datetime")}`
        : "Ekipten birinin yapacağı işi yazın; sorumlu kişi kendi listesinde görür."}
      module="clipboard"
      size="lg"
      footer={readOnly ? (
        <Button variant="secondary" onClick={onClose}>Kapat</Button>
      ) : (
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button onClick={() => void save()} loading={saving}>Kaydet</Button>
        </>
      )}
    >
      <div className="space-y-4">
        {isEdit && task && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
            <span className="text-xs font-semibold text-slate-500">Durum</span>
            <Badge tone={task.status === "TAMAMLANDI" ? "success" : task.status === "BEKLEMEDE" ? "warning" : "neutral"}>{TASK_STATUS_LABELS[task.status]}</Badge>
            {task.status === "TAMAMLANDI" && task.completedAt && (
              <span className="text-xs text-slate-500">{formatDateText(task.completedAt, "datetime")}</span>
            )}
            {!readOnly && onStatusChange && (
              <div className="ml-auto flex flex-wrap gap-2">
                {taskOpen ? (
                  <>
                    <Button size="sm" variant="secondary" icon={CheckCircle2} disabled={statusBusy} onClick={() => void changeStatus("TAMAMLANDI")}>Tamamlandı</Button>
                    {canCancel && <Button size="sm" variant="ghost" icon={XCircle} disabled={statusBusy} onClick={() => void changeStatus("IPTAL")} className="text-red-700 hover:bg-red-50 hover:text-red-800">İptal et</Button>}
                  </>
                ) : (
                  <Button size="sm" variant="secondary" icon={RotateCcw} disabled={statusBusy} onClick={() => void changeStatus("ACIK")}>Yeniden aç</Button>
                )}
              </div>
            )}
          </div>
        )}

        <FormErrorBanner message={error} />

        <FormField label="Görev" htmlFor="task-title" required error={titleError}>
          <Input
            id="task-title"
            value={form.title}
            onChange={(event) => set("title", event.target.value)}
            placeholder="Örn. Implant parçası sipariş et"
            maxLength={180}
            disabled={readOnly}
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Sorumlu" hint="Görevi kim yapacak? Birden çok kişi seçebilirsiniz.">
            <SearchableListbox
              multiple
              options={staffOptions}
              value={form.assigneeIds}
              onChange={(ids) => set("assigneeIds", ids)}
              placeholder="Personel seçin"
              searchPlaceholder="İsim veya rolle ara"
              selectedLabel="kişi seçildi"
              allSelectedLabel="Tüm personel"
              emptyText="Aktif personel bulunamadı"
              loading={staffLoading}
              disabled={readOnly}
            />
          </FormField>
          <FormField label="Son tarih" htmlFor="task-due" hint="Boş bırakılabilir.">
            <Input
              id="task-due"
              type="datetime-local"
              min={isEdit ? undefined : turkeyDateTimeLocalValue()}
              value={form.dueAt}
              onChange={(event) => set("dueAt", event.target.value)}
              disabled={readOnly}
            />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr_0.8fr]">
          <FormField label="Hasta" hint={isEdit ? undefined : "İş bir hastayla ilgiliyse seçin."}>
            <PatientPicker
              value={form.patient}
              onChange={(patient) => set("patient", patient)}
              locked={isEdit}
              disabled={readOnly}
              aria-label="Hasta (isteğe bağlı)"
            />
          </FormField>
          <FormField label="Tür" htmlFor="task-type">
            <Select id="task-type" value={form.type} onChange={(event) => set("type", event.target.value as TaskType)} disabled={readOnly}>
              {(Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((type) => (
                <option key={type} value={type}>{TASK_TYPE_LABELS[type]}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Öncelik" htmlFor="task-priority">
            <Select id="task-priority" value={form.priority} onChange={(event) => set("priority", Number(event.target.value) as Priority)} disabled={readOnly}>
              {([1, 2, 3] as Priority[]).map((value) => <option key={value} value={value}>{PRIORITY_LABELS[value]}</option>)}
            </Select>
          </FormField>
        </div>

        {showCallHint && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Hastayı arama işi için{" "}
            <Link
              href={`/hasta-takip?yeni=1&patientId=${form.patient!.id}&patientName=${encodeURIComponent(form.patient!.fullName)}`}
              className="font-semibold underline"
            >
              Hasta Takip&apos;te takip açın
            </Link>
            : görüşme sonucu, sonraki arama tarihi ve randevu orada tutulur.
          </p>
        )}

        <FormField label="Açıklama" htmlFor="task-details">
          <Textarea
            id="task-details"
            value={form.details}
            onChange={(event) => set("details", event.target.value)}
            rows={3}
            maxLength={3000}
            placeholder="İsteğe bağlı: firma, ölçü, adet gibi ayrıntılar"
            disabled={readOnly}
          />
        </FormField>
      </div>
    </Modal>
  );
}
