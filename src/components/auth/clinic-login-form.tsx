"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { showToastSafe } from "@/lib/toast-client";
import { Button } from "@/components/ui/Button";
import { ModuleIcon } from "@/components/ui/ModuleIcon";

const HERO_IMAGE = "/clinic-workspace-hero.jpg";

// Şifre HİÇBİR ZAMAN burada saklanmaz — tarayıcının kendi şifre yöneticisi
// autoComplete="current-password" ile bunu güvenli şekilde yönetir. Burada
// yalnızca gizli olmayan kimlik alanları ("Oturumu açık tut" işaretliyken)
// hatırlanır ki kullanıcı her seferinde kurum kodunu yeniden yazmasın.
const REMEMBER_KEY = "km_remember_login";

function loadRememberedLogin(): { institution: string; identityNo: string } | null {
  try {
    const raw = window.localStorage.getItem(REMEMBER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function AuthBackground() {
  return (
    <div className="fixed inset-0 -z-10 bg-slate-950">
      <Image
        src={HERO_IMAGE}
        alt="Diş hekimliği muayenesi"
        fill
        priority
        unoptimized
        className="object-cover opacity-45"
      />
    </div>
  );
}

function BrandMark() {
  return (
    <Link href="/" className="fixed left-6 top-6 z-10 flex items-center gap-2.5" aria-label="Ana sayfa">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0d7d6f] to-[#0a5b57] text-sm font-black text-white shadow-sm">
        KM
      </span>
      <span className="text-sm font-black tracking-tight text-white drop-shadow">KlinikModern</span>
    </Link>
  );
}

export function ClinicLoginForm() {
  const [institution, setInstitution] = useState("");
  const [identityNo, setIdentityNo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const remembered = loadRememberedLogin();
    if (remembered) {
      setInstitution(remembered.institution);
      setIdentityNo(remembered.identityNo);
      setRemember(true);
    }
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institution: institution.trim(), identityNo: identityNo.trim(), password, rememberMe: remember }),
    });

    const payload = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      const msg = payload.message || "Giriş başarısız";
      setError(msg);
      try { showToastSafe({ title: 'Hata', message: msg, type: 'error' }); } catch {}
      return;
    }

    if (payload.requires2FA) {
      setPendingToken(payload.pendingToken);
      return;
    }

    try {
      if (remember) {
        window.localStorage.setItem(REMEMBER_KEY, JSON.stringify({ institution: institution.trim(), identityNo: identityNo.trim() }));
      } else {
        window.localStorage.removeItem(REMEMBER_KEY);
      }
    } catch {}

    // Yeni personel hesapları şifre sorulmadan TC kimlik no ile oluşturulur —
    // ilk girişte doğrudan şifre değiştirme adımına yönlendirilir (bkz.
    // kullanıcı geri bildirimi — akıcı personel ekleme süreci).
    window.location.href = payload.mustChangePassword ? "/profil?forcePasswordChange=1" : "/anasayfa";
  };

  const onSubmit2FA = async (event: FormEvent) => {
    event.preventDefault();
    if (!pendingToken) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/login/verify-2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken, code: twoFactorCode.trim() }),
    });

    const payload = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      const msg = payload.message || "Kod hatalı";
      setError(msg);
      try { showToastSafe({ title: 'Hata', message: msg, type: 'error' }); } catch {}
      return;
    }

    try {
      if (remember) {
        window.localStorage.setItem(REMEMBER_KEY, JSON.stringify({ institution: institution.trim(), identityNo: identityNo.trim() }));
      } else {
        window.localStorage.removeItem(REMEMBER_KEY);
      }
    } catch {}

    window.location.href = "/anasayfa";
  };

  if (pendingToken) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <AuthBackground />
        <BrandMark />
        <form onSubmit={onSubmit2FA} className="auth-panel mt-14 w-full max-w-sm p-6 sm:mt-0 sm:p-7">
          <div className="auth-panel-heading">
            <span className="auth-panel-icon"><ShieldCheck className="h-5 w-5" /></span>
            <div>
              <p className="auth-eyebrow">Güvenli erişim</p>
              <h2 className="text-xl font-black text-slate-900">İki Faktörlü Doğrulama</h2>
            </div>
          </div>
          <p className="mt-1 text-sm text-slate-500">Kimlik doğrulama uygulamanızdaki 6 haneli kodu girin.</p>
          <input
            className="auth-input mt-5 w-full px-3 py-3 text-center text-lg"
            value={twoFactorCode}
            onChange={(e) => setTwoFactorCode(e.target.value.replace(/\s/g, "").slice(0, 12))}
            placeholder="000000"
            inputMode="numeric"
            autoFocus
            required
          />
          {error && <p className="auth-status auth-status-error mt-3 px-3 py-2 text-sm font-semibold">{error}</p>}
          <Button type="submit" loading={loading} fullWidth icon={ArrowRight} className="mt-4">
            {loading ? "Doğrulanıyor..." : "Doğrula ve Giriş Yap"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => { setPendingToken(null); setTwoFactorCode(""); setError(null); }} fullWidth className="mt-2">
            Geri dön
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-8 sm:items-center sm:py-12">
      <AuthBackground />
      <BrandMark />
      <form onSubmit={onSubmit} className="auth-panel mt-14 w-full max-w-md p-6 sm:mt-0 sm:p-8">
        <div className="auth-brand-row">
          <span className="auth-panel-icon"><ModuleIcon module="calendar" size="md" /></span>
          <div>
            <p className="auth-eyebrow">Yetkili personel girişi</p>
            <h1 className="text-xl font-black text-slate-950">Panele giriş</h1>
          </div>
        </div>
        <div className="mt-3 border-b border-slate-100 pb-5">
          <p className="mt-1 text-sm text-slate-500">Kurum ve personel bilgilerinizle devam edin.</p>
        </div>

          <div className="mt-6 space-y-4">
            <label className="auth-label block text-xs font-bold">
              Kurum Kodu veya Kısa Adı
              <input
                className="auth-input mt-1.5 w-full px-3 py-3 text-sm"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="ornekklinik"
                autoComplete="organization"
                required
              />
            </label>

            <label className="auth-label block text-xs font-bold">
              TC Kimlik No
              <input
                className="auth-input mt-1.5 w-full px-3 py-3 text-sm"
                value={identityNo}
                onChange={(e) => setIdentityNo(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="11 haneli"
                inputMode="numeric"
                autoComplete="username"
                required
              />
            </label>

            <label className="auth-label block text-xs font-bold">
              Şifre
              <span className="relative mt-1.5 block">
                <input
                  className="auth-input w-full px-3 py-3 pr-11 text-sm"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="auth-icon-button absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg"
                  aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                  title={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            <div className="flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600" title="İşaretliyse oturum 24 saat, işaretli değilse 3 saat sonra kendiliğinden sona erer.">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-primary" />
                Oturumu açık tut (24 saat)
              </label>
            </div>

            {error && <p className="auth-status auth-status-error px-3 py-2 text-sm font-semibold">{error}</p>}

            <Button type="submit" loading={loading} fullWidth icon={ArrowRight}>
              {loading ? "Giriş yapılıyor..." : "Panele Giriş Yap"}
            </Button>
          </div>
        </form>
    </main>
  );
}
