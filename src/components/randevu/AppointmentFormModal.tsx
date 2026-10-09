"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, Globe2, ListChecks, UserPlus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { PatientPicker, type PickedPatient } from "@/components/patient/PatientPicker";
import { PatientFormModal } from "@/components/patient/PatientFormModal";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import type { TreatmentOption } from "@/lib/appointment-follow-up";
import { fetchDayAppointments, saveAppointment } from "@/components/randevu/appointment-api";
import {
  buildNoteSafe,
  buildSlotOptions,
  dateAtMinutes,
  defaultTreatmentKey,
  durationMinutes as durationBetween,
  firstFreeSlot,
  formatDayShort,
  formatPhoneDisplay,
  formatTimeRange,
  fromDateKey,
  getDayHours,
  minutesOfDay,
  parseClock,
  parseNoteFull,
  preferredDateKeyOf,
  preferredMinutesOf,
  preferredPeriodLabel,
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
};

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

/** Saat seçeneklerinden hangileri sunucunun kesin olarak reddettiği saatler. */
function isHardBlocked(option: SlotOption | undefined) {
  if (!option?.busyReason) return false;
  return !option.busyReason.startsWith("dolu");
}

function phoneDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

/**
 * Randevu formu — TEK form: "Yeni randevu" düğmesi, takvimde boş saat, üst
 * bardaki "Yeni > Randevu", hasta dosyasından gelen bağlantı, online talep ve
 * bekleme listesi aynı formu açar. Önceden her giriş aynı formu farklı
 * varsayılanlarla dolduruyordu: online talep 03:00 ile açılıyor, saat
 * ızgaraya uymuyor, listede olmayan tedavi sessizce "Implant" kaydediliyordu.
 * Saat artık seçili doktorun o günkü programına göre listeden seçilir; dolu,
 * kapalı ve geçmiş saatler listede açıkça yazar.
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
  const todayKey = toDateKey(new Date());
  const parsedNote = useMemo(() => (appointment ? parseNoteFull(appointment.note, treatments) : null), [appointment, treatments]);

  const [patient, setPatient] = useState<PickedPatient | null>(() => {
    if (appointment?.patient) {
      return { id: appointment.patient.id, fullName: appointment.patient.fullName, phone: appointment.patient.phone || null, tcNo: appointment.patient.tcNo || null };
    }
    return initial?.patient || null;
  });
  const [doctorId, setDoctorId] = useState(() => appointment?.doctor?.id || initial?.doctorId || (doctors.length === 1 ? doctors[0].id : ""));
  const [dateKey, setDateKey] = useState(() => (appointment ? toDateKey(new Date(appointment.startAt)) : initial?.dateKey || todayKey));
  const [minutes, setMinutes] = useState<number | null>(() => (appointment ? minutesOfDay(new Date(appointment.startAt)) : initial?.minutes ?? null));
  const [durationMin, setDurationMin] = useState(() => {
    if (appointment) return durationBetween(appointment.startAt, appointment.endAt) || slotInterval;
    return initial?.durationMin || slotInterval;
  });
  const [treatment, setTreatment] = useState(() => parsedNote?.treatment || initial?.treatment || defaultTreatmentKey(treatments));
  const [clinicUnitId, setClinicUnitId] = useState(() => appointment?.clinicUnit?.id || "");
  const [note, setNote] = useState(() => parsedNote?.detail ?? initial?.note ?? "");
  const [smsInfo, setSmsInfo] = useState(true);
  const [smsReminder, setSmsReminder] = useState(false);

  const [dayAppointments, setDayAppointments] = useState<Appointment[]>([]);
  const [dayBlocks, setDayBlocks] = useState<DoctorBlock[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [sourceMatchState, setSourceMatchState] = useState<"idle" | "searching" | "found" | "missing">("idle");
  // Takvimde tıklanan saat kullanıcı seçimidir; online talep/bekleme listesindeki
  // saat ise yalnız tercihtir (o saatten sonraki ilk boş saat seçilir).
  const userPickedTimeRef = useRef(Boolean(appointment) || (initial?.minutes !== undefined && initial?.minutes !== null && !source));
  const sourceSearchedRef = useRef(false);

  // Online talepte hasta önce talepteki TC/telefonla otomatik aranır; bulunursa
  // seçili gelir. Bulunamazsa "Yeni hasta olarak kaydet" yolu açıkça gösterilir.
  useEffect(() => {
    if (source?.type !== "online" || patient || sourceSearchedRef.current) return;
    sourceSearchedRef.current = true;
    const request = source.request;
    const term = request.tcNo || phoneDigits(request.phone);
    if (!term || term.length < 4) { setSourceMatchState("missing"); return; }
    const controller = new AbortController();
    setSourceMatchState("searching");
    fetch(`/api/patients?q=${encodeURIComponent(term)}&take=5&summary=false`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        const list: PickedPatient[] = Array.isArray(data?.patients) ? data.patients : [];
        const match = list.find((item) => (request.tcNo && item.tcNo === request.tcNo) || (phoneDigits(item.phone).length === 10 && phoneDigits(item.phone) === phoneDigits(request.phone)));
        if (controller.signal.aborted) return;
        if (match) {
          setPatient({ id: match.id, fullName: match.fullName, phone: match.phone || null, tcNo: match.tcNo || null });
          setSourceMatchState("found");
        } else {
          setSourceMatchState("missing");
        }
      })
      .catch(() => { if (!controller.signal.aborted) setSourceMatchState("missing"); });
    return () => controller.abort();
  }, [source, patient]);

  // Seçili doktorun o günkü randevuları ve kapalı zamanları — takvimde başka
  // bir gün açıkken de çakışma doğru gösterilsin (önceden yalnız ekrandaki
  // aralığa bakılıyordu).
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
        if (!blocksResponse.ok) setDayError("Doktorun kapalı zamanları yüklenemedi; kayıt sırasında yine kontrol edilir.");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setDayAppointments([]);
        setDayBlocks([]);
        setDayError(loadError instanceof Error ? `${loadError.message} Çakışma kayıt sırasında kontrol edilir.` : "Doktorun programı yüklenemedi.");
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

  const busyItems = useMemo(() => {
    const items: Array<{ start: number; end: number; label: string }> = [];
    for (const item of dayAppointments) {
      if (item.id === appointment?.id) continue;
      if (item.status === "IPTAL" || item.status === "GELMEDI") continue;
      if (doctorId && item.doctor?.id && item.doctor.id !== doctorId) continue;
      const start = minutesOfDay(new Date(item.startAt));
      items.push({ start, end: start + durationBetween(item.startAt, item.endAt), label: `dolu: ${item.patient?.fullName || "randevu"}` });
    }
    for (const block of dayBlocks) {
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
      // Kullanıcının kendi seçtiği saat korunur (uyarılar ayrıca gösterilir).
      if (userPickedTimeRef.current) return;
      if (!current.busyReason) return;
    }
    const now = new Date();
    const from = minutes ?? (dateKey === toDateKey(now) ? minutesOfDay(now) : null);
    const next = firstFreeSlot(slotOptions, from);
    if (next !== null && next !== minutes) setMinutes(next);
  }, [slotOptions, dayLoading, minutes, dateKey]);

  const selectedOption = slotOptions.find((option) => option.minutes === minutes);
  const selectedStart = minutes === null ? null : dateAtMinutes(dateKey, minutes);
  const softConflict = selectedOption?.busyReason?.startsWith("dolu") ? selectedOption.busyReason.replace(/^dolu: /, "") : null;
  const nearbyFree = useMemo(() => {
    if (!softConflict || minutes === null) return [] as SlotOption[];
    return slotOptions
      .filter((option) => !option.busyReason)
      .sort((a, b) => Math.abs(a.minutes - minutes) - Math.abs(b.minutes - minutes))
      .slice(0, 4)
      .sort((a, b) => a.minutes - b.minutes);
  }, [softConflict, minutes, slotOptions]);

  const durationOptions = useMemo(() => {
    const list = [1, 2, 3, 4, 6, 8].map((multiplier) => multiplier * slotInterval).filter((value) => value <= 240);
    if (!list.includes(durationMin)) list.push(durationMin);
    return Array.from(new Set(list)).sort((a, b) => a - b);
  }, [slotInterval, durationMin]);

  const activeUnits = clinicUnits.filter((unit) => unit.isActive || unit.id === clinicUnitId);
  const freeCount = slotOptions.filter((option) => !option.busyReason).length;
  const doctorDayCount = dayAppointments.filter((item) => item.status !== "IPTAL" && item.id !== appointment?.id).length;

  const dayProblem = !dateKey
    ? "Tarih seçin."
    : !settings
      ? null
      : dayHours?.isHoliday
        ? "Klinik bu gün kapalı. Başka bir gün seçin."
        : isPastDay && !isEdit
          ? "Geçmiş bir güne randevu verilemez."
          : null;

  const blockingReason = selectedOption && isHardBlocked(selectedOption) && !isEdit
    ? `Seçilen saat uygun değil: ${selectedOption.busyReason}.`
    : null;

  const preferredDoctorName = source?.type === "online" ? source.request.doctor?.fullName : source?.type === "waitlist" ? source.entry.doctor?.fullName : null;
  const preferredDoctorId = source?.type === "online" ? source.request.doctor?.id : source?.type === "waitlist" ? source.entry.doctor?.id : null;

  const save = async () => {
    setError(null);
    if (!patient) { setError("Hasta seçin. Listede yoksa “Yeni hasta ekle” ile kaydedin."); return; }
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
    const result = isEdit && appointment
      ? await saveAppointment(`/api/appointments/${appointment.id}`, "PUT", {
          patientId: patient.id,
          doctorId,
          clinicUnitId: clinicUnitId || null,
          startAt: sameTime ? appointment.startAt : start.toISOString(),
          endAt: sameTime ? appointment.endAt : end.toISOString(),
          type: appointment.type || "STANDART",
          status: appointment.status,
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

    const sms = result.data.smsStatus;
    const smsText = !isEdit && sms
      ? [sms.info === "sent" ? sms.infoMessage : sms.info === "failed" ? `Bilgi mesajı gönderilemedi: ${sms.infoMessage}` : "", sms.reminder === "scheduled" ? "Hatırlatma bir gün önce gönderilecek." : ""].filter(Boolean).join(" ")
      : "";
    const when = `${formatDayShort(start)} ${timeLabel(minutes)}`;
    onSaved({
      appointment: result.data,
      message: [`${patient.fullName} · ${when}`, smsText].filter(Boolean).join(" — "),
      tone: sms?.info === "failed" ? "error" : "success",
    });
  };

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
      <Button onClick={() => void save()} loading={saving} disabled={!settings}>Kaydet</Button>
    </>
  );

  const sourceBanner = source?.type === "online" ? (
    <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900">
      <p className="flex items-center gap-1.5 font-bold"><Globe2 className="h-4 w-4" aria-hidden="true" /> Online talep: {source.request.fullName}</p>
      <p className="mt-0.5 text-xs text-sky-800">
        {[
          canSeePhone && source.request.phone ? formatPhoneDisplay(source.request.phone) : "",
          canSeePhone && source.request.tcNo ? `TC ${source.request.tcNo}` : "",
          (() => {
            const key = preferredDateKeyOf(source.request.preferredFrom);
            const day = fromDateKey(key);
            return day ? `Tercih: ${formatDayShort(day)} · ${preferredPeriodLabel(preferredMinutesOf(source.request.preferredFrom))}` : "";
          })(),
          source.request.doctor?.fullName ? `Doktor tercihi: ${source.request.doctor.fullName}` : "",
        ].filter(Boolean).join(" · ")}
      </p>
      {source.request.note && <p className="mt-1 text-xs text-sky-800">Hastanın notu: {source.request.note}</p>}
      {sourceMatchState === "searching" && <p className="mt-1 text-xs text-sky-700">Kayıtlı hasta aranıyor…</p>}
      {sourceMatchState === "missing" && !patient && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-sky-900">Bu bilgilerle kayıtlı hasta bulunamadı.</p>
          <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => setShowNewPatient(true)}>Yeni hasta olarak kaydet</Button>
        </div>
      )}
    </div>
  ) : source?.type === "waitlist" ? (
    <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm text-violet-900">
      <p className="flex items-center gap-1.5 font-bold"><ListChecks className="h-4 w-4" aria-hidden="true" /> Bekleme listesinden: {source.entry.patient.fullName}</p>
      {(source.entry.note || source.entry.doctor?.fullName) && (
        <p className="mt-0.5 text-xs text-violet-800">{[source.entry.doctor?.fullName ? `Doktor tercihi: ${source.entry.doctor.fullName}` : "", source.entry.note || ""].filter(Boolean).join(" · ")}</p>
      )}
    </div>
  ) : null;

  return (
    <>
      <Modal
        open
        module="calendar"
        onClose={onClose}
        size="lg"
        title={isEdit ? "Randevuyu düzenle" : "Yeni randevu"}
        description={isEdit ? "Saat, doktor, tedavi veya notu değiştirip kaydedin." : "Hastayı, doktoru ve boş bir saati seçin."}
        footer={footer}
      >
        <div className="space-y-4">
          {sourceBanner}
          <FormErrorBanner message={error} />

          <FormField label="Hasta" required htmlFor="appt-patient">
            <PatientPicker
              id="appt-patient"
              value={patient}
              onChange={(next) => { setPatient(next); setError(null); }}
              onCreateNew={() => setShowNewPatient(true)}
            />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label="Doktor"
              required
              htmlFor="appt-doctor"
              hint={preferredDoctorName && preferredDoctorId && preferredDoctorId !== doctorId ? `Hastanın tercihi: ${preferredDoctorName}` : undefined}
            >
              <DoctorSelect id="appt-doctor" value={doctorId} doctors={doctors} onChange={(id) => { setDoctorId(id); setError(null); }} />
            </FormField>
            <FormField label="Tedavi" htmlFor="appt-treatment">
              <Select id="appt-treatment" value={treatment} onChange={(event) => setTreatment(event.target.value)}>
                {!treatments.some((item) => item.value === treatment) && <option value={treatment}>{treatment}</option>}
                {treatments.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
            </FormField>
            <FormField label="Tarih" required htmlFor="appt-date">
              <Input
                id="appt-date"
                type="date"
                value={dateKey}
                min={isEdit ? undefined : todayKey}
                onChange={(event) => { setDateKey(event.target.value); userPickedTimeRef.current = false; setError(null); }}
              />
            </FormField>
            <FormField label="Saat" required htmlFor="appt-time" hint={!doctorId ? "Önce doktor seçin; boş saatler doktora göre listelenir." : undefined}>
              <Select
                id="appt-time"
                value={minutes === null ? "" : String(minutes)}
                disabled={!doctorId || slotOptions.length === 0}
                onChange={(event) => { setMinutes(event.target.value === "" ? null : Number(event.target.value)); userPickedTimeRef.current = true; setError(null); }}
              >
                {minutes === null && <option value="">{dayLoading ? "Program yükleniyor…" : "Saat seçin"}</option>}
                {slotOptions.map((option) => (
                  <option key={option.minutes} value={option.minutes} disabled={isHardBlocked(option) && option.minutes !== minutes}>
                    {option.label}{option.busyReason ? ` — ${option.busyReason}` : ""}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Süre" htmlFor="appt-duration">
              <Select id="appt-duration" value={durationMin} onChange={(event) => setDurationMin(Number(event.target.value))}>
                {durationOptions.map((value) => <option key={value} value={value}>{value} dakika</option>)}
              </Select>
            </FormField>
            {activeUnits.length > 0 && (
              <FormField label="Tedavi alanı" htmlFor="appt-unit" hint="İsteğe bağlı — koltuk/oda çakışması kontrol edilir.">
                <Select id="appt-unit" value={clinicUnitId} onChange={(event) => setClinicUnitId(event.target.value)}>
                  <option value="">Seçilmedi</option>
                  {activeUnits.map((unit) => (
                    <option key={unit.id} value={unit.id} disabled={!unit.isActive}>
                      {unit.name}{unit.code ? ` · ${unit.code}` : ""}{!unit.isActive ? " (arşivde)" : ""}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </div>

          {/* Seçili günün özeti ve uyarılar */}
          {doctorId && dateKey && (
            <div className="space-y-2" aria-live="polite">
              {dayProblem ? (
                <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {dayProblem}
                </p>
              ) : !dayLoading && selectedDoctor && dayDate ? (
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {selectedDoctor.fullName} · {formatDayShort(dayDate)}: {doctorDayCount} randevu, {freeCount} boş saat
                  {selectedStart ? ` · seçilen: ${formatTimeRange(selectedStart, new Date(selectedStart.getTime() + durationMin * 60_000))}` : ""}
                </p>
              ) : null}
              {dayError && <p className="text-xs font-semibold text-amber-700">{dayError}</p>}
              {blockingReason && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{blockingReason}</p>}
              {softConflict && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p className="font-semibold">Bu saatte doktorun başka randevusu var ({softConflict}). Kaydederseniz onayınız istenir.</p>
                  {nearbyFree.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span>Yakındaki boş saatler:</span>
                      {nearbyFree.map((option) => (
                        <Button key={option.minutes} size="sm" variant="secondary" onClick={() => { setMinutes(option.minutes); userPickedTimeRef.current = true; }}>
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <FormField label="Not" htmlFor="appt-note" hint="İsteğe bağlı — doktorun görmesi gereken kısa bilgi.">
            <Textarea id="appt-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ör. sol alt 36 kanal, penisilin alerjisi" />
          </FormField>

          {!isEdit && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <Switch
                checked={smsInfo}
                onChange={setSmsInfo}
                label="Randevu bilgisini hastaya şimdi gönder"
                description="Kanal (SMS veya WhatsApp) ve hastanın iletişim izni sistem tarafından kontrol edilir."
              />
              <Switch
                checked={smsReminder}
                onChange={setSmsReminder}
                label="Randevudan bir gün önce hatırlatma gönder"
              />
            </div>
          )}
        </div>
      </Modal>

      {showNewPatient && (
        <PatientFormModal
          open
          hidePhoneField={!canSeePhone}
          onClose={() => setShowNewPatient(false)}
          onSaved={(created) => {
            const full = created as PickedPatient;
            setPatient({ id: full.id, fullName: full.fullName, phone: full.phone || null, tcNo: full.tcNo || null });
            setSourceMatchState("found");
            setShowNewPatient(false);
          }}
        />
      )}
    </>
  );
}
