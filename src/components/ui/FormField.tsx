import type { ComponentType, ReactNode } from "react";

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

// Not: bu bileşen kendi input'unu icat etmez, mevcut heterojen inputları
// (native input/select, PhoneInput, SearchSelect, checkbox) sarar — label,
// zorunlu-alan işareti, hata ve ipucu metnini tek bir standarda taşır.
export function FormField({ label, htmlFor, required, error, hint, children }: FormFieldProps) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-400">{hint}</p>
      ) : null}
    </label>
  );
}

export function inputErrorClass(hasError: boolean) {
  return hasError
    ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-200"
    : "border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20";
}

export interface FormSectionProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: ReactNode;
}

export function FormSection({ icon: Icon, title, description, children }: FormSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-start gap-3 border-b border-slate-100/80 pb-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-[0_6px_16px_rgba(13,125,111,0.08)]">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-extrabold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function FormErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 shadow-[0_8px_20px_rgba(220,38,38,0.06)]">
      {message}
    </div>
  );
}
