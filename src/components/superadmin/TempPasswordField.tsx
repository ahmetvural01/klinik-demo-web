"use client";

import { Wand2 } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { generateTemporaryPassword } from "./temp-password";

/**
 * Geçici şifre alanı + "Şifre üret" düğmesi (yeni klinik, klinik kullanıcısı,
 * platform yöneticisi formlarında aynı). Önceden FormField alan yerine
 * alanı ve düğmeyi saran div'e bağlanıyordu: hata metni ve aria-invalid
 * şifre kutusuna ulaşmıyordu (ekran okuyucu hatayı duymuyordu).
 */
export function TempPasswordField({
  id,
  value,
  onChange,
  error,
  hint = "En az 8 karakter. Kişiye güvenli bir yoldan iletin.",
  label = "Geçici şifre",
  length = 10,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  label?: string;
  /** Üretilen şifrenin uzunluğu (platform yöneticisi için daha uzun). */
  length?: number;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <FormField as="div" label={label} htmlFor={id} required error={error} hint={hint}>
      <div className="flex gap-1.5">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="new-password"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <IconButton icon={Wand2} title="Şifre üret" onClick={() => onChange(generateTemporaryPassword(length))} />
      </div>
    </FormField>
  );
}
