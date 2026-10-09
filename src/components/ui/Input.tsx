import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

/**
 * Ortak form kontrolleri. Renk/kenarlık/odak/hata görünümü globals.css'teki
 * `.ui-control` sınıfından gelir; burada yalnız tek tip yükseklik, iç boşluk
 * ve genişlik verilir. FormField içinde kullanıldığında hata ve ipucu
 * bağlantısı (aria-invalid / aria-describedby) otomatik kurulur.
 */
type ControlSize = "sm" | "md";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: ControlSize };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ size = "md", className = "", ...rest }, ref) {
  return <input ref={ref} className={`ui-control ${size === "sm" ? "ui-control-sm" : ""} ${className}`} {...rest} />;
});

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: ControlSize };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ size = "md", className = "", children, ...rest }, ref) {
  return (
    <select ref={ref} className={`ui-control ui-select ${size === "sm" ? "ui-control-sm" : ""} ${className}`} {...rest}>
      {children}
    </select>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className = "", rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={`ui-control ui-textarea ${className}`} {...rest} />;
});
