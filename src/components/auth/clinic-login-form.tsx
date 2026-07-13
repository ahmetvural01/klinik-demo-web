"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { showToastSafe } from "@/lib/toast-client";

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

    window.location.href = "/anasayfa";
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

    window.location.href = "/anasayfa";
  };

  if (pendingToken) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(140deg,#f8fbfd_0%,#eefdf8_45%,#fff9ef_100%)] p-4">
        <form onSubmit={onSubmit2FA} className="relative w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl">
          <h2 className="text-xl font-black text-slate-900">İki Faktörlü Doğrulama</h2>
          <p className="mt-1 text-sm text-slate-500">Kimlik doğrulama uygulamanızdaki 6 haneli kodu girin.</p>
          <input
            className="mt-5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-center text-lg tracking-[0.3em] outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
            value={twoFactorCode}
            onChange={(e) => setTwoFactorCode(e.target.value.replace(/\s/g, "").slice(0, 12))}
            placeholder="000000"
            inputMode="numeric"
            autoFocus
            required
          />
          {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
          <button disabled={loading} className="mt-4 w-full rounded-xl bg-cyan-600 p-3 text-sm font-bold text-white transition hover:bg-cyan-700 disabled:opacity-50">
            {loading ? "Doğrulanıyor..." : "Doğrula ve Giriş Yap"}
          </button>
          <button type="button" onClick={() => { setPendingToken(null); setTwoFactorCode(""); setError(null); }} className="mt-2 w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-50">
            Geri dön
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-100 p-4 md:p-8">
      <div className="relative mx-auto grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl lg:grid-cols-[0.95fr_1.05fr]">
        <aside className="relative bg-slate-950 p-8 text-white md:p-10">
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-black tracking-wide">Klinik Yönetim Platformu</p>
                  <p className="text-xs text-slate-400">Yetkili personel paneli</p>
                </div>
              </div>
              <h1 className="mt-10 max-w-sm text-3xl font-black leading-tight md:text-4xl">Yetkili personel erişimi</h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
                Hasta, randevu, tedavi ve finans süreçleri için kurumunuza ait güvenli yönetim paneli.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-2 text-sm text-slate-300">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">Kurum ve rol bazlı yetkilendirme</div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">Hasta verileri için denetlenebilir erişim</div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">Tek panelden günlük operasyon takibi</div>
            </div>

            <p className="mt-10 text-xs text-slate-500">Yetkili kullanıcı girişi</p>
          </div>
        </aside>

        <form onSubmit={onSubmit} className="p-7 md:p-10 lg:p-12">
          <div>
            <h2 className="text-2xl font-black text-slate-950">Panele giriş</h2>
            <p className="mt-1 text-sm text-slate-500">Kurum kodu ve personel kimliğinizle devam edin.</p>
          </div>

          <div className="mt-7 space-y-4">
            <label className="block text-sm font-semibold text-slate-700">
              Kurum Kodu veya Kısa Adı
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="ornekklinik"
                autoComplete="organization"
                required
              />
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              TC Kimlik No
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
                value={identityNo}
                onChange={(e) => setIdentityNo(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="11 haneli"
                inputMode="numeric"
                autoComplete="username"
                required
              />
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Şifre
              <span className="relative mt-1.5 block">
                <input
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 pr-11 text-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                  title={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            <div className="flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-cyan-600" />
                Oturumu açık tut
              </label>
              <span className="text-xs text-slate-500">Yetkili erişim</span>
            </div>

            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}

            <button disabled={loading} className="w-full rounded-xl bg-cyan-600 p-3 text-sm font-bold text-white transition hover:bg-cyan-700 disabled:opacity-50">
              {loading ? "Giriş yapılıyor..." : "Panele Giriş Yap"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
