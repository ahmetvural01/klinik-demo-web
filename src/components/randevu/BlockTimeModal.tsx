"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { FormModal } from "@/components/ui/FormModal";
import { IconButton } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards, type ChoiceOption } from "@/components/ui/ChoiceCards";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { QuickDatePicker } from "@/components/ui/QuickDatePicker";
import { TimeRangeInput, timeRangeError, type TimeRange } from "@/components/ui/TimeRangeInput";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { confirmDialog } from "@/lib/confirm-client";
import { clientMutation } from "@/lib/client-mutation";
import { showToastSafe } from "@/lib/toast-client";
import { checkDoctorLocalHoursInterval, checkLocalWorkingHoursInterval } from "@/lib/working-hours-core";
import {
  formatDayShort,
  fromDateKey,
  getDayHours,
  openDayKeys,
  parseClock,
  quickDayLabel,
  timeLabel,
  toDateKey,
  type CalendarDoctor,
  type CalendarSettings,
  type DoctorBlock,
} from "@/components/randevu/appointment-utils";

type BlockTimeModalProps = {
  settings: CalendarSettings | null;
  doctors: CalendarDoctor[];
  /** Takvimde görüntülenen gün ve seçili doktor — form bunlarla açılır. */
  initialDateKey: string;
  initialDoctorId: string;
  slotInterval: number;
  onClose: () => void;
  onChanged: () => void;
};

type Preset = "sabah" | "ogleden-sonra" | "tum-gun" | "aralik";

/**
 * Doktorun zamanını kapatma (izin, toplantı, kongre). Saat aralığı kliniğin
 * o günkü çalışma saatinden hazır gelir (öğleden önce / öğleden sonra / tüm
 * gün); öğle arası olan günde "tüm gün" iki kayıt olarak kaydedilir (öğle
 * arasıyla çakışan kapalı zaman sunucuda kabul edilmiyor). Önceden her
 * açılışta sabit 13:00–17:00 geliyordu (Cumartesi 15:00 kapanışını aşıyordu).
 */
export function BlockTimeModal({ settings, doctors, initialDateKey, initialDoctorId, slotInterval, onClose, onChanged }: BlockTimeModalProps) {
  const todayKey = toDateKey(new Date());
  const [doctorId, setDoctorId] = useState(initialDoctorId || (doctors.length === 1 ? doctors[0].id : ""));
  const [dateKey, setDateKey] = useState(initialDateKey < todayKey ? todayKey : initialDateKey);
  const [preset, setPreset] = useState<Preset>("ogleden-sonra");
  const [customRange, setCustomRange] = useState<TimeRange>({ start: "", end: "" });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<DoctorBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);

  const loadBlocks = useCallback(async () => {
    if (!doctorId || !dateKey) { setBlocks([]); return; }
    setBlocksLoading(true);
    try {
      const response = await fetch(`/api/doctor-blocks?doctorId=${encodeURIComponent(doctorId)}&date=${dateKey}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      setBlocks(response.ok && Array.isArray(data) ? data : []);
    } catch {
      setBlocks([]);
    } finally {
      setBlocksLoading(false);
    }
  }, [doctorId, dateKey]);

  useEffect(() => { void loadBlocks(); }, [loadBlocks]);

  const doctor = doctors.find((item) => item.id === doctorId);

  // Kliniğin (ve doktorun) o günkü saatlerinden hazır aralıklar.
  const ranges = useMemo(() => {
    const day = fromDateKey(dateKey);
    if (!settings || !day) return null;
    const hours = getDayHours(settings.dailySchedules, day, settings.openingTime, settings.closingTime);
    if (hours.isHoliday) return null;
    const workStart = parseClock(doctor?.profile?.workStart || "");
    const workEnd = parseClock(doctor?.profile?.workEnd || "");
    // Bugün için geçmiş saat kapatılmaz: aralık bir sonraki dilimden başlar.
    const step = Math.max(5, slotInterval);
    const now = new Date();
    const nowStart = dateKey === todayKey ? Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / step) * step : 0;
    const open = Math.max(hours.open, workStart ?? hours.open, nowStart);
    const close = Math.min(hours.close, workEnd ?? hours.close);
    const split = hours.lunchStart !== null && hours.lunchEnd !== null ? { morningEnd: hours.lunchStart, afternoonStart: hours.lunchEnd } : { morningEnd: 13 * 60, afternoonStart: 13 * 60 };
    const range = (start: number, end: number): TimeRange | null => (start < end ? { start: timeLabel(start), end: timeLabel(end) } : null);
    const morning = range(open, Math.min(split.morningEnd, close));
    const afternoon = range(Math.max(split.afternoonStart, open), close);
    const hasLunch = hours.lunchStart !== null;
    // Öğle arası varsa tüm gün = sabah + öğleden sonra (iki kayıt).
    const whole: TimeRange[] = hasLunch ? [morning, afternoon].filter((item): item is TimeRange => Boolean(item)) : [range(open, close)].filter((item): item is TimeRange => Boolean(item));
    return { morning, afternoon, whole };
  }, [settings, dateKey, doctor, slotInterval, todayKey]);

  // Seçili hazır aralık bu gün için yoksa (ör. bugün öğleden sonra geçmiş ya
  // da gün değişti) ilk uygun hazır aralığa geçilir; önceden pasif seçenek
  // seçili kalıp "kapatılacak saat yok" uyarısı veriyordu.
  useEffect(() => {
    if (!ranges || preset === "aralik") return;
    const available = (key: Preset) => (key === "sabah" ? Boolean(ranges.morning) : key === "ogleden-sonra" ? Boolean(ranges.afternoon) : ranges.whole.length > 0);
    if (available(preset)) return;
    const next = (["ogleden-sonra", "sabah", "tum-gun"] as const).find(available);
    if (next) setPreset(next);
  }, [ranges, preset]);

  const selectedRanges = useMemo<TimeRange[]>(() => (
    preset === "aralik"
      ? [customRange]
      : preset === "sabah"
        ? (ranges?.morning ? [ranges.morning] : [])
        : preset === "ogleden-sonra"
          ? (ranges?.afternoon ? [ranges.afternoon] : [])
          : ranges?.whole || []
  ), [preset, customRange, ranges]);

  const presetOptions: ChoiceOption<Preset>[] = [
    { value: "sabah", label: "Öğleden önce", disabled: !ranges?.morning, disabledReason: "Bu gün öğleden önce kapatılacak saat yok" },
    { value: "ogleden-sonra", label: "Öğleden sonra", disabled: !ranges?.afternoon, disabledReason: "Bu gün öğleden sonra kapatılacak saat yok" },
    { value: "tum-gun", label: "Tüm gün", disabled: !ranges || ranges.whole.length === 0 },
    { value: "aralik", label: "Saat aralığı" },
  ];
  const rangeHint = preset !== "aralik" && selectedRanges.length > 0
    ? `Kapatılacak: ${selectedRanges.map((item) => `${item.start}–${item.end}`).join(" ve ")}`
    : undefined;

  // Ayarlar yüklenmeden doğrulama yapılmaz (önceden açılışta sahte
  // "çalışma saati tanımlanmamış" hatasıyla kilitleniyordu).
  const validationError = useMemo(() => {
    if (!settings || !dateKey) return null;
    if (preset === "aralik") {
      const rangeProblem = timeRangeError(customRange, { required: true });
      if (rangeProblem) return customRange.start || customRange.end ? rangeProblem : null;
    }
    if (selectedRanges.length === 0) return "Bu gün için kapatılacak saat yok (klinik kapalı ya da doktorun mesaisi dışında).";
    for (const item of selectedRanges) {
      const clinicError = checkLocalWorkingHoursInterval({ date: dateKey, startTime: item.start, endTime: item.end, dailySchedules: settings.dailySchedules, actionLabel: "Kapalı zaman" });
      if (clinicError) return clinicError;
      const doctorError = checkDoctorLocalHoursInterval(item.start, item.end, doctor?.profile?.workStart, doctor?.profile?.workEnd, doctor?.fullName);
      if (doctorError) return doctorError;
    }
    return null;
  }, [settings, dateKey, preset, customRange, selectedRanges, doctor]);

  const save = async () => {
    setError(null);
    if (!doctorId) { setError("Doktor seçin."); return; }
    if (!dateKey) { setError("Tarih seçin."); return; }
    if (preset === "aralik") {
      const rangeProblem = timeRangeError(customRange, { required: true });
      if (rangeProblem) { setError(rangeProblem); return; }
    }
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    const saved: TimeRange[] = [];
    try {
      for (const item of selectedRanges) {
        await clientMutation("/api/doctor-blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doctorId, date: dateKey, startTime: item.start, endTime: item.end, reason: reason.trim() || null }),
        }, "Kapalı zaman kaydedilemedi.");
        saved.push(item);
      }
      const day = fromDateKey(dateKey);
      showToastSafe({ title: "Zaman kapatıldı", message: `${doctor?.fullName || "Doktor"} · ${day ? formatDayShort(day) : dateKey} ${saved.map((item) => `${item.start}–${item.end}`).join(", ")}`, type: "success" });
      onChanged();
      onClose();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Kapalı zaman kaydedilemedi.";
      setError(saved.length > 0 ? `${saved.map((item) => `${item.start}–${item.end}`).join(", ")} kapatıldı; kalan kaydedilemedi: ${message}` : message);
      if (saved.length > 0) { void loadBlocks(); onChanged(); }
    } finally {
      setSaving(false);
    }
  };

  const removeBlock = async (block: DoctorBlock) => {
    const confirmed = await confirmDialog({
      title: "Kapalı zaman kaldırılsın mı?",
      message: `${block.startTime}–${block.endTime}${block.reason ? ` (${block.reason})` : ""} tekrar randevuya açılır.`,
      confirmText: "Kaldır",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await clientMutation(`/api/doctor-blocks?id=${encodeURIComponent(block.id)}`, { method: "DELETE" }, "Kapalı zaman kaldırılamadı.");
      showToastSafe({ message: `${block.startTime}–${block.endTime} yeniden randevuya açıldı.`, type: "success" });
      await loadBlocks();
      onChanged();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Kapalı zaman kaldırılamadı.");
      void loadBlocks();
    }
  };

  const quickDates = settings
    ? openDayKeys(settings.dailySchedules, todayKey, 3).map((key) => ({ label: quickDayLabel(key, todayKey), date: key }))
    : undefined;

  return (
    <FormModal
      open
      module="calendar"
      onClose={onClose}
      title="Doktorun zamanını kapat"
      description="Bu aralıkta doktora randevu verilemez."
      onSubmit={() => save()}
      submitting={saving}
      error={error}
      formClassName="space-y-3"
    >
      <FormField label="Doktor" required htmlFor="block-doctor" className="sm:max-w-sm">
        <DoctorSelect id="block-doctor" value={doctorId} doctors={doctors} onChange={(id) => { setDoctorId(id); setError(null); }} />
      </FormField>
      <QuickDatePicker
        label="Tarih"
        required
        id="block-date"
        min="today"
        value={dateKey}
        options={quickDates}
        onChange={(next) => { if (next) { setDateKey(next); setError(null); } }}
      />
      <ChoiceCards
        label="Saat"
        variant="pills"
        value={preset}
        onChange={(next) => { setPreset(next); setError(null); }}
        options={presetOptions}
        hint={rangeHint}
      />
      {preset === "aralik" && (
        <TimeRangeInput
          label="Saat aralığı"
          labelHidden
          required
          minuteStep={Math.max(5, slotInterval)}
          value={customRange}
          onChange={(next) => { setCustomRange(next); setError(null); }}
        />
      )}
      <FormField label="Neden" htmlFor="block-reason" hint="İsteğe bağlı — takvimde kapalı saatin üstünde görünür.">
        <Input id="block-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="İzin, toplantı, kongre…" maxLength={120} />
      </FormField>
      {validationError && !error && <Callout tone="warning" compact role="alert">{validationError}</Callout>}

      {doctorId && dateKey && (
        <section className="border-t border-slate-100 pt-3" aria-label="Bu gündeki kapalı zamanlar">
          <h3 className="mb-2 text-xs font-bold text-slate-800">{doctor?.fullName || "Doktor"} · bu gündeki kapalı zamanlar</h3>
          {blocksLoading ? (
            <ListRowSkeleton rows={1} variant="row" />
          ) : blocks.length === 0 ? (
            <p className="text-xs text-slate-500">Bu gün için kapalı zaman yok.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {blocks.map((block) => (
                <li key={block.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-semibold tabular-nums text-slate-800">{block.startTime}–{block.endTime}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-500">{block.reason || "Neden yazılmadı"}</span>
                  <IconButton icon={Trash2} tone="danger" size="sm" title="Kapalı zamanı kaldır" onClick={() => void removeBlock(block)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </FormModal>
  );
}
