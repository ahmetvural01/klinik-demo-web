// Hastalar, Hasta Takip ve Görevler listelerinin ORTAK etiket ve tarih
// yardımcıları. Önceden her sayfa önceliği farklı yazıyordu (bir yerde
// "Öncelik 2", formda "Orta"), tarihleri saniyesiyle gösteriyordu
// ("04.08.2026 11:46:27") ve cinsiyeti ham kodla ("KADIN") basıyordu.
import { turkeyDateKey, turkeyTimeKey } from "@/lib/tz";

export type Priority = 1 | 2 | 3;

export const PRIORITY_LABELS: Record<Priority, string> = {
  1: "Düşük",
  2: "Orta",
  3: "Yüksek",
};

export const PRIORITY_CHOICES: Array<{ value: "1" | "2" | "3"; label: string }> = [
  { value: "1", label: "Düşük" },
  { value: "2", label: "Orta" },
  { value: "3", label: "Yüksek" },
];

export function toPriority(value: unknown): Priority {
  const n = Number(value);
  return n === 1 || n === 3 ? n : 2;
}

export function priorityLabel(value: unknown): string {
  return PRIORITY_LABELS[toPriority(value)];
}

const GENDER_LABELS: Record<string, string> = {
  ERKEK: "Erkek",
  KADIN: "Kadın",
  DIGER: "Diğer",
};

/** Ham cinsiyet kodunu ekranda okunacak sözcüğe çevirir; bilinmiyorsa boş döner. */
export function genderLabel(code?: string | null): string {
  if (!code) return "";
  return GENDER_LABELS[code.toLocaleUpperCase("tr-TR")] || "";
}

export function ageFromBirthDate(value?: string | null, now: Date = new Date()): number | null {
  if (!value) return null;
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function isValidDate(value?: string | Date | null): value is string | Date {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

/** "09.10.2026" — Türkiye saatine göre. */
export function formatDayTR(value?: string | Date | null): string {
  if (!isValidDate(value)) return "";
  const [y, m, d] = turkeyDateKey(new Date(value)).split("-");
  return `${d}.${m}.${y}`;
}

/** "09.10.2026 14:30" — saniye yok, Türkiye saatine göre. */
export function formatDateTimeTR(value?: string | Date | null): string {
  if (!isValidDate(value)) return "";
  const date = new Date(value);
  return `${formatDayTR(date)} ${turkeyTimeKey(date)}`;
}

function dayIndex(date: Date): number {
  const [y, m, d] = turkeyDateKey(date).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Bugünden kaç takvim günü önce/sonra (Türkiye saatine göre). Negatif = geçmiş. */
export function calendarDaysFromToday(value: string | Date, now: Date = new Date()): number {
  return dayIndex(new Date(value)) - dayIndex(now);
}

export type DueTone = "overdue" | "today" | "soon" | "later" | "none";

export type DueInfo = {
  tone: DueTone;
  /** Kısa, okunur metin: "3 gün gecikti", "Bugün 14:30", "Yarın 10:00", "12.10.2026". */
  label: string;
  /** Tam tarih-saat (title/ekran okuyucu için). */
  full: string;
  overdue: boolean;
};

/**
 * Son tarih / sonraki arama zamanını kişinin anlayacağı dile çevirir.
 * Geçmişte kalan an "gecikti" sayılır; aynı gün içindeki geçmiş saat de
 * gecikmedir ("Bugün 09:00 — gecikti" yerine "Gecikti · bugün 09:00").
 */
export function describeDue(value?: string | Date | null, now: Date = new Date()): DueInfo {
  if (!isValidDate(value)) return { tone: "none", label: "", full: "", overdue: false };
  const date = new Date(value);
  const full = formatDateTimeTR(date);
  const time = turkeyTimeKey(date);
  const days = calendarDaysFromToday(date, now);
  const overdue = date.getTime() < now.getTime();
  if (overdue) {
    if (days === 0) return { tone: "overdue", label: `Gecikti · bugün ${time}`, full, overdue };
    if (days === -1) return { tone: "overdue", label: "1 gün gecikti", full, overdue };
    return { tone: "overdue", label: `${Math.abs(days)} gün gecikti`, full, overdue };
  }
  if (days === 0) return { tone: "today", label: `Bugün ${time}`, full, overdue };
  if (days === 1) return { tone: "soon", label: `Yarın ${time}`, full, overdue };
  if (days < 7) return { tone: "later", label: `${days} gün sonra · ${formatDayTR(date)}`, full, overdue };
  return { tone: "later", label: full, full, overdue };
}

/** "3 gün önce", "bugün", "dün" — geçmiş bir anın göreli ifadesi. */
export function describeAgo(value?: string | Date | null, now: Date = new Date()): string {
  if (!isValidDate(value)) return "";
  const days = -calendarDaysFromToday(value, now);
  if (days <= 0) return "bugün";
  if (days === 1) return "dün";
  return `${days} gün önce`;
}

/**
 * Randevu ekranını bu hasta seçili olarak açan bağlantı. Tasarım sözleşmesi
 * §5 `?yeni=1&patientId=&patientName=` bekler; randevu ekranının bugün
 * okuduğu `newPatientId/newPatientName` de geriye uyum için eklenir.
 */
export function newAppointmentHref(patient: { id: string; fullName?: string | null }, extra?: Record<string, string>): string {
  const params = new URLSearchParams({
    yeni: "1",
    patientId: patient.id,
    newPatientId: patient.id,
  });
  if (patient.fullName) {
    params.set("patientName", patient.fullName);
    params.set("newPatientName", patient.fullName);
  }
  for (const [key, value] of Object.entries(extra || {})) params.set(key, value);
  return `/randevu?${params.toString()}`;
}

export function patientFileHref(patientId: string): string {
  return `/hasta-detay?id=${encodeURIComponent(patientId)}`;
}

