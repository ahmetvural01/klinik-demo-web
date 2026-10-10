"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { readFormText } from "@/components/auth/form-values";

type TwoFactorStepProps = {
  /** Kod sunucuya gönderilir; hata/başarı durumu çağıranda yönetilir. */
  onSubmit: (code: string) => void | Promise<void>;
  onBack: () => void;
  loading: boolean;
  error: string | null;
};

/**
 * İki adımlı doğrulama adımı — klinik ve platform girişinde TEK görünüm.
 * Önceden iki ayrı ekran vardı (farklı başlık, etiket, genişlik; platformda
 * kısa kod sessizce yok sayılıyordu). Yedek kodlar harf içerir: "Yedek kod
 * kullan" alanı telefonda harf klavyesine geçirir (önceden klinikte yalnız
 * rakam klavyesi açılıyordu, yedek kod yazılamıyordu).
 */
export function TwoFactorStep({ onSubmit, onBack, loading, error }: TwoFactorStepProps) {
  const [code, setCode] = useState("");
  const [backupMode, setBackupMode] = useState(false);
  const [fieldError, setFieldError] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    // Tarayıcının "tek kullanımlık kod" önerisi onChange tetiklemeden de dolabilir.
    const value = (readFormText(event.currentTarget, "code") || code).replace(/\s/g, "");
    setCode(value);
    if (value.length < 6) {
      setFieldError(backupMode ? "Yedek kodu eksiksiz girin." : "6 haneli kodu girin.");
      return;
    }
    setFieldError("");
    void onSubmit(value);
  };

  return (
    <form method="post" onSubmit={submit} noValidate className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-extrabold text-slate-900">İki adımlı doğrulama</h1>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          {backupMode ? "Kaydettiğiniz yedek kodlardan birini girin." : "Doğrulama uygulamanızdaki 6 haneli kodu girin."}
        </p>
      </div>
      {/* Tek alanlı adım: zorunlu yıldızı gürültü olurdu. */}
      <FormField label="Doğrulama kodu" error={fieldError || undefined}>
        <Input
          name="code"
          value={code}
          onChange={(event) => { setCode(event.target.value.replace(/\s/g, "").slice(0, 12)); setFieldError(""); }}
          inputMode={backupMode ? "text" : "numeric"}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="one-time-code"
          autoFocus
          className="text-center text-lg tracking-[0.3em]"
        />
      </FormField>
      {/* Ortak düğme (elle yazılmış bağlantı görünümlü düğme yerine); metin alanın soluna hizalı. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-3"
        onClick={() => { setBackupMode((value) => !value); setFieldError(""); }}
      >
        {backupMode ? "Uygulamadaki kodu kullan" : "Yedek kod kullan"}
      </Button>
      {error && <Callout tone="critical" role="alert">{error}</Callout>}
      <Button type="submit" loading={loading} fullWidth>
        {loading ? "Doğrulanıyor…" : "Doğrula"}
      </Button>
      <Button type="button" variant="ghost" icon={ArrowLeft} onClick={onBack} fullWidth disabled={loading}>
        Geri dön
      </Button>
    </form>
  );
}
