"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FormModal } from "@/components/ui/FormModal";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { formatDateText } from "@/components/ui/Money";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { PaymentMethodPicker, usePosDevices } from "@/components/finance/PaymentMethodPicker";
import { useFocusWhenReady, useOpenReset } from "@/components/finance/use-open-reset";
import {
  CONNECTION_LOST,
  failureMessage,
  formatMoney,
  isPositiveMoney,
  moneyToNumber,
  newRequestKey,
  noteWithSystemTags,
  paymentDateIso,
  subtractMoney,
  visibleNote,
} from "@/components/finance/finance-money";
import { confirmDialog } from "@/lib/confirm-client";
import { compareMoney, moneyInputError, toMoneyValue } from "@/lib/money-input";
import { isPaymentMethod, requiresPos, type PaymentMethod } from "@/lib/payment-methods";
import type { StaffLike } from "@/lib/staff-roles";
import { showToastSafe } from "@/lib/toast-client";
import { printPaymentReceipt } from "@/components/finance/payment-receipt";
import { turkeyDateKey } from "@/lib/tz";

/** Hastanın açık taksit planı (tahsilat önerisi için). */
export type PaymentPlanInfo = {
  /** Planın doktoru: tahsilat taksitlere YALNIZ bu doktor adına alınırsa işlenir (lib/taksit-integration). */
  doctorId: string | null;
  doctorName?: string | null;
  /** Sıradaki (ya da en eski geciken) taksidin kalanı — normalize tutar. */
  nextDueAmount: string | null;
  nextDueDate: string | null;
  overdueCount: number;
};

/** Hastanın tahsilat bağlamı: borç, açık taksit planı ve doktor önerisi için bilgiler. */
export type PaymentContext = {
  /** Kalan borç (normalize tutar; eksi = avans). Bilinmiyorsa (ör. yetki yok) null. */
  debt: string | null;
  plan: PaymentPlanInfo | null;
  /** Hastayı en son tedavi eden doktor. */
  lastTreatmentDoctorId?: string | null;
  /** Son tahsilatın doktoru — tedavileri göremeyen rollerde (banko) öneri için. */
  lastPaymentDoctorId?: string | null;
  /** Hastayı tedavi etmiş doktorlar (yanlış doktor uyarısı). */
  treatingDoctorIds?: readonly string[];
  /**
   * Randevudan hekim önerisi (sıradaki, yoksa son tamamlanan randevunun hekimi):
   * ücrete yansıyan tedavisi olmayan hastada doktor alanı boş gelmesin.
   */
  appointmentDoctorId?: string | null;
};

export type EditablePayment = {
  id: string;
  createdAt: string;
  amount: number | string;
  method: string;
  description?: string | null;
  posId?: string | null;
  doctorId?: string | null;
};

export type InstallmentPaymentTarget = {
  planId: string;
  patientName: string;
  installment: { id: string; siraNo: number; vadeDate: string; tutar: number | string; kalan: number | string };
  /** Planın oluşturulma anı: tahsilat tarihi bundan önceki bir gün olamaz (sunucu da denetler). */
  planCreatedAt?: string;
};

type BaseProps = {
  open: boolean;
  onClose: () => void;
  /** Kayıt başarılı (pencere kapanmadan hemen önce). */
  onSaved?: () => void;
  /** Ayarlar'a "POS cihazı ekle" bağlantısı gösterilsin mi (settings:write). */
  canManagePos?: boolean;
};

type DoctorProps = {
  doctors: StaffLike[];
  doctorsLoaded: boolean;
  /** Doktor listesi yüklenemediyse kullanıcıya gösterilecek metin (boş liste "doktor yok" sanılmasın). */
  doctorsError?: string;
};

export type PaymentFormProps = BaseProps & (
  | (DoctorProps & {
      mode: "new";
      /** Seçili hasta; null ise formda hasta seçici çıkar. */
      patient: PickedPatient | null;
      /** Hasta değiştirilemez (hasta dosyasından açılan form) — adı başlıkta yazar. */
      patientLocked?: boolean;
      /** Elde hazır bağlam (hasta dosyası). */
      context?: PaymentContext | null;
      /** Bağlamı sunucudan okur (Muhasebe). Çağıran useCallback ile sabit tutmalı. */
      loadContext?: (patientId: string) => Promise<PaymentContext | null>;
      /** Çağıranın önerdiği doktor (ör. Alacaklar satırı); yalnız açılıştaki hasta için. */
      suggestedDoctorId?: string;
    })
  | (DoctorProps & {
      mode: "edit";
      payment: EditablePayment;
      patientName: string;
      context?: PaymentContext | null;
      /**
       * Tutar, tarih ve doktor düzeltilebilir mi (payments:refund). Tutarı
       * düşürmek iade sayılır; izni olmayan (banko, asistan) yalnız açıklama
       * ve yöntemi düzeltir. Verilmezse açık (eski davranış).
       */
      canAdjust?: boolean;
    })
  | {
      mode: "installment";
      target: InstallmentPaymentTarget;
    }
);

type Values = { amount: string; method: PaymentMethod; posId: string; doctorId: string; date: string; note: string };
type Errors = Partial<Record<"patient" | "amount" | "pos" | "doctor" | "date", string>>;

const EMPTY: Values = { amount: "", method: "NAKIT", posId: "", doctorId: "", date: "", note: "" };
const NO_DOCTORS: StaffLike[] = [];

function initialValues(props: PaymentFormProps): Values {
  const today = turkeyDateKey();
  if (props.mode === "edit") {
    const payment = props.payment;
    return {
      amount: toMoneyValue(payment.amount) ?? "",
      method: isPaymentMethod(payment.method) ? payment.method : "NAKIT",
      posId: payment.posId || "",
      doctorId: payment.doctorId || "",
      date: turkeyDateKey(new Date(payment.createdAt)),
      note: visibleNote(payment.description),
    };
  }
  if (props.mode === "installment") {
    return { ...EMPTY, amount: toMoneyValue(props.target.installment.kalan) ?? "", date: today };
  }
  return { ...EMPTY, date: today };
}

/**
 * Tahsilat doktoru önerisi — TEK kural (Muhasebe ve hasta dosyası aynı):
 * açık taksit planının doktoru (tahsilat taksitlerden ancak bu doktorla düşer)
 * → son tedaviyi yapan → randevunun hekimi → son tahsilatın doktoru →
 * klinikte tek doktor.
 * Önceden hasta dosyası son muayeneden öneriyordu: taksitli hastada tahsilat
 * plana işlenmiyor, banko rolünde (tedavileri göremez) alan hep boş kalıyordu.
 */
export function suggestPaymentDoctor(context: PaymentContext | null | undefined, doctors: readonly StaffLike[], explicit?: string | null): string {
  const known = (id?: string | null): id is string => Boolean(id) && doctors.some((doctor) => doctor.id === id);
  if (known(explicit)) return explicit;
  if (known(context?.plan?.doctorId)) return context.plan.doctorId;
  if (known(context?.lastTreatmentDoctorId)) return context.lastTreatmentDoctorId;
  if (known(context?.appointmentDoctorId)) return context.appointmentDoctorId;
  if (known(context?.lastPaymentDoctorId)) return context.lastPaymentDoctorId;
  return doctors.length === 1 ? doctors[0].id : "";
}

/**
 * TEK tahsilat formu: Muhasebe "Tahsilat al", hasta dosyası "Tahsilat al",
 * tahsilat düzeltme ve taksit tahsilatı aynı alanları, aynı sırayı ve aynı
 * kuralları kullanır. Zorunlular üstte (tutar, yöntem, doktor önerili);
 * tarih ve açıklama "Tarih ve açıklama" altında (tarih bugün).
 *
 * Korunan kurallar: Idempotency-Key her açılışta yeni, hata sonrası aynı
 * anahtarla tekrar (kayıt iki kez oluşmaz); doktor zorunlu; kart / mail
 * order'da POS zorunlu, diğerlerinde gönderilmez; ileri tarih yok; düzeltmede
 * YALNIZ değişen alanlar gönderilir (hakedişi ödenmiş dönemdeki kaydın
 * açıklaması düzeltilebilsin); taksit tahsilatı taksit kalanını aşamaz.
 */
export function PaymentForm(props: PaymentFormProps) {
  const { open, onClose, onSaved, canManagePos } = props;
  const mode = props.mode;
  const isNew = mode === "new";
  const isInstallment = mode === "installment";
  const baseId = useId().replace(/:/g, "");

  const propsRef = useRef(props);
  propsRef.current = props;

  const recordKey = props.mode === "new"
    ? `new:${props.patient?.id || ""}`
    : props.mode === "edit"
      ? `edit:${props.payment.id}`
      : `taksit:${props.target.planId}:${props.target.installment.id}`;
  const initKey = open ? recordKey : "";

  const [values, setValues] = useState<Values>(EMPTY);
  // POS seçimi yalnız klinikte aktif POS cihazı tanımlıysa zorunlu (sunucu kuralıyla aynı).
  const { devices: posDevices } = usePosDevices(requiresPos(values.method));
  const posAvailable = posDevices === null || posDevices.some((device) => device.isActive);
  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ patientId: string; context: PaymentContext | null } | null>(null);
  const [doctorTouched, setDoctorTouched] = useState(false);
  const initialRef = useRef<Values>(EMPTY);
  const initialPatientIdRef = useRef("");
  const requestKeyRef = useRef("");
  const autoDoctorRef = useRef("");
  const amountRef = useRef<HTMLInputElement>(null);

  // Form her açılışta temiz (ya da düzeltilen kayıtla) başlar; yeni işlem anahtarı.
  const ready = useOpenReset(initKey, () => {
    const current = propsRef.current;
    const next = initialValues(current);
    setValues(next);
    initialRef.current = next;
    const initialPatient = current.mode === "new" ? current.patient : null;
    setPatient(initialPatient);
    initialPatientIdRef.current = initialPatient?.id || "";
    setErrors({});
    setServerError("");
    setSaving(false);
    setMoreOpen(current.mode === "edit");
    setLoaded(null);
    setDoctorTouched(current.mode !== "new");
    autoDoctorRef.current = "";
    requestKeyRef.current = current.mode === "edit" ? "" : newRequestKey(current.mode === "installment" ? "taksit" : "tahsilat");
  });

  // İlk odak: hasta seçiliyse tutar, değilse hasta araması.
  useFocusWhenReady(ready, () => (propsRef.current.mode === "new" && !propsRef.current.patient
    ? document.getElementById(`${baseId}-patient`)
    : amountRef.current));

  // Muhasebe: seçilen hastanın borcu, açık planı ve doktoru sunucudan.
  const loadContext = props.mode === "new" ? props.loadContext : undefined;
  const patientId = patient?.id || "";
  useEffect(() => {
    if (!ready || !loadContext || !patientId) return;
    let active = true;
    loadContext(patientId)
      .then((context) => { if (active) setLoaded({ patientId, context }); })
      .catch(() => { if (active) setLoaded({ patientId, context: null }); });
    return () => { active = false; };
  }, [ready, loadContext, patientId]);

  const givenContext = props.mode === "installment" ? null : props.context ?? null;
  const context: PaymentContext | null = givenContext ?? (loaded && loaded.patientId === patientId ? loaded.context : null);
  const doctors = props.mode === "installment" ? NO_DOCTORS : props.doctors;
  const doctorsLoaded = props.mode === "installment" ? true : props.doctorsLoaded;
  const doctorsError = props.mode === "installment" ? "" : props.doctorsError || "";
  const explicitDoctor = props.mode === "new" && patientId && patientId === initialPatientIdRef.current ? props.suggestedDoctorId : undefined;
  const suggestion = useMemo(() => suggestPaymentDoctor(context, doctors, explicitDoctor), [context, doctors, explicitDoctor]);

  // Doktor önerisi kullanıcı elle seçene kadar bağlam geldikçe güncellenir.
  // `patientId` bağımlılıkta: hasta değişince alan boşaltılır; öneri aynı
  // kalsa bile (ör. tek doktorlu klinik) yeniden yazılsın — yoksa doktor boş
  // kalıyor, gizli alan açılıp elle seçim isteniyordu.
  useEffect(() => {
    if (!ready || !isNew || doctorTouched) return;
    const previousAuto = autoDoctorRef.current;
    autoDoctorRef.current = suggestion;
    setValues((current) => (
      current.doctorId === suggestion || (current.doctorId && current.doctorId !== previousAuto)
        ? current
        : { ...current, doctorId: suggestion }
    ));
  }, [ready, isNew, doctorTouched, suggestion, patientId]);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    const errorKey: Partial<Record<keyof Values, keyof Errors>> = { amount: "amount", posId: "pos", doctorId: "doctor", date: "date", method: "pos" };
    const target = errorKey[key];
    if (target) setErrors((current) => (current[target] ? { ...current, [target]: undefined } : current));
  };

  const today = turkeyDateKey();
  const kalan = props.mode === "installment" ? toMoneyValue(props.target.installment.kalan) ?? "0" : null;
  // Taksit tahsilatı geç girilebilir ama plan oluşturulmadan önceki bir güne yazılamaz.
  const minDate = props.mode === "installment" && props.target.planCreatedAt ? turkeyDateKey(new Date(props.target.planCreatedAt)) : "";
  // Düzeltmede tutar, tarih ve doktor yalnız iade izniyle (payments:refund) değişir.
  const canAdjust = props.mode !== "edit" || props.canAdjust !== false;
  const debt = context?.debt ?? null;
  const plan = context?.plan ?? null;
  const planDoctorId = plan?.doctorId && doctors.some((doctor) => doctor.id === plan.doctorId) ? plan.doctorId : "";
  const planDoctorName = plan?.doctorName || doctors.find((doctor) => doctor.id === plan?.doctorId)?.fullName || "";

  // Uyarılar yalnız gerektiğinde (sürekli açık ipucu yok).
  const doctorWarning = (() => {
    if (isInstallment || !values.doctorId) return undefined;
    if (plan?.doctorId && values.doctorId !== plan.doctorId) {
      return `Taksit planı ${planDoctorName || "başka bir doktor"} adına; bu tahsilat taksitlere işlenmez, yalnız genel borçtan düşer.`;
    }
    const treating = context?.treatingDoctorIds;
    if (treating && treating.length > 0 && !treating.includes(values.doctorId)) {
      return "Bu doktor hastayı tedavi edenler arasında değil; hakediş bu doktora yazılır.";
    }
    return undefined;
  })();
  const hideDoctor = isInstallment || (doctors.length === 1 && values.doctorId === doctors[0].id && !doctorWarning && !errors.doctor);

  const amountHint = ((): { text: string; tone: "neutral" | "warning" } | null => {
    if (!isPositiveMoney(values.amount) || moneyInputError(values.amount)) return null;
    if (isInstallment && kalan && compareMoney(values.amount, kalan) === -1) {
      return { text: `Kalan ${formatMoney(subtractMoney(kalan, values.amount))} bu taksitte açık kalır.`, tone: "neutral" };
    }
    if (isNew && debt !== null && compareMoney(values.amount, debt) === 1) {
      const base = compareMoney(debt, 0) === 1 ? debt : "0";
      return { text: `Kalan borçtan ${formatMoney(subtractMoney(values.amount, base))} fazla; fazlası hastanın sonraki tedavilerinden düşülür.`, tone: "warning" };
    }
    return null;
  })();

  const validate = (): Errors => {
    const next: Errors = {};
    if (isNew && !patient) next.patient = "Hastayı seçin.";
    const amountError = moneyInputError(values.amount, { required: true, ...(kalan ? { max: kalan } : {}) });
    if (amountError) next.amount = amountError;
    // Doktor kilitliyse (düzeltmede iade izni yok) doktoru olmayan eski kayıtta da açıklama düzeltilebilsin.
    if (!isInstallment && canAdjust && !values.doctorId) next.doctor = "Tahsilatın sayılacağı doktoru seçin.";
    if (requiresPos(values.method) && !values.posId && posAvailable) next.pos = "Kart / mail order tahsilatında POS cihazı seçin.";
    if (!values.date) next.date = "Tarihi seçin.";
    else if (values.date > today) next.date = "İleri bir tarih seçilemez.";
    else if (minDate && values.date < minDate) next.date = `Plan ${formatDateText(`${minDate}T12:00:00.000Z`)} tarihinde oluşturuldu; daha önceki bir gün seçilemez.`;
    return next;
  };

  // receiptPaymentId: yeni tahsilattan sonra bildirimde "Makbuz yazdır".
  const finish = (message: string, receiptPaymentId?: string) => {
    showToastSafe({
      type: "success",
      icon: "finance",
      duration: receiptPaymentId ? 9000 : 4500,
      message,
      action: receiptPaymentId ? { label: "Makbuz yazdır", onClick: () => void printPaymentReceipt(receiptPaymentId) } : undefined,
    });
    onSaved?.();
    onClose();
  };

  const submit = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      if (nextErrors.date) setMoreOpen(true);
      return;
    }
    // Yanlış yazılmış olabilecek tutarda tek bir onay (ör. "1,5" yerine "1.500";
    // borcun iki katından fazlası). Düzeltmede ve taksit tahsilatında yalnız
    // tutar değiştiyse sorulur (taksidin kalanı zaten 10 TL'nin altındaysa
    // önerilen tutar için onay istenmez).
    const amountChanged = props.mode === "new" || compareMoney(values.amount, initialRef.current.amount) !== 0;
    const excess = debt !== null ? subtractMoney(values.amount, debt) : null;
    const suspicious = !amountChanged
      ? null
      : compareMoney(values.amount, "10") === -1
        ? `${formatMoney(values.amount)} tahsilat kaydedilsin mi? Tutar çok düşük görünüyor.`
        : props.mode === "new" && debt !== null && compareMoney(debt, 0) === 1 && excess !== null && compareMoney(excess, debt) === 1
          ? `${formatMoney(values.amount)} tahsilat kaydedilsin mi? Kalan borç ${formatMoney(debt)}; fazlası hastanın sonraki tedavilerinden düşülür.`
          : null;
    if (suspicious && !(await confirmDialog({ title: "Tutarı kontrol edin", message: suspicious, confirmText: "Evet, kaydet", cancelText: "Tutarı düzelt" }))) {
      window.requestAnimationFrame(() => amountRef.current?.focus());
      return;
    }
    setSaving(true);
    setServerError("");
    try {
      const current = propsRef.current;
      const posId = requiresPos(values.method) ? values.posId || null : null;

      if (current.mode === "installment") {
        const { target } = current;
        const response = await fetch(`/api/taksit-plani/${encodeURIComponent(target.planId)}/taksitler/${encodeURIComponent(target.installment.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current },
          body: JSON.stringify({
            tutar: moneyToNumber(values.amount),
            yontem: values.method,
            posId,
            note: values.note.trim() || null,
            // Geç girilen tahsilat: seçilen gün (sunucu bugünü "şimdi" yazar).
            ...(values.date && values.date !== today ? { createdAt: values.date } : {}),
          }),
        }).catch(() => null);
        if (!response) { setServerError(CONNECTION_LOST); return; }
        const body = await response.json().catch(() => null);
        if (!response.ok) { setServerError(failureMessage(response, body, "Tahsilat kaydedilemedi.")); return; }
        finish(`${target.patientName} — ${target.installment.siraNo}. taksit için ${formatMoney(values.amount)} tahsil edildi.`);
        return;
      }

      if (current.mode === "edit") {
        // Yalnız değişen alanlar: dönem kilidi tutar/tarih/doktora bakar; yalnız
        // açıklaması değişen kayıt kilitli dönemde de düzeltilebilsin.
        const initial = initialRef.current;
        const body: Record<string, unknown> = {};
        if (values.date !== initial.date) body.createdAt = paymentDateIso(values.date, { forceNow: true });
        if (compareMoney(values.amount, initial.amount) !== 0) body.amount = moneyToNumber(values.amount);
        if (values.method !== initial.method) body.method = values.method;
        if (values.method !== initial.method || values.posId !== initial.posId) body.posId = posId;
        if (values.doctorId !== initial.doctorId) body.doctorId = values.doctorId;
        if (values.note.trim() !== initial.note.trim()) body.description = noteWithSystemTags(current.payment.description, values.note);
        if (Object.keys(body).length === 0) { onClose(); return; }
        const response = await fetch(`/api/payments/${encodeURIComponent(current.payment.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(() => null);
        if (!response) { setServerError("Bağlantı kurulamadı. Değişiklikleriniz korundu; tekrar deneyin."); return; }
        const data = await response.json().catch(() => null);
        if (!response.ok) { setServerError(failureMessage(response, data, "Tahsilat güncellenemedi.")); return; }
        finish(`${current.patientName} — tahsilat güncellendi.`);
        return;
      }

      if (!patient) return;
      const createdAt = paymentDateIso(values.date);
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current },
        body: JSON.stringify({
          patientId: patient.id,
          doctorId: values.doctorId,
          method: values.method,
          amount: moneyToNumber(values.amount),
          description: values.note.trim() || null,
          ...(posId ? { posId } : {}),
          ...(createdAt ? { createdAt } : {}),
        }),
      }).catch(() => null);
      if (!response) { setServerError(CONNECTION_LOST); return; }
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        // Aynı işlem anahtarıyla daha önce kaydedilmişse kayıt zaten var: başarı say.
        if (data?.duplicatePrevented) { finish(`${patient.fullName} için tahsilat zaten kaydedilmişti.`); return; }
        setServerError(failureMessage(response, data, "Tahsilat kaydedilemedi. Bilgileri kontrol edip tekrar deneyin."));
        return;
      }
      // Sunucu tahsilatı açık taksitlere ve aynı günkü randevuya kendisi işler; kullanıcı bunu görsün.
      const taksitCount = Number(data?.taksitInfo?.updatedCount || 0);
      const completed = Number(data?.autoCompletedAppointments || 0);
      const extras = [
        taksitCount > 0 ? `${taksitCount} taksit ödendi olarak işlendi` : "",
        completed > 0 ? "bugünkü randevusu Tamamlandı yapıldı" : "",
      ].filter(Boolean);
      finish(`${patient.fullName} için ${formatMoney(values.amount)} tahsilat kaydedildi${extras.length ? ` (${extras.join(", ")})` : ""}.`, typeof data?.id === "string" ? data.id : undefined);
    } finally {
      setSaving(false);
    }
  };

  const initial = initialRef.current;
  const dirty = open && (
    values.amount !== initial.amount
    || values.method !== initial.method
    || values.date !== initial.date
    || values.note !== initial.note
    || (doctorTouched && values.doctorId !== initial.doctorId)
    || (isNew && (patient?.id || "") !== initialPatientIdRef.current)
  );

  // Başlık ve tek satırlık bağlam (borç bir kez, burada yazar).
  const debtText = debt === null ? "" : compareMoney(debt, 0) === 1 ? `Kalan borç ${formatMoney(debt)}` : "Açık borç yok";
  let title = "Tahsilat al";
  let description: string | undefined;
  if (props.mode === "new") {
    description = [props.patientLocked ? patient?.fullName : "", patient ? debtText : ""].filter(Boolean).join(" · ") || undefined;
  } else if (props.mode === "edit") {
    title = "Tahsilatı düzelt";
    description = `${props.patientName} · ${formatDateText(props.payment.createdAt)} tarihli tahsilat`;
  } else {
    const { target } = props;
    title = `${target.patientName} — ${target.installment.siraNo}. taksit`;
    const tutar = toMoneyValue(target.installment.tutar);
    description = [
      `Vade ${formatDateText(target.installment.vadeDate)}`,
      tutar && kalan && compareMoney(tutar, kalan) !== 0 ? `Taksit ${formatMoney(tutar)}` : "",
      `Kalan ${formatMoney(kalan)}`,
    ].filter(Boolean).join(" · ");
  }

  // Tutarı tek dokunuşla doldur: borcun tamamı / sıradaki taksit.
  const quickFills: { key: string; label: string; amount: string; doctorId?: string; title?: string }[] = [];
  if (isNew && debt !== null && compareMoney(debt, 0) === 1) {
    quickFills.push({ key: "borc", label: "Borcun tamamı", amount: debt });
  }
  if (isNew && plan?.nextDueAmount && isPositiveMoney(plan.nextDueAmount) && !(debt !== null && compareMoney(plan.nextDueAmount, debt) === 0)) {
    quickFills.push({
      key: "taksit",
      label: `${plan.overdueCount > 0 ? "Geciken" : "Sıradaki"} taksit · ${formatMoney(plan.nextDueAmount)}`,
      amount: plan.nextDueAmount,
      doctorId: planDoctorId || undefined,
      title: plan.nextDueDate ? `${formatDateText(plan.nextDueDate)} vadeli${plan.overdueCount > 1 ? ` · ${plan.overdueCount} taksit gecikti` : ""}` : undefined,
    });
  }

  const noteInput = (
    <Input
      id={`${baseId}-note`}
      aria-label="Açıklama"
      value={values.note}
      maxLength={500}
      placeholder={props.mode === "installment" ? `Taksit tahsilatı (${props.target.installment.siraNo}. taksit)` : "Örn. implant 2. seans"}
      onChange={(event) => set("note", event.target.value)}
    />
  );

  const moreSummary = [
    values.date === today ? "Bugün" : values.date ? formatDateText(`${values.date}T12:00:00.000Z`) : "",
    values.note.trim() ? "açıklama var" : "",
  ].filter(Boolean).join(" · ");

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      module="finance"
      size="md"
      isDirty={dirty}
      onSubmit={() => submit()}
      submitting={saving}
      error={serverError}
    >
      {isNew && !(props.mode === "new" && props.patientLocked) && (
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
              setErrors((current) => ({ ...current, patient: undefined }));
              // Başka hastaya geçince önceki denemenin işlem anahtarı ve doktor seçimi taşınmaz.
              requestKeyRef.current = newRequestKey("tahsilat");
              setDoctorTouched(false);
              setValues((current) => ({ ...current, doctorId: "" }));
              autoDoctorRef.current = "";
              if (next) window.requestAnimationFrame(() => amountRef.current?.focus());
            }}
            aria-label="Hasta"
          />
        </FormField>
      )}

      <div>
        <FormField
          label="Tutar"
          required
          htmlFor={`${baseId}-amount`}
          error={errors.amount}
          hint={canAdjust ? amountHint?.text : "Tutarı düşürmek iade sayılır; muhasebe ya da yönetici yapar."}
          hintTone={canAdjust ? amountHint?.tone : undefined}
        >
          <MoneyInput
            ref={amountRef}
            id={`${baseId}-amount`}
            value={values.amount}
            onChange={(value) => set("amount", value)}
            disabled={!canAdjust}
            className="text-lg font-bold"
            // Hasta belliyse ilk odak tutarda; değilse hasta aramasında.
            data-autofocus={!isNew || patient ? true : undefined}
          />
        </FormField>
        {quickFills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {quickFills.map((fill) => (
              <Button
                key={fill.key}
                variant="secondary"
                size="sm"
                title={fill.title}
                onClick={() => {
                  set("amount", fill.amount);
                  // Taksit tutarı seçildiyse tahsilat taksite işlensin diye planın doktoru.
                  if (fill.doctorId) { set("doctorId", fill.doctorId); setDoctorTouched(true); }
                }}
              >
                {fill.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      <PaymentMethodPicker
        idPrefix={baseId}
        value={values.method}
        onChange={(method) => {
          setValues((current) => ({ ...current, method, posId: requiresPos(method) ? current.posId : "" }));
          setErrors((current) => (current.pos ? { ...current, pos: undefined } : current));
        }}
        pos={{
          value: values.posId,
          onChange: (posId) => set("posId", posId),
          error: errors.pos,
          keepId: props.mode === "edit" ? props.payment.posId : null,
          canManage: canManagePos,
        }}
      />

      {!hideDoctor && (
        <FormField label="Doktor" required htmlFor={`${baseId}-doctor`} error={errors.doctor || doctorsError || undefined} hint={doctorWarning} hintTone="warning">
          <DoctorSelect
            id={`${baseId}-doctor`}
            value={values.doctorId}
            doctors={doctors}
            disabled={!doctorsLoaded || !canAdjust}
            onChange={(doctorId) => { set("doctorId", doctorId); setDoctorTouched(true); }}
          />
        </FormField>
      )}

      {/* Taksit tahsilatında da tarih: geç girilen tahsilat kendi gününe yazılsın (bugün varsayılan). */}
      <Disclosure title="Tarih ve açıklama" summary={moreSummary || undefined} open={moreOpen} onOpenChange={setMoreOpen}>
        <div className="space-y-4">
          <FormField
            label="Tarih"
            required
            htmlFor={`${baseId}-date`}
            error={errors.date}
            hint={canAdjust ? undefined : "Tarihi ve doktoru muhasebe ya da yönetici değiştirir."}
          >
            <Input id={`${baseId}-date`} type="date" min={minDate || undefined} max={today} value={values.date} disabled={!canAdjust} onChange={(event) => set("date", event.target.value)} />
          </FormField>
          <FormField label="Açıklama" htmlFor={`${baseId}-note`}>
            {noteInput}
          </FormField>
        </div>
      </Disclosure>
    </FormModal>
  );
}
