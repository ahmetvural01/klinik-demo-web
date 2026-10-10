import { appointmentNeedsFollowUp, parseAppointmentNote } from "@/lib/appointment-follow-up";
import type { BadgeTone } from "@/components/ui/Badge";
import { canMessageOnWhatsapp } from "@/lib/whatsapp-consent";
import { turkeyDateKey } from "@/lib/tz";

// Hasta aramaları listesinin veri modeli: API kayıtlarını ekrandaki tek tip
// "arama satırı"na çevirir. Ekran ve yazma istekleri birbirinden ayrıdır:
// `rawNote` kayıtlı nottur ve yalnız okunur; ekranda gösterilen metin hiçbir
// yazma isteğine gönderilmez (önceden gösterim metni kayıtlı notun üstüne
// yazılıyor, lab provasının hangi adım olduğu kayboluyordu — denetim HL-V01).

export type ApiFollowUpType = "GERI_ARA" | "ULASILAMADI" | "DONUS_BEKLENIYOR" | "DIGER";

export type ApiPatient = {
  id: string;
  fullName: string;
  phone?: string | null;
  phoneCountryCode?: string | null;
  whatsappOptInAt?: string | null;
  whatsappOptOutAt?: string | null;
};

export type ApiAppointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  note?: string | null;
  patient?: ApiPatient;
  doctor?: { id: string; fullName: string };
};

export type ApiFollowUp = {
  id: string;
  patientId: string;
  appointmentId?: string | null;
  doctorId?: string | null;
  type: ApiFollowUpType;
  priority: number;
  status: "ACIK" | "KAPALI";
  note?: string | null;
  resolutionNote?: string | null;
  nextActionAt?: string | null;
  lastContactAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  patient?: ApiPatient;
  appointment?: { id: string; startAt: string; endAt: string; status: string; doctor?: { id: string; fullName: string } | null } | null;
  assignedDoctor?: { id: string; fullName: string } | null;
  createdBy?: { id: string; fullName: string } | null;
  labOrderId?: string | null;
  labTripId?: string | null;
  labOrder?: { id: string; labName: string; labType: string } | null;
  events?: Array<{ id: string; occurredAt: string; summary: string; channel?: string | null }>;
};

export type FollowUpEvent = {
  id: string;
  followUpId: string;
  occurredAt: string;
  channel?: string | null;
  summary: string;
  detail?: string | null;
  patientResponse?: string | null;
  nextStep?: string | null;
  createdBy?: { id: string; fullName: string } | null;
};

export type PatientVisit = { lastVisitAt: string | null; nextAppointment: { startAt: string; doctorName: string | null } | null };

/** GET /api/patient-follow-ups/worklist yanıtı: listenin tamamı tek istekte. */
export type FollowUpWorklist = {
  followUps: ApiFollowUp[];
  /** "Gelmedi" ya da randevu notunda takip durumu olan, henüz aramaya bağlanmamış randevular. */
  appointments: ApiAppointment[];
  visits: Record<string, PatientVisit>;
  customTypes: string[];
  canSeeAppointments: boolean;
  appointmentsTruncated?: boolean;
};

export type LabContext = {
  labName?: string;
  labType?: string;
  receivedStep?: string;
  groupKey: string;
};

/** Ekrandaki tek tip arama satırı. */
export type FollowItem = {
  key: string;
  /** Kayıtlı arama (manuel ya da lab) varsa kimliği; randevudan türeyen satırda yok. */
  followUpId?: string;
  appointmentId?: string;
  appointmentStartAt?: string;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  phoneCountryCode: string;
  whatsappConsent: boolean;
  doctorId?: string;
  doctorName: string | null;
  /** GELMEDI yalnız randevudan türeyen satırda. */
  type: ApiFollowUpType | "GELMEDI";
  reasonLabel: string;
  reasonTone: BadgeTone;
  /** Notun ilk satırındaki "Takip Tipi:" etiketi (özel neden); yoksa "". */
  customType: string;
  /** Kayıtlı not (yalnız okunur, "Takip Tipi:" ve lab etiket satırları ayıklanmış). */
  noteText: string;
  /** Kayıtlı notun tamamı (yalnız düzenlemede teknik satırları korumak için). */
  rawNote: string;
  isOpen: boolean;
  priority: number;
  createdAt: string;
  /** Kayıtlı sonraki arama zamanı. */
  nextActionAt: string | null;
  /**
   * Listedeki grup ve "ne zaman" için kullanılan tarih: kayıtlı aramada
   * nextActionAt; randevudan türeyen satırda kaçırılan randevu günü
   * (hasta dönüş yapacaksa +3 gün). Önceden türeyen satır 90 gün sonra bile
   * "Hemen aranacak" yazıyor, gecikmiş sayılmıyordu (canlı test H5).
   */
  dueAt: string | null;
  /** dueAt'in saati anlamsız (randevudan türeyen satır): yalnız gün gösterilir. */
  dueAllDay: boolean;
  derived: boolean;
  lastContactAt: string | null;
  lastEvent: { occurredAt: string; summary: string } | null;
  resolutionNote: string | null;
  closedAt: string | null;
  labContext: LabContext | null;
};

export const BASE_TYPE_LABELS: Record<ApiFollowUpType | "GELMEDI", string> = {
  GELMEDI: "Randevuya gelmedi",
  GERI_ARA: "Tekrar aranacak",
  ULASILAMADI: "Ulaşılamadı",
  // Görüşme sonucu ve randevu formundaki adla aynı (önceden listede "Dönüş bekleniyor" yazıyordu).
  DONUS_BEKLENIYOR: "Hasta dönüş yapacak",
  DIGER: "Diğer",
};

const TYPE_TONES: Record<ApiFollowUpType | "GELMEDI", BadgeTone> = {
  GELMEDI: "critical",
  GERI_ARA: "warning",
  ULASILAMADI: "warning",
  DONUS_BEKLENIYOR: "info",
  DIGER: "neutral",
};

/** Yeni aramada seçilebilen hazır nedenler (sonuç olan "Randevu verildi"/"Ertelendi" çıkarıldı — HL-15). */
export const PRESET_REASONS = [
  "Tekrar aranacak",
  "Ulaşılamadı",
  "Hasta dönüş yapacak",
  "Fiyat bilgisi bekleniyor",
  "Tedavi onayı bekleniyor",
  "Kontrol araması",
] as const;

const CUSTOM_TYPE_PREFIX = "Takip Tipi:";
export const LAB_PROVA_LABEL = "Lab prova randevusu";
// Lab otomatiğinin notuna yazdığı iç etiket; elle seçilebilen nedenlere karışmamalı (canlı test H6).
const LAB_INTERNAL_TYPE = "lab prova randevusu";

const reasonKey = (value: string) => value.trim().toLocaleLowerCase("tr-TR");

/**
 * Seçilen neden etiketini API türüne çevirir. Yalnız TAM eşleşme: önceden
 * içinde "ara"/"beklen" geçen her etiket (ör. "Para iadesi", "Fiyat bilgisi
 * bekleniyor") sessizce başka türe dönüşüyordu (denetim HL-15). Diğer her
 * etiket DIGER türünde, notun ilk satırında "Takip Tipi: …" olarak saklanır.
 */
export function resolveReason(label: string): { apiType: ApiFollowUpType; customLabel: string } {
  const trimmed = label.trim();
  const key = reasonKey(trimmed);
  if (!trimmed || key === "tekrar aranacak") return { apiType: "GERI_ARA", customLabel: "" };
  if (key === "ulaşılamadı") return { apiType: "ULASILAMADI", customLabel: "" };
  if (key === "dönüş bekleniyor" || key === "hasta dönüş yapacak") return { apiType: "DONUS_BEKLENIYOR", customLabel: "" };
  if (key === "diğer") return { apiType: "DIGER", customLabel: "" };
  return { apiType: "DIGER", customLabel: trimmed };
}

export function buildNote(customLabel: string, note: string) {
  const label = customLabel.trim();
  const text = note.trim();
  if (label && text) return `${CUSTOM_TYPE_PREFIX} ${label}\n${text}`;
  if (label) return `${CUSTOM_TYPE_PREFIX} ${label}`;
  return text;
}

// Eski ekran boş notu bu dolgu metniyle kaydediyordu (denetim HL-V01); not yokmuş gibi gösterilir.
const FILLER_NOTES = new Set(["Takip notu girilmedi.", "Randevu notu bulunmuyor.", "Not bulunmuyor."]);

export function parseCustomType(note?: string | null) {
  const raw = FILLER_NOTES.has((note || "").trim()) ? "" : (note || "").trim();
  if (!raw) return { customType: "", cleanNote: "" };
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const first = lines[0] || "";
  if (!first.toLocaleLowerCase("tr-TR").startsWith(CUSTOM_TYPE_PREFIX.toLocaleLowerCase("tr-TR"))) {
    return { customType: "", cleanNote: raw };
  }
  const cleanNote = lines.slice(1).join("\n").trim();
  return { customType: first.slice(CUSTOM_TYPE_PREFIX.length).trim(), cleanNote: FILLER_NOTES.has(cleanNote) ? "" : cleanNote };
}

/**
 * Lab otomatiğinin nota yazdığı teknik satır mı? Ekranda tekrar yazılmaz:
 * önceden "Laboratuvardan gelen prova için…", "Hasta: <ad>" (ad zaten
 * başlıkta) ve "Lab adımı #2: …" satırları bağlam cümlesinin altında ikinci,
 * üçüncü kez görünüyordu (denetim §3.2 sorun 2). Kayıtlı not değişmez.
 */
function isLabTechnicalLine(line: string, patientName: string, legacyLabLine?: string) {
  const lower = line.toLocaleLowerCase("tr-TR");
  return line.startsWith("LAB_ORDER:") || line.startsWith("LAB_PROVA:") || line.startsWith("İş:")
    || line.startsWith("Laboratuvar:") || line.startsWith("Gelen/Prova:") || line.startsWith("Adım #")
    || line.startsWith("Lab adımı #") || lower.startsWith("laboratuvardan gelen prova")
    || (patientName !== "" && line === `Hasta: ${patientName}`)
    || line === legacyLabLine || FILLER_NOTES.has(line) || lower.startsWith(CUSTOM_TYPE_PREFIX.toLocaleLowerCase("tr-TR"));
}

// PatientFollowUp.labOrderId/labTripId doluysa öncelikli kaynak odur; not
// metni yalnız eski kayıtlar için yedektir.
function parseLabContext(followUp: ApiFollowUp): { context: LabContext | null; cleanNote: string; technicalLines: string[] } {
  const lines = (followUp.note || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const orderToken = lines.find((line) => line.startsWith("LAB_ORDER:"));
  const tripToken = lines.find((line) => line.startsWith("LAB_PROVA:"));
  const legacyLabLine = lines.find((line) => line.includes(" - ") && !line.startsWith("Adım #"));
  const [legacyLabType, legacyLabName] = legacyLabLine ? legacyLabLine.split(" - ").map((part) => part.trim()) : ["", ""];
  const legacyStepLine = lines.find((line) => line.startsWith("Adım #"));
  const legacyDescription = legacyStepLine?.split(":").slice(1).join(":").trim() || "";
  const legacyReceivedStep = legacyDescription.includes(" → ") ? legacyDescription.split(" → ")[1].trim() : "";
  const labType = followUp.labOrder?.labType || lines.find((line) => line.startsWith("İş:"))?.slice(3).trim() || legacyLabType;
  const labName = followUp.labOrder?.labName || lines.find((line) => line.startsWith("Laboratuvar:"))?.slice("Laboratuvar:".length).trim() || legacyLabName;
  const receivedStep = lines.find((line) => line.startsWith("Gelen/Prova:"))?.slice("Gelen/Prova:".length).trim() || legacyReceivedStep;
  const isLab = Boolean(
    followUp.labOrderId || followUp.labTripId || orderToken || tripToken || receivedStep
    || lines.some((line) => line.toLocaleLowerCase("tr-TR").includes("laboratuvardan gelen prova")),
  );
  if (!isLab) return { context: null, cleanNote: "", technicalLines: [] };
  const patientName = followUp.patient?.fullName || "";
  const technical = (line: string) => isLabTechnicalLine(line, patientName, legacyLabLine);
  return {
    context: {
      labName: labName || undefined,
      labType: labType || undefined,
      receivedStep: receivedStep || undefined,
      groupKey: followUp.labOrderId || orderToken || `${labType || "-"}::${labName || "-"}`,
    },
    cleanNote: lines.filter((line) => !technical(line)).join("\n"),
    technicalLines: lines.filter(technical),
  };
}

/**
 * Lab aramasının notu düzenlenirken korunacak teknik satırlar (iş, lab,
 * prova adımı etiketleri). Kullanıcı yalnız kendi notunu değiştirir (HL-V01).
 */
export function labTechnicalLines(followUp: ApiFollowUp) {
  return parseLabContext(followUp).technicalLines;
}

export function followUpToItem(followUp: ApiFollowUp): FollowItem {
  const custom = parseCustomType(followUp.note);
  const lab = parseLabContext(followUp);
  const lastEvent = followUp.events?.[0] ? { occurredAt: followUp.events[0].occurredAt, summary: followUp.events[0].summary } : null;
  return {
    key: `manual-${followUp.id}`,
    followUpId: followUp.id,
    appointmentId: followUp.appointmentId || undefined,
    appointmentStartAt: followUp.appointment?.startAt,
    patientId: followUp.patientId,
    patientName: followUp.patient?.fullName || "Hasta",
    patientPhone: followUp.patient?.phone || null,
    phoneCountryCode: followUp.patient?.phoneCountryCode || "+90",
    whatsappConsent: canMessageOnWhatsapp(followUp.patient),
    doctorId: followUp.doctorId || followUp.appointment?.doctor?.id || undefined,
    doctorName: followUp.assignedDoctor?.fullName || followUp.appointment?.doctor?.fullName || null,
    type: followUp.type,
    reasonLabel: lab.context ? LAB_PROVA_LABEL : custom.customType || BASE_TYPE_LABELS[followUp.type] || "Diğer",
    reasonTone: lab.context ? "info" : custom.customType ? "neutral" : TYPE_TONES[followUp.type] || "neutral",
    customType: lab.context ? "" : custom.customType,
    noteText: lab.context ? lab.cleanNote : custom.cleanNote,
    rawNote: followUp.note || "",
    isOpen: followUp.status === "ACIK",
    priority: followUp.priority,
    createdAt: followUp.appointment?.startAt || followUp.createdAt,
    nextActionAt: followUp.nextActionAt || null,
    dueAt: followUp.nextActionAt || null,
    dueAllDay: false,
    derived: false,
    lastContactAt: followUp.lastContactAt || null,
    lastEvent,
    resolutionNote: followUp.resolutionNote || null,
    closedAt: followUp.closedAt || null,
    labContext: lab.context,
  };
}

export function appointmentToItem(appointment: ApiAppointment): FollowItem {
  const parsed = parseAppointmentNote(appointment.note);
  const type: FollowItem["type"] = appointment.status === "GELMEDI"
    ? "GELMEDI"
    : parsed.followUp === "GERI_ARA" || parsed.followUp === "ULASILAMADI" || parsed.followUp === "DONUS_BEKLENIYOR"
      ? parsed.followUp
      : "GERI_ARA";
  // Hasta dönüş yapacaksa üç gün beklenir; diğerlerinde arama randevu gününden itibaren yapılmalı.
  const dueAt = type === "DONUS_BEKLENIYOR"
    ? new Date(new Date(appointment.startAt).getTime() + 3 * 86_400_000).toISOString()
    : appointment.startAt;
  return {
    key: `appt-${appointment.id}`,
    appointmentId: appointment.id,
    appointmentStartAt: appointment.startAt,
    patientId: appointment.patient?.id || "",
    patientName: appointment.patient?.fullName || "Hasta",
    patientPhone: appointment.patient?.phone || null,
    phoneCountryCode: appointment.patient?.phoneCountryCode || "+90",
    whatsappConsent: canMessageOnWhatsapp(appointment.patient),
    doctorId: appointment.doctor?.id,
    doctorName: appointment.doctor?.fullName || null,
    type,
    reasonLabel: BASE_TYPE_LABELS[type],
    reasonTone: TYPE_TONES[type],
    customType: "",
    noteText: parsed.detail || "",
    rawNote: "",
    isOpen: true,
    priority: 2,
    createdAt: appointment.startAt,
    nextActionAt: null,
    dueAt,
    dueAllDay: true,
    derived: true,
    lastContactAt: null,
    lastEvent: null,
    resolutionNote: null,
    closedAt: null,
    labContext: null,
  };
}

/**
 * Arama ve randevu kayıtlarından ekrandaki listeyi kurar.
 * - Bir aramaya bağlanmış randevu (açık ya da kapalı) bir daha satır
 *   üretmez: arama kapatılınca "Gelmedi" satırı geri gelmiyordu (HL-V02).
 * - Gelmedi randevusundan sonra yeni randevu almış ya da gelmiş hastanın
 *   eski "Gelmedi" satırı listeden düşer (HL-19).
 * - Aynı lab işinin birden çok açık prova aramasından yalnız en yenisi kalır.
 */
export function buildItems(followUps: ApiFollowUp[], appointments: ApiAppointment[], visits: Record<string, PatientVisit>): FollowItem[] {
  const linkedAppointmentIds = new Set(followUps.map((followUp) => followUp.appointmentId).filter(Boolean) as string[]);
  const derived = appointments
    .filter((appointment) => appointment.patient?.id && appointmentNeedsFollowUp(appointment.status, appointment.note))
    .filter((appointment) => !linkedAppointmentIds.has(appointment.id))
    .filter((appointment) => {
      if (appointment.status !== "GELMEDI") return true;
      const visit = appointment.patient?.id ? visits[appointment.patient.id] : undefined;
      if (!visit) return true;
      const missedAt = new Date(appointment.startAt).getTime();
      const cameLater = visit.lastVisitAt && new Date(visit.lastVisitAt).getTime() > missedAt;
      return !cameLater && !visit.nextAppointment;
    })
    .map(appointmentToItem);

  const manual = followUps.map(followUpToItem);
  const newestLab = new Map<string, FollowItem>();
  for (const item of manual) {
    if (!item.isOpen || !item.labContext) continue;
    const groupKey = `${item.patientId}::${item.labContext.groupKey}`;
    const previous = newestLab.get(groupKey);
    if (!previous || new Date(item.createdAt).getTime() > new Date(previous.createdAt).getTime()) newestLab.set(groupKey, item);
  }
  const manualDeduped = manual.filter((item) => {
    if (!item.isOpen || !item.labContext) return true;
    return newestLab.get(`${item.patientId}::${item.labContext.groupKey}`)?.key === item.key;
  });
  return [...manualDeduped, ...derived];
}

/**
 * Listedeki grup. Gruplar birbirini dışlar: önceden "Açık" sekmesi "Gecikmiş"
 * ve "Bugün"ü de içeriyor, tarihsiz (hemen aranacak) arama ise hiçbir
 * aranacaklar sekmesinde görünmüyordu (denetim §3.1 sorun 1-2, canlı test H4).
 * - "bugun": günü geçmiş, bugün ya da tarihsiz açık aramalar
 * - "sonraki": ileri tarihli açık aramalar
 * - "kapali": kapanmış aramalar
 * Günler Türkiye takvimine göredir.
 */
export type FollowBucket = "bugun" | "sonraki" | "kapali";

export function followBucket(item: FollowItem, todayKey: string): FollowBucket {
  if (!item.isOpen) return "kapali";
  if (!item.dueAt) return "bugun";
  return turkeyDateKey(new Date(item.dueAt)) <= todayKey ? "bugun" : "sonraki";
}

/** Açık arama, günü geçmiş (saat değil gün bazlı). */
export function isOverdueItem(item: FollowItem, todayKey: string) {
  return item.isOpen && Boolean(item.dueAt) && turkeyDateKey(new Date(item.dueAt!)) < todayKey;
}

/**
 * Yeni arama formundaki neden seçenekleri: hazır nedenler + kurumun kayıtlı
 * nedenleri + önceki aramalarda kullanılmış özel nedenler. Büyük/küçük harf
 * farkı tek seçenek sayılır ve lab otomatiğinin iç etiketi listeye girmez
 * (önceden "Kontrol araması" ile "Kontrol Araması" ve "Lab Prova Randevusu"
 * ayrı seçenek olarak görünüyordu — canlı test H6).
 */
export function collectReasonOptions(customTypes: string[], followUps: ApiFollowUp[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const add = (value: string) => {
    const label = value.trim().replace(/\s+/g, " ");
    const key = reasonKey(label);
    if (!label || seen.has(key) || key === LAB_INTERNAL_TYPE || key === "diğer") return;
    seen.add(key);
    result.push(label);
  };
  PRESET_REASONS.forEach(add);
  // Eski ad ("Dönüş bekleniyor") hazır "Hasta dönüş yapacak" ile aynı nedendir; ayrı seçenek olmaz.
  seen.add(reasonKey("Dönüş bekleniyor"));
  customTypes.forEach(add);
  for (const followUp of followUps) {
    if (followUp.labOrderId || followUp.labTripId) continue;
    const { customType } = parseCustomType(followUp.note);
    if (customType) add(customType);
  }
  result.push("Diğer");
  return result;
}

export function phoneDigitsForTel(phone: string, countryCode: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (countryCode && countryCode !== "+90") return `${countryCode}${digits.replace(/^0+/, "")}`;
  return digits.startsWith("0") ? digits : `0${digits}`;
}

export function whatsappHref(phone: string, countryCode: string) {
  const code = (countryCode || "+90").replace(/\D/g, "");
  const local = phone.replace(/\D/g, "").replace(/^0+/, "");
  return local ? `https://wa.me/${code}${local}` : "";
}
