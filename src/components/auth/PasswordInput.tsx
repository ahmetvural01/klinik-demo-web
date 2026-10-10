"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/Input";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size">;

/**
 * Göster/gizle düğmeli şifre alanı. Klinik ve platform girişi aynı alanı
 * kullanır (önceden yalnız klinik girişinde vardı). Ortak kütüphaneye
 * taşınması Dalga 2 isteğidir (profil, personel, görünmez giriş de kullanabilir).
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput({ className = "", ...rest }, ref) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Şifreyi gizle" : "Şifreyi göster";
  return (
    <span className="relative block">
      <Input ref={ref} type={visible ? "text" : "password"} className={`pr-11 ${className}`} {...rest} />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={label}
        title={label}
        className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </span>
  );
});
