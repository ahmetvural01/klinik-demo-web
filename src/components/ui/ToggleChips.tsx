"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import { CountBadge, type CountBadgeTone } from "@/components/ui/CountBadge";

export type ToggleChipOption<V extends string | number = string> = {
  value: V;
  label: string;
  /** Çipin yanında sayı (ör. o etiketteki hasta sayısı) — ortak CountBadge: 0 gösterilmez, 99+. */
  count?: number;
  /** Sayacın rengi: "critical" sorunlu/acil, "warning" dikkat, "neutral" bilgi. */
  countTone?: CountBadgeTone;
  disabled?: boolean;
  /** Pasif seçeneğin neden seçilemediği — grubun altında yazar, ekran okuyucu da duyar. */
  disabledReason?: string;
};

type ToggleChipsProps<V extends string | number> = {
  /** Grubun adı ("Hatırlatma günleri"). Görünür etiket; FormField ile sarmayın. */
  label: string;
  /** Ad görünmesin (yalnız ekran okuyucu) — ad zaten yanında yazıyorsa (ayar satırı, tablo). */
  labelHidden?: boolean;
  options: ToggleChipOption<V>[];
  /** Seçili değerler; sonuç her zaman seçeneklerin sırasıyla döner. */
  value: readonly V[];
  onChange: (value: V[]) => void;
  required?: boolean;
  /** Grup hatası ("En az bir gün seçin"). */
  error?: string;
  hint?: string;
  size?: "sm" | "md";
  className?: string;
};

/**
 * Birbirini DIŞLAMAYAN çoklu seçim çipleri (ör. ödeme hatırlatma günleri
 * [1] [3✓] [7✓] [14]). Tek seçim için ChoiceCards, açık/kapalı ayar için
 * Switch kullanılır. Önceden aynı iş elle onay kutulu kartlarla ve elle
 * yazılmış gün pilleriyle yapılıyordu. role="group" + her çipte aria-pressed;
 * Tab ile gezilir, Boşluk/Enter ile seçilir.
 *
 *   <ToggleChips label="Vadeden kaç gün önce" value={days} onChange={setDays}
 *     options={[1, 3, 7, 14].map((d) => ({ value: d, label: `${d} gün` }))} />
 */
export function ToggleChips<V extends string | number>({
  label,
  labelHidden = false,
  options,
  value,
  onChange,
  required = false,
  error,
  hint,
  size = "md",
  className = "",
}: ToggleChipsProps<V>) {
  const id = useId();
  const labelId = `${id}-label`;
  const messageId = error || hint ? `${id}-message` : undefined;
  // Pasif çiplerin nedeni grubun altında yazar ve gruba bağlanır (title
  // dokunmatikte görünmüyordu; sözleşme §0.3 "Pasif seçenek nedenini söyler").
  const disabledReasons = options.filter((option) => option.disabled && option.disabledReason).map((option) => `${option.label}: ${option.disabledReason}`);
  const reasonsId = disabledReasons.length > 0 ? `${id}-reasons` : undefined;
  const selected = new Set<V>(value);

  const toggle = (option: ToggleChipOption<V>) => {
    if (option.disabled) return;
    const next = new Set(selected);
    if (next.has(option.value)) next.delete(option.value);
    else next.add(option.value);
    const known = new Set(options.map((item) => item.value));
    // Seçenek sırası korunur; listede olmayan eski değerler (ör. elle girilmiş
    // özel gün) sessizce silinmez, sona eklenir.
    onChange([
      ...options.filter((item) => next.has(item.value)).map((item) => item.value),
      ...value.filter((item) => !known.has(item) && next.has(item)),
    ]);
  };

  return (
    <div className={className}>
      <p id={labelId} className={labelHidden ? "sr-only" : "ui-form-label mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-800"}>
        {label}
        {/* Grup rolünde yerel "zorunlu" bilgisi yok; ekran okuyucuya sözle söylenir. */}
        {required && <><span className="text-red-500" aria-hidden="true">*</span><span className="sr-only">(zorunlu)</span></>}
      </p>
      <div role="group" aria-labelledby={labelId} aria-describedby={[messageId, reasonsId].filter(Boolean).join(" ") || undefined} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = selected.has(option.value);
          // Seçili çipte nötr sayaç marka rengine geçer (ChoiceCards ile aynı).
          const tone = option.countTone || "neutral";
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={on}
              disabled={option.disabled}
              title={option.disabled ? option.disabledReason : undefined}
              onClick={() => toggle(option)}
              // sm görünüşte 32px; dokunmatikte ui-touch-target dokunma alanını 36px'e genişletir (§6.3).
              className={`ui-touch-target inline-flex items-center gap-1.5 rounded-full border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${size === "sm" ? "!min-h-8 px-3 text-xs" : "min-h-9 px-3.5 text-sm"} ${on ? "border-primary bg-primary/10 text-primary" : `bg-white text-slate-700 hover:border-slate-300 ${error && !option.disabled ? "border-red-300" : "border-slate-200"}`}`}
            >
              {on && <Check className="-ml-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={3} aria-hidden="true" />}
              <span>{option.label}</span>
              {option.count ? (
                <>
                  {" "}
                  <CountBadge count={option.count} tone={on && tone === "neutral" ? "info" : tone} />
                </>
              ) : null}
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
