"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CalendarClock, Globe2, ListChecks, UserPlus } from "lucide-react";
import { FormModal } from "@/components/ui/FormModal";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Checkbox } from "@/components/ui/Checkbox";
import { Disclosure } from "@/components/ui/Disclosure";
import { FormField } from "@/components/ui/FormField";
import { Select, Textarea } from "@/components/ui/Input";
import { QuickDatePicker, type QuickDateOption } from "@/components/ui/QuickDatePicker";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { PatientFormModal, type PatientFormInitialValues } from "@/components/patient/PatientFormModal";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { normalizeLocalPhone } from "@/lib/phone-number";
import { turkeyDateKey } from "@/lib/tz";
import type { TreatmentOption } from "@/lib/appointment-follow-up";
import { SlotPicker } from "@/components/randevu/SlotPicker";
import {
  fetchBookingRequestMatch,
  fetchDayAppointments,
  fetchPatientContext,
  saveAppointment,
  type PatientContext,
} from "@/components/randevu/appointment-api";
import {
  buildNoteSafe,
  buildSlotOptions,
  dateAtMinutes,
  defaultTreatmentKey,
  durationMinutes as durationBetween,
  firstFreeSlot,
  formatClock,
  formatDayShort,
  formatPhoneDisplay,
  fromDateKey,
  getDayHours,
  minutesOfDay,
  openDayKeys,
  parseClock,
  parseNoteFull,
  preferredDateKeyOf,
  preferredMinutesOf,
  preferredPeriodLabel,
  quickDayLabel,
  slotKind,
  timeLabel,
  toDateKey,
  type Appointment,
  type AppointmentSource,
  type CalendarDoctor,
  type CalendarSettings,
  type ClinicUnit,
  type DoctorBlock,
  type SlotOption,
} from "@/components/randevu/appointment-utils";

export type AppointmentFormInitial = {
  patient?: PickedPatient | null;
  doctorId?: string;
  dateKey?: string;
  /** Tercih edilen başlangıç (dakika). Verilmezse ilk boş saat seçilir. */
  minutes?: number | null;
  durationMin?: number;
  treatment?: string;
  note?: string;
  /** "sonraki": hızlı günler +1 hafta / +2 hafta / +1 ay (kontrol randevusu). */
  quickDates?: "yakin" | "sonraki";
};

/**
 * Hasta aramasına yazılan metinden yeni hasta formunun ön değerleri: 11 hane
 * (0'la başlamayan) TC, 10-11 hane telefon, diğer her şey ad soyad. Önceden
 * yazılan ad yeni hasta formunda yeniden yazılıyordu (canlı test H7).
 */
function initialFromQuery(query: string | undefined): PatientFormInitialValues | undefined {
  const text = (query || "").trim();
  if (!text) return undefined;
  const digits = text.replace(/\D/g, "");
  if (/^[\d\s()+-]+$/.test(text)) {
    if (digits.length === 11 && !digits.startsWith("0")) return { tcNo: digits };
    if (digits.length >= 10) return { phone: normalizeLocalPhone(digits, "+90"), phoneCountryCode: "+90" };
    return undefined;
  }
  return { fullName: text };
}

export type AppointmentFormSaved = {
  appointment: Appointment;
  /** Kullanıcıya gösterilecek kısa sonuç (ör. mesaj gönderim durumu). */
  message: string;
  tone: "success" | "info" | "error";
};

type AppointmentFormModalProps = {
  mode: "create" | "edit";
  appointment?: Appointment | null;
  initial?: AppointmentFormInitial;
  source?: AppointmentSource | null;
  settings: CalendarSettings | null;
  doctors: CalendarDoctor[];
  treatments: TreatmentOption[];
  clinicUnits: ClinicUnit[];
  slotInterval: number;
  canSeePhone: boolean;
  onClose: () => void;
  onSaved: (result: AppointmentFormSaved) => void;
};

/**
 * Randevu formu — TEK form: "Yeni randevu" düğmesi, takvimde boş saat, üst
 * bardaki "Yeni > Randevu", hasta dosyasından gelen bağlantı, online talep ve
 * bekleme listesi aynı formu açar.
 *
 * Sıra işin sırasıdır: hasta → doktor → gün → saat → süre ve tedavi → not;
 * seyrek alan (tedavi alanı) "Diğer seçenekler" altında, hastaya mesaj tek
 * satırda. Önceden saat 30-40 seçenekli bir açılır listeden diğer hastaların
 * adları okunarak seçiliyordu, SMS anahtarları kurum varsayılanını yok
 * sayıyordu ve beş ayrı elle yazılmış uyarı kutusu aynı anda görünebiliyordu.
 */
export function AppointmentFormModal({
  mode,
  appointment,
  initial,
  source,
  settings,
  doctors,
  treatments,
  clinicUnits,
  slotInterval,
  canSeePhone,
  onClose,
  onSaved,
}: AppointmentFormModalProps) {
  const isEdit = mode === "edit" && Boolean(appointment);
  const { hasFeature } = usePermissions();
  const todayKey = toDateKey(new Date());
  const parsedNote = useMemo(() => (appointment ? parseNoteFull(appointment.note, treatments) : null), [appointment, treatments]);

  const [patient, setPatient] = useState<PickedPatient | null>(() => {
    if (appointment?.patient) {
      return { id: appointment.patient.id, fullName: appointment.patient.fullName, phone: appointment.patient.phone || null, tcNo: appointment.patient.tcNo || null };
    }
    return initial?.patient || null;
  });
  const [doctorId, setDoctorId] = useState(() => appointment?.doctor?.id || initial?.doctorId || (doctors.length === 1 ? doctors[0].id : ""));
  // Hasta seçilince boş doktor alanına hastanın hekimi önerilir (aşağıda);
  // kullanıcı doktoru kendisi seçtiyse öneri hiç uygulanmaz.
  const [suggestedDoctorId, setSuggestedDoctorId] = useState<string | null>(null);
  const doctorTouchedRef = useRef(false);
  const [dateKey, setDateKey] = useState(() => (appointment ? toDateKey(new Date(appointment.startAt)) : initial?.dateKey || todayKey));
  const [minutes, setMinutes] = useState<number | null>(() => (appointment ? minutesOfDay(new Date(appointment.startAt)) : initial?.minutes ?? null));
  const [durationMin, setDurationMin] = useState(() => {
    if (appointment) return durationBetween(appointment.startAt, appointment.endAt) || slotInterval;
    return initial?.durationMin || slotInterval;
  });
  const [treatment, setTreatment] = useState(() => parsedNote?.treatment || initial?.treatment || defaultTreatmentKey(treatments));
  const [clinicUnitId, setClinicUnitId] = useState(() => appointment?.clinicUnit?.id || "");
  const [note, setNote] = useState(() => parsedNote?.detail ?? initial?.note ?? "");
  // Hastaya mesaj seçimleri kurumun varsayılanıyla gelir (İletişim › Otomatik
  // mesajlar); önceden her açılışta sabit "bilgi açık, hatırlatma kapalı" idi.
  const [smsInfo, setSmsInfo] = useState(() => settings?.sms.info ?? true);
  const [smsReminder, setSmsReminder] = useState(() => settings?.sms.reminder ?? false);
  const smsTouchedRef = useRef(false);

  const [dayAppointments, setDayAppointments] = useState<Appointment[]>([]);
  const [dayBlocks, setDayBlocks] = useState<DoctorBlock[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [newPatientInitial, setNewPatientInitial] = useState<PatientFormInitialValues | undefined>(undefined);
  const [sourceMatchState, setSourceMatchState] = useState<"idle" | "searching" | "found" | "missing">("idle");
  const [patientContext, setPatientContext] = useState<PatientContext | null>(null);
  // Hasta, gün ve saat düğme/arama ile seçildiği için pencerenin otomatik
  // "değişti" algısı bunları görmüyordu: seçim yapılmış form Esc ile sormadan
  // kapanıyordu. Yalnız kullanıcının seçimi sayılır (otomatik ilk boş saat değil).
  const [userTouched, setUserTouched] = useState(false);
  // Takvimde tıklanan saat kullanıcı seçimidir; online talep/bekleme listesindeki
  // saat ise yalnız tercihtir (o saatten sonraki ilk boş saat seçilir).
  const userPickedTimeRef = useRef(Boolean(appointment) || (initial?.minutes !== undefined && initial?.minutes !== null && !source));
  const sourceSearchedRef = useRef(false);

  // Ayarlar form açıldıktan sonra gelirse varsayılanlar o zaman uygulanır
  // (kullanıcı kutulara dokunmadıysa).
  useEffect(() => {
    if (!settings || smsTouchedRef.current) return;
    setSmsInfo(settings.sms.info);
    setSmsReminder(settings.sms.reminder);
  }, [settings]);

  // Online talepte kayıtlı hasta sunucuda (TC ya da telefonla) aranır; bulunursa
  // seçili gelir. Telefon görme yetkisi olmayan rollerde de çalışır (denetim G7).
  useEffect(() => {
    if (source?.type !== "online" || patient || sourceSearchedRef.current) return;
    sourceSearchedRef.current = true;
    const controller = new AbortController();
    let finished = false;
    setSourceMatchState("searching");
    fetchBookingRequestMatch(source.request.id, controller.signal)
      .then((match) => {
        if (controller.signal.aborted) return;
        finished = true;
        if (match) {
          setPatient({ id: match.id, fullName: match.fullName });
          setSourceMatchState("found");
        } else {
          setSourceMatchState("missing");
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        finished = true;
        setSourceMatchState("missing");
      });
    return () => {
      controller.abort();
      // Arama bitmeden kapandıysa (ör. geliştirme modunda çift çalıştırma) yeniden denensin.
      if (!finished) sourceSearchedRef.current = false;
    };
  }, [source, patient]);

  // Seçili hastanın bağlamı: mesaj gider mi, yaklaşan randevusu, bulaşıcı hastalık.
  const patientId = patient?.id || "";
  useEffect(() => {
    setPatientContext(null);
    if (!patientId) return;
    const controller = new AbortController();
    fetchPatientContext(patientId, appointment?.id, controller.signal)
      .then((context) => { if (!controller.signal.aborted) setPatientContext(context); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [patientId, appointment?.id]);

  // Hekim önerisi: son tamamlanan randevunun hekimi, yoksa yaklaşan randevunun
  // hekimi. Yalnız yeni randevuda ve doktor boşken (ya da önceki hastaya
  // önerilmiş olarak duruyorken) uygulanır; asistan her randevuda hekimi elle
  // seçmek zorunda kalıyordu.
  useEffect(() => {
    if (isEdit || !patientContext || doctorTouchedRef.current) return;
    if (doctorId && doctorId !== suggestedDoctorId) return;
    const candidate = [patientContext.lastAppointmentDoctorId, patientContext.nextAppointment?.doctorId]
      .find((id): id is string => Boolean(id) && doctors.some((doctor) => doctor.id === id));
    if (candidate) {
      if (candidate !== doctorId) setDoctorId(candidate);
      setSuggestedDoctorId(candidate);
    } else if (suggestedDoctorId) {
      setDoctorId(initial?.doctorId || (doctors.length === 1 ? doctors[0].id : ""));
      setSuggestedDoctorId(null);
    }
  }, [patientContext, doctors, isEdit, doctorId, suggestedDoctorId, initial?.doctorId]);

  // Seçili doktorun o günkü randevuları ve kapalı zamanları — takvimde başka
  // bir gün açıkken de saatler doğru gösterilsin.
  useEffect(() => {
    if (!doctorId || !dateKey) { setDayAppointments([]); setDayBlocks([]); return; }
    const controller = new AbortController();
    setDayLoading(true);
    setDayError(null);
    const timer = window.setTimeout(async () => {
      try {
        const [appts, blocksResponse] = await Promise.all([
          fetchDayAppointments(dateKey, doctorId, controller.signal),
          fetch(`/api/doctor-blocks?doctorId=${encodeURIComponent(doctorId)}&date=${dateKey}`, { cache: "no-store", signal: controller.signal }),
        ]);
        const blocks = await blocksResponse.json().catch(() => null);
        if (controller.signal.aborted) return;
        setDayAppointments(appts);
        setDayBlocks(blocksResponse.ok && Array.isArray(blocks) ? blocks : []);
        if (!blocksResponse.ok) setDayError("Doktorun kapalı zamanları yüklenemedi; kayıt sırasında yine denetlenir.");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setDayAppointments([]);
        setDayBlocks([]);
        setDayError(loadError instanceof Error ? `${loadError.message} Uygunluk kayıt sırasında denetlenir.` : "Doktorun programı yüklenemedi.");
      } finally {
        if (!controller.signal.aborted) setDayLoading(false);
      }
    }, 150);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [doctorId, dateKey]);

  const selectedDoctor = doctors.find((doctor) => doctor.id === doctorId) || null;
  const dayDate = useMemo(() => fromDateKey(dateKey), [dateKey]);
  const dayHours = useMemo(() => (dayDate && settings ? getDayHours(settings.dailySchedules, dayDate, settings.openingTime, settings.closingTime) : null), [dayDate, settings]);
  const isPastDay = Boolean(dateKey) && dateKey < todayKey;

  // Dolu saatlerde hasta adı tutulmaz: saat düğmeleri yalnız "dolu" der.
  const busyItems = useMemo(() => {
    const items: Array<{ start: number; end: number; label: string }> = [];
    for (const item of dayAppointments) {
      if (item.id === appointment?.id) continue;
      if (item.status === "IPTAL" || item.status === "GELMEDI") continue;
      if (doctorId && item.doctor?.id && item.doctor.id !== doctorId) continue;
      const start = minutesOfDay(new Date(item.startAt));
      items.push({ start, end: start + durationBetween(item.startAt, item.endAt), label: "dolu" });
    }
    for (const block of dayBlocks) {
      if (doctorId && block.doctorId && block.doctorId !== doctorId) continue;
      const start = parseClock(block.startTime);
      const end = parseClock(block.endTime);
      if (start === null || end === null) continue;
      items.push({ start, end, label: `kapalı${block.reason ? ` (${block.reason})` : ""}` });
    }
    const workStart = parseClock(selectedDoctor?.profile?.workStart || "");
    const workEnd = parseClock(selectedDoctor?.profile?.workEnd || "");
    if (workStart !== null && dayHours && workStart > dayHours.open) items.push({ start: 0, end: workStart, label: "doktorun mesaisi dışında" });
    if (workEnd !== null && dayHours && workEnd < dayHours.close) items.push({ start: workEnd, end: 24 * 60, label: "doktorun mesaisi dışında" });
    return items;
  }, [dayAppointments, dayBlocks, appointment?.id, doctorId, selectedDoctor, dayHours]);

  const slotOptions = useMemo<SlotOption[]>(() => {
    if (!dayHours || dayHours.isHoliday) return [];
    const options = buildSlotOptions({ dateKey, hours: dayHours, interval: slotInterval, durationMin, busy: busyItems });
    if (isPastDay) return options.map((option) => ({ ...option, busyReason: "geçti" }));
    // Mevcut randevu ızgaraya uymayan bir saatteyse (ör. 15:37) seçenek olarak korunur.
    if (minutes !== null && !options.some((option) => option.minutes === minutes)) {
      options.push({ minutes, label: timeLabel(minutes), busyReason: isEdit ? null : "ızgara dışı" });
      options.sort((a, b) => a.minutes - b.minutes);
    }
    if (isEdit && appointment) {
      const original = minutesOfDay(new Date(appointment.startAt));
      const originalKey = toDateKey(new Date(appointment.startAt));
      return options.map((option) => (originalKey === dateKey && option.minutes === original ? { ...option, busyReason: null } : option));
    }
    return options;
  }, [dayHours, dateKey, slotInterval, durationMin, busyItems, isPastDay, minutes, isEdit, appointment]);

  // Saat seçilmediyse (ya da seçilen saat bu gün için geçersizse) ilk boş saat.
  useEffect(() => {
    if (slotOptions.length === 0 || dayLoading) return;
    const current = slotOptions.find((option) => option.minutes === minutes);
    if (minutes !== null && current) {
      // Kullanıcının kendi seçtiği saat korunur (uyarı ayrıca gösterilir).
      if (userPickedTimeRef.current) return;
      if (!current.busyReason) return;
    }
    const now = new Date();
    const from = minutes ?? (dateKey === toDateKey(now) ? minutesOfDay(now) : null);
    const next = firstFreeSlot(slotOptions, from);
    if (next !== null && next !== minutes) setMinutes(next);
  }, [slotOptions, dayLoading, minutes, dateKey]);

  const selectedOption = slotOptions.find((option) => option.minutes === minutes);
  const selectedKind = selectedOption ? slotKind(selectedOption) : null;

  const durationOptions = useMemo(() => {
    const list = [1, 2, 3, 4, 6, 8].map((multiplier) => multiplier * slotInterval).filter((value) => value <= 240);
    if (!list.includes(durationMin)) list.push(durationMin);
    return Array.from(new Set(list)).sort((a, b) => a - b);
  }, [slotInterval, durationMin]);

  const activeUnits = clinicUnits.filter((unit) => unit.isActive || unit.id === clinicUnitId);

  const dayProblem = !dateKey
    ? "Tarih seçin."
    : !settings
      ? null
      : dayHours?.isHoliday
        ? "Klinik bu gün kapalı. Başka bir gün seçin."
        : isPastDay && !isEdit
          ? "Geçmiş bir güne randevu verilemez."
          : null;

  // Kesin engel: kapalı zaman, öğle arası, mesai dışı, geçmiş saat (sunucu da reddeder).
  const blockingReason = selectedOption && selectedOption.busyReason && selectedKind !== "busy" && !isEdit
    ? `Seçilen saat uygun değil: ${selectedOption.busyReason}.`
    : null;
  const softConflict = selectedKind === "busy";

  // Hızlı günler: yeni randevuda bugün + sonraki açık günler; "sonraki
  // randevu"da kontrol aralıkları. Tarih alanı her zaman görünür.
  const quickDates = useMemo<QuickDateOption[]>(() => {
    if (initial?.quickDates === "sonraki") {
      return [
        { label: "1 hafta sonra", days: 7 },
        { label: "2 hafta sonra", days: 14 },
        { label: "1 ay sonra", days: 30 },
      ];
    }
    if (!settings) return [{ label: "Bugün", days: 0 }, { label: "Yarın", days: 1 }];
    const today = turkeyDateKey();
    return openDayKeys(settings.dailySchedules, today, 5).map((key) => ({ label: quickDayLabel(key, today), date: key }));
  }, [initial?.quickDates, settings]);

  const preferredDoctorName = source?.type === "online" ? source.request.doctor?.fullName : source?.type === "waitlist" ? source.entry.doctor?.fullName : null;
  const preferredDoctorId = source?.type === "online" ? source.request.doctor?.id : source?.type === "waitlist" ? source.entry.doctor?.id : null;
  const notifyAvailable = settings ? settings.sms.enabled || hasFeature("whatsapp") : true;

  const save = async () => {
    setError(null);
    if (!patient) { setError("Hasta seçin. Listede yoksa “Yeni hasta” ile kaydedin."); return; }
    if (!doctorId) { setError("Doktor seçin."); return; }
    if (dayProblem) { setError(dayProblem); return; }
    if (minutes === null) { setError("Saat seçin."); return; }
    if (blockingReason) { setError(blockingReason); return; }
    const start = dateAtMinutes(dateKey, minutes);
    if (!start) { setError("Tarih veya saat geçersiz."); return; }
    const end = new Date(start.getTime() + durationMin * 60_000);
    const meta = treatments.find((item) => item.value === treatment);
    const color = meta?.color && /^#[0-9a-fA-F]{6}$/.test(meta.color) ? meta.color : "#2a9d8f";

    // Saat değişmediyse sunucuya orijinal değer gider (sunucu "taşındı mı" diye karşılaştırır).
    const sameTime = isEdit && appointment
      && new Date(appointment.startAt).getTime() === start.getTime()
      && new Date(appointment.endAt).getTime() === end.getTime();

    setSaving(true);
    // Düzenlemede durum gönderilmez: sunucu mevcut durumu korur (arada
    // işaretlenen "Geldi" ya da "Planlandı'ya geri al" geri yazılmasın).
    const result = isEdit && appointment
      ? await saveAppointment(`/api/appointments/${appointment.id}`, "PUT", {
          patientId: patient.id,
          doctorId,
          clinicUnitId: clinicUnitId || null,
          startAt: sameTime ? appointment.startAt : start.toISOString(),
          endAt: sameTime ? appointment.endAt : end.toISOString(),
          type: appointment.type || "STANDART",
          colorCode: color,
          note: buildNoteSafe(parsedNote?.followUp || "YOK", note, treatment),
        })
      : await saveAppointment("/api/appointments", "POST", {
          patientId: patient.id,
          doctorId,
          clinicUnitId: clinicUnitId || null,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          type: "STANDART",
          colorCode: color,
          note: buildNoteSafe("YOK", note, treatment),
          smsInfo,
          smsReminder,
          // Değerlendirme mesajı randevu oluşturulurken otomatik gönderilmiyor
          // (İletişim > Toplu gönderim'den gönderilir); formda vaat edilmez.
          smsSurvey: false,
        });
    setSaving(false);

    if (!result.ok) {
      if (result.message) setError(result.message);
      return;
    }

    // Bilgi mesajı gitmediyse nedeni söylenir (önceden yalnız "gönderildi" ve
    // "gönderilemedi" yazıyordu; izin yokken sessiz kalıyordu — canlı test H5).
    const sms = result.data.smsStatus;
    let tone: AppointmentFormSaved["tone"] = "success";
    let smsText = "";
    // Kurumda SMS kapalı ve WhatsApp yoksa "Hastaya mesaj" satırı hiç
    // gösterilmez; her kayıtta "mesaj gitmedi" bildirimi de çıkmaz (gürültü).
    if (!isEdit && sms && smsInfo && notifyAvailable) {
      if (sms.info === "sent") smsText = sms.infoMessage;
      else if (sms.info === "failed") { smsText = `Bilgi mesajı gönderilemedi: ${sms.infoMessage}`; tone = "error"; }
      else if (sms.info === "skipped") { smsText = `Bilgi mesajı gitmedi: ${sms.infoMessage}`; tone = "info"; }
    }
    onSaved({
      appointment: result.data,
      message: [`${patient.fullName} · ${formatDayShort(start)} ${timeLabel(minutes)}`, smsText].filter(Boolean).join(" — "),
      tone,
    });
  };

  // Yeni hasta: online talepte talep sahibinin bilgileri, aksi halde aramaya
  // yazılan metin forma taşınır (aynı bilgi ikinci kez yazılmaz).
  const openNewPatient = (query?: string) => {
    if (source?.type === "online") {
      const request = source.request;
      const phone = request.phone ? normalizeLocalPhone(request.phone, "+90") : "";
      setNewPatientInitial({
        fullName: request.fullName,
        ...(phone ? { phone, phoneCountryCode: "+90" } : {}),
        ...(request.tcNo && /^\d{11}$/.test(request.tcNo) ? { tcNo: request.tcNo } : {}),
      });
    } else {
      setNewPatientInitial(initialFromQuery(query));
    }
    setShowNewPatient(true);
  };

  // Hasta aramasında Enter formu göndermesin (sonuç seçilmemişse "Hasta seçin" hatası çıkıyordu).
  const keepSearchEnter = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && (event.target as HTMLElement).getAttribute("role") === "combobox") event.preventDefault();
  };

  // Talebin notu Not alanına aktarıldığı için burada tekrar yazılmaz; yeni
  // hasta kaydı Hasta alanının yanındaki "Yeni hasta" düğmesiyle (tek yol).
  const sourceCallout = source?.type === "online" ? (
    <Callout tone="info" icon={Globe2} title={`Online talep: ${source.request.fullName}`}>
      {[
        canSeePhone && source.request.phone ? formatPhoneDisplay(source.request.phone) : "",
        (() => {
          const day = fromDateKey(preferredDateKeyOf(source.request.preferredFrom));
          return day ? `Tercih: ${formatDayShort(day)} · ${preferredPeriodLabel(preferredMinutesOf(source.request.preferredFrom))}` : "";
        })(),
      ].filter(Boolean).join(" · ")}
      {sourceMatchState === "searching" && <span className="block text-xs opacity-80">Kayıtlı hasta aranıyor…</span>}
      {sourceMatchState === "found" && patient && <span className="block text-xs opacity-80">Kayıtlı hasta bulundu: {patient.fullName}</span>}
      {sourceMatchState === "missing" && !patient && <span className="block text-xs opacity-80">Bu bilgilerle kayıtlı hasta bulunamadı; “Yeni hasta” ile kaydedin.</span>}
    </Callout>
  ) : source?.type === "waitlist" ? (
    <Callout tone="neutral" icon={ListChecks} title={`Bekleme listesinden: ${source.entry.patient.fullName}`}>
      {source.entry.note ? source.entry.note.split("\n")[0] : undefined}
    </Callout>
  ) : null;

  // Saat seçilemiyorsa nedeni saat alanının yerinde yazar (doktor yok, kapalı
  // ya da geçmiş gün); saat bölümünde aynı anda tek uyarı görünür.
  const slotBlockedMessage = !doctorId
    ? "Önce doktor seçin; boş saatler doktorun programına göre listelenir."
    : dayProblem && settings
      ? dayProblem
      : null;
  const slotCallout = slotBlockedMessage ? null : blockingReason ? (
    <Callout tone="critical" compact>{blockingReason}</Callout>
  ) : softConflict ? (
    <Callout tone="warning" compact>Bu saatte doktorun başka randevusu var; kaydederseniz onayınız istenir.</Callout>
  ) : dayError ? (
    <Callout tone="warning" compact>{dayError}</Callout>
  ) : null;

  const nextAppt = patientContext?.nextAppointment;

  return (
    <>
      <FormModal
        open
        module="calendar"
        onClose={onClose}
        size="lg"
        title={isEdit ? "Randevuyu düzenle" : "Yeni randevu"}
        description={isEdit && appointment
          ? `${appointment.patient?.fullName || "Hasta"} · şu an ${formatDayShort(new Date(appointment.startAt))} ${formatClock(appointment.startAt)} · ${appointment.doctor?.fullName || ""}`
          : undefined}
        onSubmit={() => save()}
        submitting={saving}
        submitDisabled={!settings}
        error={error}
        isDirty={userTouched}
      >
        {sourceCallout}

        <FormField label="Hasta" required as="div" htmlFor="appt-patient">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start" onKeyDown={keepSearchEnter}>
            <div className="min-w-0 flex-1">
              <PatientPicker
                id="appt-patient"
                required
                value={patient}
                onChange={(next) => { setPatient(next); setUserTouched(true); setError(null); }}
                onCreateNew={(query) => openNewPatient(query)}
              />
            </div>
            {!patient && (
              <Button variant="secondary" icon={UserPlus} onClick={() => openNewPatient()} className="shrink-0">Yeni hasta</Button>
            )}
          </div>
        </FormField>
        {patient && patientContext?.contagious && (
          <Callout tone="critical" compact title="Bulaşıcı hastalık">{patientContext.contagious.note || "Hasta kartında işaretli."}</Callout>
        )}
        {patient && nextAppt && (
          <p className="-mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Yaklaşan randevusu: {formatDayShort(new Date(nextAppt.startAt))} {formatClock(nextAppt.startAt)}{nextAppt.doctorName ? ` · ${nextAppt.doctorName}` : ""}
          </p>
        )}

        <FormField
          label="Doktor"
          required
          htmlFor="appt-doctor"
          className="sm:max-w-sm"
          hint={preferredDoctorName && preferredDoctorId && preferredDoctorId !== doctorId
            ? `Hastanın tercihi: ${preferredDoctorName}`
            : suggestedDoctorId && suggestedDoctorId === doctorId ? "Hastanın kendi hekimi önerildi; değiştirebilirsiniz." : undefined}
        >
          <DoctorSelect id="appt-doctor" value={doctorId} doctors={doctors} onChange={(id) => { doctorTouchedRef.current = true; setDoctorId(id); setError(null); }} />
        </FormField>

        <QuickDatePicker
          label="Tarih"
          required
          id="appt-date"
          value={dateKey}
          options={quickDates}
          min={isEdit ? undefined : todayKey}
          onChange={(next) => { if (!next) return; setDateKey(next); setUserTouched(true); userPickedTimeRef.current = false; setError(null); }}
        />

        <div className="space-y-2">
          <SlotPicker
            label="Saat"
            required
            options={slotOptions}
            value={minutes}
            durationMin={durationMin}
            loading={dayLoading}
            blockedMessage={slotBlockedMessage}
            onChange={(next) => { setMinutes(next); setUserTouched(true); userPickedTimeRef.current = true; setError(null); }}
          />
          {slotCallout}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Süre" htmlFor="appt-duration">
            <Select id="appt-duration" value={durationMin} onChange={(event) => setDurationMin(Number(event.target.value))}>
              {durationOptions.map((value) => <option key={value} value={value}>{value} dakika</option>)}
            </Select>
          </FormField>
          <FormField label="Tedavi" htmlFor="appt-treatment">
            <Select id="appt-treatment" value={treatment} onChange={(event) => setTreatment(event.target.value)}>
              {!treatments.some((item) => item.value === treatment) && <option value={treatment}>{treatment}</option>}
              {treatments.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </Select>
          </FormField>
        </div>

        <FormField label="Not" htmlFor="appt-note">
          <Textarea id="appt-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ör. 36 numaralı diş, kanal tedavisi 2. seans" />
        </FormField>

        {activeUnits.length > 0 && (
          <Disclosure
            title="Diğer seçenekler"
            summary={clinicUnitId ? `Tedavi alanı: ${activeUnits.find((unit) => unit.id === clinicUnitId)?.name || ""}` : "Tedavi alanı"}
            defaultOpen={Boolean(clinicUnitId)}
          >
            <FormField label="Tedavi alanı" htmlFor="appt-unit" hint="Koltuk/oda çakışması kayıtta denetlenir.">
              <Select id="appt-unit" value={clinicUnitId} onChange={(event) => setClinicUnitId(event.target.value)}>
                <option value="">Seçilmedi</option>
                {activeUnits.map((unit) => (
                  <option key={unit.id} value={unit.id} disabled={!unit.isActive}>
                    {unit.name}{unit.code ? ` · ${unit.code}` : ""}{!unit.isActive ? " (arşivde)" : ""}
                  </option>
                ))}
              </Select>
            </FormField>
          </Disclosure>
        )}

        {!isEdit && notifyAvailable && (
          <FormField label="Hastaya mesaj" as="div">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Checkbox
                label="Bilgilendirme"
                checked={smsInfo}
                onChange={(checked) => { smsTouchedRef.current = true; setSmsInfo(checked); }}
              />
              <Checkbox
                label="Hatırlatma"
                checked={smsReminder}
                onChange={(checked) => { smsTouchedRef.current = true; setSmsReminder(checked); }}
              />
            </div>
            {patientContext && !patientContext.notify.canNotify && (smsInfo || smsReminder) ? (
              <p className="mt-1.5 text-xs font-medium text-amber-700" role="status">{patientContext.notify.reason}</p>
            ) : (
              <p className="mt-1.5 text-xs text-slate-500">Bilgilendirme açıksa saat değişince ve iptalde de mesaj gider.</p>
            )}
          </FormField>
        )}
      </FormModal>

      {showNewPatient && (
        <PatientFormModal
          open
          initialValues={newPatientInitial}
          onClose={() => setShowNewPatient(false)}
          onSaved={(created) => {
            const full = created as PickedPatient;
            setPatient({ id: full.id, fullName: full.fullName, phone: full.phone || null, tcNo: full.tcNo || null });
            setUserTouched(true);
            // Yeni kayıt: "kayıtlı hasta bulundu" yazısı çıkmasın.
            setSourceMatchState("idle");
            setShowNewPatient(false);
          }}
          // Mükerrer kayıt uyarısında "Bu hastayı seç": var olan hasta randevu formuna seçilir.
          onPickExisting={(existing) => {
            setPatient({ id: existing.id, fullName: existing.fullName });
            setUserTouched(true);
            setSourceMatchState("found");
            setShowNewPatient(false);
          }}
        />
      )}
    </>
  );
}
