"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { FormModal } from "@/components/ui/FormModal";
import { FormField } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Disclosure } from "@/components/ui/Disclosure";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { useFinanceDoctors } from "@/components/muhasebe/useFinanceDoctors";
import { ExpenseTypesModal, isSystemCategory, type ExpenseCategory } from "@/components/muhasebe/ExpenseTypesModal";
import { PaymentMethodPicker } from "@/components/finance/PaymentMethodPicker";
import { useFocusWhenReady, useOpenReset } from "@/components/finance/use-open-reset";
import {
  CONNECTION_LOST,
  formatMoney,
  isPositiveMoney,
  moneyToNumber,
  newRequestKey,
  failureMessage,
  noteWithSystemTags,
  serverMessage,
  visibleNote,
} from "@/components/finance/finance-money";
import { cachedGet } from "@/lib/client-cache";
import { compareMoney, moneyInputError, toMoneyValue } from "@/lib/money-input";
import {
  DOCTOR_PAYOUT_METHODS,
  PAYMENT_METHOD_VALUES,
  VENDOR_PAYMENT_METHODS,
  isPaymentMethod,
  type PaymentMethod,
} from "@/lib/payment-methods";
import { showToastSafe } from "@/lib/toast-client";
import { turkeyDateKey } from "@/lib/tz";

export type OutgoingKind = "gider" | "firma" | "hakedis";
export type FirmaOption = { id: string; name: string; bakiye: number };
export type PayoutTarget = { doctorId: string; year: number; month: number; kalan: number };
export type EditableExpense = {
  id: string;
  tarih: string;
  category: string;
  categoryId?: string | null;
  description?: string | null;
  tutar: number | string;
  yontem?: string | null;
  doctorId?: string | null;
  doctor?: { id: string; fullName: string } | null;
  periodYear?: number | null;
  periodMonth?: number | null;
};

type BaseProps = {
  open: boolean;
  onClose: () => void;
  /** Kayıt başarılı (pencere kapandıktan sonra). */
  onSaved?: (kind: OutgoingKind) => void;
};

export type ExpenseFormProps = BaseProps & (
  | {
      mode: "new";
      kind: OutgoingKind;
      /** Üstteki tür seçicide gösterilecek türler (izne göre). Tek tür ya da sabit bağlamda seçici çıkmaz. */
      kinds?: readonly OutgoingKind[];
      /** Firma ekranından: firma sabit (seçici yok). */
      firma?: FirmaOption | null;
      /** Firma: önerilen tutar (ör. bir satın almanın kalanı). */
      suggestedAmount?: number;
      /** Firma: açıklama boş bırakılırsa yazılacak metin (ör. "Satın alma ödemesi"). */
      reference?: string;
      /**
       * Firma: ödeme önce bu satın almanın borcuna düşsün
       * (POST /api/firma/[id]/islemler isteğe bağlı purchaseId). Verilmezse
       * sunucu en eski açık borçtan düşer.
       */
      purchaseId?: string;
      /** Hakediş: Hakediş sekmesinden seçili doktor/ay ile açılır. */
      payout?: PayoutTarget | null;
    }
  | {
      mode: "edit";
      expense: EditableExpense;
    }
);

type PayoutPeriod = { year: number; month: number; kalan: number };
type Values = {
  amount: string;
  method: PaymentMethod;
  date: string;
  note: string;
  categoryId: string;
  categoryText: string;
  firmaId: string;
  firmaText: string;
  payoutDoctorId: string;
  period: string;
};
type Errors = Partial<Record<"amount" | "date" | "category" | "firma" | "doctor" | "period", string>>;

const KIND_TITLE: Record<OutgoingKind, string> = {
  gider: "Gider ekle",
  firma: "Firma ödemesi",
  hakedis: "Hakediş ödemesi",
};
const KIND_LABEL: Record<OutgoingKind, string> = {
  gider: "Gider",
  firma: "Firma ödemesi",
  hakedis: "Hakediş ödemesi",
};
const DEFAULT_METHOD: Record<OutgoingKind, PaymentMethod> = { gider: "NAKIT", firma: "HAVALE_EFT", hakedis: "NAKIT" };
const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const monthName = (year: number, month: number) => `${AY_ADLARI[month - 1] || month} ${year}`;
const periodKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

const EMPTY: Values = {
  amount: "", method: "NAKIT", date: "", note: "",
  categoryId: "", categoryText: "", firmaId: "", firmaText: "", payoutDoctorId: "", period: "",
};

/** Karşılaştırma anahtarı: Türkçe küçük harf, aksansız, tek boşluk. */
const nameKey = (value: string) => value
  .toLocaleLowerCase("tr-TR")
  .replace(/ı/g, "i")
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

/**
 * Yazılan gider türü ya da açıklamada kayıtlı bir firmanın adı geçiyor mu?
 * Firma adının tamamı ya da ilk iki sözcüğü (tek sözcüklüyse en az 4 harfli
 * adı) bütün sözcük olarak aranır. Eşleşme yalnız uyarıdır; kayıt engellenmez.
 */
function findFirmaMention(firmas: readonly FirmaOption[], texts: string[]): FirmaOption | null {
  const haystack = ` ${texts.map(nameKey).filter(Boolean).join(" ")} `;
  if (haystack.trim().length < 3) return null;
  for (const firma of firmas) {
    const words = nameKey(firma.name).split(" ").filter(Boolean);
    if (words.length === 0) continue;
    const needle = words.length === 1 ? (words[0].length >= 4 ? words[0] : "") : words.slice(0, 2).join(" ");
    if (needle && haystack.includes(` ${needle} `)) return firma;
  }
  return null;
}

function initialValues(props: ExpenseFormProps): Values {
  const today = turkeyDateKey();
  if (props.mode === "edit") {
    const expense = props.expense;
    return {
      ...EMPTY,
      amount: toMoneyValue(expense.tutar) ?? "",
      method: isPaymentMethod(expense.yontem) ? expense.yontem : "NAKIT",
      date: turkeyDateKey(new Date(expense.tarih)),
      note: visibleNote(expense.description),
      categoryId: expense.categoryId || "",
      categoryText: expense.category || "",
    };
  }
  const suggested = props.kind === "firma" && props.firma
    ? (() => {
        const balance = toMoneyValue(Math.max(0, props.firma.bakiye));
        const proposed = props.suggestedAmount && props.suggestedAmount > 0 ? toMoneyValue(props.suggestedAmount) : null;
        // Önerilen tutar (satın almanın kalanı) firmanın toplam borcunu aşamaz.
        return proposed && balance && compareMoney(proposed, balance) === 1 ? balance : proposed;
      })()
    : null;
  return {
    ...EMPTY,
    amount: props.kind === "hakedis" && props.payout ? toMoneyValue(props.payout.kalan) ?? "" : suggested ?? "",
    method: DEFAULT_METHOD[props.kind],
    date: today,
    firmaId: props.firma?.id || "",
    firmaText: props.firma?.name || "",
    payoutDoctorId: props.payout?.doctorId || "",
    period: props.payout ? periodKey(props.payout.year, props.payout.month) : "",
  };
}

/**
 * Hakediş ödenebilecek aylar: biten ve kalanı olan aylar. `/api/hakedis`
 * earnings:read ister; bu izni olmayan muhasebeci için (varsayılan MUHASEBE
 * rolü) liste boş geliyor ve "ödenecek hakediş yok" deniyordu — bu durumda
 * finance:read ile okunabilen özetten en eski ödenmemiş ay alınır.
 */
async function loadPayoutPeriods(doctorId: string): Promise<{ periods: PayoutPeriod[]; failed: boolean }> {
  const current = turkeyDateKey().slice(0, 7);
  const response = await fetch(`/api/hakedis?doctorId=${encodeURIComponent(doctorId)}&months=12`, { cache: "no-store" }).catch(() => null);
  if (response?.ok) {
    const data = await response.json().catch(() => null);
    const months: PayoutPeriod[] = Array.isArray(data?.months) ? data.months : [];
    return { periods: months.filter((row) => periodKey(row.year, row.month) !== current && Number(row.kalan) > 0.5), failed: false };
  }
  if (response && response.status !== 403) return { periods: [], failed: true };
  const summary = await fetch("/api/hakedis/ozet", { cache: "no-store" }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
  const row = Array.isArray(summary?.doctors) ? summary.doctors.find((item: { doctor?: { id?: string } }) => item.doctor?.id === doctorId) : null;
  const oldest = row?.enEskiOdenmemis as PayoutPeriod | null | undefined;
  if (!summary) return { periods: [], failed: true };
  return { periods: oldest && Number(oldest.kalan) > 0.5 ? [oldest] : [], failed: false };
}

/**
 * Para ÇIKIŞI formu — gider, firma (tedarikçi) ödemesi, hakediş ödemesi ve
 * gider/hakediş düzeltmesi. Zorunlular üstte (tutar, yöntem, tarih bugün);
 * açıklama katlanır bölümde. Firma ekranındaki "Ödeme yap" da bu formu
 * kullanır (önceden iki ayrı firma ödeme formu vardı). "Gider"de tedarikçi
 * malzemesinin Satın alma'dan, ödemesinin "Firma ödemesi"nden girileceği
 * söylenir; aksi halde aynı maliyet iki kez gider yazılır.
 *
 * Korunan kurallar: Idempotency-Key her açılışta ve tür değişince yeni;
 * bağlantı koparsa anahtar korunur; ileri tarih yok; firma ödemesi ≤ firma
 * borcu; hakediş yalnız nakit / havale, yalnız biten aylar, ≤ ay kalanı;
 * "Doktor Hakedişi" türü normal giderde seçilemez; listede olmayan gider
 * türü yazılırsa kalıcı tür olarak eklenir; düzeltmede yalnız değişen alanlar.
 */
export function ExpenseForm(props: ExpenseFormProps) {
  const { open, onClose, onSaved } = props;
  const isEdit = props.mode === "edit";
  const baseId = useId().replace(/:/g, "");
  const propsRef = useRef(props);
  propsRef.current = props;

  const editPayout = props.mode === "edit" && Boolean(props.expense.doctorId);
  const recordKey = props.mode === "edit"
    ? `edit:${props.expense.id}`
    : `new:${props.kind}:${props.firma?.id || ""}:${props.payout ? `${props.payout.doctorId}-${props.payout.year}-${props.payout.month}` : ""}`;
  const initKey = open ? recordKey : "";

  const [kind, setKind] = useState<OutgoingKind>("gider");
  const [values, setValues] = useState<Values>(EMPTY);
  const [methodTouched, setMethodTouched] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [typesOpen, setTypesOpen] = useState(false);
  const [firmas, setFirmas] = useState<FirmaOption[] | null>(null);
  const [periodsState, setPeriodsState] = useState<{ doctorId: string; periods: PayoutPeriod[]; failed: boolean } | null>(null);
  const initialRef = useRef<Values>(EMPTY);
  const requestKeyRef = useRef("");

  const ready = useOpenReset(initKey, () => {
    const current = propsRef.current;
    const next = initialValues(current);
    setKind(current.mode === "edit" ? (current.expense.doctorId ? "hakedis" : "gider") : current.kind);
    setValues(next);
    initialRef.current = next;
    setMethodTouched(false);
    setErrors({});
    setServerError("");
    setSaving(false);
    setMoreOpen(current.mode === "edit" && Boolean(next.note));
    setPeriodsState(null);
    requestKeyRef.current = newRequestKey("odeme");
  });

  // İlk odak: firma seçilecekse firma araması, hakediş doktoru seçilecekse doktor, yoksa tutar.
  useFocusWhenReady(ready, () => {
    const current = propsRef.current;
    if (current.mode === "new" && current.kind === "firma" && !current.firma) return document.getElementById(`${baseId}-firma`);
    if (current.mode === "new" && current.kind === "hakedis" && !current.payout) return document.getElementById(`${baseId}-doctor`);
    return document.getElementById(`${baseId}-amount`);
  });

  // Tür değişince yeni işlem anahtarı: bir türde başarısız kalan deneme diğerine taşınmasın.
  const changeKind = (next: OutgoingKind) => {
    setKind(next);
    requestKeyRef.current = newRequestKey(next);
    setErrors({});
    setServerError("");
    setValues((current) => {
      const allowed: readonly PaymentMethod[] = next === "hakedis" ? DOCTOR_PAYOUT_METHODS : PAYMENT_METHOD_VALUES;
      const method = !methodTouched || !allowed.includes(current.method) ? DEFAULT_METHOD[next] : current.method;
      return { ...current, method };
    });
  };

  // Gider türleri (60 sn önbellek; yeni tür eklenince yenilenir).
  const loadCategories = useCallback(async (force = false) => {
    const list = await cachedGet<ExpenseCategory[]>("/api/gider-kategorileri", 60_000, { force }).catch(() => null);
    const next = Array.isArray(list) ? list : [];
    setCategories(next);
    return next;
  }, []);
  const needsCategories = ready && kind === "gider";
  useEffect(() => {
    if (needsCategories) void loadCategories();
  }, [needsCategories, loadCategories]);

  // Firma listesi yalnız firma sabit değilse (Muhasebe) ve firma türü seçiliyken.
  const fixedFirma = props.mode === "new" ? props.firma || null : null;
  const needsFirmas = ready && kind === "firma" && !fixedFirma;
  // İstek başarısızsa (ör. 429/5xx) liste "Kayıtlı firma yok" diye boş
  // görünmesin: hata ve "Yeniden dene" gösterilir.
  const [firmasError, setFirmasError] = useState("");
  const [firmasAttempt, setFirmasAttempt] = useState(0);
  useEffect(() => {
    if (!needsFirmas) return;
    let active = true;
    setFirmas(null);
    setFirmasError("");
    fetch("/api/firma", { cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(serverMessage(body, "Firmalar yüklenemedi."));
        return body;
      })
      .then((list) => {
        if (!active) return;
        setFirmas(Array.isArray(list) ? (list as FirmaOption[]).map((item) => ({ id: item.id, name: item.name, bakiye: Number(item.bakiye) || 0 })) : []);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setFirmas([]);
        setFirmasError(loadError instanceof Error && loadError.message ? loadError.message : "Firmalar yüklenemedi.");
      });
    return () => { active = false; };
  }, [needsFirmas, firmasAttempt]);

  // Hakediş ayları seçilen doktor için.
  const payoutDoctorId = values.payoutDoctorId;
  const needsPeriods = ready && !isEdit && kind === "hakedis" && Boolean(payoutDoctorId);
  useEffect(() => {
    if (!needsPeriods) return;
    let active = true;
    setPeriodsState(null);
    loadPayoutPeriods(payoutDoctorId)
      .then((result) => { if (active) setPeriodsState({ doctorId: payoutDoctorId, ...result }); })
      .catch(() => { if (active) setPeriodsState({ doctorId: payoutDoctorId, periods: [], failed: true }); });
    return () => { active = false; };
  }, [needsPeriods, payoutDoctorId]);

  const payout = props.mode === "new" ? props.payout || null : null;
  const periods = useMemo(() => {
    const list = periodsState && periodsState.doctorId === payoutDoctorId ? [...periodsState.periods] : [];
    // Hakediş sekmesinden gelen ay listede yoksa (ör. özetten yalnız en eski ay geldi) eklenir.
    if (payout && payout.doctorId === payoutDoctorId && !list.some((item) => item.year === payout.year && item.month === payout.month)) {
      list.push({ year: payout.year, month: payout.month, kalan: payout.kalan });
    }
    return list.sort((a, b) => periodKey(a.year, a.month).localeCompare(periodKey(b.year, b.month)));
  }, [periodsState, payoutDoctorId, payout]);
  const periodsLoading = needsPeriods && (!periodsState || periodsState.doctorId !== payoutDoctorId);
  const selectedPeriod = periods.find((item) => periodKey(item.year, item.month) === values.period);

  // Ay seçili değilse en eski ödenmemiş ay seçilir ve tutar onun kalanıyla dolar.
  useEffect(() => {
    if (!needsPeriods || periodsLoading || values.period || periods.length === 0) return;
    const oldest = periods[0];
    setValues((current) => (current.period ? current : { ...current, period: periodKey(oldest.year, oldest.month), amount: toMoneyValue(oldest.kalan) ?? current.amount }));
  }, [needsPeriods, periodsLoading, values.period, periods]);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    const errorKey: Partial<Record<keyof Values, keyof Errors>> = { amount: "amount", date: "date", categoryText: "category", categoryId: "category", firmaId: "firma", firmaText: "firma", payoutDoctorId: "doctor", period: "period" };
    const target = errorKey[key];
    if (target) setErrors((current) => (current[target] ? { ...current, [target]: undefined } : current));
  };

  const today = turkeyDateKey();
  const selectedFirma = fixedFirma || (firmas || []).find((item) => item.id === values.firmaId) || null;
  const firmaDebt = selectedFirma ? toMoneyValue(Math.max(0, selectedFirma.bakiye)) : null;
  const payoutCategory = categories.find((item) => item.isDoctorPayout && item.isActive);
  const { doctors, loaded: doctorsLoaded, error: doctorsError } = useFinanceDoctors(ready && !isEdit && kind === "hakedis");

  const categoryOptions = useMemo(() => {
    const q = values.categoryText.trim().toLocaleLowerCase("tr");
    return categories
      // Sistem türleri ("Doktor Hakedişi", "Firma Ödemesi") yalnız kendi akışlarından yazılır.
      .filter((item) => item.isActive && !isSystemCategory(item) && (!q || item.name.toLocaleLowerCase("tr").includes(q)))
      .slice(0, 40)
      .map((item) => ({ id: item.id, label: item.name }));
  }, [categories, values.categoryText]);

  const firmaOptions = useMemo(() => {
    const q = values.firmaText.trim().toLocaleLowerCase("tr");
    return (firmas || [])
      .filter((item) => !q || item.name.toLocaleLowerCase("tr").includes(q))
      .slice(0, 40)
      .map((item) => ({ id: item.id, label: item.name, meta: item.bakiye > 0.005 ? `Borç ${formatMoney(item.bakiye)}` : "Borç yok" }));
  }, [firmas, values.firmaText]);

  const validate = (): Errors => {
    const next: Errors = {};
    const max = kind === "firma" && firmaDebt ? firmaDebt : kind === "hakedis" && selectedPeriod ? toMoneyValue(selectedPeriod.kalan) ?? undefined : undefined;
    const amountError = moneyInputError(values.amount, { required: true, ...(max ? { max } : {}) });
    if (amountError) next.amount = kind === "firma" && max && compareMoney(values.amount, max) === 1 ? `Firmaya borcunuz ${formatMoney(max)}; daha fazlası ödenemez.` : amountError;
    if (!values.date) next.date = "Tarihi seçin.";
    else if (values.date > today) next.date = "İleri bir tarih seçilemez.";
    if (kind === "gider" && !editPayout) {
      const typed = values.categoryText.trim().toLocaleLowerCase("tr");
      if (!values.categoryId && !typed) next.category = "Gider türünü seçin veya yazın.";
      else if (!values.categoryId && categories.some((item) => item.isDoctorPayout && item.name.toLocaleLowerCase("tr") === typed)) {
        next.category = "Doktora yapılan ödeme için Hakediş ödemesi'ni seçin.";
      } else if (!values.categoryId && !isEdit && isSystemCategory({ name: values.categoryText.trim() })) {
        next.category = "Tedarikçiye yapılan ödeme için Firma ödemesi'ni seçin.";
      }
    }
    if (kind === "firma") {
      if (!selectedFirma) next.firma = "Ödeme yapılan firmayı seçin.";
      else if (!firmaDebt || !isPositiveMoney(firmaDebt)) next.firma = "Bu firmaya açık borç görünmüyor.";
    }
    if (kind === "hakedis" && !isEdit) {
      if (!values.payoutDoctorId) next.doctor = "Doktoru seçin.";
      if (!values.period) next.period = "Hangi ayın hakedişi ödendiğini seçin.";
    }
    return next;
  };

  async function resolveExpenseCategory(): Promise<{ id: string | null; name: string }> {
    if (values.categoryId) {
      const picked = categories.find((item) => item.id === values.categoryId);
      return { id: values.categoryId, name: picked?.name || values.categoryText.trim() };
    }
    const name = values.categoryText.trim();
    const existing = categories.find((item) => !item.isDoctorPayout && item.name.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr"));
    if (existing) return { id: existing.id, name: existing.name };
    // Listede olmayan tür yazıldıysa kalıcı tür olarak eklenir (raporlarda aynı adla gruplanır).
    const created = await fetch("/api/gider-kategorileri", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    const createdBody = created?.ok ? await created.json().catch(() => null) : null;
    const list = await loadCategories(true);
    if (createdBody?.id) return { id: createdBody.id, name: createdBody.name || name };
    const again = list.find((item) => item.name.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr"));
    return { id: again && !again.isDoctorPayout ? again.id : null, name };
  }

  const done = (message: string, savedKind: OutgoingKind) => {
    showToastSafe({ message, type: "success", icon: savedKind === "hakedis" ? "hakediş" : savedKind === "firma" ? "firma" : "finance", duration: 4500 });
    onClose();
    onSaved?.(savedKind);
  };

  const submit = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    setServerError("");
    try {
      const current = propsRef.current;
      const amount = moneyToNumber(values.amount);
      const note = values.note.trim();

      if (current.mode === "edit") {
        const initial = initialRef.current;
        const body: Record<string, unknown> = {};
        if (values.date !== initial.date) body.tarih = values.date;
        if (compareMoney(values.amount, initial.amount) !== 0) body.tutar = amount;
        if (values.method !== initial.method) body.yontem = values.method;
        if (values.note.trim() !== initial.note.trim()) body.description = noteWithSystemTags(current.expense.description, values.note);
        if (!editPayout) {
          if (values.categoryText !== initial.categoryText || values.categoryId !== initial.categoryId) {
            const typed = values.categoryText.trim();
            const match = values.categoryId
              ? categories.find((item) => item.id === values.categoryId)
              : categories.find((item) => !item.isDoctorPayout && item.name.toLocaleLowerCase("tr") === typed.toLocaleLowerCase("tr"));
            body.categoryId = match?.id || null;
            body.category = match?.name || typed;
          }
        }
        if (Object.keys(body).length === 0) { onClose(); return; }
        const response = await fetch(`/api/gider/${encodeURIComponent(current.expense.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(() => null);
        if (!response) { setServerError("Bağlantı kurulamadı. Değişiklikleriniz korundu; tekrar deneyin."); return; }
        const data = await response.json().catch(() => null);
        if (!response.ok) { setServerError(failureMessage(response, data, "Değişiklik kaydedilemedi.")); return; }
        done(editPayout ? "Hakediş ödemesi güncellendi." : "Gider güncellendi.", editPayout ? "hakedis" : "gider");
        return;
      }

      const headers = { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current };
      let response: Response | null = null;
      let message = "";
      if (kind === "gider") {
        const category = await resolveExpenseCategory();
        response = await fetch("/api/gider", {
          method: "POST",
          headers,
          body: JSON.stringify({
            tarih: values.date,
            categoryId: category.id,
            category: category.name,
            description: note || null,
            tutar: amount,
            yontem: values.method,
          }),
        }).catch(() => null);
        message = `${category.name} gideri kaydedildi (${formatMoney(values.amount)}).`;
      } else if (kind === "hakedis") {
        const [periodYear, periodMonth] = values.period.split("-").map(Number);
        response = await fetch("/api/gider", {
          method: "POST",
          headers,
          body: JSON.stringify({
            tarih: values.date,
            categoryId: payoutCategory?.id || null,
            category: payoutCategory?.name || "Doktor Hakedişi",
            description: note || null,
            tutar: amount,
            yontem: values.method,
            doctorId: values.payoutDoctorId,
            periodYear,
            periodMonth,
          }),
        }).catch(() => null);
        message = `${monthName(periodYear, periodMonth)} hakediş ödemesi kaydedildi (${formatMoney(values.amount)}).`;
      } else if (selectedFirma) {
        response = await fetch(`/api/firma/${encodeURIComponent(selectedFirma.id)}/islemler`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            tarih: values.date,
            islemTipi: "ODEME",
            tutar: amount,
            yontem: values.method,
            aciklama: note || (current.mode === "new" ? current.reference : "") || "Firma ödemesi",
            ...(current.mode === "new" && current.purchaseId ? { purchaseId: current.purchaseId } : {}),
          }),
        }).catch(() => null);
        message = `${selectedFirma.name} için ${formatMoney(values.amount)} ödeme kaydedildi.`;
      }
      if (!response) { setServerError(CONNECTION_LOST); return; }
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setServerError(failureMessage(response, data, "Kayıt yapılamadı. Bilgileri kontrol edip tekrar deneyin."));
        return;
      }
      done(message, kind);
    } finally {
      setSaving(false);
    }
  };

  // ── Görünüm
  const switcherKinds = props.mode === "new" && !fixedFirma && !payout ? (props.kinds || []) : [];
  const showSwitcher = switcherKinds.length > 1;
  // "Gider"de tedarikçi malzemesi yazılırsa aynı maliyet iki kez gider olur (Satın
  // alma + ödeme). Firma ödemesi seçilebiliyorsa yol gösterilir; firma listesi bu
  // pencerede zaten yüklendiyse (Firma ödemesine bakıldıysa) adı geçen firma uyarılır.
  const showSupplierHint = showSwitcher && kind === "gider" && switcherKinds.includes("firma");
  const mentionedFirma = showSupplierHint && firmas ? findFirmaMention(firmas, [values.categoryText, values.note]) : null;
  // Satın almadan açılan ödeme: o alımın kalanı (firmanın toplam borcunu aşamaz). Önceden
  // başlık yalnız firmanın toplam borcunu yazıyor, "Borcun tamamı" onu dolduruyor ve
  // fazlası başka alımlara gidiyordu.
  const invoiceRemaining = (() => {
    if (!fixedFirma || props.mode !== "new" || !props.purchaseId || !props.suggestedAmount || props.suggestedAmount <= 0) return null;
    const proposed = toMoneyValue(props.suggestedAmount);
    return proposed && firmaDebt && compareMoney(proposed, firmaDebt) === 1 ? firmaDebt : proposed;
  })();
  // Tedarikçi ekranından açılan pencerenin adı onu açan düğmeyle aynı: "Ödeme yap"
  // (sözlük: tedarikçiye yapılan para çıkışı "Ödeme"; firma adı açıklamada).
  const title = isEdit
    ? editPayout ? "Hakediş ödemesini düzenle" : "Gideri düzenle"
    : fixedFirma ? "Ödeme yap" : showSwitcher ? "Gider / ödeme" : KIND_TITLE[kind];
  const description = props.mode === "edit"
    ? editPayout
      ? [props.expense.doctor?.fullName, props.expense.periodYear && props.expense.periodMonth ? `${monthName(props.expense.periodYear, props.expense.periodMonth)} hakedişi` : ""].filter(Boolean).join(" · ")
      : undefined
    : fixedFirma
      ? invoiceRemaining && firmaDebt && isPositiveMoney(firmaDebt)
        ? [fixedFirma.name, `Bu alımın kalanı ${formatMoney(invoiceRemaining)}`, `toplam borç ${formatMoney(firmaDebt)}`].join(" · ")
        : [fixedFirma.name, firmaDebt && isPositiveMoney(firmaDebt) ? `Kalan borç ${formatMoney(firmaDebt)}` : "Açık borç yok"].join(" · ")
      : undefined;

  const initial = initialRef.current;
  const dirty = open && (
    values.amount !== initial.amount || values.note !== initial.note
      || values.date !== initial.date || values.categoryText !== initial.categoryText
      || (!fixedFirma && values.firmaId !== initial.firmaId) || methodTouched
      || (!payout && values.payoutDoctorId !== initial.payoutDoctorId)
  );

  const methods: readonly PaymentMethod[] = kind === "hakedis" ? DOCTOR_PAYOUT_METHODS : kind === "firma" ? VENDOR_PAYMENT_METHODS : PAYMENT_METHOD_VALUES;
  const notePreview = values.note.trim().length > 40 ? `${values.note.trim().slice(0, 40)}…` : values.note.trim();
  const invoiceContext = Boolean(fixedFirma && props.mode === "new" && (props.reference || props.suggestedAmount));
  const targetsInvoice = Boolean(fixedFirma && props.mode === "new" && props.purchaseId);

  return (
    <>
      <FormModal
        open={open}
        onClose={onClose}
        title={title}
        description={description || undefined}
        module={kind === "hakedis" ? "hakediş" : kind === "firma" ? "firma" : "finance"}
        size="md"
        isDirty={dirty}
        onSubmit={() => submit()}
        submitting={saving}
        error={serverError}
      >
        {showSwitcher && (
          <ChoiceCards
            label="Ne ödüyorsunuz?"
            labelHidden
            variant="pills"
            options={switcherKinds.map((value) => ({ value, label: KIND_LABEL[value] }))}
            value={kind}
            onChange={changeKind}
          />
        )}
        {showSupplierHint && (mentionedFirma ? (
          <Callout
            tone="warning"
            compact
            inline
            className="-mt-2"
            // Firma ödemesine geçerken adı geçen firma seçili gelir.
            action={(
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  changeKind("firma");
                  setValues((current) => ({ ...current, firmaId: mentionedFirma.id, firmaText: mentionedFirma.name }));
                }}
              >
                Firma ödemesi
              </Button>
            )}
          >
            “{mentionedFirma.name}” kayıtlı firma: ödemeyi “Firma ödemesi” ile girin, yoksa iki kez gider yazılır.
          </Callout>
        ) : (
          <p className="-mt-2 text-xs leading-5 text-slate-500">
            Tedarikçiden aldığınız malzeme mi?{" "}
            <Link href="/firma?yeni=1" className="font-semibold text-primary hover:underline">{"Satın alma'dan girin"}</Link>;
            ödemesini buradan{" "}
            <button type="button" className="font-semibold text-primary hover:underline" onClick={() => changeKind("firma")}>“Firma ödemesi”</button>{" "}
            ile yapın.
          </p>
        ))}

        {kind === "firma" && !fixedFirma && (
          <FormField
            label="Firma"
            required
            as="div"
            htmlFor={`${baseId}-firma`}
            error={errors.firma || firmasError || undefined}
            hint={firmasError ? undefined : firmas && firmas.length === 0 ? "Kayıtlı firma yok." : selectedFirma ? (firmaDebt && isPositiveMoney(firmaDebt) ? `Kalan borç ${formatMoney(firmaDebt)}` : "Bu firmaya açık borç görünmüyor.") : undefined}
          >
            <SearchSelect
              id={`${baseId}-firma`}
              aria-label="Firma"
              query={values.firmaText}
              onQueryChange={(value) => { setValues((current) => ({ ...current, firmaText: value, firmaId: "" })); setErrors((current) => ({ ...current, firma: undefined })); }}
              options={firmaOptions}
              onSelect={(option) => { setValues((current) => ({ ...current, firmaText: option.label, firmaId: option.id })); setErrors((current) => ({ ...current, firma: undefined, amount: undefined })); }}
              placeholder={firmas ? "Firma adı yazın" : "Firmalar yükleniyor…"}
              loading={!firmas}
              // Yükleme hatası açılır listede "Bu adla firma yok" yerine yazar (alan odaktayken alttaki hata metni listenin arkasında kalıyordu).
              error={firmasError || undefined}
              emptyText="Bu adla firma yok"
              className="ui-control"
            />
          </FormField>
        )}
        {kind === "firma" && !fixedFirma && firmasError && (
          <Button variant="secondary" size="sm" className="-mt-2" onClick={() => setFirmasAttempt((attempt) => attempt + 1)}>Yeniden dene</Button>
        )}
        {kind === "firma" && !fixedFirma && !firmasError && firmas && firmas.length === 0 && (
          <p className="-mt-2 text-xs text-slate-500">
            Firmayı <Link href="/firma" className="font-semibold text-primary hover:underline">Satın alma</Link> ekranından ekleyin.
          </p>
        )}

        {kind === "hakedis" && !isEdit && (
          <div className="grid gap-4">
            <FormField label="Doktor" required htmlFor={`${baseId}-doctor`} error={errors.doctor || doctorsError || undefined}>
              <DoctorSelect
                id={`${baseId}-doctor`}
                value={values.payoutDoctorId}
                doctors={doctors}
                disabled={!doctorsLoaded}
                onChange={(doctorId) => { setValues((current) => ({ ...current, payoutDoctorId: doctorId, period: "", amount: "" })); setErrors((current) => ({ ...current, doctor: undefined, period: undefined, amount: undefined })); }}
              />
            </FormField>
            <FormField
              label="Hakediş ayı"
              required
              htmlFor={`${baseId}-period`}
              error={errors.period}
              hint={values.payoutDoctorId && !periodsLoading && periods.length === 0
                ? periodsState?.failed ? "Hakediş ayları yüklenemedi." : "Bu doktora ödenecek hakediş yok (içinde bulunulan ay ödenemez)."
                : undefined}
            >
              <Select
                id={`${baseId}-period`}
                value={values.period}
                disabled={!values.payoutDoctorId || periodsLoading}
                onChange={(event) => {
                  const next = event.target.value;
                  const found = periods.find((item) => periodKey(item.year, item.month) === next);
                  setValues((current) => ({ ...current, period: next, amount: found ? toMoneyValue(found.kalan) ?? current.amount : current.amount }));
                  setErrors((current) => ({ ...current, period: undefined, amount: undefined }));
                }}
              >
                <option value="">{periodsLoading ? "Yükleniyor…" : values.payoutDoctorId ? "Ay seçin" : "Önce doktoru seçin"}</option>
                {periods.map((item) => (
                  <option key={periodKey(item.year, item.month)} value={periodKey(item.year, item.month)}>
                    {monthName(item.year, item.month)} · {formatMoney(item.kalan)} kalan
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        )}

        <div>
          <FormField
            label="Tutar"
            required
            htmlFor={`${baseId}-amount`}
            error={errors.amount}
            hint={kind === "firma" && invoiceContext && !errors.amount
              ? targetsInvoice ? "Ödeme önce bu alımın borcundan düşülür." : "Ödeme firmanın en eski açık borcundan başlayarak düşülür."
              : undefined}
          >
            <MoneyInput id={`${baseId}-amount`} value={values.amount} onChange={(value) => set("amount", value)} data-autofocus />
          </FormField>
          {/* Satın almadan açılınca hızlı doldurma o alımın kalanıdır; yoksa firmanın borcunun tamamı. */}
          {kind === "firma" && invoiceRemaining && compareMoney(values.amount, invoiceRemaining) !== 0 && (
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => set("amount", invoiceRemaining)}>
              Kalanın tamamı
            </Button>
          )}
          {kind === "firma" && !invoiceRemaining && firmaDebt && isPositiveMoney(firmaDebt) && compareMoney(values.amount, firmaDebt) !== 0 && (
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => set("amount", firmaDebt)}>
              Borcun tamamı
            </Button>
          )}
        </div>

        {kind === "gider" && !editPayout && (
          <div>
            <FormField label="Gider türü" required as="div" htmlFor={`${baseId}-category`} error={errors.category}>
              <SearchSelect
                id={`${baseId}-category`}
                aria-label="Gider türü"
                query={values.categoryText}
                onQueryChange={(value) => { setValues((current) => ({ ...current, categoryText: value, categoryId: "" })); setErrors((current) => ({ ...current, category: undefined })); }}
                options={categoryOptions}
                onSelect={(option) => { setValues((current) => ({ ...current, categoryText: option.label, categoryId: option.id })); setErrors((current) => ({ ...current, category: undefined })); }}
                placeholder="Örn. Kira, Elektrik, Sarf malzeme"
                emptyText={values.categoryText.trim()
                  ? isEdit ? "Listede yok — bu ad bu gidere yazılır" : `"${values.categoryText.trim()}" yeni gider türü olarak eklenecek`
                  : "Kayıtlı gider türü yok"}
                className="ui-control"
              />
            </FormField>
            <Button variant="ghost" size="sm" className="mt-1 -ml-2" onClick={() => setTypesOpen(true)}>Türleri düzenle</Button>
          </div>
        )}

        <PaymentMethodPicker
          idPrefix={baseId}
          value={values.method}
          methods={methods}
          onChange={(method) => { set("method", method); setMethodTouched(true); }}
        />

        <FormField label={kind === "hakedis" ? "Ödeme tarihi" : "Tarih"} required htmlFor={`${baseId}-date`} error={errors.date}>
          <Input id={`${baseId}-date`} type="date" max={today} value={values.date} onChange={(event) => set("date", event.target.value)} />
        </FormField>

        {/* Bölümde yalnız açıklama var; başlık zaten "Açıklama" olduğu için alan etiketi tekrar yazılmaz. */}
        <Disclosure title="Açıklama" summary={notePreview || undefined} open={moreOpen} onOpenChange={setMoreOpen}>
          <Input
            id={`${baseId}-note`}
            aria-label="Açıklama"
            value={values.note}
            maxLength={1000}
            placeholder={kind === "firma"
              ? (props.mode === "new" && props.reference) || "Örn. Eylül ödemesi"
              : kind === "hakedis" ? "Örn. Eylül hakedişi" : "Örn. Ekim ayı kirası"}
            onChange={(event) => set("note", event.target.value)}
          />
        </Disclosure>
      </FormModal>

      {kind === "gider" && (
        <ExpenseTypesModal open={typesOpen} onClose={() => setTypesOpen(false)} categories={categories} onChanged={() => loadCategories(true)} />
      )}
    </>
  );
}

