"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Badge } from "@/components/ui/Badge";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { showToastSafe } from "@/lib/toast-client";
import { shortDate, todayKey } from "@/components/muhasebe/muhasebe-utils";

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

/** Aktif ödeme hatırlatmaları (sistem kayıtları hariç), tarihi en yakın olan üstte. */
export async function fetchPaymentReminders(): Promise<PaymentReminder[]> {
  const response = await fetch("/api/reminder?status=AKTIF", { cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || body?.message || "Hatırlatmalar yüklenemedi.");
  const list: PaymentReminder[] = Array.isArray(body) ? body : [];
  return list.filter((reminder) => !isSystemReminder(reminder)).sort((a, b) => a.reminderDate.localeCompare(b.reminderDate));
}

type AddProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  patient?: PickedPatient | null;
  planId?: string | null;
};

export function AddReminderModal({ open, onClose, onSaved, patient: initialPatient, planId }: AddProps) {
  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayKey());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ patient?: string; note?: string; date?: string }>({});

  useEffect(() => {
    if (!open) return;
    setPatient(initialPatient || null);
    setNote("");
    setDate(todayKey());
    setError("");
    setFieldErrors({});
  }, [open, initialPatient]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (saving) return;
    const errors: typeof fieldErrors = {};
    if (!patient) errors.patient = "Hastayı seçin.";
    if (!note.trim()) errors.note = "Ne hatırlatılacağını yazın.";
    if (!date) errors.date = "Tarih seçin.";
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
        setError(body?.error || body?.message || "Hatırlatma kaydedilemedi.");
        return;
      }
      showToastSafe({ message: `${shortDate(date)} için hatırlatma eklendi.`, type: "success" });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ödeme hatırlatması ekle"
      description="Hastayı aramanız için kendinize not. Hastaya otomatik mesaj gönderilmez."
      size="md"
      module="finance"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button>
          <Button type="submit" form="reminder-form" loading={saving}>Kaydet</Button>
        </>
      )}
    >
      <form id="reminder-form" onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
        <FormErrorBanner message={error} />
        <FormField label="Hasta" required htmlFor="reminder-patient" error={fieldErrors.patient}>
          <PatientPicker id="reminder-patient" value={patient} onChange={setPatient} locked={Boolean(initialPatient)} aria-label="Hasta" />
        </FormField>
        <FormField label="Not" required htmlFor="reminder-note" error={fieldErrors.note}>
          <Textarea id="reminder-note" value={note} maxLength={1000} placeholder="Örn. 2. taksit için aranacak" onChange={(event) => setNote(event.target.value)} />
        </FormField>
        <FormField label="Hatırlatma tarihi" required htmlFor="reminder-date" error={fieldErrors.date}>
          <Input id="reminder-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </FormField>
      </form>
    </Modal>
  );
}

type ListProps = {
  open: boolean;
  onClose: () => void;
  canWrite: boolean;
  onChanged: () => void;
};

/** Bekleyen ödeme hatırlatmaları: bugün ve geçmiş tarihliler önce. */
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

  const today = todayKey();
  const columns: ListTableColumn<PaymentReminder>[] = [
    {
      key: "tarih",
      header: "Tarih",
      cellClassName: "whitespace-nowrap",
      render: (row) => {
        const day = row.reminderDate.slice(0, 10);
        return (
          <div className="flex flex-col items-start gap-1">
            <span className="text-sm text-slate-700">{shortDate(row.reminderDate)}</span>
            {day < today ? <Badge tone="critical">Geçti</Badge> : day === today ? <Badge tone="warning">Bugün</Badge> : null}
          </div>
        );
      },
    },
    { key: "hasta", header: "Hasta", render: (row) => <span className="font-semibold text-slate-800">{row.patient?.fullName || "Hasta yok"}</span> },
    { key: "not", header: "Not", render: (row) => <span className="text-sm text-slate-600">{row.note}</span> },
    {
      key: "islem",
      header: "",
      align: "right",
      render: (row) => canWrite ? <IconButton icon={Check} title="Yapıldı olarak işaretle" size="sm" tone="primary" disabled={busyId === row.id} onClick={() => void complete(row)} /> : null,
    },
  ];

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Ödeme hatırlatmaları"
        description="Aranması gereken hastalar. Yapılanı işaretleyin; listeden kalkar."
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
          emptyDescription="Taksit planı penceresinden ya da buradan hatırlatma ekleyebilirsiniz."
          mobileCard={(row) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{row.patient?.fullName || "Hasta yok"}</p>
                <p className="text-xs text-slate-500">{shortDate(row.reminderDate)}{row.reminderDate.slice(0, 10) < today ? " · geçti" : row.reminderDate.slice(0, 10) === today ? " · bugün" : ""}</p>
                <p className="mt-0.5 text-sm text-slate-600">{row.note}</p>
              </div>
              {canWrite && <IconButton icon={Check} title="Yapıldı olarak işaretle" size="sm" tone="primary" disabled={busyId === row.id} onClick={() => void complete(row)} />}
            </div>
          )}
        />
      </Modal>
      <AddReminderModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => { onChanged(); void load(); }} />
    </>
  );
}
