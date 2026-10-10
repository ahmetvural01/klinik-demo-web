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
  /**
   * "Bugün": verilirse sayfa tarihi adresten siler (adreste tarih yoksa gün
   * Türkiye saatine göre bugündür). Verilmezse tarayıcı saatiyle bugün seçilir.
   */
  onToday?: () => void;
  /** Görüntülenen aralık bugünü içeriyorsa "Bugün" düğmesi pasif görünür. */
  isToday: boolean;
  stepLabel: string;
};

/**
 * Tarih gezinmesi: ‹ Bugün › ve tarihe tıklayınca takvimden gün seçimi.
 * Tarih yazısı sayfa başlığıyla yarışmaz (normal boy) ve sabit en az
 * genişlikte durur: "Ekim 2026" ↔ "Pazartesi, 12 Ekim 2026" değişince yandaki
 * görünüm sekmeleri kaymaz (canlı test: imleç altındaki sekme değişiyordu).
 */
export function DateNav({ date, label, onStep, onPick, onToday, isToday, stepLabel }: DateNavProps) {
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
      <Button variant="secondary" onClick={() => (onToday ? onToday() : onPick(new Date()))} disabled={isToday}>Bugün</Button>
      <IconButton icon={ChevronRight} title={`Sonraki ${stepLabel}`} onClick={() => onStep(1)} />
      <div className="relative min-w-0">
        <button
          type="button"
          onClick={openPicker}
          aria-label={`Tarih seç — şu an: ${label}`}
          className="inline-flex h-10 min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm font-bold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 sm:min-w-[14.5rem]"
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
