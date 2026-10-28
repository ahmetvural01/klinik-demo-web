"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Checkbox } from "@/components/ui/Checkbox";
import { Disclosure } from "@/components/ui/Disclosure";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { AuthLayout, AuthLink } from "@/components/auth/AuthLayout";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { TwoFactorStep } from "@/components/auth/TwoFactorStep";
import { focusFirstEmpty, normalizeIdentityNo, readFormText } from "@/components/auth/form-values";
import { safeLoginNextPath } from "@/lib/routes";

// Şifre HİÇBİR ZAMAN burada saklanmaz — tarayıcının kendi şifre yöneticisi
// autoComplete="current-password" ile bunu güvenli şekilde yönetir.
// "Oturumu açık tut" işaretliyken yalnız KURUM ADI hatırlanır. TC kimlik no
// artık saklanmaz: ortak banko bilgisayarında sonraki kişi önceki personelin
// TC'sini görüyordu (KVKK); kullanıcı adını tarayıcının şifre yöneticisi önerir.
const REMEMBER_KEY = "km_remember_login";

function loadRememberedInstitution(): string {
  try {
    const raw = window.localStorage.getItem(REMEMBER_KEY);
    if (!raw) return "";
    const parsed: unknown = JSON.parse(raw);
    const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const institution = typeof record.institution === "string" ? record.institution : "";
    // Eski sürümün sakladığı TC kimlik no'yu bu cihazdan sil.
    if ("identityNo" in record) window.localStorage.setItem(REMEMBER_KEY, JSON.stringify({ institution }));
    return institution;
  } catch {
    return "";
  }
}

function saveRememberedInstitution(remember: boolean, institution: string) {
  try {
    if (remember) window.localStorage.setItem(REMEMBER_KEY, JSON.stringify({ institution }));
    else window.localStorage.removeItem(REMEMBER_KEY);
  } catch {
    // Gizli pencere / engellenmiş depolama: giriş yine çalışır.
  }
}

type Credentials = { institution: string; identityNo: string; password: string; remember: boolean };

type ClinicLoginFormProps = {
  /** Oturum bitince açık olan sayfa (`/klinik/giris?next=…`); güvenliyse girişten sonra oraya dönülür. */
  next?: string | null;
  /** `oturum`: oturum süresi dolduğu için gelindi; kısa bilgi gösterilir. */
  reason?: string | null;
};

export function ClinicLoginForm({ next, reason }: ClinicLoginFormProps = {}) {
  const nextPath = safeLoginNextPath(next);
  const sessionExpired = reason === "oturum";
  const idleLogout = reason === "zaman-asimi";
  const [institution, setInstitution] = useState("");
  const [identityNo, setIdentityNo] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingSurface, setPendingSurface] = useState<"clinic" | "superadmin">("clinic");
  const formRef = useRef<HTMLFormElement>(null);
  const institutionRef = useRef<HTMLInputElement>(null);
  const identityRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // Doğrulama adımında yeniden kullanılır (ilk adım ekrandan kalkmış olur).
  const credentialsRef = useRef<Credentials | null>(null);

  useEffect(() => {
    // Hidrasyondan önce yazılan / otomatik doldurulan değerleri duruma al:
    // aksi halde ilk yeniden çizimde React alanları boşaltır.
    const form = formRef.current;
    const typedInstitution = readFormText(form, "organization");
    const typedIdentity = normalizeIdentityNo(readFormText(form, "username"));
    const typedPassword = readFormText(form, "password");
    const remembered = loadRememberedInstitution();
    if (typedInstitution) setInstitution(typedInstitution);
    else if (remembered) {
      setInstitution(remembered);
      if (institutionRef.current) institutionRef.current.value = remembered;
      setRemember(true);
    }
    if (typedIdentity) setIdentityNo(typedIdentity);
    if (typedPassword) setPassword(typedPassword);
    focusFirstEmpty([institutionRef.current, identityRef.current, passwordRef.current]);
  }, []);

  const finishLogin = (credentials: Credentials, mustChangePassword: boolean) => {
    saveRememberedInstitution(credentials.remember, credentials.institution);
    // Yeni personel hesapları şifre sorulmadan TC kimlik no ile oluşturulur —
    // ilk girişte doğrudan şifre değiştirme adımına yönlendirilir.
    // Oturumu biten kişi kaldığı sayfaya döner.
    window.location.href = mustChangePassword ? "/profil?forcePasswordChange=1" : nextPath ?? "/anasayfa";
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    const form = event.currentTarget;
    // Değerler formun kendisinden okunur (bkz. form-values.ts); durum boş olsa da kaybolmaz.
    const credentials: Credentials = {
      institution: (readFormText(form, "organization") || institution).trim(),
      identityNo: normalizeIdentityNo(readFormText(form, "username") || identityNo),
      password: readFormText(form, "password") || password,
      remember: new FormData(form).has("remember"),
    };
    setInstitution(credentials.institution);
    setIdentityNo(credentials.identityNo);
    setPassword(credentials.password);
    setRemember(credentials.remember);
    setError(null);
    setLoading(true);
    // Başarılı girişte sayfa değişene kadar düğme "Giriş yapılıyor…" kalır:
    // panel yavaş açılırken ikinci tıklama ikinci giriş isteği göndermesin.
    let navigating = false;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // API sözleşmesi: institution, identityNo, password, rememberMe (önceki gövdeyle aynı).
        body: JSON.stringify({
          institution: credentials.institution,
          identityNo: credentials.identityNo,
          password: credentials.password,
          rememberMe: credentials.remember,
        }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(payload.message || "Giriş yapılamadı.");
        return;
      }

      if (payload.requires2FA || payload.requiresTwoFactor) {
        credentialsRef.current = credentials;
        setPendingSurface(payload.requiresTwoFactor ? "superadmin" : "clinic");
        setPendingToken(payload.pendingToken);
        return;
      }

      // Sistem sahibi kurum adına bir klinik yazdıysa sunucu o kliniğe gizli ve
      // tam yetkili oturum açar (normal klinik girişi gibi döner). Bu ekran
      // Platform panelini açmaz; panel /superadmin adresindedir.
      if (payload.role === "SUPERADMIN") {
        setError("Platform yönetimi için /superadmin adresinden giriş yapın.");
        return;
      }

      navigating = true;
      finishLogin(credentials, Boolean(payload.mustChangePassword));
    } catch {
      navigating = false;
      setError("Bağlantı kurulamadı. Bilgilerinizi kontrol edip yeniden deneyin.");
    } finally {
      if (!navigating) setLoading(false);
    }
  };

  const onSubmitCode = async (code: string) => {
    const credentials = credentialsRef.current;
    if (!pendingToken || !credentials || loading) return;
    setError(null);
    setLoading(true);
    let navigating = false;
    try {
      const res = await fetch(pendingSurface === "superadmin" ? "/api/auth/superadmin/verify-2fa" : "/api/auth/login/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken, code, institution: credentials.institution }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.message || "Kod hatalı.");
        return;
      }
      // Süperadmin ise de sunucu klinik oturumu açmıştır (payload.clinic).
      navigating = true;
      finishLogin(credentials, false);
    } catch {
      navigating = false;
      setError("Bağlantı kurulamadı. Bilgilerinizi kontrol edip yeniden deneyin.");
    } finally {
      if (!navigating) setLoading(false);
    }
  };

  const links = (
    <>
      <AuthLink href="/"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Tanıtım sayfası</AuthLink>
      <AuthLink href="/superadmin">Platform yöneticisi girişi</AuthLink>
    </>
  );

  if (pendingToken) {
    return (
      <AuthLayout links={links}>
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
    <AuthLayout links={links}>
      <form ref={formRef} method="post" onSubmit={onSubmit} className="space-y-4">
        <h1 className="font-display text-xl font-extrabold text-slate-900">Klinik girişi</h1>
        {idleLogout && !error && (
          <Callout tone="info" role="status" title="Oturum kapatıldı">
            2 saat işlem yapılmadığı için güvenlik amacıyla çıkış yapıldı.
          </Callout>
        )}
        {sessionExpired && !error && (
          <Callout tone="info" role="status" title="Oturum süreniz doldu">
            {nextPath ? "Yeniden giriş yapınca kaldığınız sayfaya dönersiniz." : "Devam etmek için yeniden giriş yapın."}
          </Callout>
        )}
        <FormField label="Kurum adı" required>
          <Input
            ref={institutionRef}
            name="organization"
            value={institution}
            onChange={(event) => setInstitution(event.target.value)}
            autoComplete="organization"
            autoCapitalize="off"
            required
          />
        </FormField>
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
        <Checkbox
          name="remember"
          checked={remember}
          onChange={setRemember}
          label="Oturumu 24 saat açık tut"
          description="İşaretlemezseniz 2 saat işlem yapılmadığında oturum kapanır. Kurum adı bu cihazda hatırlanır."
        />
        {error && <Callout tone="critical" role="alert">{error}</Callout>}
        <Button type="submit" loading={loading} fullWidth>
          {loading ? "Giriş yapılıyor…" : "Giriş yap"}
        </Button>
        <Disclosure title="Şifrenizi mi unuttunuz?">
          <p className="text-sm leading-6 text-slate-600">Klinik yöneticiniz Personel ekranından size yeni şifre belirleyebilir.</p>
        </Disclosure>
      </form>
    </AuthLayout>
  );
}
