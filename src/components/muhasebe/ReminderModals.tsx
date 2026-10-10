"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { FormModal } from "@/components/ui/FormModal";
import { Button, IconButton } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { QuickDatePicker } from "@/components/ui/QuickDatePicker";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Badge } from "@/components/ui/Badge";
import { formatDateText } from "@/components/ui/Money";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { showToastSafe } from "@/lib/toast-client";
import { turkeyDateKey } from "@/lib/tz";

export type PaymentReminder = {
  id: string;
  note: string;
  reminderDate: string;
  status: string;
  planId?: string | null;
  patient?: { id: string; fullName: string } | null;
};

// Randevu açılınca sistemin kendisinin oluşturduğu SMS hatırlatma kayıtları
// ("[APPT_REMINDER]:<randevu>") bu listeye ait değildir: muhasebeci onları
// "tamamlarsa" randevu SMS'i hiç gönderilmez.
export const isSystemReminder = (reminder: { note?: string | null }) => (reminder.note || "").startsWith("[APPT_REMINDER]");

/** Aktif tahsilat hatırlatmaları (sistem kayıtları hariç), tarihi en yakın olan üstte. */
export async function fetchPaymentReminders(): Promise<PaymentReminder[]> {
  // kind=odeme: sistemin randevu SMS kayıtları sunucuda elenir (yalnız gerekeni indir).
  const response = await fetch("/api/reminder?status=AKTIF&kind=odeme", { cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || body?.message || "Hatırlatmalar yüklenemedi.");
  const list: PaymentReminder[] = Array.isArray(body) ? body : [];
  return list.filter((reminder) => !isSystemReminder(reminder)).sort((a, b) => a.reminderDate.localeCompare(b.reminderDate));
}

/** Aktif tahsilat hatırlatmalarının yalnız SAYISI ("Hatırlatmalar (n)" düğmesi; liste indirilmez). */
export async function fetchPaymentReminderCount(): Promise<number> {
  const response = await fetch("/api/reminder?status=AKTIF&kind=odeme&count=1", { cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || body?.message || "Hatırlatmalar yüklenemedi.");
  return Number(body?.count) || 0;
}

type AddProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  patient?: PickedPatient | null;
  planId?: string | null;
};

/**
 * Tahsilat hatırlatması: hastayı aramak için kendinize not (hastaya mesaj
 * gitmez; hastaya giden otomatik "Ödeme hatırlatmaları" İletişim'dedir). Tarih hızlı seçimle (Bugün / Yarın / 3 gün / 1 hafta); geçmiş
 * gün seçilemez. Plan ya da hasta bağlamından açılınca hasta sabittir.
 */
export function AddReminderModal({ open, onClose, onSaved, patient: initialPatient, planId }: AddProps) {
  const baseId = useId().replace(/:/g, "");
  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ patient?: string; note?: string; date?: string }>({});

  useEffect(() => {
    if (!open) return;
    setPatient(initialPatient || null);
    setNote("");
    setDate(turkeyDateKey());
    setError("");
    setFieldErrors({});
  }, [open, initialPatient]);

  async function submit() {
    const errors: typeof fieldErrors = {};
    if (!patient) errors.patient = "Hastayı seçin.";
    if (!note.trim()) errors.note = "Ne için aranacağını yazın.";
    if (!date) errors.date = "Tarihi seçin.";
    else if (date < turkeyDateKey()) errors.date = "Geçmiş bir gün seçilemez.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !patient) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: patient.id, ...(planId ? { planId } : {}), note: note.trim(), reminderDate: date }),
      }).catch(() => null);
      if (!response?.ok) {
        const body = await response?.json().catch(() => null);
        setError(body?.error || body?.message || (response ? "Hatırlatma kaydedilemedi." : "Bağlantı kurulamadı. Bilgileriniz korundu; tekrar deneyin."));
        return;
      }
      showToastSafe({ message: `${formatDateText(`${date}T12:00:00.000Z`)} için hatırlatma eklendi.`, type: "success" });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const locked = Boolean(initialPatient);
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Tahsilat hatırlatması ekle"
      description={[locked ? patient?.fullName : "", "Hastayı aramak için kendinize not; hastaya mesaj gitmez."].filter(Boolean).join(" · ")}
      size="md"
      module="finance"
      isDirty={Boolean(note.trim()) || (!locked && Boolean(patient)) || (Boolean(date) && date !== turkeyDateKey())}
      onSubmit={() => submit()}
      submitting={saving}
      error={error}
    >
      {!locked && (
        <FormField label="Hasta" required as="div" htmlFor={`${baseId}-patient`} error={fieldErrors.patient}>
          {/* Finans araması: hasta listesini göremeyen muhasebe de hasta seçebilir (yalnız ad, telefon, TC son 4). */}
          <PatientPicker id={`${baseId}-patient`} required scope="finance" value={patient} onChange={(next) => { setPatient(next); setFieldErrors((current) => ({ ...current, patient: undefined })); }} aria-label="Hasta" />
        </FormField>
      )}
      <FormField label="Not" required htmlFor={`${baseId}-note`} error={fieldErrors.note}>
        <Textarea
          id={`${baseId}-note`}
          rows={2}
          value={note}
          maxLength={1000}
          placeholder="Örn. 2. taksit için aranacak"
          onChange={(event) => { setNote(event.target.value); setFieldErrors((current) => ({ ...current, note: undefined })); }}
          data-autofocus={locked ? true : undefined}
        />
      </FormField>
      <QuickDatePicker
        label="Ne zaman?"
        required
        min="today"
        value={date}
        onChange={(next) => { setDate(next); setFieldErrors((current) => ({ ...current, date: undefined })); }}
        error={fieldErrors.date}
      />
    </FormModal>
  );
}

type ListProps = {
  open: boolean;
  onClose: () => void;
  canWrite: boolean;
  onChanged: () => void;
};

/** Bekleyen tahsilat hatırlatmaları: bugün ve geçmiş tarihliler önce. */
export function RemindersModal({ open, onClose, canWrite, onChanged }: ListProps) {
  const [rows, setRows] = useState<PaymentReminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchPaymentReminders());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Hatırlatmalar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const complete = async (reminder: PaymentReminder) => {
    setBusyId(reminder.id);
    const response = await fetch(`/api/reminder/${reminder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "TAMAMLANDI" }),
    }).catch(() => null);
    setBusyId("");
    if (!response?.ok) {
      const body = await response?.json().catch(() => null);
      showToastSafe({ message: body?.error || "Hatırlatma güncellenemedi.", type: "error" });
      return;
    }
    showToastSafe({ message: "Hatırlatma tamamlandı.", type: "success" });
    onChanged();
    void load();
  };

  const today = turkeyDateKey();
  const dayOf = (row: PaymentReminder) => row.reminderDate.slice(0, 10);
  const dueBadge = (row: PaymentReminder) => (dayOf(row) < today
    ? <Badge tone="critical">Geçti</Badge>
    : dayOf(row) === today ? <Badge tone="warning">Bugün</Badge> : null);
  const doneButton = (row: PaymentReminder) => (canWrite
    ? <IconButton icon={Check} title="Arandı, listeden kaldır" size="sm" tone="primary" disabled={busyId === row.id} onClick={() => void complete(row)} />
    : null);

  // Üç sütun: pencereye sığar (dört sütunlu tablo yatay kayıyor, not metni kesiliyordu).
  const columns: ListTableColumn<PaymentReminder>[] = [
    {
      key: "hasta",
      header: "Hasta",
      cellClassName: "whitespace-nowrap",
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          {row.patient?.fullName ? <span className="font-semibold text-slate-800">{row.patient.fullName}</span> : <span className="text-slate-300">—</span>}
          <span className="flex items-center gap-1.5 text-xs text-slate-500">{formatDateText(row.reminderDate)}{dueBadge(row)}</span>
        </div>
      ),
    },
    { key: "not", header: "Not", cellClassName: "whitespace-normal break-words", render: (row) => <span className="text-sm text-slate-600">{row.note}</span> },
    { key: "islem", header: "", align: "right", render: doneButton },
  ];

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Tahsilat hatırlatmaları"
        description="Aranacak hastalar; arandıkça işaretleyin."
        size="lg"
        module="finance"
        trackFormChanges={false}
        footer={(
          <>
            {canWrite && <Button variant="secondary" icon={Plus} onClick={() => setAddOpen(true)}>Hatırlatma ekle</Button>}
            <Button variant="secondary" onClick={onClose}>Kapat</Button>
          </>
        )}
      >
        <ListTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          error={error || null}
          onRetry={() => void load()}
          emptyText="Bekleyen hatırlatma yok"
          emptyDescription="Taksit planından ya da buradan hatırlatma ekleyebilirsiniz."
          mobileCard={(row) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{row.patient?.fullName || "—"}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">{formatDateText(row.reminderDate)}{dueBadge(row)}</p>
                <p className="mt-0.5 text-sm text-slate-600">{row.note}</p>
              </div>
              {doneButton(row)}
            </div>
          )}
        />
      </Modal>
      <AddReminderModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => { onChanged(); void load(); }} />
    </>
  );
}
