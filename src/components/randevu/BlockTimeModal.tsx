"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { confirmDialog } from "@/lib/confirm-client";
import { clientMutation } from "@/lib/client-mutation";
import { showToastSafe } from "@/lib/toast-client";
import { checkDoctorLocalHoursInterval, checkLocalWorkingHoursInterval } from "@/lib/working-hours-core";
import { formatDayShort, fromDateKey, toDateKey, type CalendarDoctor, type CalendarSettings, type DoctorBlock } from "@/components/randevu/appointment-utils";

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

/**
 * Doktorun zamanını kapatma (izin, toplantı, öğle arası dışı mola). Aynı
 * pencerede o doktorun o günkü kapalı zamanları listelenir ve tamamı tek
 * dokunuşla kaldırılabilir. Önceden form her açılışta bugünü ve boş doktoru
 * getiriyordu; mevcut kayıtlar yalnız takvimde açık olan aralıktan geliyordu.
 */
export function BlockTimeModal({ settings, doctors, initialDateKey, initialDoctorId, slotInterval, onClose, onChanged }: BlockTimeModalProps) {
  const todayKey = toDateKey(new Date());
  const [doctorId, setDoctorId] = useState(initialDoctorId || (doctors.length === 1 ? doctors[0].id : ""));
  const [dateKey, setDateKey] = useState(initialDateKey < todayKey ? todayKey : initialDateKey);
  const [startTime, setStartTime] = useState("13:00");
  const [endTime, setEndTime] = useState("17:00");
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
  // Ayarlar yüklenmeden doğrulama yapılmaz (önceden açılışta sahte
  // "çalışma saati tanımlanmamış" hatasıyla kilitleniyordu).
  const validationError = useMemo(() => {
    if (!settings || !dateKey || !startTime || !endTime) return null;
    const clinicError = checkLocalWorkingHoursInterval({
      date: dateKey,
      startTime,
      endTime,
      dailySchedules: settings.dailySchedules,
      actionLabel: "Kapalı zaman",
    });
    if (clinicError) return clinicError;
    return checkDoctorLocalHoursInterval(startTime, endTime, doctor?.profile?.workStart, doctor?.profile?.workEnd, doctor?.fullName);
  }, [settings, dateKey, startTime, endTime, doctor]);

  const save = async () => {
    setError(null);
    if (!doctorId) { setError("Doktor seçin."); return; }
    if (!dateKey || !startTime || !endTime) { setError("Tarih, başlangıç ve bitiş saatini girin."); return; }
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    try {
      await clientMutation("/api/doctor-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId, date: dateKey, startTime, endTime, reason: reason.trim() || null }),
      }, "Kapalı zaman kaydedilemedi.");
      const day = fromDateKey(dateKey);
      showToastSafe({ title: "Zaman kapatıldı", message: `${doctor?.fullName || "Doktor"} · ${day ? formatDayShort(day) : dateKey} ${startTime}–${endTime}`, type: "success" });
      onChanged();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kapalı zaman kaydedilemedi.");
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
    }
  };

  const step = Math.max(5, slotInterval) * 60;

  return (
    <Modal
      open
      module="calendar"
      onClose={onClose}
      title="Doktorun zamanını kapat"
      description="Bu aralıkta doktora randevu verilemez (izin, toplantı vb.)."
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button onClick={() => void save()} loading={saving}>Kaydet</Button>
        </>
      )}
    >
      <div className="space-y-3">
        <FormErrorBanner message={error} />
        <FormField label="Doktor" required htmlFor="block-doctor">
          <DoctorSelect id="block-doctor" value={doctorId} doctors={doctors} onChange={(id) => { setDoctorId(id); setError(null); }} />
        </FormField>
        <FormField label="Tarih" required htmlFor="block-date">
          <Input id="block-date" type="date" min={todayKey} value={dateKey} onChange={(event) => { setDateKey(event.target.value); setError(null); }} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Başlangıç" required htmlFor="block-start">
            <Input id="block-start" type="time" step={step} value={startTime} onChange={(event) => { setStartTime(event.target.value); setError(null); }} />
          </FormField>
          <FormField label="Bitiş" required htmlFor="block-end">
            <Input id="block-end" type="time" step={step} value={endTime} onChange={(event) => { setEndTime(event.target.value); setError(null); }} />
          </FormField>
        </div>
        <FormField label="Neden" htmlFor="block-reason" hint="İsteğe bağlı — takvimde kapalı saatin üstünde görünür.">
          <Input id="block-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="İzin, toplantı, kongre…" maxLength={120} />
        </FormField>
        {validationError && !error && (
          <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{validationError}</p>
        )}

        {doctorId && dateKey && (
          <section className="border-t border-slate-100 pt-3" aria-label="Bu gündeki kapalı zamanlar">
            <h3 className="mb-2 text-xs font-bold text-slate-800">{doctor?.fullName || "Doktor"} · bu gündeki kapalı zamanlar</h3>
            {blocksLoading ? (
              <p className="text-xs text-slate-400">Yükleniyor…</p>
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
      </div>
    </Modal>
  );
}
