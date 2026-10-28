"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { FormModal } from "@/components/ui/FormModal";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Disclosure } from "@/components/ui/Disclosure";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { QuickDatePicker, type QuickDateOption } from "@/components/ui/QuickDatePicker";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { FirmaFormModal } from "@/components/firma/FirmaFormModal";
import { ManagerRequestButton } from "@/components/takip/ManagerRequestButton";
import { fetchPatientContext } from "@/components/randevu/appointment-api";
import { LabToothPicker } from "@/components/lab/LabToothPicker";
import { addDaysToDateKey } from "@/components/lab/useLabOrderActions";
import { fetchJson, newRequestKey, normalizeLabOrder, normalizeLabOrders, type LabOrderView } from "@/components/lab/lab-order-model";
import { readLabFormPrefs, writeLabFormPrefs } from "@/components/lab/lab-prefs";
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
  formatShortLabDate,
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

/** Beklenen dönüş için hızlı seçenekler; varsayılan gönderim + LAB_LATE_DAYS. */
const RETURN_OPTIONS: QuickDateOption[] = [
  { label: `${LAB_LATE_DAYS} gün sonra`, days: LAB_LATE_DAYS },
  { label: "1 hafta sonra", days: 7 },
  { label: "2 hafta sonra", days: 14 },
];

const METHOD_OPTIONS: { value: "none" | Exclude<ImpressionMethod, "">; label: string }[] = [
  { value: "none", label: "Belirtilmedi" },
  { value: "KLASIK_OLCU", label: "Klasik ölçü" },
  { value: "DIJITAL_TARAMA", label: "Dijital tarama" },
];

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
 * "Yeni lab işi" penceresi — Laboratuvar sayfası ve hasta dosyası aynı formu
 * kullanır. Personel üşenmesin diye yalnız gerçekten gereken alanlar sorulur:
 * hasta (hasta dosyasından gelince dolu), iş türü, dişler. Hekim; giriş yapan
 * hekim ya da son kullanılan hekim, laboratuvar; tek laboratuvar ya da son
 * kullanılan laboratuvar olarak dolu gelir. Gönderim bugün kabul edilir,
 * beklenen dönüş tek dokunuşla seçilir; gönderilen/beklenen adım iş türünün
 * şablonundan dolar ("Gönderim ayrıntıları" altında değiştirilebilir).
 * Eksik alanlar kaydetmeye basınca alanın altında yazılır.
 */
export function LabNewOrderModal({
  open,
  onClose,
  onCreated,
  initialPatient = null,
  lockPatient = false,
  initialLabName = "",
  initialDoctorId = "",
  labNames,
  labsLoading = false,
  labsError = null,
  onRetryLabs,
  canAddLab = false,
  onLabCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (order: LabOrderView) => void;
  initialPatient?: PickedPatient | null;
  lockPatient?: boolean;
  initialLabName?: string;
  /** Hekim önerisi (ör. hasta dosyasında hastayı en son tedavi eden hekim). */
  initialDoctorId?: string;
  /** "Satın alma" ekranında Laboratuvar türünde tanımlı firmalar. */
  labNames: string[];
  labsLoading?: boolean;
  /**
   * Laboratuvar listesi okunamadıysa hata metni. Verilirse boş liste "tanımlı
   * laboratuvar yok" sayılmaz (yöneticiye gereksiz istek ya da aynı adla ikinci
   * laboratuvar eklenmesin); "Yeniden dene" gösterilir.
   */
  labsError?: string | null;
  onRetryLabs?: () => void;
  /** Kullanıcı firma ekleyebiliyorsa (finance:write) formdan yeni laboratuvar tanımlanabilir. */
  canAddLab?: boolean;
  onLabCreated?: (name: string) => void;
}) {
  const { can, scopeKey, userId: sessionUserId, role, ghost } = usePermissions();
  // Doktor rolündeki kişi lab işini yalnız kendi adına açar; diğerleri (yönetici
  // hekim olsa bile) hastanın hekimini önerir: lab ücreti o hekimin hakedişinden düşer.
  const doctorIsSelf = role === "DOKTOR" && !ghost;
  const canReadPatientContext = can("appointments:write");
  const [patient, setPatient] = useState<PickedPatient | null>(initialPatient);
  const [form, setForm] = useState<FormState>(() => initialForm(""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Hızlı laboratuvar ekleme ortak tedarikçi formuyla (FirmaFormModal) yapılır.
  const [labFormOpen, setLabFormOpen] = useState(false);
  const requestKeyRef = useRef("");
  // Kullanıcı hekimi kendisi seçtiyse hasta seçimi hekimi değiştirmez.
  const doctorTouchedRef = useRef(false);
  const openedRef = useRef(false);
  const prefsRef = useRef<{ labName?: string; doctorId?: string }>({});

  // Pencere her açıldığında temiz form; varsayılanlar bir kez uygulanır.
  useEffect(() => {
    if (!open) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    prefsRef.current = readLabFormPrefs(scopeKey);
    const lastLab = prefsRef.current.labName;
    const defaultLab = initialLabName && labNames.includes(initialLabName)
      ? initialLabName
      : labNames.length === 1
        ? labNames[0]
        : lastLab && labNames.includes(lastLab) ? lastLab : "";
    setForm(initialForm(defaultLab));
    setPatient(initialPatient);
    setErrors({});
    setError("");
    setLabFormOpen(false);
    setDetailsOpen(false);
    requestKeyRef.current = "";
    doctorTouchedRef.current = false;
  }, [initialLabName, initialPatient, labNames, open, scopeKey]);

  // Varsayılan hekim: (doktor rolünde) kendisi > önerilen hekim (hastanın hekimi) >
  // giriş yapan hekim > son kullanılan hekim > tek hekim.
  // Oturumdaki kullanıcı kabuktan (layout) gelir; ayrı /api/auth/me isteği yalnız yedek.
  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([
      cachedGet<StaffLike[]>("/api/staff", 60_000, { throwOnError: true }).catch(() => null),
      sessionUserId ? Promise.resolve({ id: sessionUserId }) : cachedGet<{ id?: string }>("/api/auth/me", 60_000).catch(() => null),
    ]).then(([staff, me]) => {
      if (!active) return;
      const list = selectDoctors(staff || []);
      const isDoctor = (id?: string) => Boolean(id && list.some((doctor) => doctor.id === id));
      const pick = [doctorIsSelf ? me?.id : "", initialDoctorId, me?.id, prefsRef.current.doctorId].find(isDoctor) || (list.length === 1 ? list[0].id : "");
      if (pick) setForm((current) => (current.doctorId ? current : { ...current, doctorId: pick }));
    });
    return () => { active = false; };
  }, [doctorIsSelf, initialDoctorId, open, sessionUserId]);

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

  // Hasta seçilince hekim önerisi: hastanın yaklaşan ya da son randevusunun
  // hekimi (randevu yetkisi varsa), o da yoksa hastanın son lab işinin hekimi.
  // "Son kullanılan / tek hekim" ve hekim olan yöneticinin kendi adı tahmininin
  // yerine geçer; kullanıcının seçtiği, önerilen (initialDoctorId) ya da doktor
  // rolündeki kişinin kendisi değiştirilmez. Önceden Laboratuvar sayfasında hasta
  // seçilince hekim boş kalıyor, hekim olan yönetici açınca kendi adı kalıyordu.
  const patientId = patient?.id || "";
  useEffect(() => {
    if (!open || !patientId || lockPatient) return;
    let active = true;
    void (async () => {
      const staff = await cachedGet<StaffLike[]>("/api/staff", 60_000, { throwOnError: true }).catch(() => null);
      const doctors = selectDoctors(staff || []);
      const isDoctor = (id?: string | null): id is string => Boolean(id && doctors.some((doctor) => doctor.id === id));
      if (!active || doctorTouchedRef.current || isDoctor(initialDoctorId) || (doctorIsSelf && isDoctor(sessionUserId))) return;
      const context = canReadPatientContext ? await fetchPatientContext(patientId, undefined).catch(() => null) : null;
      let pick = [context?.nextAppointment?.doctorId, context?.lastAppointmentDoctorId].find(isDoctor);
      if (!pick) {
        const lastOrders = await fetchJson(`/api/lab-orders?patientId=${encodeURIComponent(patientId)}&limit=1`, undefined, "").catch(() => null);
        const lastDoctorId = normalizeLabOrders(lastOrders)[0]?.doctor.id;
        if (isDoctor(lastDoctorId)) pick = lastDoctorId;
      }
      if (!active || !pick || doctorTouchedRef.current) return;
      const suggested = pick;
      setForm((current) => ({ ...current, doctorId: suggested }));
      setErrors((current) => ({ ...current, doctorId: "" }));
    })();
    return () => { active = false; };
  }, [canReadPatientContext, doctorIsSelf, initialDoctorId, lockPatient, open, patientId, sessionUserId]);

  // Laboratuvar listesi pencere açıldıktan sonra gelirse: tek laboratuvar ya da son kullanılan seçilir.
  useEffect(() => {
    if (!open || form.labName || labNames.length === 0) return;
    const lastLab = prefsRef.current.labName;
    const pick = labNames.length === 1 ? labNames[0] : lastLab && labNames.includes(lastLab) ? lastLab : "";
    if (pick) setForm((current) => (current.labName ? current : { ...current, labName: pick }));
  }, [form.labName, labNames, open]);

  const set = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));
  // Liste okunamadı ve elde laboratuvar yok: "tanımlı değil" ile karıştırılmaz.
  const labsUnavailable = !labsLoading && Boolean(labsError) && labNames.length === 0 && !form.labName;
  const today = turkeyDateKey();
  const typeKnown = useMemo(() => LAB_CATEGORIES.some((category) => category.items.includes(form.labType)), [form.labType]);
  const template = WORKFLOW_TEMPLATES[form.labType] ?? [];

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
    setErrors((current) => ({ ...current, labType: "", sentItem: "" }));
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!patient) next.patient = "Hastayı seçin.";
    if (!form.labType) next.labType = "İş türünü seçin.";
    if (!form.doctorId) next.doctorId = "Hekimi seçin. Lab gideri bu hekimin hakedişinden düşülür.";
    if (!form.labName) next.labName = labsUnavailable ? "Laboratuvar listesi yüklenemedi; yeniden deneyin." : labNames.length === 0 ? "Önce bir laboratuvar tanımlayın." : "Laboratuvarı seçin.";
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
      // Hatalı alan katlanmış bölümdeyse görünür olsun.
      if (nextErrors.sentItem || nextErrors.sentAt) setDetailsOpen(true);
      setError("");
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
      writeLabFormPrefs(scopeKey, { labName: form.labName, doctorId: form.doctorId });
      showToastSafe({
        title: "Lab işi kaydedildi",
        message: form.sendNow
          ? `${form.labType} · ${form.labName}: laboratuvarda${form.expectedAt ? `, dönüş ${formatShortLabDate(`${form.expectedAt}T12:00:00`)}` : ""}.`
          : `${form.labType} · ${form.labName}: gönderince “${LAB_LABELS.send}” ile kaydedin.`,
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

  const showMethod = form.sendNow && isMeasurementStep(form.sentItem);
  const stepSummary = [
    buildDescription(form.sentItem, form.requestedItem) || (form.labType ? "Gönderilen yazılmadı" : "İş türü seçince dolar"),
    form.sentAt === today ? "bugün gönderildi" : form.sentAt ? `${formatShortLabDate(`${form.sentAt}T12:00:00`)} gönderildi` : "",
    template.length > 0 ? `${template.length} adımlı akış` : "",
  ].filter(Boolean).join(" · ");
  const dirty = Boolean(form.labType || form.teeth || form.notes.trim() || (!lockPatient && patient && patient.id !== initialPatient?.id));

  // Tanımlı laboratuvar yokken iş kaydedilemez (sunucu Laboratuvar türünde firma ister).
  // Form baştan sona doldurulup kayıtta reddedilmesin diye üstte uyarı çıkar, Kaydet pasif olur.
  const noLab = !labsLoading && !labsError && labNames.length === 0 && !form.labName;

  return (
    <>
    {/* Kirli formda Esc / × / Vazgeç onayı ortak pencereden (isDirty) gelir; önceden ayrıca yerel onay da çıkıyordu. */}
    <FormModal
      open={open}
      onClose={onClose}
      onSubmit={() => submit()}
      submitting={saving}
      submitDisabled={noLab || labsUnavailable}
      error={error}
      isDirty={dirty}
      title={LAB_LABELS.newOrder}
      size="lg"
      module="flask"
    >
      {labsUnavailable && <LoadErrorState compact message={labsError || "Laboratuvar listesi yüklenemedi."} onRetry={onRetryLabs} />}
      {noLab && (
        <Callout
          tone="warning"
          compact
          title="Tanımlı laboratuvar yok"
          action={canAddLab
            ? <Button size="sm" variant="secondary" onClick={() => setLabFormOpen(true)}>Laboratuvar ekle</Button>
            : <ManagerRequestButton label="Yöneticiden laboratuvar tanımlamasını iste" taskTitle="Laboratuvar firması tanımlanmalı" taskDetails="Yeni lab işi açılamıyor: Satın alma ekranında Laboratuvar türünde firma tanımlı değil." taskType="LAB" />}
        >
          {canAddLab
            ? "Lab işini kaydetmek için önce laboratuvarı ekleyin."
            : "Yöneticiniz “Satın alma” ekranında Laboratuvar türünde firma tanımlamalı."}
        </Callout>
      )}
      <FormField label="Hasta" as="div" required error={errors.patient}>
        <PatientPicker required value={patient} onChange={(next) => { setPatient(next); setErrors((current) => ({ ...current, patient: "" })); }} locked={lockPatient} aria-label="Hasta" />
      </FormField>

      <FormField label="İş türü" htmlFor="lab-new-type" required error={errors.labType}>
        <Select id="lab-new-type" value={form.labType} onChange={(event) => chooseType(event.target.value)} data-autofocus={patient ? true : undefined}>
          <option value="">İş türü seçin</option>
          {!typeKnown && form.labType && <option value={form.labType}>{form.labType}</option>}
          {LAB_CATEGORIES.map((category) => (
            <optgroup key={category.group} label={category.group}>
              {category.items.map((item) => <option key={item} value={item}>{item}</option>)}
            </optgroup>
          ))}
        </Select>
      </FormField>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={LAB_LABELS.doctor} htmlFor="lab-new-doctor" required error={errors.doctorId}>
          <DoctorSelect id="lab-new-doctor" value={form.doctorId} onChange={(doctorId) => { doctorTouchedRef.current = true; set({ doctorId }); setErrors((current) => ({ ...current, doctorId: "" })); }} aria-label={LAB_LABELS.doctor} />
        </FormField>
        <FormField
          label={LAB_LABELS.lab}
          htmlFor="lab-new-lab"
          required
          error={errors.labName}
        >
          <Select
            id="lab-new-lab"
            value={form.labName}
            disabled={labsLoading}
            onChange={(event) => {
              if (event.target.value === NEW_LAB_OPTION) {
                setLabFormOpen(true);
                return;
              }
              set({ labName: event.target.value });
              setErrors((current) => ({ ...current, labName: "" }));
            }}
          >
            <option value="">{labsLoading ? "Laboratuvarlar yükleniyor…" : labsUnavailable ? "Laboratuvarlar yüklenemedi" : labNames.length === 0 ? "Tanımlı laboratuvar yok" : "Laboratuvar seçin"}</option>
            {labNames.map((name) => <option key={name} value={name}>{name}</option>)}
            {canAddLab && <option value={NEW_LAB_OPTION}>+ Yeni laboratuvar ekle…</option>}
          </Select>
        </FormField>
      </div>
      <FormField label="Dişler" as="div" hint="İsteğe bağlı — plak ve protezde boş bırakılabilir.">
        <LabToothPicker value={form.teeth} onChange={(teeth) => set({ teeth })} />
      </FormField>

      <div className="space-y-3 border-t border-slate-100 pt-4">
        <Switch
          checked={form.sendNow}
          onChange={(sendNow) => set({ sendNow })}
          label="Laboratuvara gönderildi"
          description={form.sendNow ? "İş “Laboratuvarda” listesine düşer." : "İş “Gönderilecek” listesine düşer; gönderince kaydedersiniz."}
        />
        {form.sendNow && (
          <>
            <QuickDatePicker
              label="Beklenen dönüş"
              value={form.expectedAt}
              onChange={(expectedAt) => { set({ expectedAt }); setErrors((current) => ({ ...current, expectedAt: "" })); }}
              options={RETURN_OPTIONS}
              min={form.sentAt || undefined}
              error={errors.expectedAt}
              hint="Bu tarih geçerse iş “Gecikiyor” görünür."
            />
            <Disclosure title="Gönderim ayrıntıları" summary={stepSummary} open={detailsOpen} onOpenChange={setDetailsOpen}>
              <div className="space-y-3">
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
                <FormField label="Gönderim tarihi" htmlFor="lab-new-sent-at" required error={errors.sentAt} className="sm:max-w-[50%]">
                  <Input
                    id="lab-new-sent-at"
                    type="date"
                    value={form.sentAt}
                    max={today}
                    onChange={(event) => {
                      const sentAt = event.target.value;
                      setForm((current) => ({ ...current, sentAt, expectedAt: sentAt ? addDaysToDateKey(sentAt, LAB_LATE_DAYS) : current.expectedAt }));
                    }}
                  />
                </FormField>
                {showMethod && (
                  <ChoiceCards
                    label="Ölçü yöntemi"
                    variant="pills"
                    value={form.impressionMethod || "none"}
                    onChange={(value) => set({ impressionMethod: value === "none" ? "" : value })}
                    options={METHOD_OPTIONS}
                  />
                )}
              </div>
            </Disclosure>
          </>
        )}
      </div>

      <FormField label="Not" htmlFor="lab-new-notes" hint="Renk, özel istek…">
        <Textarea id="lab-new-notes" rows={2} maxLength={1500} value={form.notes} onChange={(event) => set({ notes: event.target.value })} />
      </FormField>
    </FormModal>
    {canAddLab && (
      <FirmaFormModal
        open={labFormOpen}
        defaultKategori="LAB"
        onClose={() => setLabFormOpen(false)}
        onSaved={(firma) => {
          if (firma.kategori && firma.kategori !== "LAB") {
            setErrors((current) => ({ ...current, labName: `${firma.name} Laboratuvar türünde eklenmedi; lab işinde seçilemez.` }));
            return;
          }
          onLabCreated?.(firma.name);
          set({ labName: firma.name });
          setErrors((current) => ({ ...current, labName: "" }));
        }}
      />
    )}
    </>
  );
}
