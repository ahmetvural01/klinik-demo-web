import { Ban, CalendarClock, CheckCircle2, Clock, XCircle } from "lucide-react";
import type { ComponentType } from "react";
import {
  APPOINTMENT_DISPLAY_STATUS_LABELS,
  APPOINTMENT_DISPLAY_STATUS_TONE,
  getDisplayAppointmentStatus,
  isAppointmentPastDay,
  type DisplayAppointmentStatus,
} from "@/lib/appointment-status";
import { buildScheduleByJsDay, type DaySchedule } from "@/lib/working-hours-core";
import {
  APPOINTMENT_TREATMENT_OPTIONS,
  FOLLOW_UP_OPTIONS,
  buildAppointmentNote,
  type FollowUpKey,
  type TreatmentOption,
} from "@/lib/appointment-follow-up";

// ── Ortak tipler ──────────────────────────────────────────────────────────

export type AppointmentPatient = {
  id: string;
  fullName: string;
  phone?: string | null;
  tcNo?: string | null;
  hasContagiousDisease?: boolean;
  contagiousDiseaseNote?: string | null;
};

export type Appointment = {
  id: string;
  startAt: string;
  endAt: string;
  type?: "STANDART" | "KONTROL" | "ACIL" | string;
  status: string;
  note?: string | null;
  colorCode?: string | null;
  patient?: AppointmentPatient | null;
  doctor?: { id: string; fullName: string } | null;
  clinicUnit?: { id: string; name: string; code?: string | null } | null;
  branch?: { id: string; name: string; code?: string | null; colorCode?: string } | null;
};

export type CalendarDoctor = {
  id: string;
  fullName: string;
  role: string;
  isActive?: boolean | null;
  profile?: { hideAsDoctor?: boolean | null; workStart?: string | null; workEnd?: string | null } | null;
};

export type ClinicUnit = { id: string; name: string; code?: string | null; isActive: boolean };

export type DoctorBlock = {
  id: string;
  doctorId: string;
  date: string;
  startTime: string;
  endTime: string;
  reason?: string | null;
  doctor?: { id: string; fullName: string };
};

export type BookingRequestEntry = {
  id: string;
  fullName: string;
  phone: string;
  tcNo?: string | null;
  doctor?: { id: string; fullName: string } | null;
  preferredFrom: string;
  note?: string | null;
  status: "BEKLIYOR" | "ONAYLANDI" | "REDDEDILDI" | "IPTAL";
  createdAt: string;
};

export type WaitlistEntry = {
  id: string;
  patient: { id: string; fullName: string; phone?: string | null };
  doctor?: { id: string; fullName: string } | null;
  preferredFrom?: string | null;
  preferredTo?: string | null;
  note?: string | null;
  status: "BEKLIYOR" | "ARANDI" | "YERLESTIRILDI" | "IPTAL";
  createdAt: string;
};

/** Randevu formunun hangi kayıttan açıldığı — kayıttan sonra kaynak kayıt bu randevuya bağlanır. */
export type AppointmentSource =
  | { type: "online"; request: BookingRequestEntry }
  | { type: "waitlist"; entry: WaitlistEntry };

export type CalendarSettings = {
  institutionName: string;
  openingTime: string;
  closingTime: string;
  appointmentDuration: number;
  holidayDays: string[];
  dailySchedules: DaySchedule[];
  sms: { enabled: boolean; info: boolean; reminder: boolean; survey: boolean };
  treatments: Array<{ value: string; label: string; color: string }>;
  doctors: CalendarDoctor[];
  multiBranch: boolean;
};

/** Takvim/form izinleri — sayfa bir kez hesaplar, bileşenlere geçirir. */
export type AppointmentPermissions = {
  canCreate: boolean;
  /** appointments:delete (DELETE ile iptal) */
  canDelete: boolean;
  /** appointments:approve (online talep onayı, PUT ile iptal) */
  canApprove: boolean;
  canSeePhone: boolean;
  /** Zaman kapatma: API yalnız Yönetici rolüne izin veriyor. */
  canManageBlocks: boolean;
};

// ── Tarih / saat ──────────────────────────────────────────────────────────

export const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const TR_MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
export const TR_DAYS_FULL = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
export const TR_DAYS_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

const pad = (value: number) => String(value).padStart(2, "0");

/** Tarayıcının yerel takvim günü "YYYY-MM-DD" (Türkiye kullanımında Türkiye günü). */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "YYYY-MM-DD" → o günün yerel 12:00'si (gün kayması olmasın diye öğlen). */
export function fromDateKey(key: string | null | undefined): Date | null {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (Number.isNaN(date.getTime()) || date.getMonth() !== m - 1) return null;
  return date;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function timeLabel(totalMinutes: number): string {
  const safe = Math.max(0, Math.min(24 * 60 - 1, Math.round(totalMinutes)));
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
}

export function parseClock(value: string | null | undefined, fallback: number | null = null): number | null {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return fallback;
  const [h, m] = value.split(":").map(Number);
  if (h > 23 || m > 59) return fallback;
  return h * 60 + m;
}

/** "YYYY-MM-DD" + dakika → yerel Date. */
export function dateAtMinutes(dateKey: string, minutes: number): Date | null {
  const base = fromDateKey(dateKey);
  if (!base) return null;
  base.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return base;
}

export function formatClock(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "15:00–15:30" */
export function formatTimeRange(startAt: string | Date, endAt: string | Date): string {
  return `${formatClock(startAt)}–${formatClock(endAt)}`;
}

export function durationMinutes(startAt: string | Date, endAt: string | Date): number {
  const diff = new Date(endAt).getTime() - new Date(startAt).getTime();
  return Math.max(0, Math.round(diff / 60000));
}

/** "Cuma, 9 Ekim 2026" */
export function formatDayLong(date: Date): string {
  return `${TR_DAYS_FULL[date.getDay()]}, ${date.getDate()} ${TR_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "9 Eki Cuma" — yıl bu yılsa yazılmaz. */
export function formatDayShort(date: Date, now: Date = new Date()): string {
  const year = date.getFullYear() === now.getFullYear() ? "" : ` ${date.getFullYear()}`;
  return `${date.getDate()} ${TR_MONTHS_SHORT[date.getMonth()]}${year} ${TR_DAYS_FULL[date.getDay()]}`;
}

/** Bugün/Yarın/Dün ya da kısa tarih. */
export function relativeDayLabel(date: Date, now: Date = new Date()): string {
  if (isSameDay(date, now)) return "Bugün";
  if (isSameDay(date, addDays(now, 1))) return "Yarın";
  if (isSameDay(date, addDays(now, -1))) return "Dün";
  return formatDayShort(date, now);
}

// ── Telefon ───────────────────────────────────────────────────────────────

/** Ekranda gösterim: "0532 123 45 67". Boşsa "". */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  const local = digits.length === 12 && digits.startsWith("90") ? digits.slice(2) : digits;
  const ten = local.length === 11 && local.startsWith("0") ? local.slice(1) : local;
  if (ten.length !== 10) return String(phone);
  return `0${ten.slice(0, 3)} ${ten.slice(3, 6)} ${ten.slice(6, 8)} ${ten.slice(8)}`;
}

/** tel: bağlantısı (telefondan tek dokunuşla arama). */
export function phoneHref(phone: string | null | undefined): string | null {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const ten = digits.slice(-10);
  return `tel:+90${ten}`;
}

// ── Durum ─────────────────────────────────────────────────────────────────

export const STATUS_ICON: Record<DisplayAppointmentStatus, ComponentType<{ className?: string }>> = {
  PLANLANDI: CalendarClock,
  BEKLIYOR: Clock,
  TAMAMLANDI: CheckCircle2,
  GELMEDI: XCircle,
  IPTAL: Ban,
};

/** Takvim kartı zemini (durum rengi + sol şerit). Metinle birlikte kullanılır, renk tek başına anlam taşımaz. */
export const STATUS_CARD_CLASS: Record<DisplayAppointmentStatus, string> = {
  PLANLANDI: "border-sky-200 bg-sky-50 border-l-sky-500",
  BEKLIYOR: "border-amber-200 bg-amber-50 border-l-amber-500",
  TAMAMLANDI: "border-emerald-200 bg-emerald-50 border-l-emerald-500",
  GELMEDI: "border-red-200 bg-red-50 border-l-red-500",
  IPTAL: "border-slate-200 bg-slate-100 border-l-slate-400",
};

export function displayStatus(raw: string): DisplayAppointmentStatus {
  return getDisplayAppointmentStatus(raw);
}

export function statusLabel(raw: string): string {
  return APPOINTMENT_DISPLAY_STATUS_LABELS[displayStatus(raw)];
}

export function statusTone(raw: string) {
  return APPOINTMENT_DISPLAY_STATUS_TONE[displayStatus(raw)];
}

/** Kapanmamış durum: hasta henüz gelmedi (Planlandı) ya da geldi ama randevu kapatılmadı (Bekliyor). */
export function isOpenStatus(raw: string): boolean {
  return raw === "BEKLIYOR" || raw === "ONAYLANDI" || raw === "GELDI";
}

/**
 * Randevu günü geçmiş ama durumu kapatılmamış (Planlandı/Bekliyor kalmış).
 * Otomatik değiştirilmez; personelin "Tamamlandı" ya da "Gelmedi" seçmesi
 * için görünür uyarı verilir.
 */
export function isUnresolvedPast(raw: string, startAt: string | Date, now: Date = new Date()): boolean {
  return isOpenStatus(raw) && isAppointmentPastDay(startAt, now);
}

/** Bugün saati geçmiş ama hâlâ "Planlandı" (hasta geldi/gelmedi işaretlenmemiş). */
export function isLateUnmarked(raw: string, startAt: string | Date, now: Date = new Date()): boolean {
  return (raw === "BEKLIYOR" || raw === "ONAYLANDI") && new Date(startAt).getTime() < now.getTime();
}

// ── Online talep tarihi ───────────────────────────────────────────────────

/**
 * Online talebin tercih edilen günü. Eski talepler günü UTC gece yarısı
 * olarak saklıyordu (ekranda 03:00 görünüyordu); bu durumda UTC tarih
 * bölümü hastanın seçtiği gündür.
 */
export function preferredDateKeyOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0) return date.toISOString().slice(0, 10);
  return toDateKey(date);
}

/** Tercih edilen saat (dakika) — yalnız gün seçilmişse null. */
export function preferredMinutesOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0) return null;
  return minutesOfDay(date);
}

export function preferredPeriodLabel(minutes: number | null): string {
  if (minutes === null) return "Saat tercihi yok";
  if (minutes < 12 * 60) return "Sabah";
  if (minutes < 15 * 60) return "Öğle";
  return "Öğleden sonra";
}

// ── Çalışma günü / saat ızgarası ─────────────────────────────────────────

export type DayHours = { open: number; close: number; lunchStart: number | null; lunchEnd: number | null; isHoliday: boolean };

export function getDayHours(dailySchedules: DaySchedule[], date: Date, fallbackOpen = "08:30", fallbackClose = "18:00"): DayHours {
  const schedule = buildScheduleByJsDay(dailySchedules).get(date.getDay());
  const open = parseClock(schedule?.open, parseClock(fallbackOpen, 8 * 60 + 30)) ?? 8 * 60 + 30;
  const close = parseClock(schedule?.close, parseClock(fallbackClose, 18 * 60)) ?? 18 * 60;
  const lunchStart = parseClock(schedule?.lunchStart || "", null);
  const lunchEnd = parseClock(schedule?.lunchEnd || "", null);
  return {
    open,
    close: Math.max(close, open + 15),
    lunchStart: lunchStart !== null && lunchEnd !== null && lunchStart < lunchEnd ? lunchStart : null,
    lunchEnd: lunchStart !== null && lunchEnd !== null && lunchStart < lunchEnd ? lunchEnd : null,
    isHoliday: Boolean(schedule?.isHoliday),
  };
}

/** Açılıştan kapanışa slot başlangıçları (dakika). */
export function buildSlots(open: number, close: number, interval: number): number[] {
  const step = Math.max(5, interval);
  const slots: number[] = [];
  for (let cursor = open; cursor + step <= close; cursor += step) slots.push(cursor);
  return slots.length > 0 ? slots : [open];
}

/**
 * Izgara satırları: çalışma saatleri + o gün çalışma saati dışına taşan
 * randevular da görünsün diye satırlar genişletilir (önceden ızgara dışındaki
 * ya da 15 dk'ya denk gelmeyen randevular takvimde hiç çizilmiyordu).
 */
export function buildRowsCovering(open: number, close: number, interval: number, items: Array<{ start: number; end: number }>): number[] {
  const step = Math.max(5, interval);
  let first = open;
  let last = close;
  for (const item of items) {
    if (item.start < first) first = open - Math.ceil((open - item.start) / step) * step;
    if (item.end > last) last = item.end;
  }
  first = Math.max(0, first);
  const rows: number[] = [];
  for (let cursor = first; cursor < last && cursor < 24 * 60; cursor += step) rows.push(cursor);
  return rows.length > 0 ? rows : [open];
}

/** Bir dakikanın düştüğü satırın sırası (satırlar artan sırada). */
export function rowIndexFor(minutes: number, rows: number[]): number {
  let index = 0;
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i] <= minutes) index = i;
    else break;
  }
  return index;
}

export type SlotOption = { minutes: number; label: string; busyReason: string | null };

/**
 * Formdaki saat seçenekleri: çalışma saatleri içindeki slotlar; seçilen
 * doktorun o günkü randevuları, kapalı zamanları, öğle arası ve geçmiş
 * saatler "dolu" diye işaretlenir (seçim engellenmez, açıkça yazılır).
 */
export function buildSlotOptions(params: {
  dateKey: string;
  hours: DayHours;
  interval: number;
  durationMin: number;
  busy: Array<{ start: number; end: number; label: string }>;
  now?: Date;
}): SlotOption[] {
  const { dateKey, hours, interval, durationMin, busy } = params;
  const now = params.now || new Date();
  const isToday = dateKey === toDateKey(now);
  const nowMinutes = minutesOfDay(now);
  return buildSlots(hours.open, hours.close, interval).map((start) => {
    const end = start + durationMin;
    let busyReason: string | null = null;
    if (isToday && start <= nowMinutes) busyReason = "geçti";
    else if (end > hours.close) busyReason = "mesai sonu";
    else if (hours.lunchStart !== null && hours.lunchEnd !== null && start < hours.lunchEnd && end > hours.lunchStart) busyReason = "öğle arası";
    else {
      const hit = busy.find((item) => item.start < end && item.end > start);
      if (hit) busyReason = hit.label;
    }
    return { minutes: start, label: timeLabel(start), busyReason };
  });
}

/** Tercih edilen dakikadan (yoksa günün başından) sonraki ilk boş slot. */
export function firstFreeSlot(options: SlotOption[], fromMinutes: number | null = null): number | null {
  const candidates = options.filter((option) => !option.busyReason);
  if (candidates.length === 0) return null;
  if (fromMinutes === null) return candidates[0].minutes;
  return (candidates.find((option) => option.minutes >= fromMinutes) || candidates[0]).minutes;
}

// ── Sayma ─────────────────────────────────────────────────────────────────

/**
 * Görüntü durumuna göre sayım. Ham ONAYLANDI eski istemcilerden kalan değerdir
 * ve "Planlandı" sayılır; böylece süzgeç, sayaç ve renk aynı şeyi söyler.
 */
export function countByDisplay(list: Array<{ status: string }>): Record<DisplayAppointmentStatus, number> {
  const counts: Record<DisplayAppointmentStatus, number> = { PLANLANDI: 0, BEKLIYOR: 0, TAMAMLANDI: 0, GELMEDI: 0, IPTAL: 0 };
  for (const item of list) counts[displayStatus(item.status)] += 1;
  return counts;
}

/** İptaller hariç randevu sayısı (ekrandaki ana sayı; iptal ayrıca yazılır). */
export function activeCount(list: Array<{ status: string }>): number {
  return list.filter((item) => item.status !== "IPTAL").length;
}

// ── Tedavi ────────────────────────────────────────────────────────────────

export function toTreatmentOptions(list: Array<{ value: string; label: string; color: string }> | null | undefined): TreatmentOption[] {
  const source = list && list.length > 0 ? list : APPOINTMENT_TREATMENT_OPTIONS;
  return source.map((item) => ({ value: item.value, label: item.label, color: item.color, badge: "" }));
}

/**
 * Tedavinin etiketi/rengi. Kurum listesinde yoksa (ör. pasife alınmış tür)
 * varsayılan listeye, o da yoksa kodun kendisine düşer — önceden bilinmeyen
 * tür sessizce "Muayene" görünüyordu.
 */
export function treatmentMetaOf(key: string | null | undefined, options: TreatmentOption[]): { value: string; label: string; color: string } {
  const value = key || "";
  const found = options.find((item) => item.value === value) || APPOINTMENT_TREATMENT_OPTIONS.find((item) => item.value === value);
  if (found) return { value: found.value, label: found.label, color: found.color };
  return { value, label: value ? value.charAt(0) + value.slice(1).toLocaleLowerCase("tr-TR").replace(/_/g, " ") : "Tedavi belirtilmedi", color: "#64748b" };
}

/** Formun varsayılan tedavisi: listede Muayene varsa o, yoksa ilk seçenek (seçim kutusunda görünür). */
export function defaultTreatmentKey(options: TreatmentOption[]): string {
  return options.find((item) => item.value === "MUAYENE")?.value || options[0]?.value || "MUAYENE";
}

// ── Randevu notu ─────────────────────────────────────────────────────────

const NOTE_LABELS = ["tedavi:", "takip durumu:", "not:"];

/**
 * Not metnini çözer. src/lib/appointment-follow-up.ts'teki ayrıştırıcı yalnız
 * "Not:" satırının İLK satırını okuyordu; çok satırlı notlarda alt satırlar
 * (ör. "Penisilin alerjisi var") hiçbir ekranda görünmüyor ve takip notu
 * kaydedilince kalıcı olarak siliniyordu. Burada "Not:" satırından sonraki
 * etiketsiz satırlar da notun parçası sayılır.
 */
export function parseNoteFull(note: string | null | undefined, options: TreatmentOption[]): { followUp: FollowUpKey; detail: string; treatment: string } {
  const raw = (note || "").trim();
  const fallbackTreatment = defaultTreatmentKey(options);
  if (!raw) return { followUp: "YOK", detail: "", treatment: fallbackTreatment };
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const hasLabels = lines.some((line) => NOTE_LABELS.some((label) => line.toLowerCase().startsWith(label)));
  if (!hasLabels) return { followUp: "YOK", detail: lines.join("\n"), treatment: fallbackTreatment };

  let treatment = "";
  let followUp = "";
  const detailLines: string[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    const value = line.split(":").slice(1).join(":").trim();
    if (lower.startsWith("tedavi:")) { treatment = value; continue; }
    if (lower.startsWith("takip durumu:")) { followUp = value; continue; }
    if (lower.startsWith("not:")) { if (value) detailLines.push(value); continue; }
    // "Not:" satırının devamı ya da etiketsiz eski metin.
    detailLines.push(line);
  }
  const validFollow = FOLLOW_UP_OPTIONS.some((item) => item.value === followUp) ? (followUp as FollowUpKey) : "YOK";
  const validTreatment = options.some((item) => item.value === treatment) ? treatment : (treatment || fallbackTreatment);
  return { followUp: validFollow, detail: detailLines.join("\n"), treatment: validTreatment };
}

/**
 * Notu yazar. Diğer ekranlar (Hasta Takip, hasta dosyası) notun yalnız ilk
 * "Not:" satırını okuduğundan, satır sonları "; " ile tek satıra indirilir —
 * böylece hiçbir ekranda notun bir parçası kaybolmaz.
 */
export function buildNoteSafe(followUp: FollowUpKey, detail: string, treatment: string): string {
  const singleLine = detail.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join("; ");
  return buildAppointmentNote(followUp, singleLine, treatment);
}

/** Durum düğmeleriyle aynı şeyi ikinci kez soran takip seçenekleri formda gösterilmez (mevcut değer korunur). */
export function followUpChoices(current: FollowUpKey) {
  return FOLLOW_UP_OPTIONS.filter((item) => (item.value !== "GEC_GELDI" && item.value !== "KENDISI_IPTAL") || item.value === current);
}

// ── Kişi ─────────────────────────────────────────────────────────────────

export function initialsOf(name: string | null | undefined): string {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !/^(dr\.?|dt\.?|uzm\.?)$/i.test(part))
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("tr-TR") || "?";
}

