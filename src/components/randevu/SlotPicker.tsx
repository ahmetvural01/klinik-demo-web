"use client";

import { useId, useMemo, useRef, type KeyboardEvent } from "react";
import { slotKind, timeLabel, type SlotKind, type SlotOption } from "@/components/randevu/appointment-utils";

type SlotPickerProps = {
  label: string;
  options: SlotOption[];
  /** Seçili başlangıç (dakika). */
  value: number | null;
  onChange: (minutes: number) => void;
  /** Seçili saatin bitişini göstermek için randevu süresi (dk). */
  durationMin: number;
  required?: boolean;
  loading?: boolean;
  /** Saat seçilemiyorsa nedeni ("Önce doktor seçin."); verilirse düğmeler çizilmez. */
  blockedMessage?: string | null;
  /** Alanın altında hata (ör. "Saat seçin."). */
  error?: string;
};

const GROUPS: Array<{ key: string; label: string; test: (minutes: number) => boolean }> = [
  { key: "sabah", label: "Öğleden önce", test: (minutes) => minutes < 12 * 60 },
  { key: "ogleden-sonra", label: "Öğleden sonra", test: (minutes) => minutes >= 12 * 60 },
];

function reasonTitle(option: SlotOption, kind: SlotKind): string {
  if (kind === "busy") return `${option.label} — dolu (seçilirse kayıtta onay istenir)`;
  if (kind === "blocked") return `${option.label} — ${option.busyReason || "kapalı"}`;
  return option.label;
}

/**
 * Randevu formunda saat seçimi: doktorun o günkü programına göre boş saatler
 * tek dokunuşla seçilir. Önceden 30-40 seçenekli bir açılır listeydi; her
 * seçenekte "— dolu: Ahmet Yılmaz" gibi neden metni okunuyor, diğer hastaların
 * adları listede görünüyordu. Dolu saat (doktorun başka randevusu) üstü
 * çizili ama SEÇİLEBİLİR: doktor çakışması kayıtta onayla geçilebilir (mevcut
 * iş kuralı; eski listede de seçilebiliyordu — telefonda ızgara olmadığı için
 * tek yol bu). Kapalı zaman pasif; geçmiş/öğle arası/mesai dışı saatler hiç
 * gösterilmez (sunucu da reddeder). Hasta adı hiçbir saatte yazmaz.
 * Klavye: grup tek sekme durağıdır; ok tuşları boş saatler arasında gezer.
 */
export function SlotPicker({ label, options, value, onChange, durationMin, required = false, loading = false, blockedMessage, error }: SlotPickerProps) {
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const messageId = `${baseId}-message`;
  const groupRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () => options
      .map((option) => ({ option, kind: slotKind(option) }))
      .filter(({ option, kind }) => kind !== "hidden" || option.minutes === value),
    [options, value],
  );
  const freeCount = visible.filter((item) => item.kind === "free").length;
  const enabledMinutes = visible.filter((item) => item.kind === "free" || item.option.minutes === value).map((item) => item.option.minutes);
  const tabStop = value !== null && enabledMinutes.includes(value) ? value : enabledMinutes[0] ?? null;

  const select = (minutes: number) => {
    onChange(minutes);
    window.requestAnimationFrame(() => {
      groupRef.current?.querySelector<HTMLButtonElement>(`[data-minutes="${minutes}"]`)?.focus();
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key) || enabledMinutes.length === 0) return;
    event.preventDefault();
    const current = enabledMinutes.indexOf(value ?? -1);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? enabledMinutes.length - 1
        : event.key === "ArrowRight" || event.key === "ArrowDown"
          ? Math.min(enabledMinutes.length - 1, current + 1)
          : Math.max(0, current < 0 ? 0 : current - 1);
    select(enabledMinutes[next]);
  };

  const summary = loading
    ? "Program yükleniyor…"
    : blockedMessage
      ? null
      : `${freeCount} boş saat${value !== null ? ` · seçilen ${timeLabel(value)}–${timeLabel(value + durationMin)}` : ""}`;

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p id={labelId} className="ui-form-label flex items-center gap-1.5 text-xs font-bold text-slate-800">
          {label}
          {required && <span className="text-red-500" aria-hidden="true">*</span>}
        </p>
        {summary && <p className="text-xs tabular-nums text-slate-500" aria-live="polite">{summary}</p>}
      </div>
      {blockedMessage ? (
        <p id={messageId} className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">{blockedMessage}</p>
      ) : loading && visible.length === 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, index) => <span key={index} className="ui-skeleton-shimmer block h-9 w-[3.75rem] rounded-md bg-slate-100" />)}
        </div>
      ) : visible.length === 0 ? (
        <p id={messageId} className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">Bu gün için boş saat yok. Başka bir gün seçin.</p>
      ) : (
        <div
          ref={groupRef}
          role="radiogroup"
          aria-labelledby={labelId}
          aria-describedby={error ? messageId : undefined}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          onKeyDown={onKeyDown}
          className={`space-y-2 ${loading ? "opacity-60" : ""}`}
        >
          {GROUPS.map((group) => {
            const items = visible.filter(({ option }) => group.test(option.minutes));
            if (items.length === 0) return null;
            return (
              <div key={group.key} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                <span className="shrink-0 pt-0 text-[11px] font-semibold text-slate-400 sm:w-24 sm:pt-2.5">{group.label}</span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {items.map(({ option, kind }) => {
                    const selected = option.minutes === value;
                    const selectable = kind === "free" || kind === "busy" || selected;
                    const conflict = selected && kind !== "free";
                    return (
                      <button
                        key={option.minutes}
                        type="button"
                        role="radio"
                        data-minutes={option.minutes}
                        aria-checked={selected}
                        aria-disabled={!selectable || undefined}
                        disabled={!selectable}
                        tabIndex={option.minutes === tabStop ? 0 : -1}
                        title={reasonTitle(option, kind)}
                        onClick={() => select(option.minutes)}
                        className={`inline-flex h-9 min-w-[3.75rem] items-center justify-center rounded-md border px-2 text-sm font-semibold tabular-nums transition-colors !min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                          conflict
                            ? "border-amber-500 bg-amber-50 text-amber-900"
                            : selected
                              ? "border-primary bg-primary text-white"
                              : kind === "free"
                                ? "border-slate-200 bg-white text-slate-800 hover:border-primary/50 hover:bg-primary/5"
                                : kind === "busy"
                                  ? "border-slate-200 bg-slate-50 text-slate-400 line-through hover:border-amber-400 hover:text-amber-800"
                                  : kind === "blocked"
                                    ? "cursor-not-allowed border-orange-100 bg-orange-50/70 text-orange-300"
                                    : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 line-through"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {error && <p id={messageId} role="alert" className="ui-field-message mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
