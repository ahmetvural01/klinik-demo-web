"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FormModal } from "@/components/ui/FormModal";
import { FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Button } from "@/components/ui/Button";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Disclosure } from "@/components/ui/Disclosure";
import { Switch } from "@/components/ui/Switch";
import { formatDateText } from "@/components/ui/Money";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { PaymentMethodPicker, usePosDevices } from "@/components/finance/PaymentMethodPicker";
import { useFocusWhenReady, useOpenReset } from "@/components/finance/use-open-reset";
import type { PaymentContext } from "@/components/finance/PaymentForm";
import {
  CONNECTION_LOST,
  formatMoney,
  isPositiveMoney,
  moneyToNumber,
  newRequestKey,
  failureMessage,
  splitMoney,
  subtractMoney,
  sumMoney,
} from "@/components/finance/finance-money";
import { addInstallmentPeriod } from "@/lib/installment-schedule";
import { compareMoney, moneyInputError } from "@/lib/money-input";
import { requiresPos, type PaymentMethod } from "@/lib/payment-methods";
import type { StaffLike } from "@/lib/staff-roles";
import { showToastSafe } from "@/lib/toast-client";
import { isValidDateKey, turkeyDateKey } from "@/lib/tz";

/** Sunucunun kabul ettiği en fazla taksit sayısı (api/taksit-plani: 1–100). */
export const MAX_INSTALLMENTS = 100;

const QUICK_COUNTS = ["2", "3", "4", "6", "9", "12"] as const;

const PERIOD_OPTIONS = [
  { value: "HAFTALIK", label: "Haftada bir" },
  { value: "IKIHALFTALIK", label: "İki haftada bir" },
  { value: "AYLIK", label: "Ayda bir" },
  { value: "IKIAYLIK", label: "İki ayda bir" },
  { value: "UCAYLIK", label: "Üç ayda bir" },
  { value: "ALTIAYLIK", label: "Altı ayda bir" },
  { value: "YILLIK", label: "Yılda bir" },
];

/** Hastanın borç özeti: plan tutarının varsayılanı ve üst sınırı. */
export type PlanPatientBalance = {
  /** Kalan borç (normalize); bilinmiyorsa null — sınır uygulanmaz. */
  debt: string | null;
  /** Açık taksit planlarında kalan (normalize); bilinmiyorsa null. */
  planRemaining: string | null;
  /** Doktor önerisi için (son tedavi, açık plan, son tahsilat). */
  context?: PaymentContext | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (info: { patientName: string }) => void;
  /** Hasta; null ise formda hasta seçici çıkar. */
  patient: PickedPatient | null;
  /** Hasta değiştirilemez (hasta dosyasından ya da hasta bağlamıyla açılan form) — adı başlıkta yazar. */
  patientLocked?: boolean;
  /** Elde hazır borç bilgisi (hasta dosyası). */
  balance?: PlanPatientBalance | null;
  /** Borç bilgisini sunucudan okur (Muhasebe). Çağıran useCallback ile sabit tutmalı. */
  loadBalance?: (patientId: string) => Promise<PlanPatientBalance | null>;
  doctors: StaffLike[];
  doctorsLoaded: boolean;
  /** Doktor listesi yüklenemediyse gösterilecek metin (boş liste "doktor yok" sanılmasın). */
  doctorsError?: string;
  /** payments:write — peşinat şimdi tahsilat olarak kaydedilebilir. */
  canCollect: boolean;
  canManagePos?: boolean;
  /**
   * installments:delete — açık planı iptal edebilir. Yoksa "önce o planı iptal
   * edin" yerine kime başvurulacağı yazılır (banko planı iptal edemez).
   * Verilmezse eski metin.
   */
  canCancelPlans?: boolean;
};

type Row = { date: string; amount: string };
type Errors = Partial<Record<"patient" | "total" | "down" | "count" | "start" | "doctor" | "pos" | "rows", string>>;

function nextMonthKey() {
  const today = new Date(`${turkeyDateKey()}T00:00:00.000Z`);
  return addInstallmentPeriod(today, "AYLIK", 1).toISOString().slice(0, 10);
}

/** Kalanı eşit taksitlere böler; kuruş küsuratı son taksite eklenir (sunucuyla aynı kural). */
function buildSchedule(remaining: string | null, count: number, period: string, startDate: string): Row[] {
  if (!remaining || !isPositiveMoney(remaining) || !Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS || !isValidDateKey(startDate)) return [];
  const start = new Date(`${startDate}T00:00:00.000Z`);
  return splitMoney(remaining, count).map((amount, index) => ({
    date: addInstallmentPeriod(start, period, index).toISOString().slice(0, 10),
    amount,
  }));
}

/** Yeni planın doktoru: son tedaviyi yapan → açık planın doktoru → son tahsilatın doktoru → tek doktor. */
function suggestPlanDoctor(context: PaymentContext | null | undefined, doctors: readonly StaffLike[]): string {
  const known = (id?: string | null): id is string => Boolean(id) && doctors.some((doctor) => doctor.id === id);
  if (known(context?.lastTreatmentDoctorId)) return context.lastTreatmentDoctorId;
  if (known(context?.plan?.doctorId)) return context.plan.doctorId;
  if (known(context?.lastPaymentDoctorId)) return context.lastPaymentDoctorId;
  return doctors.length === 1 ? doctors[0].id : "";
}

/**
 * TEK taksit planı formu (Muhasebe "Yeni taksit planı" ve hasta dosyası
 * "Taksit planı yap"). Zorunlular üstte: taksitlendirilecek tutar (taksitte
 * olmayan borçla dolu), taksit sayısı (hızlı seçim), ilk taksit. Takvim
 * özetlenir, "Taksit takvimi" açılınca tarih/tutar tek tek düzenlenir; plan
 * adı ve not "Ek bilgiler"de.
 *
 * Korunan kurallar: plan tutarı kalan borcu aşamaz (borç biliniyorsa; sunucu
 * da aynı kuralı denetler ve aşan istekte 409 PLAN_EXCEEDS_DEBT döner);
 * peşinat < tutar; vadeler sıralı ve toplamı peşinat sonrası kalana eşit;
 * peşinat tahsilatı payments:write ister ve plan ile aynı işlemde kaydedilir;
 * Idempotency-Key her açılışta yeni.
 */
export function InstallmentPlanForm({
  open,
  onClose,
  onCreated,
  patient: initialPatient,
  patientLocked = false,
  balance: givenBalance,
  loadBalance,
  doctors,
  doctorsLoaded,
  doctorsError,
  canCollect,
  canManagePos,
  canCancelPlans = true,
}: Props) {
  const baseId = useId().replace(/:/g, "");
  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [loaded, setLoaded] = useState<{ patientId: string; balance: PlanPatientBalance | null } | null>(null);
  const [total, setTotal] = useState("");
  const [totalTouched, setTotalTouched] = useState(false);
  const [down, setDown] = useState("");
  const [collectDown, setCollectDown] = useState(true);
  const [downMethod, setDownMethod] = useState<PaymentMethod>("NAKIT");
  // POS seçimi yalnız klinikte aktif POS cihazı tanımlıysa zorunlu (sunucu kuralıyla aynı).
  const { devices: posDevices } = usePosDevices(requiresPos(downMethod));
  const posAvailable = posDevices === null || posDevices.some((device) => device.isActive);
  const [downPosId, setDownPosId] = useState("");
  const [countChoice, setCountChoice] = useState<string>("3");
  const [customCount, setCustomCount] = useState("");
  const [period, setPeriod] = useState("AYLIK");
  const [startDate, setStartDate] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [doctorTouched, setDoctorTouched] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [manualRows, setManualRows] = useState<Row[] | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const requestKeyRef = useRef("");
  const initialPatientRef = useRef<PickedPatient | null>(null);
  initialPatientRef.current = initialPatient;
  const customCountRef = useRef<HTMLInputElement>(null);

  const initKey = open ? `plan:${initialPatient?.id || ""}` : "";
  const initialStart = useRef("");

  const ready = useOpenReset(initKey, () => {
    const start = nextMonthKey();
    initialStart.current = start;
    setPatient(initialPatientRef.current);
    setLoaded(null);
    setTotal("");
    setTotalTouched(false);
    setDown("");
    setCollectDown(true);
    setDownMethod("NAKIT");
    setDownPosId("");
    setCountChoice("3");
    setCustomCount("");
    setPeriod("AYLIK");
    setStartDate(start);
    setDoctorId("");
    setDoctorTouched(false);
    setTitle("");
    setNotes("");
    setManualRows(null);
    setScheduleOpen(false);
    setMoreOpen(false);
    setErrors({});
    setServerError("");
    setSaving(false);
    requestKeyRef.current = newRequestKey("plan");
  });

  // İlk odak: hasta seçiliyse tutar, değilse hasta araması.
  useFocusWhenReady(ready, () => document.getElementById(initialPatientRef.current ? `${baseId}-total` : `${baseId}-patient`));

  const patientId = patient?.id || "";
  useEffect(() => {
    if (!ready || !loadBalance || !patientId) return;
    let active = true;
    loadBalance(patientId)
      .then((result) => { if (active) setLoaded({ patientId, balance: result }); })
      .catch(() => { if (active) setLoaded({ patientId, balance: null }); });
    return () => { active = false; };
  }, [ready, loadBalance, patientId]);

  const balance = givenBalance ?? (loaded && loaded.patientId === patientId ? loaded.balance : null);
  const debt = balance?.debt ?? null;
  const debtCap = debt === null ? null : compareMoney(debt, 0) === 1 ? debt : "0.00";
  const planRemaining = balance?.planRemaining ?? null;
  // Taksitte olmayan borç: yeni planın doğal tutarı (açık planın kalanı ikinci kez taksitlenmesin).
  const unplanned = debtCap !== null && planRemaining !== null && isPositiveMoney(planRemaining)
    ? subtractMoney(debtCap, planRemaining)
    : debtCap;
  const defaultTotal = unplanned && isPositiveMoney(unplanned) ? unplanned : "";
  // Üst sınır: açık planın kalanı zaten taksitte — aynı borç ikinci plana bölünmesin
  // (önceden Muhasebe formu buna izin veriyor, alacak iki kez sayılıyordu).
  const planCap = unplanned === null ? null : compareMoney(unplanned, 0) === 1 ? unplanned : "0.00";

  // Tutar, kullanıcı yazana kadar borç bilgisinden dolar.
  useEffect(() => {
    if (!ready || totalTouched) return;
    setTotal(defaultTotal);
  }, [ready, totalTouched, defaultTotal]);

  const suggestion = useMemo(() => suggestPlanDoctor(balance?.context, doctors), [balance?.context, doctors]);
  useEffect(() => {
    if (!ready || doctorTouched) return;
    setDoctorId(suggestion);
  }, [ready, doctorTouched, suggestion]);

  const count = countChoice === "diger" ? Number(customCount) : Number(countChoice);
  const downValue = down.trim() ? down : "0.00";
  const remaining = isPositiveMoney(total) && !moneyInputError(downValue, { allowZero: true })
    ? subtractMoney(total, downValue)
    : null;
  const autoRows = useMemo(() => buildSchedule(remaining, count, period, startDate), [remaining, count, period, startDate]);
  const rows = manualRows ?? autoRows;
  const rowsTotal = sumMoney(rows.map((row) => row.amount));
  const rowsMismatch = rows.length > 0 && remaining !== null && compareMoney(rowsTotal, remaining) !== 0;
  const collectingDown = canCollect && collectDown && isPositiveMoney(down) && !moneyInputError(down);

  const clearError = (key: keyof Errors) => setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  const editRow = (index: number, patch: Partial<Row>) => {
    setManualRows((current) => (current ?? autoRows).map((row, i) => (i === index ? { ...row, ...patch } : row)));
    clearError("rows");
  };

  const validate = (): Errors => {
    const next: Errors = {};
    if (!patient) next.patient = "Hastayı seçin.";
    const totalError = moneyInputError(total, { required: true });
    if (totalError) next.total = totalError;
    else if (planCap !== null && compareMoney(total, planCap) === 1) {
      next.total = planRemaining && isPositiveMoney(planRemaining)
        ? `Taksitte olmayan borç ${formatMoney(planCap)}; ${canCancelPlans
          ? "açık planı değiştirmek için önce o planı iptal edin."
          : "planı değiştirmek için muhasebe ya da yöneticiye başvurun."}`
        : `Taksitlendirilecek tutar kalan borcu (${formatMoney(planCap)}) aşamaz.`;
    }
    const downError = down.trim() ? moneyInputError(down, { allowZero: true }) : null;
    if (downError) next.down = downError;
    else if (!next.total && compareMoney(downValue, total) !== -1) next.down = "Peşinat, taksitlendirilecek tutardan küçük olmalı.";
    if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) next.count = `Taksit sayısı 1 ile ${MAX_INSTALLMENTS} arasında olmalı.`;
    if (!isValidDateKey(startDate)) next.start = "İlk taksit tarihini seçin.";
    if (!doctorId) next.doctor = "Planın hangi doktorun tedavisi için yapıldığını seçin.";
    if (collectingDown && requiresPos(downMethod) && !downPosId && posAvailable) next.pos = "Kartla alınan peşinat için POS cihazı seçin.";
    if (!next.total && !next.down && !next.count && !next.start) {
      if (rows.length === 0 || rows.some((row) => !isValidDateKey(row.date) || !isPositiveMoney(row.amount) || Boolean(moneyInputError(row.amount)))) {
        next.rows = "Her taksidin tarihi ve 0'dan büyük tutarı olmalı.";
      } else if (rows.some((row, index) => index > 0 && row.date < rows[index - 1].date)) {
        next.rows = "Taksit tarihleri sırayla ilerlemeli.";
      } else if (rowsMismatch && remaining) {
        next.rows = `Taksitlerin toplamı ${formatMoney(rowsTotal)}; peşinat sonrası kalan ${formatMoney(remaining)} olmalı.`;
      }
    }
    return next;
  };

  const submit = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      if (nextErrors.rows) setScheduleOpen(true);
      return;
    }
    if (!patient) return;
    setSaving(true);
    setServerError("");
    try {
      const response = await fetch("/api/taksit-plani", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current },
        body: JSON.stringify({
          patientId: patient.id,
          doctorId,
          baslik: title.trim() || `${rows.length} taksitli ödeme planı`,
          toplamBorc: moneyToNumber(total),
          pesnat: isPositiveMoney(down) ? moneyToNumber(down) : 0,
          taksitSayisi: rows.length,
          period,
          startDate: rows[0]?.date || startDate,
          notes: notes.trim() || null,
          taksitler: rows.map((row, index) => ({ siraNo: index + 1, date: row.date, amount: moneyToNumber(row.amount) })),
          ...(collectingDown ? { pesinatTahsilat: { yontem: downMethod, posId: requiresPos(downMethod) ? downPosId : null } } : {}),
        }),
      }).catch(() => null);
      if (!response) { setServerError(CONNECTION_LOST); return; }
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        // Sunucunun borç denetimi (aynı borca ikinci plan ya da borçtan büyük
        // tutar): mesaj tutar alanının altında, odak tutarda.
        if (response.status === 409 && body?.code === "PLAN_EXCEEDS_DEBT" && typeof body.error === "string") {
          setErrors((current) => ({ ...current, total: body.error }));
          window.requestAnimationFrame(() => document.getElementById(`${baseId}-total`)?.focus());
          return;
        }
        setServerError(failureMessage(response, body, "Taksit planı oluşturulamadı."));
        return;
      }
      showToastSafe({
        type: "success",
        icon: "finance",
        duration: 5000,
        message: `${patient.fullName} için ${rows.length} taksitli plan oluşturuldu${collectingDown ? `; ${formatMoney(down)} peşinat tahsil edildi` : ""}.`,
      });
      onCreated?.({ patientName: patient.fullName });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const dirty = open && Boolean(
    (totalTouched && total !== defaultTotal) || down || countChoice !== "3" || period !== "AYLIK"
      || (startDate && startDate !== initialStart.current) || doctorTouched || title.trim() || notes.trim() || manualRows
      || (patient?.id || "") !== (initialPatient?.id || ""),
  );

  const periodLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label || "";
  const scheduleSummary = rows.length === 0
    ? "Tutarı ve taksit sayısını seçin"
    : manualRows
      ? `Elle düzenlendi · ${rows.length} taksit · toplam ${formatMoney(rowsTotal)}`
      : [
          `${rows.length} taksit × ${formatMoney(rows[0].amount)}`,
          periodLabel.toLocaleLowerCase("tr"),
          rows.length > 1 ? `son ${formatDateText(`${rows[rows.length - 1].date}T12:00:00.000Z`)}` : "",
        ].filter(Boolean).join(" · ");

  const debtText = debt === null ? "" : debtCap && isPositiveMoney(debtCap) ? `Kalan borç ${formatMoney(debtCap)}` : "Açık borç yok";
  const description = [patientLocked ? patient?.fullName : "", patient ? debtText : ""].filter(Boolean).join(" · ") || undefined;
  const hideDoctor = doctors.length === 1 && doctorId === doctors[0].id && !errors.doctor;
  const totalHint = planRemaining && isPositiveMoney(planRemaining) ? `${formatMoney(planRemaining)} zaten açık taksit planında.` : undefined;

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Yeni taksit planı"
      description={description}
      module="finance"
      size="lg"
      isDirty={dirty}
      onSubmit={() => submit()}
      submitting={saving}
      error={serverError}
    >
      {!patientLocked && (
        <FormField label="Hasta" required as="div" htmlFor={`${baseId}-patient`} error={errors.patient}>
          {/* Finans araması: hasta listesini göremeyen muhasebe de hasta seçebilir (yalnız ad, telefon, TC son 4). */}
          <PatientPicker
            id={`${baseId}-patient`}
            required
            scope="finance"
            value={patient}
            onChange={(next) => {
              setPatient(next);
              setLoaded(null);
              setTotalTouched(false);
              setDoctorTouched(false);
              requestKeyRef.current = newRequestKey("plan");
              setErrors((current) => ({ ...current, patient: undefined, total: undefined }));
            }}
            aria-label="Hasta"
          />
        </FormField>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Taksitlendirilecek tutar" required htmlFor={`${baseId}-total`} error={errors.total} hint={totalHint}>
          <MoneyInput
            id={`${baseId}-total`}
            value={total}
            onChange={(value) => { setTotal(value); setTotalTouched(true); clearError("total"); }}
            data-autofocus={patient ? true : undefined}
          />
        </FormField>
        <FormField label="Peşinat" htmlFor={`${baseId}-down`} error={errors.down}>
          <MoneyInput id={`${baseId}-down`} value={down} placeholder="Yok" onChange={(value) => { setDown(value); clearError("down"); }} />
        </FormField>
      </div>

      {isPositiveMoney(down) && !moneyInputError(down) && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <Switch
            checked={collectDown && canCollect}
            disabled={!canCollect}
            onChange={(checked) => { setCollectDown(checked); clearError("pos"); }}
            label="Peşinatı şimdi tahsil et"
            description={!canCollect
              ? "Tahsilat yetkiniz olmadığı için peşinat yalnız planda not edilir; tahsilatı yetkili kişi girmelidir."
              : !collectDown ? "Peşinat daha önce tahsilat olarak girildiyse kapalı bırakın." : undefined}
          />
          {collectingDown && (
            <PaymentMethodPicker
              idPrefix={`${baseId}-down`}
              value={downMethod}
              onChange={(method) => { setDownMethod(method); if (!requiresPos(method)) setDownPosId(""); clearError("pos"); }}
              pos={{ value: downPosId, onChange: (posId) => { setDownPosId(posId); clearError("pos"); }, error: errors.pos, canManage: canManagePos }}
            />
          )}
        </div>
      )}

      <div>
        <ChoiceCards
          label="Taksit sayısı"
          required
          variant="pills"
          options={[...QUICK_COUNTS.map((value) => ({ value, label: value })), { value: "diger", label: "Diğer" }]}
          value={countChoice}
          onChange={(value) => {
            setCountChoice(value);
            setManualRows(null);
            clearError("count");
            if (value === "diger") window.requestAnimationFrame(() => customCountRef.current?.focus());
          }}
          error={countChoice === "diger" ? undefined : errors.count}
        />
        {countChoice === "diger" && (
          <FormField label="Kaç taksit?" htmlFor={`${baseId}-count`} error={errors.count} className="mt-3 max-w-[12rem]">
            <Input
              ref={customCountRef}
              id={`${baseId}-count`}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_INSTALLMENTS}
              step={1}
              value={customCount}
              onChange={(event) => { setCustomCount(event.target.value); setManualRows(null); clearError("count"); }}
            />
          </FormField>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="İlk taksit" required htmlFor={`${baseId}-start`} error={errors.start}>
          <Input id={`${baseId}-start`} type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setManualRows(null); clearError("start"); }} />
        </FormField>
        {!hideDoctor && (
          <FormField label="Doktor" required htmlFor={`${baseId}-doctor`} error={errors.doctor || doctorsError || undefined}>
            <DoctorSelect
              id={`${baseId}-doctor`}
              value={doctorId}
              doctors={doctors}
              disabled={!doctorsLoaded}
              onChange={(id) => { setDoctorId(id); setDoctorTouched(true); clearError("doctor"); }}
            />
          </FormField>
        )}
      </div>

      <Disclosure title="Taksit takvimi" summary={scheduleSummary} open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <FormField label="Ne sıklıkla?" htmlFor={`${baseId}-period`} className="min-w-[12rem]">
              <Select id={`${baseId}-period`} value={period} onChange={(event) => { setPeriod(event.target.value); setManualRows(null); }}>
                {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </FormField>
            {manualRows && <Button variant="secondary" size="sm" onClick={() => { setManualRows(null); clearError("rows"); }}>Eşit böl</Button>}
          </div>
          {rows.length > 0 ? (
            <ol className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {rows.map((row, index) => (
                <li key={index} className="grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 px-3 py-1.5">
                  <span className="text-xs font-semibold text-slate-500">{index + 1}.</span>
                  <Input size="sm" type="date" aria-label={`${index + 1}. taksit tarihi`} value={row.date} onChange={(event) => editRow(index, { date: event.target.value })} />
                  <MoneyInput size="sm" aria-label={`${index + 1}. taksit tutarı`} value={row.amount} onChange={(value) => editRow(index, { amount: value })} className="text-right" />
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-slate-500">Tutarı ve taksit sayısını seçin; takvim burada oluşur.</p>
          )}
          {rows.length > 0 && (rowsMismatch || manualRows) && (
            <p className={`text-xs font-semibold ${rowsMismatch ? "text-red-700" : "text-slate-600"}`}>
              Taksitler toplamı {formatMoney(rowsTotal)}{rowsMismatch && remaining ? ` · olması gereken ${formatMoney(remaining)}` : ""}
            </p>
          )}
          {errors.rows && <p role="alert" className="text-xs font-medium text-red-600">{errors.rows}</p>}
        </div>
      </Disclosure>

      <Disclosure
        title="Ek bilgiler"
        summary={[title.trim() ? "plan adı" : "", notes.trim() ? "not" : ""].filter(Boolean).join(" · ") || "Plan adı, not"}
        open={moreOpen}
        onOpenChange={setMoreOpen}
      >
        <div className="grid gap-4">
          <FormField label="Plan adı" htmlFor={`${baseId}-title`}>
            <Input id={`${baseId}-title`} value={title} maxLength={180} placeholder="Örn. İmplant tedavisi" onChange={(event) => setTitle(event.target.value)} />
          </FormField>
          <FormField label="Not" htmlFor={`${baseId}-notes`}>
            <Textarea id={`${baseId}-notes`} rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </FormField>
        </div>
      </Disclosure>
    </FormModal>
  );
}
