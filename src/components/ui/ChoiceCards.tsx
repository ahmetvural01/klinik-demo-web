"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { CountBadge, type CountBadgeTone } from "@/components/ui/CountBadge";

export type ChoiceOption<V extends string = string> = {
  value: V;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
  /** Pasif seçeneğin neden seçilemediği (ör. "WhatsApp bağlı değil"). */
  disabledReason?: string;
  /**
   * Seçeneğin yanında sayı — durum süzgecinde kayıt sayısı ("Tümü 24 ·
   * Gönderildi 20 · Gönderilemedi 4"). Ortak CountBadge: 0 gösterilmez, 99+.
   */
  count?: number;
  /** Sayacın rengi: "critical" sorunlu kayıtlar, "warning" dikkat, "neutral" bilgi. */
  countTone?: CountBadgeTone;
};

type ChoiceCardsProps<V extends string> = {
  /** Grubun görünür adı (FormField yerine bunu kullanın). */
  label: string;
  options: ChoiceOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** "cards": açıklamalı büyük seçenekler; "pills": kısa seçenekler (gün, kanal vb.). */
  variant?: "cards" | "pills";
  columns?: 1 | 2 | 3;
  className?: string;
  /** Zorunlu seçim: etikette * ve ekran okuyucuya "zorunlu". */
  required?: boolean;
  /** Alan hatası ("Cinsiyet seçin") — grubun altında, ekran okuyucuya bağlı. */
  error?: string;
  /** Grubun altında kısa ipucu (hata varken gösterilmez). */
  hint?: string;
  /**
   * Ad görünmesin (yalnız ekran okuyucu) — ör. araç çubuğundaki durum
   * süzgecinde adın ekranda tekrar yazılması gereksizse. `label` yine zorunludur.
   */
  labelHidden?: boolean;
};

/**
 * Birbirini dışlayan seçenekler (kanal önceliği, ödeme yöntemi, gün sayısı...)
 * için TEK görünüm: role="radiogroup", ok tuşlarıyla gezilir, pasif seçenek
 * nedenini söyler. Önceden her ekran kendi kart/çip/düğme grubunu yazıyordu.
 * Durum süzgeci olarak da kullanılır (pills + `count`); çoklu seçim için
 * ToggleChips kullanın.
 */
export function ChoiceCards<V extends string>({ label, options, value, onChange, variant = "cards", columns = 2, className = "", required = false, error, hint, labelHidden = false }: ChoiceCardsProps<V>) {
  const groupId = useId();
  const enabled = options.filter((option) => !option.disabled);
  const messageId = error || hint ? `${groupId}-message` : undefined;
  // Pasif seçeneklerin nedeni: kartlarda kartın içinde yazar; çiplerde
  // grubun altında tek satır (title dokunmatikte hiç görünmüyordu, §0.3).
  const disabledReasons = variant === "pills"
    ? options.filter((option) => option.disabled && option.disabledReason).map((option) => `${option.label}: ${option.disabledReason}`)
    : [];
  const reasonsId = disabledReasons.length > 0 ? `${groupId}-reasons` : undefined;
  // Gezici odak (roving tabindex): grupta tek Tab durağı. Değer seçeneklerde
  // yoksa ya da seçili seçenek pasifse ilk etkin seçenek durak olur; yoksa
  // grup klavyeyle hiç ulaşılamıyordu.
  const tabStop = enabled.some((option) => option.value === value) ? value : enabled[0]?.value;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key) || enabled.length === 0) return;
    event.preventDefault();
    const index = enabled.findIndex((option) => option.value === value);
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    // Seçim yokken ileri ok ilk, geri ok son seçeneğe gider.
    const next = index === -1 ? enabled[step > 0 ? 0 : enabled.length - 1] : enabled[(index + step + enabled.length) % enabled.length];
    onChange(next.value);
    document.getElementById(`${groupId}-${next.value}`)?.focus();
  };

  const grid = variant === "pills"
    ? "flex flex-wrap gap-1.5"
    : `grid gap-2 ${columns === 1 ? "grid-cols-1" : columns === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`;
  // Hatalı grupta seçilebilir (seçilmemiş) seçeneklerin kenarı kırmızılaşır
  // (FormField'daki hatalı alan görünümüyle aynı dil).
  const idleBorder = (option: ChoiceOption<V>) => (error && !option.disabled ? "border-red-300" : "border-slate-200");

  // Seçili seçenekte nötr sayaç marka rengine geçer (seçimle aynı dil).
  const countBadge = (option: ChoiceOption<V>, selected: boolean, extraClass = "") => {
    if (!option.count || option.count < 1) return null;
    const tone = option.countTone || "neutral";
    return (
      <>
        {" "}
        <CountBadge count={option.count} tone={selected && tone === "neutral" ? "info" : tone} className={extraClass} />
      </>
    );
  };

  return (
    <div className={className}>
      <p id={`${groupId}-label`} className={labelHidden ? "sr-only" : "ui-form-label mb-1.5 text-xs font-bold text-slate-800"}>
        {label}
        {required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
        aria-describedby={[messageId, reasonsId].filter(Boolean).join(" ") || undefined}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        onKeyDown={onKeyDown}
        className={grid}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              id={`${groupId}-${option.value}`}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={option.value === tabStop ? 0 : -1}
              disabled={option.disabled}
              title={option.disabled ? option.disabledReason : undefined}
              onClick={() => onChange(option.value)}
              // Çipler sakin (sadelik): 32px, seçili açık marka dolgusu, seçili olmayan
              // çerçevesiz açık gri; hatalı grupta kırmızı kenar kalır. Dokunmatikte
              // dokunma alanı ui-touch-target ile 36px'e genişler.
              className={variant === "pills"
                ? `ui-touch-target inline-flex !min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-transparent bg-primary/[0.12] text-primary" : `${error && !option.disabled ? "border-red-300 bg-white" : "border-transparent bg-slate-100"} text-slate-700 hover:bg-slate-200/70`}`
                : `flex items-start gap-3 rounded-[var(--radius-surface)] border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed ${selected ? "border-primary bg-primary/[0.06]" : `${idleBorder(option)} bg-white hover:border-slate-300`}`}
            >
              {variant === "cards" && (
                <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-white" : "border-slate-300 bg-white"} ${option.disabled ? "opacity-50" : ""}`}>
                  {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              )}
              {variant === "pills" ? (
                <>
                  <span className="min-w-0">
                    <span className={`block text-sm leading-5 ${selected ? "font-semibold text-primary" : "font-medium text-slate-700"}`}>{option.label}</span>
                  </span>
                  {countBadge(option, selected)}
                </>
              ) : (
                // Pasif kartta ad ve açıklama soluklaşır; neden okunur kalır.
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${selected ? "text-primary" : "text-slate-800"} ${option.disabled ? "opacity-50" : ""}`}>
                    {option.label}
                    {countBadge(option, selected, "ml-0.5 align-[1px]")}
                  </span>
                  {option.description && <span className={`mt-0.5 block text-xs font-normal leading-5 text-slate-500 ${option.disabled ? "opacity-50" : ""}`}>{option.description}</span>}
                  {option.disabled && option.disabledReason && <span className="mt-0.5 block text-xs font-medium text-amber-700">{option.disabledReason}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {error ? (
        <p id={messageId} role="alert" className="ui-field-message mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-xs leading-5 text-slate-500">{hint}</p>
      ) : null}
      {reasonsId && <p id={reasonsId} className="mt-1.5 text-xs font-medium leading-5 text-amber-700">{disabledReasons.join(" · ")}</p>}
    </div>
  );
}
