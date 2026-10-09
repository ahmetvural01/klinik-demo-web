"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Building2, Eye, EyeOff, ShieldCheck, UsersRound } from "lucide-react";
import { showToastSafe } from "@/lib/toast-client";
import { Button } from "@/components/ui/Button";
import { DentalMark } from "@/components/brand/DentalMark";
import { CepKlinikMark } from "@/components/brand/CepKlinikMark";
import { BRAND_NAME } from "@/lib/brand";

const AUTH_IMAGE = "/marketing/auth-dental-clinic.webp";

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
    <div className="fixed inset-0 -z-10 bg-slate-100">
      <Image
        src={AUTH_IMAGE}
        alt="Dijital diş şeması ve tedavi koltuğu bulunan modern diş kliniği"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[42%_center]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/10 via-transparent to-white/35" />
    </div>
  );
}

function BrandMark() {
  return (
    <Link href="/" className="fixed left-4 top-4 z-20 flex items-center gap-3 rounded-lg border border-white/70 bg-white/90 px-3 py-2 shadow-lg shadow-slate-900/10 backdrop-blur-md sm:left-6 sm:top-6" aria-label={`${BRAND_NAME} ana sayfa`}>
      <span className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-[#087f73] text-white shadow-[0_8px_20px_rgba(8,127,115,.25)]">
        <CepKlinikMark className="h-6 w-6" />
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#ff8063]" />
      </span>
      <span><span className="block text-sm font-black leading-none text-slate-950">{BRAND_NAME}</span><span className="mt-1 block text-[9px] font-black uppercase text-slate-400">Diş Klinik Yönetimi</span></span>
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
  const [pendingSurface, setPendingSurface] = useState<"clinic" | "superadmin">("clinic");
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
    if (loading) { event?.preventDefault(); return; }
    try {
      event.preventDefault();
      setLoading(true);
      setError(null);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institution: institution.trim(), identityNo: identityNo.trim(), password, rememberMe: remember }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = payload.message || "Giriş başarısız";
        setError(msg);
        try { showToastSafe({ title: 'Hata', message: msg, type: 'error' }); } catch {}
        return;
      }

      if (payload.requires2FA || payload.requiresTwoFactor) {
        setPendingSurface(payload.requiresTwoFactor ? "superadmin" : "clinic");
        setPendingToken(payload.pendingToken);
        return;
      }

      // Sistem sahibi klinik adı yazdıysa sunucu o kliniğe tam yetkili oturum
      // açar (payload.clinic); "superadmin" yazdıysa Platform Yönetimi açılır.
      if (payload.role === "SUPERADMIN" && !payload.clinic) {
        window.location.href = "/superadmin/panel";
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

    } catch {
      setError("Bağlantı kurulamadı. Bilgilerinizi kontrol edip yeniden deneyin.");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit2FA = async (event: FormEvent) => {
    if (loading) { event?.preventDefault(); return; }
    try {
      event.preventDefault();
      if (!pendingToken) return;
      setLoading(true);
      setError(null);

      const res = await fetch(pendingSurface === "superadmin" ? "/api/auth/superadmin/verify-2fa" : "/api/auth/login/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken, code: twoFactorCode.trim(), institution: institution.trim() }),
      });

      const payload = await res.json().catch(() => ({}));

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

      // Klinik açılamadıysa (ör. silinmiş) sistem sahibi klinik listesinden seçer.
      window.location.href = payload.role !== "SUPERADMIN" || payload.clinic
        ? "/anasayfa"
        : payload.clinicError ? "/superadmin/institutions" : "/superadmin/panel";

    } catch {
      setError("Bağlantı kurulamadı. Bilgilerinizi kontrol edip yeniden deneyin.");
    } finally {
      setLoading(false);
    }
  };

  if (pendingToken) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4 sm:justify-end sm:p-8 lg:p-12">
        <AuthBackground />
        <BrandMark />
        <form method="post" onSubmit={onSubmit2FA} className="auth-panel mt-20 w-full max-w-md rounded-lg p-6 shadow-[0_28px_80px_rgba(15,23,42,.2)] sm:mt-0 sm:p-8">
          <div className="auth-panel-heading">
            <span className="auth-panel-icon"><ShieldCheck className="h-5 w-5" /></span>
            <div>
              <p className="auth-eyebrow">Güvenli erişim</p>
              <h2 className="text-xl font-black text-slate-900">İki Faktörlü Doğrulama</h2>
            </div>
          </div>
          <p className="mt-1 text-sm text-slate-500">Kimlik doğrulama uygulamanızdaki 6 haneli kodu veya bir yedek kodu girin.</p>
          <input aria-label={"Doğrulama kodu"}
            className="auth-input mt-5 w-full px-3 py-3 text-center text-lg"
            value={twoFactorCode}
            onChange={(e) => setTwoFactorCode(e.target.value.replace(/\s/g, "").slice(0, 12))}
            placeholder="000000"
            inputMode={pendingSurface === "superadmin" ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoFocus
            required
          />
          {error && <p role="alert" aria-live="polite" className="auth-status auth-status-error mt-3 px-3 py-2 text-sm font-semibold">{error}</p>}
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
    <main className="flex min-h-dvh items-start justify-center px-4 pb-8 pt-28 sm:items-center sm:justify-end sm:px-8 sm:py-12 lg:px-12 xl:px-20">
      <AuthBackground />
      <BrandMark />
      <form method="post" onSubmit={onSubmit} className="auth-panel w-full max-w-[470px] rounded-lg border-white/80 bg-white/95 p-6 shadow-[0_30px_90px_rgba(15,23,42,.22)] backdrop-blur-xl sm:p-8">
        <div className="auth-brand-row">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-lg bg-emerald-50 text-[#087f73]"><DentalMark className="h-8 w-8" /></span>
          <div>
            <p className="auth-eyebrow">Yetkili personel girişi</p>
            <h1 className="text-2xl font-black text-slate-950">Klinik paneline giriş</h1>
          </div>
        </div>
        <div className="mt-3 border-b border-slate-100 pb-5">
          <p className="mt-1 text-sm leading-6 text-slate-500">Kurumunuzda tanımlı bilgilerle güvenli çalışma alanınıza devam edin.</p>
        </div>

          <div className="mt-6 space-y-4">
            <label className="auth-label block text-xs font-bold">
              Kurum Adı
              <input
                name="organization"
                className="auth-input mt-1.5 w-full px-3 py-3 text-sm"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="Kurumunuzun sistemde kayıtlı adı"
                autoComplete="organization"
                autoFocus
                required
              />
              <span className="mt-1.5 block text-[11px] font-medium leading-4 text-slate-400">Demo kullanıyorsanız size verilen kurum adını eksiksiz yazın.</span>
            </label>

            <label className="auth-label block text-xs font-bold">
              TC Kimlik / Personel No
              <input
                name="username"
                className="auth-input mt-1.5 w-full px-3 py-3 text-sm"
                value={identityNo}
                onChange={(e) => setIdentityNo(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="Kimlik veya personel numaranız"
                inputMode="numeric"
                autoComplete="username"
                required
              />
            </label>

            <label className="auth-label block text-xs font-bold">
              Şifre
              <span className="relative mt-1.5 block">
                <input
                  name="password"
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
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-600" title="İşaretliyse oturum 24 saat, işaretli değilse 3 saat sonra kendiliğinden sona erer.">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-primary" />
                <span><span className="block font-semibold text-slate-700">Bu cihazda oturumu açık tut</span><span className="mt-0.5 block text-[11px] text-slate-400">Oturum 24 saat boyunca açık kalır.</span></span>
              </label>
            </div>

            {error && <p role="alert" aria-live="polite" className="auth-status auth-status-error px-3 py-2 text-sm font-semibold">{error}</p>}

            <Button type="submit" loading={loading} fullWidth icon={ArrowRight}>
              {loading ? "Giriş yapılıyor..." : "Panele Giriş Yap"}
            </Button>

            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
              <span className="flex items-center gap-2 text-[11px] font-bold text-slate-500"><Building2 className="h-4 w-4 text-[#087f73]" /> Kurum bazlı erişim</span>
              <span className="flex items-center gap-2 text-[11px] font-bold text-slate-500"><UsersRound className="h-4 w-4 text-[#087f73]" /> Yetkiye göre görünüm</span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition-colors hover:text-[#087f73]"><ArrowLeft className="h-3.5 w-3.5" /> Tanıtım sayfasına dön</Link>
              <Link href="/superadmin" className="text-xs font-bold text-slate-500 transition-colors hover:text-[#087f73]">Platform yöneticisi girişi</Link>
            </div>
          </div>
        </form>
    </main>
  );
}
