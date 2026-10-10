"use client";

import { forwardRef, useState, type ChangeEvent, type FocusEvent, type InputHTMLAttributes } from "react";
import { analyzeTurkishMoney, compareMoney, formatMoneyInput } from "@/lib/money-input";

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type" | "size" | "inputMode"> & {
  /**
   * Normalize tutar metni ("1250.50") ya da "" (boş); formda METİN olarak
   * saklayın. Değer Türkçe kuralla okunur: normalize olmayan her değeri
   * (sunucu Decimal'i, hesaplanan sayı) `toMoneyValue(x) ?? ""` ile verin —
   * tam 3 ondalıklı makine metni ("12.345") binlik sayılır, 12,35 değil
   * 12.345 TL görünür (sözleşme §2.4).
   */
  value: string | number | null | undefined;
  /**
   * Her tuşta çağrılır: geçerli tutar → "1250.50", boş → "", çözülemeyen
   * yazı → yazının kendisi (doğrulamada `moneyInputError` hata metni verir).
   */
  onChange: (value: string) => void;
  size?: "sm" | "md";
  /** Eksi tutar yazılabilsin (fiyat farkı, düzeltme). Varsayılan: hayır. */
  allowNegative?: boolean;
};

/**
 * Tutar alanı — TEK görünüm ve TEK ayrıştırma kuralı (lib/money-input).
 * Solda ₺, mobilde ondalıklı sayı klavyesi; "3.500", "1.250,50", "1250.5"
 * kabul edilir ve alandan çıkınca "3.500" / "1.250,50" biçimine getirilir.
 * Önceden her form kendi ayrıştırıcısını yazıyordu ve "3.500" bazı
 * ekranlarda 3,50 TL kaydediliyordu. FormField içinde kullanılır:
 *
 *   <FormField label="Tutar" required htmlFor="odeme-tutar" error={errors.amount}>
 *     <MoneyInput id="odeme-tutar" value={amount} onChange={setAmount} />
 *   </FormField>
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, size = "md", allowNegative = false, className = "", onBlur, placeholder = "0,00", maxLength = 20, "aria-invalid": ariaInvalid, ...rest },
  ref,
) {
  const valueKey = value === null || value === undefined ? "" : String(value);
  // Sonsuz/NaN sayı alanda "NaN" yazmasın (eşitleme yolundaki gibi boş sayılır).
  const [text, setText] = useState(() => (typeof value === "number" && !Number.isFinite(value) ? "" : formatMoneyInput(value)));
  // Son yazılan/gösterilen değer: üst bileşen aynı tutarı geri verdiğinde
  // (ör. "3.5" yazılırken "3.50") yazılan metin bozulmasın.
  const [synced, setSynced] = useState(valueKey);
  const [showInvalid, setShowInvalid] = useState(false);

  // Dışarıdan gelen değişiklik (form sıfırlama, "Tamamını yaz" gibi).
  if (valueKey !== synced && compareMoney(value, synced) !== 0) {
    setSynced(valueKey);
    setText(typeof value === "number" && !Number.isFinite(value) ? "" : formatMoneyInput(value));
    setShowInvalid(false);
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    // Harf ve simgeler yazılmaz (yapıştırılan "₺ 1.250,50 TL" de temizlenir).
    const raw = event.target.value.replace(allowNegative ? /[^\d.,\s+\-−]/g : /[^\d.,\s+]/g, "");
    const result = analyzeTurkishMoney(raw, { allowNegative });
    const next = result.ok ? result.value : result.reason === "empty" ? "" : raw.trim();
    setText(raw);
    setSynced(next);
    if (result.ok || result.reason === "empty") setShowInvalid(false);
    onChange(next);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const result = analyzeTurkishMoney(text, { allowNegative });
    if (result.ok) setText(formatMoneyInput(result.value));
    // Çözülemeyen yazı alandan çıkınca kırmızı kenarla işaretlenir; metni
    // FormField `error` (moneyInputError) söyler.
    setShowInvalid(!result.ok && result.reason !== "empty");
    onBlur?.(event);
  };

  return (
    <div className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-slate-500">₺</span>
      <input
        {...rest}
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        maxLength={maxLength}
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-invalid={ariaInvalid ?? (showInvalid ? true : undefined)}
        className={`ui-control ${size === "sm" ? "ui-control-sm" : ""} pl-7 tabular-nums ${className}`}
      />
    </div>
  );
});
