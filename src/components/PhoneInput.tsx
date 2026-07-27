import React from "react";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  onBlur?: () => void;
  label?: string;
}

/**
 * Türkiye cep telefonu input — +90 alan kodu sabit olduğundan kullanıcıdan
 * yazması istenmez. Kanonik format: 10 haneli, 5 ile başlayan yerel numara
 * (ör. 5454046939), "545 404 69 39" olarak gruplu gösterilir. Eski "0" önekli
 * 11 haneli kayıtlar da (geriye dönük uyumluluk) kabul edilir ama girişte
 * baştaki 0 otomatik atılır.
 */
export default function PhoneInput({
  value,
  onChange,
  placeholder = "545 404 69 39",
  disabled = false,
  error,
  onBlur,
  label = "Telefon Numarası",
}: PhoneInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, "");
    // Eski format ya da yanlışlıkla 0 ile başlanırsa baştaki 0'ı at.
    if (raw.startsWith("0")) raw = raw.slice(1);
    onChange(raw.slice(0, 10));
  };

  const digits = value.startsWith("0") ? value.slice(1) : value;
  const grouped = digits.replace(/(\d{3})(\d{3})?(\d{2})?(\d{2})?/, (_, a, b, c, d) =>
    [a, b, c, d].filter(Boolean).join(" ")
  );
  const invalid = !!value && !/^5\d{9}$/.test(digits);

  return (
    <div className="space-y-1">
      {label && <label className="block text-xs font-semibold text-slate-700">{label}</label>}
      <div className={`flex items-center rounded-lg border transition ${
        error || invalid
          ? "border-red-300 bg-red-50 focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500"
          : "border-slate-200 bg-white focus-within:border-primary focus-within:ring-1 focus-within:ring-primary"
      } ${disabled ? "bg-slate-50" : ""}`}>
        <span className="pl-3 text-sm font-semibold text-slate-400">+90</span>
        <input
          type="tel"
          value={grouped}
          onChange={handleChange}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={13}
          className={`w-full rounded-lg bg-transparent px-2 py-2 text-sm font-mono outline-none ${
            error || invalid ? "text-red-900" : ""
          } ${disabled ? "text-slate-500" : ""}`}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {invalid && (
        <p className="text-xs text-amber-600">Telefon 10 haneli olmalı ve 5 ile başlamalıdır (ör. 545 404 69 39).</p>
      )}
    </div>
  );
}
