"use client";

import { CalendarClock, Clock, CopyCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, FormSection } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Switch } from "@/components/ui/Switch";
import { dayError, durationError, type ClinicSettingsForm, type ScheduleRow } from "./settings-form";

type CalismaTabProps = {
  form: ClinicSettingsForm;
  onChange: (patch: Partial<ClinicSettingsForm>) => void;
  canWrite: boolean;
};

type Row = ScheduleRow & { index: number; error: string | null };

const TIME_FIELDS = [
  { key: "open", label: "Açılış" },
  { key: "close", label: "Kapanış" },
  { key: "lunchStart", label: "Öğle arası başlangıcı" },
  { key: "lunchEnd", label: "Öğle arası bitişi" },
] as const;

type TimeKey = (typeof TIME_FIELDS)[number]["key"];

/**
 * Randevu verilebilecek zamanlar tek ekranda: varsayılan randevu süresi ve
 * gün gün açılış/kapanış/öğle arası. Öğle arası önceden hem "genel" hem gün
 * satırında soruluyordu; artık yalnız gün satırında (bkz. settings-form).
 */
export default function CalismaTab({ form, onChange, canWrite }: CalismaTabProps) {
  const rows: Row[] = form.dailySchedules.map((row, index) => ({ ...row, index, error: dayError(row) }));
  const firstOpenDay = rows.find((row) => !row.isHoliday);
  const appointmentDurationError = durationError(form.appointmentDuration);

  const updateDay = (index: number, patch: Partial<ScheduleRow>) => {
    onChange({ dailySchedules: form.dailySchedules.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  };

  // Personel her günü tek tek yazmasın: ilk açık günün saatleri (öğle arası
  // dahil) diğer açık günlere kopyalanır; Cumartesi gibi farklı günler sonra
  // ayrıca düzeltilir.
  const copyFirstDayToOpenDays = () => {
    if (!firstOpenDay) return;
    onChange({
      dailySchedules: form.dailySchedules.map((row) => (row.isHoliday ? row : {
        ...row,
        open: firstOpenDay.open,
        close: firstOpenDay.close,
        lunchStart: firstOpenDay.lunchStart,
        lunchEnd: firstOpenDay.lunchEnd,
      })),
    });
  };

  const timeInput = (row: Row, key: TimeKey, label: string) => (
    <Input
      type="time"
      size="sm"
      aria-label={`${row.day} ${label.toLocaleLowerCase("tr-TR")}`}
      value={row[key]}
      disabled={row.isHoliday || !canWrite}
      aria-invalid={row.error ? true : undefined}
      onChange={(event) => updateDay(row.index, { [key]: event.target.value })}
    />
  );

  const daySwitch = (row: Row) => (
    <Switch
      checked={!row.isHoliday}
      onChange={(open) => updateDay(row.index, { isHoliday: !open })}
      label={row.day}
      description={row.isHoliday ? "Kapalı — randevu verilmez" : "Açık"}
      disabled={!canWrite}
    />
  );

  const columns: ListTableColumn<Row>[] = [
    {
      key: "gun",
      header: "Gün",
      headerClassName: "w-56",
      render: (row) => (
        <div>
          {daySwitch(row)}
          {row.error && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{row.error}</p>}
        </div>
      ),
    },
    ...TIME_FIELDS.map((field) => ({
      key: field.key,
      header: field.label,
      render: (row: Row) => timeInput(row, field.key, field.label),
    })),
  ];

  return (
    <div className="space-y-4">
      <FormSection icon={CalendarClock} title="Randevu süresi" description="Takvimde yeni randevu açılırken önerilen süre; randevu formunda değiştirilebilir.">
        <div className="max-w-xs">
          <FormField label="Varsayılan süre (dakika)" htmlFor="ayar-randevu-suresi" required error={canWrite ? appointmentDurationError || undefined : undefined} hint="5 ile 240 dakika arası">
            <Input
              id="ayar-randevu-suresi"
              type="number"
              inputMode="numeric"
              min={5}
              max={240}
              step={5}
              value={form.appointmentDuration}
              disabled={!canWrite}
              onChange={(event) => onChange({ appointmentDuration: event.target.value })}
            />
          </FormField>
        </div>
      </FormSection>

      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Günlük çalışma saatleri</h2>
              <p className="mt-0.5 text-xs text-slate-500">Kapalı günlere, bu saatlerin dışına ve öğle arasına randevu verilemez. Öğle arası yoksa iki kutuyu da boş bırakın.</p>
            </div>
          </div>
          {canWrite && firstOpenDay && (
            <Button variant="ghost" size="sm" icon={CopyCheck} onClick={copyFirstDayToOpenDays}>
              {firstOpenDay.day} saatlerini tüm açık günlere uygula
            </Button>
          )}
        </div>
        <ListTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.day}
          rowClassName={(row) => (row.isHoliday ? "bg-slate-50/70" : "")}
          mobileCard={(row) => (
            <div className="space-y-2">
              {daySwitch(row)}
              {!row.isHoliday && (
                <div className="grid grid-cols-2 gap-2">
                  {TIME_FIELDS.map((field) => (
                    <label key={field.key} className="block text-xs font-semibold text-slate-600">
                      <span className="mb-1 block">{field.label}</span>
                      {timeInput(row, field.key, field.label)}
                    </label>
                  ))}
                </div>
              )}
              {row.error && <p role="alert" className="text-xs font-medium text-red-600">{row.error}</p>}
            </div>
          )}
        />
      </section>
    </div>
  );
}
