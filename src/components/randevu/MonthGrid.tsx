"use client";

import { Plus } from "lucide-react";
import {
  STATUS_CARD_CLASS,
  TR_DAYS_SHORT,
  addDays,
  displayStatus,
  formatClock,
  getDayHours,
  statusLabel,
  toDateKey,
  type CalendarSettings,
} from "@/components/randevu/appointment-utils";

export type MonthDaySummary = {
  total: number;
  cancelled: number;
  items: Array<{ id: string; startAt: string; status: string; patientName: string; doctorName: string }>;
};

type MonthGridProps = {
  /** Ayın herhangi bir günü. */
  date: Date;
  days: Record<string, MonthDaySummary>;
  settings: CalendarSettings;
  loading: boolean;
  canCreate: boolean;
  onOpenDay: (date: Date) => void;
  onCreate: (date: Date) => void;
};

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Ay ızgarasının ilk (Pazartesi) ve son (Pazar) günü. */
export function monthGridRange(date: Date): { start: Date; end: Date } {
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const end = addDays(last, (7 - last.getDay()) % 7);
  return { start, end };
}

/**
 * Ay görünümü: her günde randevu sayısı (iptaller hariç) ve ilk üç randevu,
 * küçük durum işaretiyle. Güne tıklamak Gün görünümünü açar. "+" yalnız
 * bugünden sonraki çalışma günlerinde, fareyle üzerine gelince görünür;
 * kapalı günlerde "Kapalı" yazar.
 */
export function MonthGrid({ date, days, settings, loading, canCreate, onOpenDay, onCreate }: MonthGridProps) {
  const { start, end } = monthGridRange(date);
  const todayKey = toDateKey(new Date());
  const cells: Date[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) cells.push(cursor);

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-[var(--shadow-surface)]" aria-busy={loading || undefined}>
      <div className="grid min-w-[700px] grid-cols-7 gap-px bg-slate-200">
        {WEEK_ORDER.map((jsDay) => (
          <div key={jsDay} className="bg-slate-50 py-2 text-center text-xs font-bold text-slate-500">{TR_DAYS_SHORT[jsDay]}</div>
        ))}
        {cells.map((day) => {
          const key = toDateKey(day);
          const summary = days[key];
          const inMonth = day.getMonth() === date.getMonth();
          const isToday = key === todayKey;
          const hours = getDayHours(settings.dailySchedules, day, settings.openingTime, settings.closingTime);
          const closed = hours.isHoliday;
          const total = summary?.total || 0;
          const canAdd = canCreate && !closed && key >= todayKey;
          return (
            <div key={key} className={`group relative min-h-[96px] ${inMonth ? "bg-white" : "bg-slate-50/70"}`}>
              <button
                type="button"
                onClick={() => onOpenDay(day)}
                aria-label={`${day.getDate()} ${inMonth ? "" : "(diğer ay) "}— ${total} randevu${closed ? ", klinik kapalı" : ""}. Gün görünümünü aç`}
                className={`flex h-full min-h-[96px] w-full flex-col gap-1 p-1.5 text-left transition-colors hover:bg-primary/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 ${isToday ? "ring-2 ring-inset ring-primary" : ""}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className={`text-xs font-extrabold ${isToday ? "text-primary" : inMonth ? "text-slate-800" : "text-slate-400"}`}>{day.getDate()}</span>
                  {closed && <span className="text-[10px] font-semibold text-slate-400">Kapalı</span>}
                  {total > 0 && <span className="ml-auto rounded-full bg-slate-100 px-1.5 text-[10px] font-bold tabular-nums text-slate-700">{total}</span>}
                </span>
                {summary?.items.map((item) => (
                  <span key={item.id} className={`flex min-w-0 items-center gap-1 truncate rounded border border-l-[3px] px-1 text-[11px] leading-4 ${STATUS_CARD_CLASS[displayStatus(item.status)]}`} title={`${formatClock(item.startAt)} ${item.patientName} · ${statusLabel(item.status)}${item.doctorName ? ` · ${item.doctorName}` : ""}`}>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-600">{formatClock(item.startAt)}</span>
                    <span className="truncate text-slate-800">{item.patientName}</span>
                  </span>
                ))}
                {total > (summary?.items.length || 0) && (
                  <span className="text-[11px] font-semibold text-primary">+{total - (summary?.items.length || 0)} randevu daha</span>
                )}
              </button>
              {canAdd && (
                <button
                  type="button"
                  onClick={() => onCreate(day)}
                  aria-label={`${day.getDate()} için yeni randevu`}
                  title="Bu güne yeni randevu"
                  className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full border border-primary/30 bg-white text-primary opacity-0 shadow-sm transition-opacity hover:bg-primary/10 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 group-hover:opacity-100"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
