"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { CalendarPlus, FolderOpen, RotateCcw } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Checkbox } from "@/components/ui/Checkbox";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Disclosure } from "@/components/ui/Disclosure";
import { FormField } from "@/components/ui/FormField";
import { FormModal, submitIntent } from "@/components/ui/FormModal";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { formatDateText } from "@/components/ui/Money";
import { FormSkeleton } from "@/components/ui/PageSkeleton";
import { PhoneCountrySelect } from "@/components/ui/PhoneCountrySelect";
import { Switch } from "@/components/ui/Switch";
import { ToggleChips } from "@/components/ui/ToggleChips";
import {
  GENDER_OPTIONS,
  HEALTH_FLAGS,
  birthDateInputValue,
  genderLabel,
  healthFlagLabels,
  isMaskedValue,
  normalizeGenderCode,
  patientAge,
  type HealthFlagKey,
} from "@/lib/patient-display";
import { getLocalPhoneDigitLimit, getLocalPhoneError, limitLocalPhoneInput, normalizeLocalPhone } from "@/lib/phone-number";
import { PROFESSIONS } from "@/lib/professions";
import { isValidTurkishIdentityNumber } from "@/lib/tc-kimlik";
import { showToastSafe } from "@/lib/toast-client";
import { turkeyDateKey } from "@/lib/tz";
import { canMessageOnWhatsapp } from "@/lib/whatsapp-consent";

type ContactChannel = "SMS" | "WHATSAPP" | "TELEFON" | "EPOSTA" | "ILETISIM_YOK";

type PatientFormState = {
  tcNo: string;
  isForeigner: boolean;
  phoneCountryCode: string;
  fullName: string;
  phone: string;
  preferredContactChannel: ContactChannel;
  whatsappConsent: boolean;
  communicationConsentSource: string;
  profession: string;
  gender: string;
  birthDate: string;
  insurance: string;
  referrer: string;
  /** Metin olarak tutulur: kutu boşaltılabilsin; kaydederken 0–100 tam sayı. */
  discountRate: string;
  address: string;
  notes: string;
  surgeries: string;
  medications: string;
  bloodType: string;
  otherDiseases: string;
  contagiousDiseaseNote: string;
} & Record<HealthFlagKey, boolean>;

/** Hasta dosyasının zaten okuduğu kayıt (düzenlemede yeniden istek atılmasın). */
export type PatientProfileData = {
  id?: string;
  tcNo?: string | null;
  isForeigner?: boolean | null;
  phoneCountryCode?: string | null;
  fullName?: string | null;
  phone?: string | null;
  preferredContactChannel?: string | null;
  whatsappOptOutAt?: string | Date | null;
  communicationConsentSource?: string | null;
  profession?: string | null;
  gender?: string | null;
  birthDate?: string | Date | null;
  insurance?: string | null;
  referrer?: string | null;
  discountRate?: number | null;
  address?: string | null;
  /** Not günlüğü: düzenlemede yalnız düzeltme/silme için gösterilir. */
  notes?: string | null;
  surgeries?: string | null;
  medications?: string | null;
  bloodType?: string | null;
  otherDiseases?: string | null;
  contagiousDiseaseNote?: string | null;
} & Partial<Record<HealthFlagKey, boolean | null>>;

/** Yeni kayıtta önceden doldurulacak alanlar (hasta seçicide yazılan ad, online talep…). */
export type PatientFormInitialValues = Partial<Pick<PatientFormState, "fullName" | "phone" | "phoneCountryCode" | "tcNo">>;

/** Düzenleme penceresi açılınca hazır açılacak bölüm ("Sağlık bilgileri > Düzenle"). */
export type PatientFormSection = "saglik" | "diger";

type SavedPatient = { id: string; fullName: string };

type DuplicateMatch = {
  id: string;
  fullName: string;
  birthDate?: string | null;
  gender?: string | null;
  archivedAt?: string | null;
  matchedBy: Array<"tc" | "phone" | "name">;
};

type Conflict = { id: string; fullName: string; archived: boolean; archivedAt?: string | null };

const INITIAL_FORM: PatientFormState = {
  tcNo: "", isForeigner: false, phoneCountryCode: "+90", fullName: "", phone: "",
  // WhatsApp izni sorulmadan "verildi" sayılmaz: kutu kapalı başlar, hasta isterse açılır.
  preferredContactChannel: "SMS", whatsappConsent: false, communicationConsentSource: "",
  profession: "", gender: "", birthDate: "", insurance: "", referrer: "", discountRate: "0",
  address: "", notes: "", surgeries: "", medications: "", bloodType: "", otherDiseases: "",
  hasAllergy: false, hasHepatitis: false, hasKidney: false, hasDiabetes: false,
  hasHeart: false, hasBloodIssue: false, hasContagiousDisease: false, contagiousDiseaseNote: "",
};

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "0+", "0-"];
const CONTACT_CHANNELS: ContactChannel[] = ["SMS", "WHATSAPP", "TELEFON", "EPOSTA", "ILETISIM_YOK"];
const HEALTH_SECTION_FIELDS = new Set(["contagiousDiseaseNote", "surgeries", "medications", "otherDiseases", "bloodType"]);
const OTHER_SECTION_FIELDS = new Set(["insurance", "discountRate", "referrer", "profession", "address", "notes"]);

/** Sunucunun İngilizce doğrulama iletisi yerine alanın Türkçe karşılığı. */
const FIELD_HINTS: Record<string, string> = {
  fullName: "Ad soyad en az 3 harf olmalı.",
  gender: "Cinsiyet seçin.",
  birthDate: "Geçerli bir doğum tarihi girin.",
  discountRate: "İndirim 0 ile 100 arasında olmalı.",
  contagiousDiseaseNote: "En fazla 200 karakter yazılabilir.",
  profession: "Meslek en fazla 120 karakter olabilir.",
};

// Kaydedilmemiş yeni hasta taslağı YALNIZ bellekte (aynı sekme) tutulur:
// pencere Esc/× ile yanlışlıkla kapanınca yazılanlar kaybolmasın. KVKK
// gereği tarayıcı depolamasına yazılmaz; sayfa yenilenince silinir.
let createDraft: { form: PatientFormState; at: number } | null = null;
const DRAFT_TTL_MS = 30 * 60 * 1000;

function fromProfile(body: PatientProfileData): PatientFormState {
  const countryCode = body.phoneCountryCode || "+90";
  const channel = CONTACT_CHANNELS.includes(body.preferredContactChannel as ContactChannel)
    ? body.preferredContactChannel as ContactChannel
    : "SMS";
  return {
    tcNo: body.tcNo || "",
    isForeigner: Boolean(body.isForeigner),
    phoneCountryCode: countryCode,
    fullName: body.fullName || "",
    phone: !body.phone || isMaskedValue(body.phone) ? "" : normalizeLocalPhone(body.phone, countryCode),
    preferredContactChannel: channel,
    whatsappConsent: canMessageOnWhatsapp(body),
    communicationConsentSource: body.communicationConsentSource || "",
    profession: body.profession || "",
    gender: normalizeGenderCode(body.gender),
    birthDate: birthDateInputValue(body.birthDate ?? null),
    insurance: body.insurance || "",
    referrer: body.referrer || "",
    discountRate: String(body.discountRate || 0),
    address: body.address || "",
    notes: body.notes || "",
    surgeries: body.surgeries || "",
    medications: body.medications || "",
    bloodType: body.bloodType || "",
    otherDiseases: body.otherDiseases || "",
    contagiousDiseaseNote: body.contagiousDiseaseNote || "",
    ...Object.fromEntries(HEALTH_FLAGS.map((flag) => [flag.key, Boolean(body[flag.key])])) as Record<HealthFlagKey, boolean>,
  };
}

function fromInitialValues(values: PatientFormInitialValues): PatientFormState {
  const countryCode = values.phoneCountryCode || "+90";
  return {
    ...INITIAL_FORM,
    fullName: (values.fullName || "").trim(),
    phoneCountryCode: countryCode,
    phone: values.phone ? cleanPhoneInput(values.phone, countryCode) : "",
    tcNo: (values.tcNo || "").replace(/\D/g, "").slice(0, 11),
  };
}

/** Sunucu hatasını alanlara dağıtır: `fieldErrors` nesnesi, "alan: ileti" dizisi ya da Zod nesneleri. */
function serverFieldErrors(result: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!result || typeof result !== "object") return errors;
  const record = result as { fieldErrors?: unknown; errors?: unknown };
  const add = (field: string, message: string) => {
    if (!field || errors[field]) return;
    const english = /[a-z]{3,}\(s\)|must|expected|invalid|required/i.test(message) && !/[çğışöü]/i.test(message);
    errors[field] = english ? FIELD_HINTS[field] || "Bu alanı kontrol edin." : message;
  };
  if (record.fieldErrors && typeof record.fieldErrors === "object") {
    for (const [field, message] of Object.entries(record.fieldErrors as Record<string, unknown>)) {
      if (typeof message === "string") add(field, message);
    }
  }
  if (Array.isArray(record.errors)) {
    for (const item of record.errors) {
      if (typeof item === "string") {
        const index = item.indexOf(":");
        if (index > 0) add(item.slice(0, index).split(".")[0].trim(), item.slice(index + 1).trim());
      } else if (item && typeof item === "object") {
        const issue = item as { path?: unknown; message?: unknown };
        const field = Array.isArray(issue.path) ? String(issue.path[0] ?? "") : "";
        if (field && typeof issue.message === "string") add(field, issue.message);
      }
    }
  }
  return errors;
}

/**
 * Telefon kutusuna yazılan/yapıştırılan değer: Türkiye'de baştaki 0 ve +90
 * hemen atılır, 10 haneyle sınırlanır. Önceden kutu 10 karakterle sınırlıydı
 * ve "0555 000 00 01" yazınca son hane hiç girilemiyordu (canlı test H9).
 */
function cleanPhoneInput(value: string, countryCode: string) {
  if (countryCode !== "+90") return limitLocalPhoneInput(value, countryCode);
  let digits = value.replace(/\D/g, "");
  // Türkiye cep numarası 5 ile başlar: baştaki "90" ülke kodu, "0" yerel önektir.
  if (digits.startsWith("90")) digits = digits.slice(2);
  return digits.replace(/^0+/, "").slice(0, 10);
}

function clampDiscount(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}

type PatientFormModalProps = {
  open: boolean;
  onClose: () => void;
  /** Verilirse düzenleme penceresi; verilmezse yeni hasta kaydı. */
  patientId?: string;
  /**
   * Telefonu/TC'yi göremeyen rol (patients:phone yok). Yalnız DÜZENLEMEDE
   * uygulanır: TC ve telefon gösterilmez, gönderilmez ve değişmez. Yeni
   * kayıtta telefon her zaman istenir (API zorunlu tutuyor; önceden randevu
   * formundan açılan yeni hasta penceresi telefonu gizlediği için ASISTAN
   * hiç hasta kaydedemiyordu).
   */
  hidePhoneField?: boolean;
  /** Kayıt (ya da arşivden geri alma) başarılı: yanıt gövdesiyle çağrılır. */
  onSaved?: (patient: SavedPatient) => void;
  /** Yeni kayıtta önceden doldurulacak alanlar. */
  initialValues?: PatientFormInitialValues;
  /** Düzenlemede açık gelecek katlanır bölüm. */
  initialSection?: PatientFormSection;
  /** Düzenlemede hastanın elde olan kaydı: verilirse ayrıca okunmaz. */
  initialData?: PatientProfileData | null;
  /**
   * Verilirse yeni kayıtta "Kaydet ve randevu ver" düğmesi çıkar; bu düğmeyle
   * kaydedilince onSaved YERİNE bu çağrılır (ör. randevu formuna geçiş).
   */
  onBookAppointment?: (patient: SavedPatient) => void;
  /**
   * Mükerrer kayıt uyarısında "Bu hastayı seç" (ör. randevu formu). Verilmezse
   * uyarıda "Hasta dosyasını aç" bağlantısı çıkar.
   */
  onPickExisting?: (patient: SavedPatient) => void;
};

/**
 * Yeni hasta ve hasta bilgilerini düzenleme — tek form. Önce gerçekten
 * gerekli alanlar (ad soyad, TC, telefon, cinsiyet; doğum tarihi isteğe
 * bağlı); sağlık bilgileri ve diğer bilgiler katlanır bölümlerde. Önceden 25
 * kontrol dört kart halinde aynı anda açıktı (1366×768 ekranda ~3 ekran boyu).
 *
 * Hasta notu, hasta dosyasında "[tarih saat - kişi] metin" satırlarından
 * oluşan bir günlüktür; not EKLEME hasta dosyasındaki Notlar bölümündedir,
 * yeni kayıtta yazılan ilk not sunucuda damgalanır. Düzenlemede notlar
 * yalnız yanlış notu düzeltmek/silmek için ("Diğer bilgiler" altında) durur
 * ve yalnız değiştirilirse, açılıştaki metinle (`notesBase`) birlikte
 * gönderilir: önceden form her kayıtta bütün metni geri yazıyor, form
 * açıkken başkasının eklediği not siliniyordu; şimdi sunucu bu durumda
 * kaydı reddeder.
 */
export function PatientFormModal({
  open,
  onClose,
  patientId,
  hidePhoneField = false,
  onSaved,
  initialValues,
  initialSection,
  initialData,
  onBookAppointment,
  onPickExisting,
}: PatientFormModalProps) {
  const isEdit = Boolean(patientId);
  const { can, hasFeature } = usePermissions();
  const canRestore = can("patients:delete");
  const showWhatsapp = hasFeature("whatsapp");
  // İndirim oranı finans kararıdır (sunucu finance:write ister); yetkisiz kişide
  // alan salt okunur görünür ve gönderilmez (kayıttaki oran korunur).
  const canEditDiscount = can("finance:write");

  const uid = useId().replace(/:/g, "");
  const ids = {
    form: `hasta-form-${uid}`,
    name: `hasta-ad-${uid}`,
    tc: `hasta-tc-${uid}`,
    phone: `hasta-tel-${uid}`,
    birth: `hasta-dogum-${uid}`,
    note: `hasta-bulasici-${uid}`,
    discount: `hasta-indirim-${uid}`,
  };

  const [form, setForm] = useState<PatientFormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [nameForCheck, setNameForCheck] = useState("");
  const [contactMasked, setContactMasked] = useState(false);
  /** Düzenlemede açılıştaki not metni (değişmediyse notlar hiç gönderilmez). */
  const [notesBase, setNotesBase] = useState("");
  const [todayKey, setTodayKey] = useState("");
  const initialTcNoRef = useRef("");
  const savedRef = useRef(false);

  // Açılışta okunacak dış değerler ref'te: çağıranın her çiziminde yeni nesne
  // gelse (ör. hasta dosyası arka planda yenilenince) form sıfırlanmasın.
  const openArgsRef = useRef({ initialValues, initialSection, initialData });
  openArgsRef.current = { initialValues, initialSection, initialData };

  // TC/telefon bu rolde gizli: düzenlemede alanlar gösterilmez ve gönderilmez
  // (API maskeli "***" döndürüyor; önceden form bunu TC alanına yazıp
  // doğrulamada reddediyordu — ASISTAN hiç kaydedemiyordu, denetim D1).
  const contactHidden = isEdit && (hidePhoneField || contactMasked);

  useEffect(() => {
    if (!open) return;
    const { initialValues: values, initialSection: section, initialData: data } = openArgsRef.current;
    setError(null);
    setFieldErrors({});
    setDuplicates([]);
    setConflict(null);
    setNameForCheck("");
    setDirty(false);
    setDraftRestored(false);
    setLoadError(null);
    setHealthOpen(section === "saglik");
    setOtherOpen(section === "diger");
    setTodayKey(turkeyDateKey());
    savedRef.current = false;

    if (!patientId) {
      initialTcNoRef.current = "";
      setContactMasked(false);
      setNotesBase("");
      setLoading(false);
      if (values && Object.values(values).some(Boolean)) {
        setForm(fromInitialValues(values));
      } else if (createDraft && Date.now() - createDraft.at < DRAFT_TTL_MS) {
        setForm(createDraft.form);
        setDraftRestored(true);
        setDirty(true);
      } else {
        createDraft = null;
        setForm(INITIAL_FORM);
      }
      return;
    }

    const apply = (body: PatientProfileData) => {
      initialTcNoRef.current = isMaskedValue(body.tcNo) ? "" : body.tcNo || "";
      setContactMasked(isMaskedValue(body.phone) || isMaskedValue(body.tcNo));
      setNotesBase(body.notes || "");
      setForm(fromProfile(body));
    };
    if (data && data.id === patientId) {
      apply(data);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    // Form yalnız kişisel ve sağlık alanlarını kullanır: hastanın tüm geçmişi
    // değil, hafif "profil" okuması (erişim kaydı amacıyla birlikte).
    fetch(`/api/patients/${encodeURIComponent(patientId)}?fields=profile`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "x-access-purpose": "Hasta bilgisi düzenleme" },
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message || "Hasta bilgileri alınamadı.");
        if (!controller.signal.aborted) apply(body as PatientProfileData);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(err instanceof Error ? err.message : "Hasta bilgileri alınamadı.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, patientId, loadKey]);

  // Mükerrer kayıt uyarısı (yalnız yeni kayıtta): TC 11 hane, telefon tam ya da
  // ad soyad yazılıp alandan çıkılınca KESİN eşleşme sorulur — her tuşta değil.
  const tcForCheck = !isEdit && !form.isForeigner && /^\d{11}$/.test(form.tcNo) ? form.tcNo : "";
  const phoneForCheck = !isEdit && form.phone && !getLocalPhoneError(form.phone, form.phoneCountryCode)
    ? `${form.phoneCountryCode}|${form.phone}`
    : "";
  useEffect(() => {
    if (!open || isEdit) return;
    if (!tcForCheck && !phoneForCheck && !nameForCheck) {
      setDuplicates([]);
      return;
    }
    const params = new URLSearchParams({ duplicate: "1" });
    if (tcForCheck) params.set("tcNo", tcForCheck);
    if (phoneForCheck) {
      const [code, phone] = phoneForCheck.split("|");
      params.set("phoneCountryCode", code);
      params.set("phone", phone);
    }
    if (nameForCheck) params.set("fullName", nameForCheck);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/patients?${params.toString()}`, { cache: "no-store", signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
          if (!controller.signal.aborted) setDuplicates(Array.isArray(body?.matches) ? body.matches : []);
        })
        .catch(() => {
          if (!controller.signal.aborted) setDuplicates([]);
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, isEdit, tcForCheck, phoneForCheck, nameForCheck]);

  const tcNoStructureValid = !form.isForeigner && isValidTurkishIdentityNumber(form.tcNo);
  const tcNoChanged = !isEdit || form.tcNo !== initialTcNoRef.current;
  const tcHint = !form.isForeigner && form.tcNo.length === 11 && !tcNoStructureValid
    ? (tcNoChanged
      ? "Bu TC geçersiz görünüyor; hastadan teyit edin. Kayıt yapılabilir."
      : "Eski kayıttaki TC biçimi geçersiz; değiştirmeden kaydedebilirsiniz.")
    : undefined;

  const age = form.birthDate && todayKey ? patientAge(`${form.birthDate}T00:00:00.000Z`) : null;
  const flagValues = HEALTH_FLAGS.filter((flag) => form[flag.key]).map((flag) => flag.key);
  const healthSummary = useMemo(() => {
    const labels = healthFlagLabels(form);
    const texts = [form.medications, form.surgeries, form.otherDiseases].filter((value) => value.trim()).length;
    const parts = [
      labels.length > 3 ? `${labels.slice(0, 3).join(", ")} +${labels.length - 3}` : labels.join(", "),
      texts ? "not var" : "",
      form.bloodType ? `Kan grubu ${form.bloodType}` : "",
    ].filter(Boolean);
    return parts.join(" · ");
  }, [form]);
  const otherSummary = [
    form.insurance.trim(),
    clampDiscount(form.discountRate) > 0 ? `%${clampDiscount(form.discountRate)} indirim` : "",
    form.profession,
    !isEdit && form.notes.trim() ? "not yazıldı" : "",
    isEdit && form.notes !== notesBase ? "notlar düzeltildi" : "",
  ].filter(Boolean).join(" · ");

  function update(patch: Partial<PatientFormState>) {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
    const keys = Object.keys(patch);
    setFieldErrors((current) => {
      if (!keys.some((key) => current[key])) return current;
      const next = { ...current };
      for (const key of keys) delete next[key];
      return next;
    });
    if (keys.includes("tcNo")) setConflict(null);
    // Ad değişince eski ad eşleşmesi uyarısı kalmasın; alandan çıkınca yeniden sorulur.
    if (keys.includes("fullName")) setNameForCheck("");
  }

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    const name = form.fullName.trim();
    if (!name) errors.fullName = "Ad soyad yazın.";
    else if (name.length < 3) errors.fullName = "Ad soyad en az 3 harf olmalı.";
    if (!contactHidden) {
      if (!form.isForeigner && !/^\d{11}$/.test(form.tcNo)) {
        errors.tcNo = form.tcNo ? "TC kimlik no 11 haneli olmalı." : "TC kimlik no yazın.";
      }
      const phoneError = getLocalPhoneError(form.phone, form.phoneCountryCode);
      if (phoneError) errors.phone = form.phone ? phoneError : "Telefon yazın.";
    }
    if (!form.gender) errors.gender = "Cinsiyet seçin.";
    if (form.birthDate) {
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(form.birthDate) && !Number.isNaN(new Date(form.birthDate).getTime());
      if (!valid || (todayKey && form.birthDate > todayKey)) errors.birthDate = "Geçerli bir doğum tarihi girin.";
    }
    if (form.discountRate.trim() && !/^\d{1,3}$/.test(form.discountRate.trim())) errors.discountRate = FIELD_HINTS.discountRate;
    else if (clampDiscount(form.discountRate) !== Number.parseInt(form.discountRate || "0", 10)) errors.discountRate = FIELD_HINTS.discountRate;
    if (form.hasContagiousDisease && form.contagiousDiseaseNote.trim().length > 200) errors.contagiousDiseaseNote = FIELD_HINTS.contagiousDiseaseNote;
    return errors;
  }

  /** Hatalı alan katlanmış bölümdeyse bölüm açılır ve ilk hatalı alana odaklanılır. */
  function revealErrors(errors: Record<string, string>) {
    const fields = Object.keys(errors);
    if (fields.some((field) => HEALTH_SECTION_FIELDS.has(field))) setHealthOpen(true);
    if (fields.some((field) => OTHER_SECTION_FIELDS.has(field))) setOtherOpen(true);
    window.requestAnimationFrame(() => {
      const root = document.getElementById(ids.form);
      const invalid = root?.querySelector<HTMLElement>("[aria-invalid='true']");
      const target = invalid?.getAttribute("role") === "radiogroup"
        ? invalid.querySelector<HTMLElement>("[role='radio']")
        : invalid;
      target?.focus();
    });
  }

  function buildBody() {
    // Düzenlemede boşaltılan alan "" gider (sunucu temizler); önceden
    // `undefined` gidiyordu ve "kaydedildi" denmesine rağmen ilaç, ameliyat,
    // kurum, adres, doğum tarihi silinemiyordu (denetim D2).
    const text = (value: string) => (isEdit ? value.trim() : value.trim() || undefined);
    const body: Record<string, unknown> = {
      fullName: form.fullName.trim(),
      gender: form.gender,
      birthDate: form.birthDate ? new Date(`${form.birthDate}T00:00:00.000Z`).toISOString() : (isEdit ? null : undefined),
      insurance: text(form.insurance),
      referrer: text(form.referrer),
      profession: text(form.profession),
      address: text(form.address),
      ...(canEditDiscount ? { discountRate: clampDiscount(form.discountRate) } : {}),
      surgeries: text(form.surgeries),
      medications: text(form.medications),
      otherDiseases: text(form.otherDiseases),
      contagiousDiseaseNote: form.hasContagiousDisease ? text(form.contagiousDiseaseNote) : text(""),
      bloodType: text(form.bloodType),
      preferredContactChannel: form.preferredContactChannel,
      // Kutu görünmüyorsa (klinikte WhatsApp kapalı) hastaya sorulmadı: izin
      // gönderilmez; sunucu kayıtta "verildi" yazmaz, düzenlemede eski değer kalır.
      ...(showWhatsapp ? { whatsappConsent: form.whatsappConsent } : {}),
      ...Object.fromEntries(HEALTH_FLAGS.map((flag) => [flag.key, form[flag.key]])),
    };
    if (!isEdit) {
      body.notes = text(form.notes);
      body.communicationConsentSource = form.communicationConsentSource.trim() || undefined;
    } else if (form.notes !== notesBase) {
      // Yalnız değiştirilen notlar gider; sunucu açılıştaki metinle karşılaştırır.
      body.notes = form.notes.trim();
      body.notesBase = notesBase;
    }
    if (!contactHidden) {
      body.tcNo = form.tcNo.trim() || (isEdit ? "" : undefined);
      body.isForeigner = form.isForeigner;
      body.phone = form.phone;
      body.phoneCountryCode = form.phoneCountryCode;
    }
    return body;
  }

  const handleClose = () => {
    if (saving || restoring) return;
    // Yeni kayıt yarım bırakıldıysa taslak bellekte kalır (bkz. createDraft).
    if (!isEdit && dirty && !savedRef.current) createDraft = { form, at: Date.now() };
    onClose();
  };

  const finish = (patient: SavedPatient, intent: "save" | "book" | "existing") => {
    savedRef.current = true;
    if (!isEdit) createDraft = null;
    if (intent === "book" && onBookAppointment) onBookAppointment(patient);
    else if (intent === "existing" && onPickExisting) onPickExisting(patient);
    else onSaved?.(patient);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    const intent = !isEdit && onBookAppointment && submitIntent(event) === "book" ? "book" : "save";
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError("Eksik ya da hatalı alanları düzeltin.");
      revealErrors(errors);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(isEdit ? `/api/patients/${patientId}` : "/api/patients", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && result?.conflict?.id) {
          setConflict(result.conflict as Conflict);
          setFieldErrors((current) => ({ ...current, tcNo: "Bu TC ile kayıtlı başka bir hasta var." }));
          setError(null);
          return;
        }
        const mapped = serverFieldErrors(result);
        if (contactHidden && (mapped.phone || mapped.tcNo)) {
          // Bu rol telefonu/TC'yi göremez ve değiştiremez; kayıttaki eski değer geçersiz.
          setError("Kayıtlı TC ya da telefon geçersiz; düzeltmesi için yetkili personele başvurun.");
        } else if (res.status === 409 && typeof result?.message === "string" && result.message) {
          // Çakışma (aynı TC ya da notların bu arada değişmesi): sunucunun açıklaması gösterilir.
          setError(result.message);
        } else {
          setError(typeof result?.message === "string" && Object.keys(mapped).length === 0 ? result.message : "Eksik ya da hatalı alanları düzeltin.");
        }
        setFieldErrors(mapped);
        revealErrors(mapped);
        return;
      }
      if (!isEdit) {
        const sms = result?.smsConsent as { sent?: boolean; error?: string } | null | undefined;
        showToastSafe({
          type: "success",
          title: `${result?.fullName || "Hasta"} kaydedildi`,
          message: !sms
            ? "Hasta kaydı açıldı."
            : sms.sent
              ? "İzin SMS'i hastaya gönderildi."
              : `İzin SMS'i gönderilemedi${sms.error ? `: ${sms.error}` : "."} Hasta dosyasından yeniden gönderebilirsiniz.`,
          duration: sms && !sms.sent ? 6500 : 3500,
        });
      }
      finish(result as SavedPatient, intent);
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Bağlantı kurulamadı. Yazdıklarınız korundu; tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  const restoreArchived = async (target: { id: string; fullName: string }) => {
    if (restoring) return;
    setRestoring(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${encodeURIComponent(target.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result?.message || "Hasta arşivden geri alınamadı.");
      showToastSafe({ type: "success", title: "Arşivden geri alındı", message: `${result?.fullName || target.fullName} yeniden aktif listede.` });
      finish({ ...(result as SavedPatient), fullName: result?.fullName || target.fullName }, "save");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hasta arşivden geri alınamadı.");
    } finally {
      setRestoring(false);
    }
  };

  // ── Mükerrer/çakışma uyarısı ──────────────────────────────────────────────
  const primaryMatch = conflict
    ? { id: conflict.id, fullName: conflict.fullName, archivedAt: conflict.archived ? conflict.archivedAt || "arşiv" : null, matchedBy: ["tc" as const] }
    : duplicates.find((match) => match.matchedBy.includes("tc"))
      || duplicates.find((match) => match.matchedBy.includes("phone"))
      || duplicates[0];
  const otherMatchCount = conflict ? 0 : Math.max(0, duplicates.length - 1);

  const matchNotice = primaryMatch && !isEdit ? (() => {
    const archived = Boolean(primaryMatch.archivedAt);
    const byTc = primaryMatch.matchedBy.includes("tc");
    const byPhone = !byTc && primaryMatch.matchedBy.includes("phone");
    const facts = "birthDate" in primaryMatch
      ? [
          patientAge((primaryMatch as DuplicateMatch).birthDate) !== null ? `${patientAge((primaryMatch as DuplicateMatch).birthDate)} yaş` : "",
          genderLabel((primaryMatch as DuplicateMatch).gender),
        ].filter(Boolean).join(" · ")
      : "";
    const archivedText = archived && primaryMatch.archivedAt && primaryMatch.archivedAt !== "arşiv"
      ? `arşiv: ${formatDateText(primaryMatch.archivedAt)}`
      : archived ? "arşivde" : "";
    const title = archived
      ? "Bu TC arşivdeki bir hastaya ait"
      : byTc ? "Bu TC ile kayıtlı hasta var"
        : byPhone ? "Bu telefonla kayıtlı hasta var"
          : "Aynı adla kayıtlı hasta var";
    const action = archived
      ? (canRestore
        ? <Button size="sm" variant="secondary" icon={RotateCcw} loading={restoring} onClick={() => void restoreArchived(primaryMatch)}>Arşivden geri al</Button>
        : null)
      : onPickExisting
        ? <Button size="sm" variant="secondary" onClick={() => finish({ id: primaryMatch.id, fullName: primaryMatch.fullName }, "existing")}>Bu hastayı seç</Button>
        : <Button size="sm" variant="secondary" icon={FolderOpen} href={`/hasta-detay?id=${encodeURIComponent(primaryMatch.id)}`} onClick={() => { savedRef.current = true; createDraft = null; onClose(); }}>Hasta dosyasını aç</Button>;
    return (
      <Callout tone={byTc || archived ? "warning" : "info"} title={title} action={action}>
        {[primaryMatch.fullName, facts, archivedText].filter(Boolean).join(" · ")}
        {otherMatchCount > 0 ? ` (+${otherMatchCount} benzer kayıt)` : ""}
        {archived && !canRestore ? " Geri almak için yöneticinize başvurun." : ""}
        {!archived && !byTc ? " Aynı kişi değilse kayda devam edin." : ""}
      </Callout>
    );
  })() : null;

  const genderOptions = form.gender && !GENDER_OPTIONS.some((option) => option.value === form.gender)
    ? [...GENDER_OPTIONS, { value: form.gender, label: genderLabel(form.gender) || form.gender }]
    : [...GENDER_OPTIONS];
  const phoneDescribedBy = fieldErrors.phone ? `${ids.phone}-error` : !isEdit ? `${ids.phone}-hint` : undefined;

  return (
    <FormModal
      open={open}
      onClose={handleClose}
      isDirty={dirty}
      title={isEdit ? "Hasta bilgilerini düzenle" : "Yeni hasta"}
      module="users"
      size="lg"
      formId={ids.form}
      onSubmit={submit}
      submitting={saving}
      submitDisabled={loading || Boolean(loadError) || restoring}
      error={error}
      // Kayıt sürerken yalnız basılan düğme "yükleniyor" görünür (ortak FormModal).
      secondarySubmit={!isEdit && onBookAppointment
        ? { label: "Kaydet ve randevu ver", intent: "book", icon: CalendarPlus, disabled: restoring }
        : undefined}
    >
      {loading ? (
        <FormSkeleton framed={false} fields={4} footer={false} />
      ) : loadError ? (
        <LoadErrorState message={loadError} onRetry={() => setLoadKey((key) => key + 1)} />
      ) : (
        <>
          {draftRestored && (
            <Callout
              tone="neutral"
              compact
              action={(
                <Button size="sm" variant="ghost" onClick={() => { createDraft = null; setForm(INITIAL_FORM); setDraftRestored(false); setDirty(false); setFieldErrors({}); }}>
                  Temizle
                </Button>
              )}
            >
              Kaydedilmemiş bilgiler geri getirildi.
            </Callout>
          )}
          {matchNotice}

          <FormField label="Ad soyad" required htmlFor={ids.name} error={fieldErrors.fullName}>
            <Input
              id={ids.name}
              data-autofocus
              autoComplete="off"
              maxLength={120}
              value={form.fullName}
              onChange={(event) => update({ fullName: event.target.value })}
              onBlur={() => {
                const name = form.fullName.trim().replace(/\s+/g, " ");
                setNameForCheck(!isEdit && name.length >= 5 && name.includes(" ") ? name : "");
              }}
            />
          </FormField>

          {contactHidden ? (
            <Callout tone="neutral" compact>TC kimlik no ve telefon bu rolde gizli; bu formdan değişmez.</Callout>
          ) : (
            <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
              <div className="space-y-2">
                <FormField
                  label={form.isForeigner ? "Pasaport / kimlik no" : "TC kimlik no"}
                  required={!form.isForeigner}
                  htmlFor={ids.tc}
                  error={fieldErrors.tcNo}
                  hint={tcHint}
                  hintTone="warning"
                  success={tcNoStructureValid && !fieldErrors.tcNo}
                >
                  <Input
                    id={ids.tc}
                    autoComplete="off"
                    className="font-mono tabular-nums"
                    inputMode={form.isForeigner ? "text" : "numeric"}
                    maxLength={form.isForeigner ? 30 : 11}
                    placeholder={form.isForeigner ? "İsteğe bağlı" : "11 haneli"}
                    value={form.tcNo}
                    onChange={(event) => update({ tcNo: form.isForeigner ? event.target.value.trim() : event.target.value.replace(/\D/g, "").slice(0, 11) })}
                  />
                </FormField>
                <Checkbox
                  label="TC'si yok (yabancı uyruklu)"
                  checked={form.isForeigner}
                  onChange={(checked) => update({ isForeigner: checked, tcNo: checked ? form.tcNo : form.tcNo.replace(/\D/g, "").slice(0, 11) })}
                />
              </div>
              <FormField
                as="div"
                label="Telefon"
                required
                htmlFor={ids.phone}
                error={fieldErrors.phone}
                hint={!isEdit ? "Kaydedince hastaya SMS izin bağlantısı gider." : undefined}
              >
                <div className="flex gap-2">
                  <PhoneCountrySelect
                    value={form.phoneCountryCode}
                    onChange={(code) => update({ phoneCountryCode: code, phone: limitLocalPhoneInput(form.phone, code) })}
                    className="w-[104px] shrink-0"
                  />
                  <Input
                    id={ids.phone}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="off"
                    className="min-w-0 flex-1 font-mono tabular-nums"
                    placeholder={form.phoneCountryCode === "+90" ? "5XX XXX XX XX" : "Telefon numarası"}
                    // Boşluklu/+90'lı yazım ve yapıştırma sığsın; hane sınırı cleanPhoneInput'ta.
                    maxLength={getLocalPhoneDigitLimit(form.phoneCountryCode) + 8}
                    value={form.phone}
                    // Alan bir <div> içinde (ülke kodu ile yan yana): zorunluluk ekran okuyucuya ayrıca söylenir.
                    aria-required
                    aria-invalid={fieldErrors.phone ? true : undefined}
                    aria-describedby={phoneDescribedBy}
                    onChange={(event) => update({ phone: cleanPhoneInput(event.target.value, form.phoneCountryCode) })}
                  />
                </div>
              </FormField>
            </div>
          )}

          <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
            <ChoiceCards
              label="Cinsiyet"
              required
              variant="pills"
              value={form.gender}
              onChange={(gender) => update({ gender })}
              options={genderOptions}
              error={fieldErrors.gender}
            />
            <FormField label="Doğum tarihi" htmlFor={ids.birth} error={fieldErrors.birthDate} hint={age !== null ? `${age} yaş` : undefined}>
              <Input
                id={ids.birth}
                type="date"
                max={todayKey || undefined}
                value={form.birthDate}
                onChange={(event) => update({ birthDate: event.target.value })}
              />
            </FormField>
          </div>

          <Disclosure title="Sağlık bilgileri" summary={healthSummary || undefined} open={healthOpen} onOpenChange={setHealthOpen}>
            <div className="space-y-4">
              <ToggleChips
                label="Sağlık durumu"
                size="sm"
                options={HEALTH_FLAGS.map((flag) => ({ value: flag.key, label: flag.label }))}
                value={flagValues}
                onChange={(keys) => {
                  const selected = new Set(keys);
                  update(Object.fromEntries(HEALTH_FLAGS.map((flag) => [flag.key, selected.has(flag.key)])) as Partial<PatientFormState>);
                }}
              />
              {form.hasContagiousDisease && (
                <FormField label="Hangi bulaşıcı hastalık?" htmlFor={ids.note} error={fieldErrors.contagiousDiseaseNote}>
                  <Input
                    id={ids.note}
                    maxLength={200}
                    placeholder="Ör. Hepatit B, tüberküloz"
                    value={form.contagiousDiseaseNote}
                    onChange={(event) => update({ contagiousDiseaseNote: event.target.value })}
                  />
                </FormField>
              )}
              <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
                <FormField label="Kullandığı ilaçlar">
                  <Textarea rows={2} placeholder="Yoksa boş bırakın" value={form.medications} onChange={(event) => update({ medications: event.target.value })} />
                </FormField>
                <FormField label="Geçirdiği ameliyatlar">
                  <Textarea rows={2} placeholder="Yoksa boş bırakın" value={form.surgeries} onChange={(event) => update({ surgeries: event.target.value })} />
                </FormField>
                <FormField label="Diğer hastalıklar / klinik not">
                  <Textarea rows={2} placeholder="Yoksa boş bırakın" value={form.otherDiseases} onChange={(event) => update({ otherDiseases: event.target.value })} />
                </FormField>
                <FormField label="Kan grubu">
                  <Select value={form.bloodType} onChange={(event) => update({ bloodType: event.target.value })}>
                    <option value="">Bilinmiyor</option>
                    {form.bloodType && !BLOOD_TYPES.includes(form.bloodType) && <option value={form.bloodType}>{form.bloodType}</option>}
                    {BLOOD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </Select>
                </FormField>
              </div>
            </div>
          </Disclosure>

          <Disclosure title="Diğer bilgiler" summary={otherSummary || undefined} open={otherOpen} onOpenChange={setOtherOpen}>
            <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
              <FormField label="Anlaşmalı kurum">
                <Input maxLength={120} placeholder="Ör. SGK, Allianz Sigorta" value={form.insurance} onChange={(event) => update({ insurance: event.target.value })} />
              </FormField>
              {canEditDiscount ? (
                <FormField label="İndirim (%)" htmlFor={ids.discount} hint="Geçmiş tedaviler dahil hastanın tüm tedavi toplamına uygulanır." error={fieldErrors.discountRate}>
                  <Input
                    id={ids.discount}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={1}
                    value={form.discountRate}
                    onChange={(event) => update({ discountRate: event.target.value })}
                  />
                </FormField>
              ) : (
                <FormField label="İndirim (%)" htmlFor={ids.discount} hint="Finans ya da yönetici değiştirir." error={fieldErrors.discountRate}>
                  <Input id={ids.discount} readOnly value={`%${clampDiscount(form.discountRate)}`} />
                </FormField>
              )}
              <FormField label="Referans / yönlendiren">
                <Input maxLength={120} placeholder="Ör. Mehmet Yılmaz, Instagram" value={form.referrer} onChange={(event) => update({ referrer: event.target.value })} />
              </FormField>
              <FormField label="Meslek" hint="Meslek günü mesajları için." error={fieldErrors.profession}>
                <Select value={form.profession} onChange={(event) => update({ profession: event.target.value })}>
                  <option value="">Seçilmedi</option>
                  {form.profession && !(PROFESSIONS as readonly string[]).includes(form.profession) && (
                    <option value={form.profession}>{form.profession} (eski kayıt)</option>
                  )}
                  {PROFESSIONS.map((profession) => <option key={profession} value={profession}>{profession}</option>)}
                </Select>
              </FormField>
              <FormField label="Adres" className="sm:col-span-2">
                <Textarea rows={2} value={form.address} onChange={(event) => update({ address: event.target.value })} />
              </FormField>
              {showWhatsapp && (
                <Switch
                  className="sm:col-span-2"
                  checked={form.whatsappConsent}
                  onChange={(value) => update({ whatsappConsent: value })}
                  label="WhatsApp'tan mesaj gönderilsin"
                  description={isEdit ? "Hasta istemezse kapatın." : "Hastaya sorun; isterse açın."}
                />
              )}
              {!isEdit ? (
                <FormField label="Not" className="sm:col-span-2" hint="Hasta dosyasında tarih ve adınızla görünür.">
                  <Textarea rows={2} value={form.notes} onChange={(event) => update({ notes: event.target.value })} />
                </FormField>
              ) : notesBase.trim() ? (
                // Yanlış yazılan/yanlış hastaya girilen notu düzeltmenin tek yolu;
                // yeni not hasta dosyasındaki Notlar bölümünden eklenir.
                <FormField label="Notlar" className="sm:col-span-2" hint="Yalnız düzeltmek ya da silmek için; yeni not hasta dosyasından eklenir." error={fieldErrors.notes}>
                  <Textarea rows={4} value={form.notes} onChange={(event) => update({ notes: event.target.value })} />
                </FormField>
              ) : null}
            </div>
          </Disclosure>
        </>
      )}
    </FormModal>
  );
}
