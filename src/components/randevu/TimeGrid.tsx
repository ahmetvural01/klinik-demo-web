"use client";

import { useMemo, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, Ban, Plus } from "lucide-react";
import type { TreatmentOption } from "@/lib/appointment-follow-up";
import {
  STATUS_CARD_CLASS,
  STATUS_ICON,
  buildRowsCovering,
  displayStatus,
  durationMinutes,
  formatClock,
  getDayHours,
  initialsOf,
  isUnresolvedPast,
  minutesOfDay,
  parseClock,
  parseNoteFull,
  rowIndexFor,
  statusLabel,
  timeLabel,
  toDateKey,
  treatmentMetaOf,
  type Appointment,
  type CalendarDoctor,
  type CalendarSettings,
  type DoctorBlock,
} from "@/components/randevu/appointment-utils";

export type GridColumn = {
  key: string;
  date: Date;
  dateKey: string;
  /** Gün görünümünde sütunun doktoru; haftada filtre doktoru ya da null (tüm doktorlar). */
  doctorId: string | null;
  header: ReactNode;
  headerTitle: string;
  isToday: boolean;
  onHeaderClick?: () => void;
};

type TimeGridProps = {
  columns: GridColumn[];
  appointments: Appointment[];
  blocks: DoctorBlock[];
  settings: CalendarSettings;
  doctors: CalendarDoctor[];
  treatments: TreatmentOption[];
  slotInterval: number;
  /** Tüm doktorlar tek sütunda gösteriliyorsa kartta doktorun baş harfleri yazar. */
  showDoctorOnCard: boolean;
  canCreate: boolean;
  onOpen: (appointment: Appointment) => void;
  onCreate: (column: GridColumn, minutes: number) => void;
  onBlockClick: (block: DoctorBlock, column: GridColumn, minutes: number) => void;
  onMove?: (appointment: Appointment, column: GridColumn, minutes: number) => void;
};

const ROW_HEIGHT = 36;

type CellKind = "free" | "past" | "closed" | "lunch" | "block" | "doctorOff";

type PlacedAppointment = { appointment: Appointment; start: number; end: number; lane: number; laneCount: number };

function placeInLanes(items: Array<{ appointment: Appointment; start: number; end: number }>): PlacedAppointment[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const result: PlacedAppointment[] = [];
  let group: Array<{ appointment: Appointment; start: number; end: number; lane: number }> = [];
  let groupEnd = -1;
  const flush = () => {
    const laneCount = Math.max(1, ...group.map((item) => item.lane + 1));
    for (const item of group) result.push({ ...item, laneCount });
    group = [];
  };
  let laneEnds: number[] = [];
  for (const item of sorted) {
    if (group.length > 0 && item.start >= groupEnd) {
      flush();
      laneEnds = [];
      groupEnd = -1;
    }
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = item.end;
    group.push({ ...item, lane });
    groupEnd = Math.max(groupEnd, item.end);
  }
  if (group.length > 0) flush();
  return result;
}

/**
 * Gün ve Hafta görünümünün ortak ızgarası. Randevu, başlangıç dakikasının
 * düştüğü satırda (eşitlik değil aralık) ve gerçek süresi kadar uzun çizilir —
 * önceden 15 dakikalık ızgaraya denk gelmeyen (ör. 15:37) randevular hiç
 * görünmüyordu. Geçmiş saatlerde, öğle arasında, kapalı zamanlarda ve mesai
 * dışında "yeni randevu" sunulmaz.
 */
export function TimeGrid({
  columns,
  appointments,
  blocks,
  settings,
  doctors,
  treatments,
  slotInterval,
  showDoctorOnCard,
  canCreate,
  onOpen,
  onCreate,
  onBlockClick,
  onMove,
}: TimeGridProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const now = new Date();
  const todayKey = toDateKey(now);
  const nowMinutes = minutesOfDay(now);
  const step = Math.max(5, slotInterval);

  const columnData = useMemo(() => columns.map((column) => {
    const hours = getDayHours(settings.dailySchedules, column.date, settings.openingTime, settings.closingTime);
    const items = appointments
      .filter((appointment) => appointment.status !== "IPTAL")
      .filter((appointment) => toDateKey(new Date(appointment.startAt)) === column.dateKey)
      .filter((appointment) => !column.doctorId || appointment.doctor?.id === column.doctorId)
      .map((appointment) => {
        const start = minutesOfDay(new Date(appointment.startAt));
        return { appointment, start, end: start + Math.max(step / 2, durationMinutes(appointment.startAt, appointment.endAt)) };
      });
    const columnBlocks = column.doctorId
      ? blocks
          .filter((block) => block.doctorId === column.doctorId && block.date === column.dateKey)
          .map((block) => ({ block, start: parseClock(block.startTime) ?? 0, end: parseClock(block.endTime) ?? 0 }))
      : [];
    const doctor = column.doctorId ? doctors.find((item) => item.id === column.doctorId) : null;
    const workStart = parseClock(doctor?.profile?.workStart || "");
    const workEnd = parseClock(doctor?.profile?.workEnd || "");
    return { column, hours, placed: placeInLanes(items), blocks: columnBlocks, workStart, workEnd };
  }), [columns, appointments, blocks, settings, doctors, step]);

  const rows = useMemo(() => {
    const open = Math.min(...columnData.map((data) => (data.hours.isHoliday ? 24 * 60 : data.hours.open)));
    const close = Math.max(...columnData.map((data) => (data.hours.isHoliday ? 0 : data.hours.close)));
    const items = columnData.flatMap((data) => data.placed.map((item) => ({ start: item.start, end: item.end })));
    const safeOpen = Number.isFinite(open) && open < 24 * 60 ? open : 8 * 60 + 30;
    const safeClose = Number.isFinite(close) && close > safeOpen ? close : Math.max(safeOpen + 60, 18 * 60);
    return buildRowsCovering(safeOpen, safeClose, step, items);
  }, [columnData, step]);

  const cellKind = (data: (typeof columnData)[number], rowStart: number): { kind: CellKind; block?: DoctorBlock } => {
    const rowEnd = rowStart + step;
    const { hours, column } = data;
    if (hours.isHoliday || rowStart < hours.open || rowEnd > hours.close) return { kind: "closed" };
    if (hours.lunchStart !== null && hours.lunchEnd !== null && rowStart < hours.lunchEnd && rowEnd > hours.lunchStart) return { kind: "lunch" };
    const blockHit = data.blocks.find((item) => rowStart < item.end && rowEnd > item.start);
    if (blockHit) return { kind: "block", block: blockHit.block };
    if ((data.workStart !== null && rowStart < data.workStart) || (data.workEnd !== null && rowEnd > data.workEnd)) return { kind: "doctorOff" };
    if (column.dateKey < todayKey || (column.dateKey === todayKey && rowStart <= nowMinutes)) return { kind: "past" };
    return { kind: "free" };
  };

  const openOnKey = (event: KeyboardEvent<HTMLElement>, action: () => void) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };

  const renderCard = (item: PlacedAppointment, rowStart: number) => {
    const { appointment, lane, laneCount } = item;
    const parsed = parseNoteFull(appointment.note, treatments);
    const treatment = treatmentMetaOf(parsed.treatment, treatments);
    const display = displayStatus(appointment.status);
    const Icon = STATUS_ICON[display];
    const stale = isUnresolvedPast(appointment.status, appointment.startAt);
    const offset = ((item.start - rowStart) / step) * ROW_HEIGHT;
    const height = Math.max(ROW_HEIGHT - 4, ((item.end - item.start) / step) * ROW_HEIGHT - 3);
    const tall = height >= ROW_HEIGHT * 1.6;
    const time = formatClock(appointment.startAt);
    const label = `${time}, ${appointment.patient?.fullName || "Hasta"}, ${statusLabel(appointment.status)}, ${treatment.label}${appointment.doctor?.fullName ? `, ${appointment.doctor.fullName}` : ""}${stale ? ", gün geçti durum işaretlenmedi" : ""}${appointment.patient?.hasContagiousDisease ? ", bulaşıcı hastalık uyarısı" : ""}`;
    const widthPercent = 100 / laneCount;
    return (
      <div
        key={appointment.id}
        role="button"
        tabIndex={0}
        aria-label={label}
        title={label}
        draggable={Boolean(onMove)}
        onDragStart={onMove ? (event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; setDragId(appointment.id); } : undefined}
        onDragEnd={() => { setDragId(null); setDropKey(null); }}
        onClick={() => onOpen(appointment)}
        onKeyDown={(event) => openOnKey(event, () => onOpen(appointment))}
        style={{
          top: offset + 2,
          height,
          left: `calc(${lane * widthPercent}% + 2px)`,
          width: `calc(${widthPercent}% - 4px)`,
          zIndex: 5 + lane,
        }}
        className={`randevu-appt-card absolute overflow-hidden rounded-md border border-l-4 px-1.5 py-1 text-left shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${onMove ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${STATUS_CARD_CLASS[display]} ${stale ? "ring-1 ring-amber-400" : ""} ${dragId === appointment.id ? "opacity-50" : ""}`}
      >
        <div className="flex min-w-0 items-center gap-1 text-[11px] leading-4">
          <Icon className="h-3 w-3 shrink-0 text-slate-500" aria-hidden="true" />
          <span className="shrink-0 font-bold tabular-nums text-slate-600">{time}</span>
          <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">{appointment.patient?.fullName || "Hasta"}</span>
          {appointment.patient?.hasContagiousDisease && <AlertTriangle className="h-3 w-3 shrink-0 text-red-600" aria-hidden="true" />}
          {stale && <span className="shrink-0 rounded bg-amber-500 px-1 text-[10px] font-bold text-white" aria-hidden="true">!</span>}
          {showDoctorOnCard && appointment.doctor?.fullName && (
            <span className="shrink-0 rounded bg-white/80 px-1 text-[10px] font-bold text-slate-600" aria-hidden="true">{initialsOf(appointment.doctor.fullName)}</span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-1 text-[10px] leading-4 text-slate-600">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: treatment.color }} aria-hidden="true" />
          <span className="truncate">{treatment.label}</span>
          {tall && <span className="ml-auto shrink-0 font-semibold">{statusLabel(appointment.status)}</span>}
        </div>
      </div>
    );
  };

  const onDrop = (event: DragEvent<HTMLTableCellElement>, column: GridColumn, rowStart: number) => {
    event.preventDefault();
    const appointment = appointments.find((item) => item.id === dragId);
    setDragId(null);
    setDropKey(null);
    if (!appointment || !onMove) return;
    onMove(appointment, column, rowStart);
  };

  return (
    <div className="max-h-[calc(100dvh-14rem)] min-h-[320px] overflow-auto rounded-lg border border-slate-200 bg-white shadow-[var(--shadow-surface)]">
      <table className="randevu-grid w-full border-collapse text-xs" style={{ minWidth: 72 + columns.length * 150 }}>
        <thead className="sticky top-0 z-20 bg-slate-50">
          <tr>
            <th scope="col" className="calendar-time-heading sticky left-0 z-30 w-[72px] border border-slate-200 bg-slate-50 px-2 py-2 text-left">Saat</th>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                title={column.headerTitle}
                className={`calendar-doctor-heading border border-slate-200 px-2 py-2 text-center ${column.isToday ? "bg-primary/5 text-primary" : "bg-slate-50"}`}
              >
                {column.onHeaderClick ? (
                  <button type="button" onClick={column.onHeaderClick} className="w-full rounded px-1 py-0.5 hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                    {column.header}
                  </button>
                ) : column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((rowStart, rowIndex) => {
            const isHour = rowStart % 60 === 0;
            return (
              <tr key={rowStart}>
                <td className={`calendar-time-cell sticky left-0 z-10 whitespace-nowrap border border-slate-200 bg-white px-2 align-top font-mono tabular-nums ${isHour ? "font-bold text-slate-800" : "text-slate-400"}`} style={{ height: ROW_HEIGHT }}>
                  {timeLabel(rowStart)}
                </td>
                {columnData.map((data) => {
                  const { column } = data;
                  const { kind, block } = cellKind(data, rowStart);
                  const starting = data.placed.filter((item) => rowIndexFor(item.start, rows) === rowIndex);
                  const covered = data.placed.some((item) => item.start < rowStart + step && item.end > rowStart);
                  const cellKey = `${column.key}-${rowStart}`;
                  const firstOfBlock = block && (rowIndex === 0 || cellKind(data, rows[rowIndex - 1]).block?.id !== block.id);
                  const firstOfLunch = kind === "lunch" && (rowIndex === 0 || cellKind(data, rows[rowIndex - 1]).kind !== "lunch");
                  const droppable = Boolean(onMove) && dragId !== null && (kind === "free");
                  const showNow = column.isToday && nowMinutes >= rowStart && nowMinutes < rowStart + step;
                  const shade = kind === "closed" ? "bg-slate-100/80" : kind === "lunch" ? "bg-slate-50" : kind === "block" ? "bg-orange-50" : kind === "doctorOff" ? "bg-slate-50" : kind === "past" ? "bg-slate-50/40" : "";
                  return (
                    <td
                      key={cellKey}
                      className={`group relative border p-0 align-top ${shade} ${dropKey === cellKey ? "bg-primary/10 ring-2 ring-inset ring-primary" : ""}`}
                      style={{ height: ROW_HEIGHT }}
                      onDragOver={droppable ? (event) => { event.preventDefault(); setDropKey(cellKey); } : undefined}
                      onDragLeave={droppable ? () => setDropKey((prev) => (prev === cellKey ? null : prev)) : undefined}
                      onDrop={droppable ? (event) => onDrop(event, column, rowStart) : undefined}
                    >
                      {showNow && (
                        <span
                          className="pointer-events-none absolute inset-x-0 z-[15] h-0.5 bg-red-500/80"
                          style={{ top: ((nowMinutes - rowStart) / step) * ROW_HEIGHT }}
                          aria-hidden="true"
                        />
                      )}
                      {kind === "block" && block && firstOfBlock && (
                        <button
                          type="button"
                          onClick={() => onBlockClick(block, column, rowStart)}
                          className="relative z-[4] flex w-full items-center gap-1 truncate px-1.5 py-1 text-left text-[10px] font-semibold text-orange-800 hover:underline"
                          title={`Kapalı ${block.startTime}–${block.endTime}${block.reason ? `: ${block.reason}` : ""}`}
                        >
                          <Ban className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">Kapalı {block.startTime}–{block.endTime}{block.reason ? ` · ${block.reason}` : ""}</span>
                        </button>
                      )}
                      {kind === "block" && block && !firstOfBlock && (
                        <button type="button" aria-label={`Kapalı zaman ${block.startTime}–${block.endTime}`} onClick={() => onBlockClick(block, column, rowStart)} className="absolute inset-0 z-[3]" />
                      )}
                      {firstOfLunch && <span className="block px-1.5 py-1 text-[10px] font-semibold text-slate-400">Öğle arası</span>}
                      {kind === "doctorOff" && !covered && (rowIndex === 0 || cellKind(data, rows[rowIndex - 1]).kind !== "doctorOff") && (
                        <span className="block px-1.5 py-1 text-[10px] font-semibold text-slate-400">Mesai dışı</span>
                      )}
                      {starting.map((item) => renderCard(item, rows[rowIndex]))}
                      {canCreate && kind === "free" && (
                        <button
                          type="button"
                          onClick={() => onCreate(column, rowStart)}
                          aria-label={`${column.headerTitle} · ${timeLabel(rowStart)} için yeni randevu`}
                          title={`${timeLabel(rowStart)} — yeni randevu`}
                          className={`absolute right-1 top-1 z-[12] flex h-6 w-6 items-center justify-center rounded-full border border-primary/30 bg-white text-primary opacity-0 shadow-sm transition-opacity hover:bg-primary/10 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 group-hover:opacity-100 ${covered ? "" : "[@media(hover:none)]:opacity-40"}`}
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
