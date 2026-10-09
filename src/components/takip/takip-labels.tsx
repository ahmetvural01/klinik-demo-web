import { Badge } from "@/components/ui/Badge";
import { EmptyValue } from "@/components/ui/ListTable";
import { formatDateText } from "@/components/ui/Money";
import { turkeyDateKey } from "@/lib/tz";

// Görevler ve Hasta Takip ekranlarının ortak etiketleri. Önceden öncelik bir
// yerde "Öncelik 2" sayısıyla, formda "Orta" diye yazılıyordu; tarihler
// saniyeli gösteriliyor, geciken iş hiçbir listede ayırt edilmiyordu (bkz.
// denetim HL-18, HL-21).

export type Priority = 1 | 2 | 3;

export const PRIORITY_LABELS: Record<Priority, string> = { 1: "Düşük", 2: "Orta", 3: "Yüksek" };

export function priorityLabel(value: number) {
  return PRIORITY_LABELS[(value >= 3 ? 3 : value <= 1 ? 1 : 2) as Priority];
}

/** Yalnız "Yüksek" öncelik rozetle gösterilir; Orta/Düşük olağan durumdur, satırı kalabalıklaştırmaz. */
export function PriorityBadge({ value, showAll = false }: { value: number; showAll?: boolean }) {
  if (value >= 3) return <Badge tone="critical">Yüksek öncelik</Badge>;
  if (!showAll) return null;
  return <Badge tone="neutral">{priorityLabel(value)} öncelik</Badge>;
}

const DAY_MS = 86_400_000;

function dayIndex(date: Date) {
  // Türkiye takvim günü (gece yarısı geçişleri yerel saate göre).
  const [y, m, d] = turkeyDateKey(date).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export type DueState = "none" | "overdue" | "today" | "upcoming";

/** Son tarihin ekrandaki durumu: gecikti / bugün / ileride. Kapalı işte "none". */
export function dueState(at: string | null | undefined, open: boolean, now: Date = new Date()): DueState {
  if (!at || !open) return "none";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "none";
  if (date.getTime() < now.getTime()) return "overdue";
  return dayIndex(date) === dayIndex(now) ? "today" : "upcoming";
}

/**
 * "Bugün 14:30", "Yarın 10:00", "3 gün gecikti" gibi kısa ve saniyesiz tarih.
 * Açık iş gecikmişse kırmızı yazılır.
 */
export function DueLabel({ at, open = true, now }: { at: string | null | undefined; open?: boolean; now?: Date }) {
  if (!at) return <EmptyValue />;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return <EmptyValue />;
  const current = now || new Date();
  const days = dayIndex(date) - dayIndex(current);
  const time = formatDateText(date, "time");
  const overdue = open && date.getTime() < current.getTime();
  let text: string;
  if (overdue) {
    text = days === 0 ? `Bugün ${time} (geçti)` : `${Math.abs(days)} gün gecikti`;
  } else if (days === 0) {
    text = `Bugün ${time}`;
  } else if (days === 1) {
    text = `Yarın ${time}`;
  } else if (days === -1) {
    text = `Dün ${time}`;
  } else {
    text = formatDateText(date, "datetime");
  }
  return (
    <time
      dateTime={date.toISOString()}
      title={formatDateText(date, "datetime")}
      className={`whitespace-nowrap tabular-nums ${overdue ? "font-semibold text-red-700" : days === 0 && open ? "font-semibold text-amber-700" : "text-slate-600"}`}
    >
      {text}
    </time>
  );
}
