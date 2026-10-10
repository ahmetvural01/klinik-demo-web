import { cloneElement, isValidElement, useId, type ComponentType, type ReactElement, type ReactNode } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Callout } from "@/components/ui/Callout";

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  /**
   * "warning": ipucu amber renkte ve uyarı ikonuyla, ekran okuyucuya
   * duyurulur — kaydı engellemeyen ama bilinmesi gereken durum ("Bu telefonla
   * kayıtlı başka hasta var"). Engelleyen durum için `error` kullanın.
   */
  hintTone?: "neutral" | "warning";
  /** Alan geçerli/onaylanmış olduğunda kısa bir check ikonu + yeşil kontur
   * gösterir (ör. TC kimlik doğrulaması tamamlandığında). `error` varsa
   * yok sayılır. */
  success?: boolean;
  /**
   * "label" (varsayılan): tek kontrol — etiket kontrolü sarar, tıklayınca odaklar.
   * "div": BİLEŞİK kontrol (ülke kodu + numara, hasta seçici, birden çok
   * düğme) — kök role="group" ve aria-labelledby ile adlandırılır. Etiket
   * içteki ilk düğmeye bağlanmaz; önceden "Hasta" etiketine tıklamak seçici
   * içindeki "seçimi kaldır" düğmesine basıyordu. `htmlFor` verilirse etiket
   * yalnız o kontrolü işaret eder (ör. numara alanı).
   */
  as?: "label" | "div";
  /** Kök öğeye ek sınıf (ör. "sm:col-span-2") — sarmalayıcı div gerekmesin. */
  className?: string;
  children: ReactNode;
}

// Not: bu bileşen kendi input'unu icat etmez, mevcut heterojen inputları
// (native input/select, PhoneInput, SearchSelect, checkbox) sarar — label,
// zorunlu-alan işareti, hata ve ipucu metnini tek bir standarda taşır.
export function FormField({ label, htmlFor, required, error, hint, hintTone = "neutral", success, as = "label", className, children }: FormFieldProps) {
  // Hata/ipucu metni önceden yalnızca görsel (kırmızı border + ayrı bir <p>)
  // olarak bağlıydı — screen reader input'a odaklanınca bunu hiç duymuyordu
  // Tek bir alan sarmalanıyorsa aria-invalid/aria-describedby otomatik
  // bağlanır; htmlFor yoksa hata ve ipucu için benzersiz kimlik üretilir.
  const generatedId = useId();
  const fieldId = htmlFor || generatedId;
  const errorId = error ? `${fieldId}-error` : undefined;
  const hintId = hint && !error ? `${fieldId}-hint` : undefined;
  const describedBy = errorId || hintId;
  const showSuccess = success && !error;

  // Zorunluluk ekran okuyucuya kontrolün kendisinde söylenir (aria-required);
  // "*" görseldir, "yıldız" diye okunmaz. Bileşik alanda (as="div") kontrol
  // bizim değildir; ad sonuna "(zorunlu)" eklenir.
  const markRequired = Boolean(required) && as === "label";
  const content = (describedBy || showSuccess || markRequired) && isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        // Hata yoksa kontrolün kendi aria-invalid değeri korunur (yalnız zorunluluk için klonlanınca ezilmesin).
        "aria-invalid": error ? true : (children as ReactElement<{ "aria-invalid"?: unknown }>).props["aria-invalid"],
        "data-success": showSuccess ? "true" : undefined,
        ...(markRequired
          ? { "aria-required": (children as ReactElement<{ "aria-required"?: unknown }>).props["aria-required"] ?? true }
          : {}),
        "aria-describedby": [
          (children as ReactElement<{ "aria-describedby"?: string }>).props["aria-describedby"],
          describedBy,
        ].filter(Boolean).join(" ") || undefined,
      })
    : children;

  const labelContent = (
    <>
      {label}
      {required && <span className="text-red-500" aria-hidden="true">*</span>}
      {required && as === "div" && <span className="sr-only">(zorunlu)</span>}
      {showSuccess && (
        <Check className="ui-field-success-check h-3 w-3 text-emerald-600" strokeWidth={3} aria-hidden="true" />
      )}
    </>
  );
  const message = error ? (
    <p id={errorId} role="alert" className="ui-field-message mt-1.5 text-xs font-medium text-red-600">{error}</p>
  ) : hint ? (
    hintTone === "warning" ? (
      <p id={hintId} role="status" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{hint}</span>
      </p>
    ) : (
      // slate-500: kendi etiketi olan bileşenlerin ipucuyla aynı renk; slate-400
      // yer tutucu rengiydi (boş alanın altında yer tutucu gibi okunuyordu, ~2.3:1).
      <p id={hintId} className="mt-1.5 text-xs leading-5 text-slate-500">{hint}</p>
    )
  ) : null;
  const rootClass = className ? `ui-form-field block ${className}` : "ui-form-field block";
  const labelClass = "ui-form-label mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-800";

  if (as === "div") {
    const labelId = `${fieldId}-label`;
    return (
      <div role="group" aria-labelledby={labelId} aria-describedby={describedBy} className={rootClass}>
        {htmlFor ? (
          <label id={labelId} htmlFor={htmlFor} className={labelClass}>{labelContent}</label>
        ) : (
          <span id={labelId} className={labelClass}>{labelContent}</span>
        )}
        {content}
        {message}
      </div>
    );
  }

  // Hata ve ipucu <label>'ın DIŞINDA: içindeyken alanın erişilebilir adına
  // karışıyordu ("Tutar Tutarı girin."); aria-describedby ile zaten bağlılar.
  return (
    <div className={rootClass}>
      <label htmlFor={htmlFor} className="block">
        <span className={labelClass}>{labelContent}</span>
        {content}
      </label>
      {message}
    </div>
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

/**
 * Uzun sayfa formunda (SaveBar'lı) bir bölüm. Görünümü Section'la aynıdır:
 * başlık satırında küçük çizgi ikon, aynı boşluklar — ayar sayfasında Section
 * ile alt alta gelince iki ayrı kart dili oluşmasın (sözleşme §6.1: büyük
 * renkli ikon kutusu yok).
 */
export function FormSection({ icon: Icon, title, description, children }: FormSectionProps) {
  return (
    <section className="ui-form-section ui-surface">
      <div className="px-4 pb-1 pt-3.5">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0">{title}</span>
        </h2>
        {description && <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>}
      </div>
      <div className="px-4 pb-4 pt-2">{children}</div>
    </section>
  );
}

/**
 * Formun genel (sunucu) hatası — sayfa formundaki `Callout tone="critical"
 * role="alert"` ile TEK görünüm. FormModal `error` bunu kullanır.
 */
export function FormErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return <Callout tone="critical" role="alert">{message}</Callout>;
}
