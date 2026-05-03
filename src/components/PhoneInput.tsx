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
 * Profesyonel telefon numarası input
 * Otomatik format: (0545) 404-6939
 * Max 11 karakter
 */
export default function PhoneInput({
  value,
  onChange,
  placeholder = "0545 404 6939",
  disabled = false,
  error,
  onBlur,
  label = "Telefon Numarası",
}: PhoneInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
    if (!raw) return onChange("");

    // Telefon numarası her zaman 0 ile başlamalı
    const normalized = raw.startsWith("0") ? raw : `0${raw}`.slice(0, 11);
    onChange(normalized);
  };

  const invalid = !!value && (!/^0\d{10}$/.test(value));

  return (
    <div className="space-y-1">
      {label && <label className="block text-xs font-semibold text-slate-700">{label}</label>}
      <input
        type="tel"
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder="05xxxxxxxxx"
        disabled={disabled}
        maxLength={11}
        className={`w-full rounded-lg border px-3 py-2 text-sm font-mono transition ${
          error || invalid
            ? "border-red-300 bg-red-50 text-red-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            : "border-slate-200 bg-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        } ${disabled ? "bg-slate-50 text-slate-500" : ""}`}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {invalid && (
        <p className="text-xs text-amber-600">Telefon 11 haneli olmalı ve 0 ile başlamalıdır.</p>
      )}
    </div>
  );
}
