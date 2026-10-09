"use client";

import { useRef } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { toDateKey, fromDateKey } from "@/components/randevu/appointment-utils";

type DateNavProps = {
  date: Date;
  label: string;
  onStep: (direction: -1 | 1) => void;
  onPick: (date: Date) => void;
  /** Görüntülenen aralık bugünü içeriyorsa "Bugün" düğmesi pasif görünür. */
  isToday: boolean;
  stepLabel: string;
};

/**
 * Tarih gezinmesi: ‹ Bugün › ve tarihe tıklayınca takvimden gün seçimi.
 * Önceden yalnız ‹ › vardı; uzak bir güne gitmek için gün gün tıklamak
 * gerekiyordu ve bugüne dönüş yoktu.
 */
export function DateNav({ date, label, onStep, onPick, isToday, stepLabel }: DateNavProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
        return;
      }
    } catch {
      // Bazı tarayıcılar showPicker'ı kullanıcı etkileşimi dışında reddeder.
    }
    input.focus();
    input.click();
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <IconButton icon={ChevronLeft} title={`Önceki ${stepLabel}`} onClick={() => onStep(-1)} />
      <Button variant="secondary" onClick={() => onPick(new Date())} disabled={isToday}>Bugün</Button>
      <IconButton icon={ChevronRight} title={`Sonraki ${stepLabel}`} onClick={() => onStep(1)} />
      <div className="relative min-w-0">
        <button
          type="button"
          onClick={openPicker}
          aria-label={`Tarih seç — şu an: ${label}`}
          className="inline-flex h-10 min-w-0 items-center gap-2 rounded-md px-2 text-left font-display text-base font-extrabold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </button>
        <input
          ref={inputRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          data-dirty-ignore
          value={toDateKey(date)}
          onChange={(event) => {
            const picked = fromDateKey(event.target.value);
            if (picked) onPick(picked);
          }}
          className="pointer-events-none absolute bottom-0 left-0 h-0 w-0 opacity-0"
        />
      </div>
    </div>
  );
}
