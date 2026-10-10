import { formatPhoneNumber } from "@/lib/format";
import { normalizeLocalPhone } from "@/lib/phone-number";
import { turkeyDateKey } from "@/lib/tz";

// Hasta bilgisinin ekranda TEK biçimde yazılması: liste, hasta seçici, hasta
// formu ve hasta dosyası aynı yardımcıları kullanır. Önceden cinsiyet etiketi
// ve yaş hesabı üç ayrı kopyadaydı (biri eski "E/K" kodlarını tanımıyordu),
// yabancı numaralar Türkiye numarası sanılıp "(0151) 234-5678" gibi yanlış
// yazılıyor ve tel: bağlantısı yanlış numarayı arıyordu.
//
// Dışa açık adlar kararlıdır; başka paketler bunları içe aktarabilir.

// ── Türkçe harf katlama ─────────────────────────────────────────────────────

/** Türkçe harflerin ASCII karşılıkları (sunucudaki SQL `translate` de bunları kullanır). */
export const TURKISH_FOLD_FROM = "ÇĞİIÖŞÜÂÎÛçğıöşüâîû";
export const TURKISH_FOLD_TO = "cgiiosuaiucgiosuaiu";
const FOLD_MAP = new Map(Array.from(TURKISH_FOLD_FROM).map((ch, index) => [ch, TURKISH_FOLD_TO[index]]));

/** "Ayşe YILMAZ" → "ayse yilmaz" (arama ve ad karşılaştırması için). */
export function foldTurkish(value: string): string {
  return Array.from(value, (ch) => FOLD_MAP.get(ch) ?? ch).join("").toLowerCase();
}

/** API'nin maskelediği değer ("***": telefon/TC görme yetkisi olmayan rol). */
export function isMaskedValue(value: string | null | undefined): boolean {
  return typeof value === "string" && /^\*+$/.test(value.trim());
}

// ── Cinsiyet ────────────────────────────────────────────────────────────────

/** Formdaki tek seçim ("Kadın / Erkek"); değerler veritabanındaki kodlar. */
export const GENDER_OPTIONS = [
  { value: "KADIN", label: "Kadın" },
  { value: "ERKEK", label: "Erkek" },
] as const;

/**
 * Veritabanında cinsiyet hem "ERKEK/KADIN" hem eski kayıtlarda (demo/içe
 * aktarma) "E/K" olarak duruyor; "DIGER" de olabilir. Formda doğru seçeneğin
 * işaretli görünmesi için eski kodlar yeni koda çevrilir; bilinmeyen kod
 * olduğu gibi döner (kaydederken sessizce değişmesin).
 */
export function normalizeGenderCode(code: string | null | undefined): string {
  // Kodlar ASCII ("KADIN"): Türkçe yerelde büyütme "kadin"i "KADİN" yapardı.
  const value = String(code || "").trim().toUpperCase();
  if (value === "E" || value === "ERKEK") return "ERKEK";
  if (value === "K" || value === "KADIN") return "KADIN";
  return value;
}

/** Ham cinsiyet kodunu ekranda okunacak sözcüğe çevirir; bilinmiyorsa "". */
export function genderLabel(code: string | null | undefined): string {
  const value = normalizeGenderCode(code);
  if (value === "ERKEK") return "Erkek";
  if (value === "KADIN") return "Kadın";
  if (value === "DIGER") return "Diğer";
  return "";
}

// ── Yaş ─────────────────────────────────────────────────────────────────────

function dateKeyParts(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

/**
 * Türkiye takvimine göre yaş. Doğum tarihi hem UTC gece yarısı
 * ("1985-03-14T00:00:00Z") hem Türkiye gece yarısı ("1985-03-13T21:00:00Z")
 * olarak saklanmış olabilir; ikisi de aynı güne düşer. Geçersiz/gelecek
 * tarihte ya da 130 yaş üstünde null. `now` render sırasında değil, veri
 * geldikten sonra çağrılmalı (sunucu/istemci farkı olmasın).
 */
export function patientAge(birthDate: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!birthDate) return null;
  const birth = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  if (Number.isNaN(birth.getTime())) return null;
  const b = dateKeyParts(turkeyDateKey(birth));
  const t = dateKeyParts(turkeyDateKey(now));
  let age = t.year - b.year;
  if (t.month < b.month || (t.month === b.month && t.day < b.day)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** Doğum tarihini `<input type="date">` değerine çevirir (Türkiye takvim günü). */
export function birthDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return turkeyDateKey(date);
}

// ── Telefon ─────────────────────────────────────────────────────────────────

function isTurkey(countryCode: string | null | undefined) {
  return !countryCode || countryCode === "+90";
}

/**
 * Ekranda telefon: Türkiye numarası sözleşmedeki `formatPhoneNumber` biçiminde
 * ("(0532) 123-4567"), yabancı numara ülke koduyla ("+49 15123456789").
 * Maskeli ya da boş değerde "".
 */
export function formatPatientPhone(phone: string | null | undefined, countryCode?: string | null): string {
  if (!phone || isMaskedValue(phone)) return "";
  if (isTurkey(countryCode)) return formatPhoneNumber(phone);
  const digits = phone.replace(/\D/g, "");
  return digits ? `${countryCode} ${digits}` : "";
}

/** Uluslararası biçimde tel: bağlantısı ("tel:+905321234567"); aranamıyorsa "". */
export function patientTelHref(phone: string | null | undefined, countryCode?: string | null): string {
  if (!phone || isMaskedValue(phone)) return "";
  const code = isTurkey(countryCode) ? "+90" : String(countryCode);
  const digits = isTurkey(countryCode) ? normalizeLocalPhone(phone, "+90") : phone.replace(/\D/g, "");
  if (!digits || !/^\+\d{1,4}$/.test(code)) return "";
  return `tel:${code}${digits}`;
}

// ── TC kimlik no ────────────────────────────────────────────────────────────

/**
 * Listede ve seçicide kimlik teyidi için son 4 hane yeter ("••••8950"); tam
 * numara hasta dosyasında. Maskeli ya da boş değerde "".
 */
export function maskTcNo(tcNo: string | null | undefined): string {
  const value = String(tcNo || "").trim();
  if (!value || isMaskedValue(value)) return "";
  // U+202F (dar, bölünmeyen boşluk): noktalar rakamlara yapışık görünmesin.
  return `•••• ${value.slice(-4)}`;
}

/** "TC ••••8950" ya da yabancı hastada "Pasaport ••••1234"; gösterilecek yoksa "". */
export function maskedIdentityLabel(patient: { tcNo?: string | null; isForeigner?: boolean | null }): string {
  const masked = maskTcNo(patient.tcNo);
  if (!masked) return "";
  return `${patient.isForeigner ? "Pasaport" : "TC"} ${masked}`;
}

// ── Sağlık uyarıları ────────────────────────────────────────────────────────

/** Hasta kaydındaki sağlık bayrakları — formdaki çipler ve listedeki uyarı aynı adları kullanır. */
export const HEALTH_FLAGS = [
  { key: "hasAllergy", label: "Alerji" },
  { key: "hasHeart", label: "Kalp hastalığı" },
  { key: "hasDiabetes", label: "Diyabet" },
  { key: "hasKidney", label: "Böbrek hastalığı" },
  { key: "hasHepatitis", label: "Hepatit" },
  { key: "hasBloodIssue", label: "Kanama / kan hastalığı" },
  { key: "hasContagiousDisease", label: "Bulaşıcı hastalık" },
] as const;

export type HealthFlagKey = (typeof HEALTH_FLAGS)[number]["key"];

/** İşaretli sağlık bayraklarının adları (formdaki sırayla). */
export function healthFlagLabels(patient: Partial<Record<HealthFlagKey, boolean | null | undefined>>): string[] {
  return HEALTH_FLAGS.filter((flag) => Boolean(patient[flag.key])).map((flag) => flag.label);
}

// ── Özet satırı ─────────────────────────────────────────────────────────────

/**
 * Ad altındaki kısa satır: "41 yaş · Kadın · SGK". Boş parçalar yazılmaz.
 * Yaş `now` ile hesaplanır (bkz. patientAge notu).
 */
export function patientFacts(
  patient: { birthDate?: string | Date | null; gender?: string | null; insurance?: string | null },
  options: { now?: Date; includeInsurance?: boolean } = {},
): string {
  const age = patientAge(patient.birthDate, options.now);
  return [
    age !== null ? `${age} yaş` : "",
    genderLabel(patient.gender),
    options.includeInsurance === false ? "" : (patient.insurance || "").trim(),
  ].filter(Boolean).join(" · ");
}
