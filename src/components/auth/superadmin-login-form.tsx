"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { AuthLayout, AuthLink } from "@/components/auth/AuthLayout";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { TwoFactorStep } from "@/components/auth/TwoFactorStep";
import { focusFirstEmpty, normalizeIdentityNo, readFormText } from "@/components/auth/form-values";

export function SuperadminLoginForm() {
  const [identityNo, setIdentityNo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Şifre doğrulandı ama TOTP/yedek kod bekleniyor (2FA zaten kuruluysa).
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const identityRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Hidrasyondan önce yazılan / otomatik doldurulan değerler kaybolmasın (bkz. form-values.ts).
    const typedIdentity = normalizeIdentityNo(readFormText(formRef.current, "username"));
    const typedPassword = readFormText(formRef.current, "password");
    if (typedIdentity) setIdentityNo(typedIdentity);
    if (typedPassword) setPassword(typedPassword);
    focusFirstEmpty([identityRef.current, passwordRef.current]);
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    const form = event.currentTarget;
    const credentials = {
      identityNo: normalizeIdentityNo(readFormText(form, "username") || identityNo),
      password: readFormText(form, "password") || password,
    };
    setIdentityNo(credentials.identityNo);
    setPassword(credentials.password);
    setError(null);
    setLoading(true);
    // Başarılı girişte sayfa değişene kadar düğme yükleniyor kalır (ikinci istek gitmesin).
    let navigating = false;
    try {
      const res = await fetch("/api/auth/superadmin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Giriş yapılamadı.");
        return;
      }
      if (data.requiresTwoFactor) {
        setPendingToken(data.pendingToken);
        return;
      }
      navigating = true;
      window.location.href = "/superadmin/panel";
    } catch {
      navigating = false;
      setError("Bağlantı kurulamadı. Bilgilerinizi kontrol edip yeniden deneyin.");
    } finally {
      if (!navigating) setLoading(false);
    }
  };

  const onSubmitCode = async (code: string) => {
    if (!pendingToken || loading) return;
    setError(null);
    setLoading(true);
    let navigating = false;
    try {
      const res = await fetch("/api/auth/superadmin/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Kod hatalı.");
        return;
      }
      navigating = true;
      window.location.href = "/superadmin/panel";
    } catch {
      navigating = false;
      setError("Bağlantı kurulamadı. Bilgilerinizi kontrol edip yeniden deneyin.");
    } finally {
      if (!navigating) setLoading(false);
    }
  };

  const links = <AuthLink href="/klinik/giris">Klinik girişi</AuthLink>;

  if (pendingToken) {
    return (
      <AuthLayout variant="platform" links={links}>
        <TwoFactorStep
          loading={loading}
          error={error}
          onSubmit={onSubmitCode}
          onBack={() => { setPendingToken(null); setError(null); }}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout variant="platform" links={links}>
      <form ref={formRef} method="post" onSubmit={onSubmit} className="space-y-4">
        <div>
          <p className="text-xs font-bold text-slate-500">Platform yönetimi</p>
          <h1 className="mt-1 font-display text-xl font-extrabold text-slate-900">Süperadmin girişi</h1>
        </div>
        <FormField label="TC kimlik no" required>
          <Input
            ref={identityRef}
            name="username"
            value={identityNo}
            onChange={(event) => setIdentityNo(normalizeIdentityNo(event.target.value))}
            inputMode="numeric"
            autoComplete="username"
            placeholder="11 haneli"
            required
          />
        </FormField>
        <FormField label="Şifre" required>
          <PasswordInput
            ref={passwordRef}
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </FormField>
        {error && <Callout tone="critical" role="alert">{error}</Callout>}
        <Button type="submit" loading={loading} fullWidth>
          {loading ? "Giriş yapılıyor…" : "Giriş yap"}
        </Button>
      </form>
    </AuthLayout>
  );
}
