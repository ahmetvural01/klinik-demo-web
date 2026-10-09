"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { LabToothPicker } from "@/components/lab/LabToothPicker";
import { addDaysToDateKey } from "@/components/lab/useLabOrderActions";
import { fetchJson, newRequestKey, normalizeLabOrder, type LabOrderView } from "@/components/lab/lab-order-model";
import { cachedGet } from "@/lib/client-cache";
import { selectDoctors, type StaffLike } from "@/lib/staff-roles";
import { showToastSafe } from "@/lib/toast-client";
import { turkeyDateKey } from "@/lib/tz";
import {
  LAB_CATEGORIES,
  LAB_LABELS,
  LAB_LATE_DAYS,
  WORKFLOW_TEMPLATES,
  buildDescription,
  buildSentNote,
  isMeasurementStep,
  type ImpressionMethod,
} from "@/lib/lab-workflow";

type FormState = {
  doctorId: string;
  labName: string;
  labType: string;
  teeth: string;
  notes: string;
  sendNow: boolean;
  sentItem: string;
  requestedItem: string;
  impressionMethod: ImpressionMethod;
  sentAt: string;
  expectedAt: string;
};

const NEW_LAB_OPTION = "__new_lab__";

function initialForm(labName: string): FormState {
  const today = turkeyDateKey();
  return {
    doctorId: "",
    labName,
    labType: "",
    teeth: "",
    notes: "",
    sendNow: true,
    sentItem: "",
    requestedItem: "",
    impressionMethod: "",
    sentAt: today,
    expectedAt: addDaysToDateKey(today, LAB_LATE_DAYS),
  };
}

/**
 * "Yeni lab işi" penceresi — Laboratuvar sayfası ve (istenirse) hasta
 * dosyası aynı formu kullanır. Hekim ve laboratuvar artık listenin ilk
 * kaydıyla doldurulmaz: hekim, giriş yapan kişi hekimse odur; laboratuvar
 * yalnız tek laboratuvar varsa önceden seçilir. Eksik alanlar kaydetmeye
 * basınca alanın altında yazılır (düğme nedensiz pasif kalmaz).
 */
export function LabNewOrderModal({
  open,
  onClose,
  onCreated,
  initialPatient = null,
  lockPatient = false,
  initialLabName = "",
  labNames,
  labsLoading = false,
  canAddLab = false,
  onLabCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (order: LabOrderView) => void;
  initialPatient?: PickedPatient | null;
  lockPatient?: boolean;
  initialLabName?: string;
  /** "Satın Alma" ekranında Laboratuvar türünde tanımlı firmalar. */
  labNames: string[];
  labsLoading?: boolean;
  /** Kullanıcı firma ekleyebiliyorsa (finance:write) formdan yeni laboratuvar tanımlanabilir. */
  canAddLab?: boolean;
  onLabCreated?: (name: string) => void;
}) {
  const [patient, setPatient] = useState<PickedPatient | null>(initialPatient);
  const [form, setForm] = useState<FormState>(() => initialForm(""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [newLab, setNewLab] = useState<{ name: string; phone: string } | null>(null);
  const [newLabSaving, setNewLabSaving] = useState(false);
  const requestKeyRef = useRef("");
  const openedRef = useRef(false);

  // Pencere her açıldığında temiz form; varsayılanlar bir kez uygulanır.
  useEffect(() => {
    if (!open) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    const defaultLab = initialLabName && labNames.includes(initialLabName) ? initialLabName : labNames.length === 1 ? labNames[0] : "";
    setForm(initialForm(defaultLab));
    setPatient(initialPatient);
    setErrors({});
    setError("");
    setNewLab(null);
    requestKeyRef.current = "";
  }, [initialLabName, initialPatient, labNames, open]);

  // Varsayılan hekim: giriş yapan kişi hekimse kendisi; değilse boş ve zorunlu.
  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([
      cachedGet<StaffLike[]>("/api/staff", 60_000, { throwOnError: true }).catch(() => null),
      cachedGet<{ id?: string }>("/api/auth/me", 60_000).catch(() => null),
    ]).then(([staff, me]) => {
      if (!active) return;
      const list = selectDoctors(staff || []);
      if (me?.id && list.some((doctor) => doctor.id === me.id)) {
        setForm((current) => (current.doctorId ? current : { ...current, doctorId: me.id || "" }));
      }
    });
    return () => { active = false; };
  }, [open]);

  // Hasta dosyasından gelindiğinde hasta bilgisi pencere açıldıktan sonra
  // yüklenebilir; geldiğinde bir kez yerleştirilir (kullanıcı sonra değiştirebilir).
  const appliedInitialRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      appliedInitialRef.current = null;
      return;
    }
    if (initialPatient && appliedInitialRef.current !== initialPatient.id) {
      appliedInitialRef.current = initialPatient.id;
      setPatient(initialPatient);
    }
  }, [initialPatient, open]);

  // Laboratuvar listesi pencere açıldıktan sonra gelirse ve tek laboratuvar varsa seç.
  useEffect(() => {
    if (!open || form.labName || labNames.length !== 1) return;
    setForm((current) => ({ ...current, labName: labNames[0] }));
  }, [form.labName, labNames, open]);

  const set = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));
  const template = WORKFLOW_TEMPLATES[form.labType] ?? [];
  const typeKnown = useMemo(() => LAB_CATEGORIES.some((category) => category.items.includes(form.labType)), [form.labType]);

  const chooseType = (labType: string) => {
    const first = (WORKFLOW_TEMPLATES[labType] ?? [])[0];
    setForm((current) => ({
      ...current,
      labType,
      // İlk gönderim iş türünün şablonundan dolar; kullanıcı değiştirebilir.
      sentItem: first?.send || current.sentItem || "Ölçü",
      requestedItem: first?.request || "",
      impressionMethod: isMeasurementStep(first?.send || "") ? current.impressionMethod : "",
    }));
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!patient) next.patient = "Hastayı seçin.";
    if (!form.doctorId) next.doctorId = "Hekimi seçin. Lab gideri bu hekimin hakedişinden düşülür.";
    if (!form.labName) next.labName = labNames.length === 0 ? "Önce bir laboratuvar tanımlayın." : "Laboratuvarı seçin.";
    if (!form.labType) next.labType = "İş türünü seçin.";
    if (form.sendNow) {
      if (!form.sentItem.trim()) next.sentItem = "Laboratuvara ne gönderildiğini yazın.";
      if (!form.sentAt) next.sentAt = "Gönderim tarihini seçin.";
      if (form.expectedAt && form.sentAt && form.expectedAt < form.sentAt) next.expectedAt = "Dönüş tarihi gönderimden önce olamaz.";
    }
    return next;
  };

  const submit = async () => {
    if (saving) return;
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError("Eksik alanları doldurun.");
      return;
    }
    setError("");
    setSaving(true);
    if (!requestKeyRef.current) requestKeyRef.current = newRequestKey();
    try {
      const payload = await fetchJson("/api/lab-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current },
        body: JSON.stringify({
          patientId: patient?.id,
          doctorId: form.doctorId,
          labName: form.labName,
          labType: form.labType,
          teeth: form.teeth || null,
          notes: form.notes.trim() || null,
          firstTrip: form.sendNow
            ? {
                description: buildDescription(form.sentItem, form.requestedItem),
                sentAt: form.sentAt,
                expectedAt: form.expectedAt || null,
                sentNote: buildSentNote("", form.impressionMethod, form.sentItem),
              }
            : null,
        }),
      }, "Lab işi kaydedilemedi.");
      const order = normalizeLabOrder(payload);
      requestKeyRef.current = "";
      window.dispatchEvent(new CustomEvent("ks:realtime-sync", { detail: { scope: "lab-orders" } }));
      showToastSafe({
        title: "Lab işi kaydedildi",
        message: form.sendNow ? `${form.labType} · ${form.labName}: laboratuvara gönderildi olarak işlendi.` : `${form.labType} · ${form.labName}: gönderildiğinde “${LAB_LABELS.send}” ile kaydedin.`,
        type: "success",
        icon: "flask",
      });
      if (order) onCreated(order);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Lab işi kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const saveNewLab = async () => {
    if (!newLab || newLabSaving) return;
    const name = newLab.name.trim();
    if (name.length < 2) {
      setErrors((current) => ({ ...current, newLab: "Laboratuvar adını yazın." }));
      return;
    }
    setNewLabSaving(true);
    try {
      const created = await fetchJson("/api/firma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone: newLab.phone.trim() || null, kategori: "LAB" }),
      }, "Laboratuvar eklenemedi.");
      const createdName = created && typeof created === "object" && "name" in created && typeof created.name === "string" ? created.name : name;
      onLabCreated?.(createdName);
      set({ labName: createdName });
      setNewLab(null);
      setErrors((current) => ({ ...current, newLab: "", labName: "" }));
      showToastSafe({ title: "Laboratuvar eklendi", message: `${createdName} Satın Alma ekranındaki firma listesine de eklendi.`, type: "success" });
    } catch (labError) {
      setErrors((current) => ({ ...current, newLab: labError instanceof Error ? labError.message : "Laboratuvar eklenemedi." }));
    } finally {
      setNewLabSaving(false);
    }
  };

  const showMethod = form.sendNow && isMeasurementStep(form.sentItem);

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title={LAB_LABELS.newOrder}
      description="Hasta, hekim, laboratuvar ve iş türü zorunlu. Gönderim bilgisi iş türüne göre dolar."
      size="lg"
      module="flask"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button>
          <Button onClick={() => void submit()} loading={saving}>Kaydet</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <FormErrorBanner message={error} />
        <FormField label="Hasta" required error={errors.patient}>
          <PatientPicker value={patient} onChange={setPatient} locked={lockPatient} aria-label="Hasta" />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={LAB_LABELS.doctor} htmlFor="lab-new-doctor" required error={errors.doctorId}>
            <DoctorSelect id="lab-new-doctor" value={form.doctorId} onChange={(doctorId) => set({ doctorId })} aria-label={LAB_LABELS.doctor} />
          </FormField>
          <FormField
            label={LAB_LABELS.lab}
            htmlFor="lab-new-lab"
            required
            error={errors.labName}
            hint={labNames.length === 0 && !labsLoading ? `Laboratuvarlar “${LAB_LABELS.firmScreen}” ekranında Laboratuvar türünde firma olarak tanımlanır.` : undefined}
          >
            <Select
              id="lab-new-lab"
              value={newLab ? NEW_LAB_OPTION : form.labName}
              disabled={labsLoading}
              onChange={(event) => {
                if (event.target.value === NEW_LAB_OPTION) {
                  setNewLab({ name: "", phone: "" });
                  return;
                }
                setNewLab(null);
                set({ labName: event.target.value });
              }}
            >
              <option value="">{labsLoading ? "Laboratuvarlar yükleniyor…" : labNames.length === 0 ? "Tanımlı laboratuvar yok" : "Laboratuvar seçin"}</option>
              {labNames.map((name) => <option key={name} value={name}>{name}</option>)}
              {canAddLab && <option value={NEW_LAB_OPTION}>+ Yeni laboratuvar ekle…</option>}
            </Select>
          </FormField>
        </div>
        {newLab && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-sm font-semibold text-slate-900">Yeni laboratuvar</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Laboratuvar adı" htmlFor="lab-new-lab-name" required error={errors.newLab}>
                <Input id="lab-new-lab-name" value={newLab.name} maxLength={180} data-dirty-ignore onChange={(event) => setNewLab({ ...newLab, name: event.target.value })} placeholder="Örn. Deneme Dental Lab" />
              </FormField>
              <FormField label="Telefon" htmlFor="lab-new-lab-phone" hint="İsteğe bağlı">
                <Input id="lab-new-lab-phone" value={newLab.phone} maxLength={40} inputMode="tel" data-dirty-ignore onChange={(event) => setNewLab({ ...newLab, phone: event.target.value })} />
              </FormField>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void saveNewLab()} loading={newLabSaving}>Laboratuvarı ekle</Button>
              <Button size="sm" variant="ghost" onClick={() => setNewLab(null)} disabled={newLabSaving}>Vazgeç</Button>
            </div>
          </div>
        )}
        <FormField label="İş türü" htmlFor="lab-new-type" required error={errors.labType}>
          <Select id="lab-new-type" value={form.labType} onChange={(event) => chooseType(event.target.value)}>
            <option value="">İş türü seçin</option>
            {!typeKnown && form.labType && <option value={form.labType}>{form.labType}</option>}
            {LAB_CATEGORIES.map((category) => (
              <optgroup key={category.group} label={category.group}>
                {category.items.map((item) => <option key={item} value={item}>{item}</option>)}
              </optgroup>
            ))}
          </Select>
        </FormField>
        <FormField label="Dişler" hint="İsteğe bağlı">
          <LabToothPicker value={form.teeth} onChange={(teeth) => set({ teeth })} />
        </FormField>

        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <Switch
            checked={form.sendNow}
            onChange={(sendNow) => set({ sendNow })}
            label="Ölçü bugün laboratuvara gönderildi"
            description={form.sendNow ? "İlk gönderim de kaydedilir; iş “Laboratuvarda” görünür." : "İş “Gönderilmedi” olarak açılır; gönderince kaydedersiniz."}
          />
          {form.sendNow && (
            <>
              {template.length > 0 && (
                <p className="text-xs text-slate-500">{form.labType} için {template.length} adımlı akış: ilk adım dolduruldu, farklıysa değiştirin.</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Gönderilen" htmlFor="lab-new-sent" required error={errors.sentItem}>
                  <Input
                    id="lab-new-sent"
                    value={form.sentItem}
                    maxLength={80}
                    onChange={(event) => {
                      const sentItem = event.target.value;
                      setForm((current) => ({ ...current, sentItem, impressionMethod: isMeasurementStep(sentItem) ? current.impressionMethod : "" }));
                    }}
                    placeholder="Ölçü, kaşık…"
                  />
                </FormField>
                <FormField label="Laboratuvardan beklenen" htmlFor="lab-new-request">
                  <Input id="lab-new-request" value={form.requestedItem} maxLength={80} onChange={(event) => set({ requestedItem: event.target.value })} placeholder="Alt yapı, prova…" />
                </FormField>
              </div>
              {showMethod && (
                <FormField label="Ölçü yöntemi" htmlFor="lab-new-method">
                  <Select id="lab-new-method" value={form.impressionMethod} onChange={(event) => set({ impressionMethod: event.target.value as ImpressionMethod })}>
                    <option value="">Belirtilmedi</option>
                    <option value="KLASIK_OLCU">Klasik ölçü</option>
                    <option value="DIJITAL_TARAMA">Dijital tarama</option>
                  </Select>
                </FormField>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Gönderim tarihi" htmlFor="lab-new-sent-at" required error={errors.sentAt}>
                  <Input
                    id="lab-new-sent-at"
                    type="date"
                    value={form.sentAt}
                    max={turkeyDateKey()}
                    onChange={(event) => {
                      const sentAt = event.target.value;
                      setForm((current) => ({ ...current, sentAt, expectedAt: sentAt ? addDaysToDateKey(sentAt, LAB_LATE_DAYS) : current.expectedAt }));
                    }}
                  />
                </FormField>
                <FormField label="Beklenen dönüş" htmlFor="lab-new-expected" error={errors.expectedAt} hint="Bu tarih geçerse iş “Gecikiyor” görünür.">
                  <Input id="lab-new-expected" type="date" value={form.expectedAt} min={form.sentAt || undefined} onChange={(event) => set({ expectedAt: event.target.value })} />
                </FormField>
              </div>
            </>
          )}
        </div>

        <FormField label="Not" htmlFor="lab-new-notes" hint="Renk, özel istek…">
          <Textarea id="lab-new-notes" rows={2} maxLength={1500} value={form.notes} onChange={(event) => set({ notes: event.target.value })} />
        </FormField>
      </div>
    </Modal>
  );
}
