import { cloneElement, isValidElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import { Check } from "lucide-react";
import { IconFrame } from "@/components/ui/IconFrame";

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  /** Alan geçerli/onaylanmış olduğunda kısa bir check ikonu + yeşil kontur
   * gösterir (ör. TC kimlik doğrulaması tamamlandığında). `error` varsa
   * yok sayılır. */
  success?: boolean;
  children: ReactNode;
}

// Not: bu bileşen kendi input'unu icat etmez, mevcut heterojen inputları
// (native input/select, PhoneInput, SearchSelect, checkbox) sarar — label,
// zorunlu-alan işareti, hata ve ipucu metnini tek bir standarda taşır.
export function FormField({ label, htmlFor, required, error, hint, success, children }: FormFieldProps) {
  // Hata/ipucu metni önceden yalnızca görsel (kırmızı border + ayrı bir <p>)
  // olarak bağlıydı — screen reader input'a odaklanınca bunu hiç duymuyordu
  // (bkz. denetim raporu). `htmlFor` verilmişse ve tek bir input elemanı
  // sarmalanıyorsa aria-invalid/aria-describedby otomatik bağlanır.
  const errorId = htmlFor && error ? `${htmlFor}-error` : undefined;
  const hintId = htmlFor && hint && !error ? `${htmlFor}-hint` : undefined;
  const describedBy = errorId || hintId;
  const showSuccess = success && !error;

  const content = (describedBy || showSuccess) && isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        "aria-invalid": error ? true : undefined,
        "data-success": showSuccess ? "true" : undefined,
        "aria-describedby": [
          (children as ReactElement<{ "aria-describedby"?: string }>).props["aria-describedby"],
          describedBy,
        ].filter(Boolean).join(" ") || undefined,
      })
    : children;

  return (
    <label htmlFor={htmlFor} className="ui-form-field block">
      <span className="ui-form-label mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-800">
        {label}
        {required && <span className="text-red-500">*</span>}
        {showSuccess && (
          <Check className="ui-field-success-check h-3 w-3 text-emerald-600" strokeWidth={3} aria-hidden="true" />
        )}
      </span>
      {content}
      {error ? (
        <p id={errorId} role="alert" className="ui-field-message mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-slate-400">{hint}</p>
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
    <section className="ui-form-section ui-surface p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3 border-b border-slate-100/80 pb-3">
        <IconFrame icon={Icon} active size="lg" />
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
    <div className="ui-error-banner rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
      {message}
    </div>
  );
}
