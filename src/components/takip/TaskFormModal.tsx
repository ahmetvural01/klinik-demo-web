"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, PauseCircle, PhoneCall, PlayCircle, RotateCcw, XCircle } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { cachedGet } from "@/lib/client-cache";
import { confirmDialog } from "@/lib/confirm-client";
import { routes } from "@/lib/routes";
import { roleLabel } from "@/lib/staff-roles";
import { showToastSafe } from "@/lib/toast-client";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Disclosure } from "@/components/ui/Disclosure";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { FormModal } from "@/components/ui/FormModal";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { formatDateText } from "@/components/ui/Money";
import { DEFAULT_QUICK_DATES } from "@/components/ui/QuickDatePicker";
import { SearchableListbox, type SearchableListboxOption } from "@/components/ui/SearchableListbox";
import {
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  isOpenTask,
  toPriority,
  type Priority,
  type TaskStatus,
  type TaskType,
} from "@/components/takip/takip-labels";
import { DateTimeQuickField } from "./DateTimeQuickField";
import { defaultDueTime, newIdempotencyKey, partsToIso, splitIsoToParts, type DateTimeParts } from "./takip-utils";

// Etiketler tek kaynaktan (takip-labels); bu dosyadan da dışa açılır (geriye uyum).
export { TASK_STATUS_LABELS, TASK_TYPE_LABELS, isOpenTask };
export type { TaskStatus, TaskType };

export type ClinicTask = {
  id: string;
  title: string;
  details?: string | null;
  /** Firma / tedarikçi (parça siparişi, laboratuvar). */
  vendorName?: string | null;
  type: TaskType;
  priority: number;
  status: TaskStatus;
  dueAt?: string | null;
  remindAt?: string | null;
  completedAt?: string | null;
  patient?: { id: string; fullName: string } | null;
  /** Eski tek sorumlu alanı (sunucu döndürür); asıl liste `assignees`. */
  assignedToId?: string | null;
  assignees?: Array<{ userId: string; user: { id: string; fullName: string; role: string; isActive?: boolean } }>;
  createdBy?: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt?: string;
};

type StaffMember = { id: string; fullName: string; role: string; isActive: boolean };

type TaskFormModalProps = {
  open: boolean;
  onClose: () => void;
  /** Verilirse görev düzenlenir; verilmezse yeni görev açılır. */
  task?: ClinicTask | null;
  /** Yeni görevde önceden seçili hasta (ör. hasta dosyasından açıldığında). */
  initialPatient?: PickedPatient | null;
  onSaved: (task: ClinicTask, mode: "create" | "edit") => void;
  /** Düzenleme penceresindeki durum düğmeleri (Tamamlandı / Beklemeye al / Yeniden aç / İptal et). */
  onStatusChange?: (task: ClinicTask, next: TaskStatus) => Promise<boolean>;
  canCancel?: boolean;
  readOnly?: boolean;
  /**
   * Tür "Arama" ve hasta seçiliyken aynı sayfada hasta araması açar (görev
   * kaydedilmez; başlık ve açıklama aramanın notuna taşınır). Verilmezse
   * Aramalar ve görevler > Hasta aramaları'na bağlantı gösterilir.
   */
  onConvertToFollowUp?: (patient: PickedPatient, note: string) => void;
};

type FormState = {
  title: string;
  patient: PickedPatient | null;
  type: TaskType;
  priority: Priority;
  assigneeIds: string[];
  due: DateTimeParts;
  details: string;
  vendorName: string;
};

const TYPE_OPTIONS = (Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((value) => ({ value, label: TASK_TYPE_LABELS[value] }));

function initialForm(task: ClinicTask | null | undefined, initialPatient: PickedPatient | null | undefined, currentUserId: string): FormState {
  if (task) {
    return {
      title: task.title,
      patient: task.patient ? { id: task.patient.id, fullName: task.patient.fullName } : null,
      type: task.type,
      priority: toPriority(task.priority),
      assigneeIds: (task.assignees || []).map((assignee) => assignee.userId),
      due: splitIsoToParts(task.dueAt),
      details: task.details || "",
      vendorName: task.vendorName || "",
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
    due: { date: "", time: "" },
    details: "",
    vendorName: "",
  };
}

/**
 * Görev oluşturma ve düzenleme için TEK form (Aramalar ve görevler > Ekip görevleri;
 * hasta dosyası da kullanabilir). Zorunlu yalnız görev metni; sorumlu
 * varsayılan olarak açan kişi, son tarih hızlı gün seçimiyle. Tür, öncelik ve
 * firma "Diğer bilgiler" altında (önceden hep açıktı; firma alanı hasta
 * dosyasındaki formda vardı, burada hiç görünmüyordu). Düzenlemede durum
 * düğmeleri formun üstünde; form değiştiyse durum değişikliği alanlarla
 * birlikte TEK istekte kaydedilir (önceden değişiklikler kayboluyordu).
 */
export function TaskFormModal({ open, onClose, task, initialPatient, onSaved, onStatusChange, canCancel = false, readOnly = false, onConvertToFollowUp }: TaskFormModalProps) {
  const { can, userId: sessionUserId } = usePermissions();
  const isEdit = Boolean(task);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  // Oturumdaki kullanıcı layout'tan gelir (ayrı /api/auth/me isteği yok; "ben"
  // varsayılanı ilk çizimde hazır). Yalnız layout vermediyse istekle bulunur.
  const [currentUserId, setCurrentUserId] = useState(sessionUserId || "");
  // Pencere her açılışta yeniden kurulur (çağıran koşullu çizer), bu yüzden
  // başlangıç değerleri ve "değişti mi" karşılaştırması ilk çizimde alınır.
  const [form, setForm] = useState<FormState>(() => initialForm(task, initialPatient, sessionUserId || ""));
  const snapshotRef = useRef(JSON.stringify(initialForm(task, initialPatient, sessionUserId || "")));
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [error, setError] = useState("");
  const [titleError, setTitleError] = useState("");
  const [dueError, setDueError] = useState("");
  const requestKeyRef = useRef("");
  const canOpenFollowUp = can("hastatracking:write");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setStaffLoading(true);
    Promise.all([
      cachedGet<StaffMember[]>("/api/staff", 60_000, { throwOnError: true }).catch(() => null),
      sessionUserId ? Promise.resolve({ id: sessionUserId }) : cachedGet<{ id?: string }>("/api/auth/me", 60_000).catch(() => null),
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
  }, [open, task, sessionUserId]);

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

  /** Kaydet; `status` verilirse durum değişikliği alanlarla aynı istekte gider. */
  const save = async (status?: TaskStatus) => {
    setError("");
    if (form.title.trim().length < 2) {
      setTitleError("Görevi kısaca yazın (en az 2 harf).");
      return;
    }
    setTitleError("");
    if (form.due.date && !/^\d{2}:\d{2}$/.test(form.due.time)) {
      setDueError("Saati girin ya da günü kaldırın.");
      return;
    }
    const dueAt = partsToIso(form.due, "18:00");
    const original = splitIsoToParts(task?.dueAt);
    const dueChanged = form.due.date !== original.date || form.due.time !== original.time;
    if (dueAt && dueChanged && new Date(dueAt).getTime() < Date.now() - 5 * 60 * 1000) {
      setDueError("Son tarih geçmişte olamaz.");
      return;
    }
    setDueError("");
    setSaving(true);
    try {
      const body = isEdit
        ? {
            title: form.title.trim(),
            details: form.details.trim() || null,
            vendorName: form.vendorName.trim() || null,
            type: form.type,
            priority: form.priority,
            dueAt: dueAt || null,
            assignedToIds: form.assigneeIds,
            ...(status ? { status } : {}),
          }
        : {
            patientId: form.patient?.id || undefined,
            title: form.title.trim(),
            details: form.details.trim() || undefined,
            vendorName: form.vendorName.trim() || undefined,
            type: form.type,
            priority: form.priority,
            dueAt: dueAt || undefined,
            assignedToIds: form.assigneeIds,
            status: "ACIK",
          };
      const response = await fetch(isEdit ? `/api/clinic-tasks/${task!.id}` : "/api/clinic-tasks", {
        method: isEdit ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(isEdit ? {} : { "Idempotency-Key": requestKeyRef.current || (requestKeyRef.current = newIdempotencyKey("task")) }),
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
    if (!task) return;
    if (dirty) {
      if (next === "IPTAL") {
        const confirmed = await confirmDialog({
          title: `"${form.title.trim() || task.title}" iptal edilsin mi?`,
          message: "Görev yapılmayacak olarak işaretlenir; geçmişi korunur.",
          danger: true,
          confirmText: "İptal et",
        });
        if (!confirmed) return;
      }
      await save(next);
      return;
    }
    if (!onStatusChange) return;
    setStatusBusy(true);
    try {
      const ok = await onStatusChange(task, next);
      if (ok) onClose();
    } finally {
      setStatusBusy(false);
    }
  };

  const taskOpen = task ? isOpenTask(task) : true;
  const statusActions = isEdit && task && !readOnly && onStatusChange;
  const showCallHint = form.type === "ARAMA" && form.patient && !isEdit;
  // Aramanın notu en çok 1800 karakter (arama formu sınırı; API 2000'i aşan notu reddeder).
  const callNote = [form.title.trim(), form.details.trim()].filter(Boolean).join("\n").slice(0, 1800);
  const callLink = form.patient
    ? routes.todos("arama", { yeni: 1, patientId: form.patient.id, patientName: form.patient.fullName, not: callNote.slice(0, 500) })
    : "";
  const otherSummary = [
    TASK_TYPE_LABELS[form.type],
    `${PRIORITY_LABELS[form.priority]} öncelik`,
    form.vendorName.trim() || null,
  ].filter(Boolean).join(" · ");
  const busy = saving || statusBusy;

  const fields = (
    <>
      {isEdit && task && (
        <Callout
          tone="neutral"
          compact
          icon={null}
          title={(
            <span className="flex flex-wrap items-center gap-2">
              Durum
              <Badge tone={task.status === "TAMAMLANDI" ? "success" : task.status === "BEKLEMEDE" ? "warning" : "neutral"}>{TASK_STATUS_LABELS[task.status]}</Badge>
              {task.status === "TAMAMLANDI" && task.completedAt && (
                <span className="text-xs font-normal text-slate-500">{formatDateText(task.completedAt, "datetime")}</span>
              )}
            </span>
          )}
          action={statusActions ? (
            taskOpen ? (
              <>
                <Button size="sm" variant="secondary" icon={CheckCircle2} disabled={busy} onClick={() => void changeStatus("TAMAMLANDI")}>Tamamlandı</Button>
                {task.status === "BEKLEMEDE"
                  ? <Button size="sm" variant="ghost" icon={PlayCircle} disabled={busy} onClick={() => void changeStatus("ACIK")}>Devam et</Button>
                  : <Button size="sm" variant="ghost" icon={PauseCircle} disabled={busy} onClick={() => void changeStatus("BEKLEMEDE")}>Beklemeye al</Button>}
              </>
            ) : (
              <Button size="sm" variant="secondary" icon={RotateCcw} disabled={busy} onClick={() => void changeStatus("ACIK")}>Yeniden aç</Button>
            )
          ) : undefined}
        />
      )}

      <FormField label="Görev" htmlFor="task-title" required error={titleError}>
        <Input
          id="task-title"
          value={form.title}
          onChange={(event) => set("title", event.target.value)}
          placeholder="Örn. İmplant parçası sipariş et"
          maxLength={180}
          disabled={readOnly}
          data-autofocus
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Esc yalnız listeyi kapatır, arama kutusunda Enter formu göndermez: ortak SearchableListbox (önceden yerel koruma vardı). */}
        <FormField label="Sorumlu" as="div" htmlFor="task-assignees" hint="Birden çok kişi seçilebilir.">
          <SearchableListbox
            id="task-assignees"
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
        <FormField label="Hasta" as="div">
          <PatientPicker
            value={form.patient}
            onChange={(patient) => set("patient", patient)}
            locked={isEdit}
            disabled={readOnly}
            aria-label="Hasta (isteğe bağlı)"
          />
        </FormField>
      </div>

      <DateTimeQuickField
        label="Son tarih"
        value={form.due}
        onChange={(due) => { set("due", due); setDueError(""); }}
        defaultTime={defaultDueTime}
        options={DEFAULT_QUICK_DATES}
        min={isEdit ? undefined : "today"}
        error={dueError || undefined}
        disabled={readOnly}
      />

      <FormField label="Açıklama" htmlFor="task-details">
        <Textarea
          id="task-details"
          value={form.details}
          onChange={(event) => set("details", event.target.value)}
          rows={2}
          maxLength={3000}
          placeholder="Ölçü, adet gibi ayrıntılar"
          disabled={readOnly}
        />
      </FormField>

      <Disclosure title="Diğer bilgiler" summary={otherSummary} defaultOpen={readOnly}>
        <div className="space-y-4">
          <ChoiceCards label="Tür" variant="pills" options={TYPE_OPTIONS.map((option) => ({ ...option, disabled: readOnly }))} value={form.type} onChange={(value) => set("type", value)} />
          <ChoiceCards
            label="Öncelik"
            variant="pills"
            options={PRIORITY_OPTIONS.map((option) => ({ ...option, disabled: readOnly }))}
            value={String(form.priority) as "1" | "2" | "3"}
            onChange={(value) => set("priority", toPriority(value))}
          />
          <FormField label="Firma / tedarikçi" htmlFor="task-vendor">
            <Input id="task-vendor" value={form.vendorName} onChange={(event) => set("vendorName", event.target.value)} maxLength={180} placeholder="Örn. Marmara Dental Lab" disabled={readOnly} />
          </FormField>
        </div>
      </Disclosure>

      {showCallHint && (
        <Callout
          tone="info"
          compact
          title="Hasta aramaları ayrı listede izlenir"
          action={canOpenFollowUp ? (
            onConvertToFollowUp
              ? <Button size="sm" variant="secondary" icon={PhoneCall} onClick={() => onConvertToFollowUp(form.patient!, callNote)}>Hasta araması olarak aç</Button>
              : <Button size="sm" variant="secondary" icon={PhoneCall} href={callLink}>Hasta araması olarak aç</Button>
          ) : undefined}
        >
          Görüşme sonucu ve sonraki arama günü orada tutulur.
        </Callout>
      )}
    </>
  );

  const description = isEdit && task
    ? `${task.createdBy?.fullName ? `${task.createdBy.fullName} açtı` : "Açılış"} · ${formatDateText(task.createdAt, "datetime")}`
    : undefined;

  if (readOnly) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Görev"
        description={description}
        module="clipboard"
        size="lg"
        trackFormChanges={false}
        footer={<Button variant="secondary" onClick={onClose}>Vazgeç</Button>}
      >
        <div className="space-y-4">
          <FormErrorBanner message={error} />
          {fields}
        </div>
      </Modal>
    );
  }

  return (
    <FormModal
      open={open}
      onClose={onClose}
      onSubmit={() => save()}
      submitting={busy}
      isDirty={dirty}
      error={error}
      title={isEdit ? "Görevi düzenle" : "Yeni görev"}
      description={description}
      module="clipboard"
      size="lg"
      dangerAction={statusActions && taskOpen && canCancel ? { label: "Görevi iptal et", icon: XCircle, onClick: () => void changeStatus("IPTAL"), disabled: busy } : undefined}
    >
      {fields}
    </FormModal>
  );
}
