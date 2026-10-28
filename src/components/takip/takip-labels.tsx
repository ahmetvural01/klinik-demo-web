import { Badge } from "@/components/ui/Badge";
import { EmptyValue } from "@/components/ui/ListTable";
import { formatDateText } from "@/components/ui/Money";
import { turkeyDateKey } from "@/lib/tz";

// Aramalar ve görevler ekranının (Hasta aramaları + Ekip görevleri) ve hasta
// dosyasındaki görev listesinin TEK etiket kaynağı. Önceden öncelik bir yerde
// "Öncelik 2" sayısıyla, formda "Orta" diye yazılıyordu; görev durum/tür
// etiketleri hasta dosyasında ayrı bir sözlükte farklı yazılıyordu ("Açık" /
// "Yapılacak", "Parça sipariş" / "Parça siparişi") ve kullanılmayan ikinci bir
// kopya (components/work-lists) duruyordu (denetim HL-18, HL-21, K4).

export type Priority = 1 | 2 | 3;

export const PRIORITY_LABELS: Record<Priority, string> = { 1: "Düşük", 2: "Orta", 3: "Yüksek" };

/** Formlardaki öncelik seçimi (ChoiceCards pills değer olarak metin ister). */
export const PRIORITY_OPTIONS: Array<{ value: "1" | "2" | "3"; label: string }> = [
  { value: "1", label: "Düşük" },
  { value: "2", label: "Orta" },
  { value: "3", label: "Yüksek" },
];

export function toPriority(value: number | string | null | undefined): Priority {
  const number = Number(value);
  return number >= 3 ? 3 : number <= 1 ? 1 : 2;
}

export function priorityLabel(value: number) {
  return PRIORITY_LABELS[toPriority(value)];
}

/** Yalnız "Yüksek" öncelik rozetle gösterilir; Orta/Düşük olağan durumdur, satırı kalabalıklaştırmaz. */
export function PriorityBadge({ value, showAll = false }: { value: number; showAll?: boolean }) {
  if (value >= 3) return <Badge tone="critical">Yüksek öncelik</Badge>;
  if (!showAll) return null;
  return <Badge tone="neutral">{priorityLabel(value)} öncelik</Badge>;
}

// ---- Görev (ClinicTask) etiketleri ----

export type TaskType = "PARCA_SIPARIS" | "LAB" | "ARAMA" | "EVRAK" | "DIGER";
export type TaskStatus = "ACIK" | "BEKLEMEDE" | "TAMAMLANDI" | "IPTAL";

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  PARCA_SIPARIS: "Parça siparişi",
  LAB: "Laboratuvar",
  ARAMA: "Arama",
  EVRAK: "Evrak",
  DIGER: "Diğer",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  ACIK: "Açık",
  BEKLEMEDE: "Beklemede",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal edildi",
};

export const isOpenTask = (task: { status: TaskStatus }) => task.status === "ACIK" || task.status === "BEKLEMEDE";

// ---- Tarih / son tarih ----

const DAY_MS = 86_400_000;

function dayIndex(date: Date) {
  // Türkiye takvim günü (gece yarısı geçişleri yerel saate göre).
  const [y, m, d] = turkeyDateKey(date).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export type DueState = "none" | "overdue" | "today" | "upcoming";

/**
 * Son tarihin ekrandaki durumu: gecikti / bugün / ileride. Kapalı işte "none".
 * `granularity="day"`: aynı günün saati geçse de iş gün boyunca "bugün" kalır,
 * ancak ertesi gün "gecikti" olur (hasta aramaları böyle çalışır: 10:00'a
 * planlanan arama 15:00'te hâlâ bugünün işidir — denetim H5).
 */
export function dueState(
  at: string | null | undefined,
  open: boolean,
  now: Date = new Date(),
  granularity: "time" | "day" = "time",
): DueState {
  if (!at || !open) return "none";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "none";
  const days = dayIndex(date) - dayIndex(now);
  if (granularity === "day") return days < 0 ? "overdue" : days === 0 ? "today" : "upcoming";
  if (date.getTime() < now.getTime()) return "overdue";
  return days === 0 ? "today" : "upcoming";
}

/**
 * "Bugün 14:30", "Yarın 10:00", "3 gün gecikti" gibi kısa ve saniyesiz tarih.
 * Açık iş gecikmişse kırmızı, bugünün işiyse turuncu yazılır.
 */
export function DueLabel({
  at,
  open = true,
  now,
  granularity = "time",
  showTime = true,
}: {
  at: string | null | undefined;
  open?: boolean;
  now?: Date;
  /** "day": gün geçmeden gecikme sayılmaz (bkz. dueState). */
  granularity?: "time" | "day";
  /** false: saatsiz gün ("Bugün", "Yarın", "12.10.2026") — saati anlamsız olan iş için. */
  showTime?: boolean;
}) {
  if (!at) return <EmptyValue />;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return <EmptyValue />;
  const current = now || new Date();
  const days = dayIndex(date) - dayIndex(current);
  const time = showTime ? ` ${formatDateText(date, "time")}` : "";
  const state = dueState(at, open, current, granularity);
  const overdue = state === "overdue";
  let text: string;
  if (overdue) {
    text = days === 0 ? `Bugün${time} (geçti)` : `${Math.abs(days)} gün gecikti`;
  } else if (days === 0) {
    text = `Bugün${time}`;
  } else if (days === 1) {
    text = `Yarın${time}`;
  } else if (days === -1) {
    text = `Dün${time}`;
  } else {
    text = formatDateText(date, showTime ? "datetime" : "short");
  }
  return (
    <time
      dateTime={date.toISOString()}
      title={formatDateText(date, showTime ? "datetime" : "short")}
      className={`whitespace-nowrap tabular-nums ${overdue ? "font-semibold text-red-700" : days === 0 && open ? "font-semibold text-amber-700" : "text-slate-600"}`}
    >
      {text}
    </time>
  );
}
