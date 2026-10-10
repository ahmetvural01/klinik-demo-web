"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { FormModal } from "@/components/ui/FormModal";
import { FormField } from "@/components/ui/FormField";
import { Input, Textarea } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { Disclosure } from "@/components/ui/Disclosure";
import { IconButton } from "@/components/ui/Button";
import { Money, formatDateText } from "@/components/ui/Money";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { cachedGet } from "@/lib/client-cache";
import { moneyInputError, parseTurkishMoney, toMoneyValue } from "@/lib/money-input";
import { selectDoctors, type StaffLike } from "@/lib/staff-roles";
import { showToastSafe } from "@/lib/toast-client";
import { apiMessage, autoPlanTitle, type TreatmentPlan } from "./plan-shared";

type PriceOption = { id: string; code?: string | null; treatment: string; amount: number | string };
type DraftStep = { key: string; query: string; toothNo: string; amount: string };

let draftSeq = 0;
const emptyStep = (): DraftStep => ({ key: `adim-${++draftSeq}`, query: "", toothNo: "", amount: "" });

function newRequestKey() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * "Yeni tedavi planı" — tedaviler kliniğin etkin fiyat listesinden seçilir
 * (tutar kendiliğinden dolar; listede yoksa ad elle yazılır), hekim giriş
 * yapan hekimse kendisi gelir, plan adı boş bırakılırsa tedavi adlarından
 * üretilir. Listenin sonunda her zaman boş bir satır durur: tedavi seçince
 * yeni satır kendiliğinden açılır ("Adım ekle" tıklaması gerekmez).
 * Eksik alan kaydetmeye basınca alanın altında yazılır (önceden "Oluştur"
 * eksik alanda sessizce hiçbir şey yapmıyordu).
 */
export function NewPlanModal({
  open,
  onClose,
  onCreated,
  initialPatient,
  lockPatient = false,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (plan: TreatmentPlan) => void;
  initialPatient: PickedPatient | null;
  lockPatient?: boolean;
}) {
  const { userId: sessionUserId, role: sessionRole, ghost: sessionGhost } = usePermissions();
  // Doktor planı yalnız kendi adına açar (sunucu kuralı; tedavi kaydı ve reçeteyle aynı).
  const lockDoctorToSelf = sessionRole === "DOKTOR" && !sessionGhost;
  const [patient, setPatient] = useState<PickedPatient | null>(initialPatient);
  const [doctorId, setDoctorId] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>(() => [emptyStep()]);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [prices, setPrices] = useState<PriceOption[]>([]);
  const [pricesFailed, setPricesFailed] = useState(false);
  const requestKeyRef = useRef("");
  const openedRef = useRef(false);

  // Her açılışta temiz form.
  useEffect(() => {
    if (!open) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    setPatient(initialPatient);
    setDoctorId("");
    setSteps([emptyStep()]);
    setTitle("");
    setNotes("");
    setErrors({});
    setError("");
    requestKeyRef.current = "";
  }, [initialPatient, open]);

  // Hasta dosyasından gelindiğinde hasta adı pencere açıldıktan sonra gelebilir;
  // geldiğinde bir kez yerleştirilir (kullanıcının sonraki seçimi ezilmez).
  const appliedInitialRef = useRef("");
  useEffect(() => {
    if (!open) {
      appliedInitialRef.current = "";
      return;
    }
    const signature = initialPatient ? `${initialPatient.id}:${initialPatient.fullName}` : "";
    if (initialPatient && appliedInitialRef.current !== signature) {
      appliedInitialRef.current = signature;
      setPatient(initialPatient);
    }
  }, [initialPatient, open]);

  // Varsayılan hekim: giriş yapan hekim; değilse klinikte tek hekim varsa o.
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
      const pick = me?.id && list.some((doctor) => doctor.id === me.id) ? me.id : list.length === 1 ? list[0].id : "";
      if (pick) setDoctorId((current) => current || pick);
    });
    return () => { active = false; };
  }, [open, sessionUserId]);

  // Kliniğin hasta dosyasında önerdiği fiyat listesi (TDB tarifesi ile birleşik; sunucu birleştirir).
  // Fiyat okuma izni olmayan kullanıcıda tedavi adı ve tutar elle yazılır.
  useEffect(() => {
    if (!open) return;
    let active = true;
    cachedGet<PriceOption[]>("/api/prices?type=active", 60_000, { throwOnError: true })
      .then((list) => { if (active) { setPrices(Array.isArray(list) ? list : []); setPricesFailed(false); } })
      .catch(() => { if (active) { setPrices([]); setPricesFailed(true); } });
    return () => { active = false; };
  }, [open]);

  const optionsFor = (query: string) => {
    const term = query.trim().toLocaleLowerCase("tr-TR");
    if (term.length < 2) return [];
    return prices
      .filter((item) => item.treatment.toLocaleLowerCase("tr-TR").includes(term) || String(item.code || "").toLocaleLowerCase("tr-TR").includes(term))
      .slice(0, 30)
      .map((item) => ({ id: item.id, label: item.treatment, meta: `${item.code ? `${item.code} · ` : ""}${formatAmount(item.amount)}` }));
  };

  const updateStep = (key: string, patch: Partial<DraftStep>) => {
    setSteps((current) => {
      const next = current.map((step) => (step.key === key ? { ...step, ...patch } : step));
      // Son satır doldurulunca altına boş satır açılır.
      const last = next[next.length - 1];
      return last.query.trim() && next.length < 100 ? [...next, emptyStep()] : next;
    });
    setErrors((current) => ({ ...current, steps: "", [`name-${key}`]: "", [`amount-${key}`]: "", [`tooth-${key}`]: "" }));
  };

  const removeStep = (key: string) => setSteps((current) => {
    const next = current.filter((step) => step.key !== key);
    return next.length === 0 || next[next.length - 1].query.trim() ? [...next, emptyStep()] : next;
  });

  const filled = steps.filter((step) => step.query.trim());
  const totalCents = filled.reduce((sum, step) => {
    const value = parseTurkishMoney(step.amount);
    return sum + (value ? Math.round(Number(value) * 100) : 0);
  }, 0);
  const today = useMemo(() => formatDateText(new Date()), []);
  const dirty = Boolean(filled.length || title.trim() || notes.trim() || (!lockPatient && patient && patient.id !== initialPatient?.id));


  const validate = () => {
    const next: Record<string, string> = {};
    if (!patient) next.patient = "Hastayı seçin.";
    if (!doctorId) next.doctorId = "Hekimi seçin.";
    if (filled.length === 0) next.steps = "En az bir tedavi ekleyin.";
    for (const step of filled) {
      const amountError = moneyInputError(step.amount, { required: true, allowZero: true });
      if (amountError) next[`amount-${step.key}`] = amountError;
      if (step.toothNo.trim().length > 50) next[`tooth-${step.key}`] = "En fazla 50 karakter.";
      if (step.query.trim().length > 200) next[`name-${step.key}`] = "Tedavi adı çok uzun.";
    }
    if (title.trim().length > 200) next.title = "Plan adı en fazla 200 karakter olabilir.";
    return next;
  };

  const submit = async () => {
    if (saving) return;
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    setError("");
    if (!requestKeyRef.current) requestKeyRef.current = newRequestKey();
    try {
      const response = await fetch("/api/treatment-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current },
        body: JSON.stringify({
          patientId: patient?.id,
          doctorId,
          title: title.trim() || autoPlanTitle(filled.map((step) => step.query), today),
          notes: notes.trim() || null,
          steps: filled.map((step) => ({
            treatmentName: step.query.trim(),
            toothNo: step.toothNo.trim() || undefined,
            // Normalize metin ("1250.50"); sunucu Decimal olarak okur.
            amount: parseTurkishMoney(step.amount) || "0",
          })),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiMessage(body, "Tedavi planı kaydedilemedi."));
      requestKeyRef.current = "";
      showToastSafe({ type: "success", icon: "tedavi", message: "Tedavi planı kaydedildi." });
      onCreated(body as TreatmentPlan);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Tedavi planı kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      open={open}
      // Girilmiş bilgi varken Esc / × / Vazgeç onayı ortak pencereden gelir
      // (isDirty); önceden burada ikinci bir onay daha soruluyordu.
      onClose={onClose}
      onSubmit={() => submit()}
      submitting={saving}
      error={error}
      isDirty={dirty}
      title="Yeni tedavi planı"
      size="lg"
      module="tedavi"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Hasta" as="div" required error={errors.patient}>
          <PatientPicker required value={patient} onChange={(next) => { setPatient(next); setErrors((current) => ({ ...current, patient: "" })); }} locked={lockPatient} aria-label="Hasta" />
        </FormField>
        <FormField label="Hekim" htmlFor="plan-doctor" required error={errors.doctorId} hint={lockDoctorToSelf ? "Plan kendi adınıza açılır." : undefined}>
          <DoctorSelect id="plan-doctor" value={doctorId} disabled={lockDoctorToSelf} onChange={(id) => { setDoctorId(id); setErrors((current) => ({ ...current, doctorId: "" })); }} aria-label="Hekim" />
        </FormField>
      </div>

      <FormField
        label="Tedaviler"
        as="div"
        required
        error={errors.steps}
        hint={pricesFailed ? "Fiyat listesi okunamadı; tedavi adını ve tutarı elle yazın." : "Tedavi adı ya da kodu yazın; seçince tutar fiyat listesinden dolar."}
      >
        <ol className="space-y-2">
          {steps.map((step, index) => {
            const isTrailing = index === steps.length - 1 && !step.query.trim();
            return (
              <li key={step.key} className="grid grid-cols-[5rem_minmax(0,1fr)_2.25rem] gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_9rem_2.25rem] sm:items-start">
                <div className="col-span-3 sm:col-span-1">
                  <SearchSelect
                    query={step.query}
                    onQueryChange={(query) => updateStep(step.key, { query })}
                    options={optionsFor(step.query)}
                    onSelect={(option) => {
                      const price = prices.find((item) => item.id === option.id);
                      updateStep(step.key, { query: option.label, amount: price ? toMoneyValue(price.amount) ?? step.amount : step.amount });
                    }}
                    placeholder={isTrailing && index > 0 ? "Başka tedavi ekle…" : "Tedavi adı veya kodu"}
                    emptyText={step.query.trim().length < 2 ? "Aramak için en az 2 harf yazın" : "Listede yok — yazdığınız ad kullanılır"}
                    aria-label={`${index + 1}. tedavi`}
                    className="ui-control"
                  />
                  {errors[`name-${step.key}`] && <p className="mt-1 text-xs font-medium text-red-600">{errors[`name-${step.key}`]}</p>}
                </div>
                <div>
                  <Input
                    aria-label={`${index + 1}. tedavinin dişi`}
                    value={step.toothNo}
                    maxLength={50}
                    placeholder="Diş"
                    onChange={(event) => updateStep(step.key, { toothNo: event.target.value })}
                    aria-invalid={errors[`tooth-${step.key}`] ? true : undefined}
                  />
                </div>
                <div>
                  <MoneyInput
                    aria-label={`${index + 1}. tedavinin tutarı`}
                    value={step.amount}
                    onChange={(amount) => updateStep(step.key, { amount })}
                    aria-invalid={errors[`amount-${step.key}`] ? true : undefined}
                  />
                  {errors[`amount-${step.key}`] && <p className="mt-1 text-xs font-medium text-red-600">{errors[`amount-${step.key}`]}</p>}
                </div>
                <div className="flex h-10 items-center">
                  {!isTrailing && <IconButton icon={X} size="sm" title={`${step.query || `${index + 1}. tedavi`} satırını kaldır`} onClick={() => removeStep(step.key)} />}
                </div>
              </li>
            );
          })}
        </ol>
        {filled.length > 0 && (
          <p className="mt-2 flex justify-end gap-2 text-sm">
            <span className="text-slate-500">Toplam</span>
            <Money value={totalCents / 100} className="font-bold text-slate-900" />
          </p>
        )}
      </FormField>

      <Disclosure title="Diğer bilgiler" summary="Plan adı, not" defaultOpen={Boolean(errors.title)}>
        <div className="space-y-3">
          <FormField label="Plan adı" htmlFor="plan-title" error={errors.title} hint="Boş bırakılırsa tedavi adlarından oluşturulur.">
            <Input id="plan-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder={autoPlanTitle(filled.map((step) => step.query), today)} />
          </FormField>
          <FormField label="Not" htmlFor="plan-notes">
            <Textarea id="plan-notes" rows={2} maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </FormField>
        </div>
      </Disclosure>
    </FormModal>
  );
}

function formatAmount(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
    : "";
}
