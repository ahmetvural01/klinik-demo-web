import { AlertTriangle } from "lucide-react";
import { describeDue, type DueTone } from "@/components/work-lists/format";
import { EmptyValue } from "@/components/ui/ListTable";

const TONE_CLASS: Record<DueTone, string> = {
  overdue: "font-semibold text-red-700",
  today: "font-semibold text-amber-700",
  soon: "text-slate-700",
  later: "text-slate-600",
  none: "text-slate-400",
};

/**
 * Son tarih / sonraki arama zamanı: "3 gün gecikti" (kırmızı), "Bugün 14:30"
 * (turuncu), "Yarın 10:00", "12.10.2026 14:30". İş bittiyse (`done`) gecikme
 * vurgusu yapılmaz, yalnız tarih yazılır.
 */
export function DueLabel({ at, done = false, emptyText }: { at?: string | null; done?: boolean; emptyText?: string }) {
  const due = describeDue(at);
  if (due.tone === "none") return emptyText ? <span className="text-xs text-slate-400">{emptyText}</span> : <EmptyValue />;
  if (done) return <span className="text-xs text-slate-500" title={due.full}>{due.full}</span>;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs ${TONE_CLASS[due.tone]}`} title={due.full}>
      {due.tone === "overdue" && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {due.label}
    </span>
  );
}
