"use client";

import { FormEvent, useState } from "react";
import { showToastSafe } from "@/lib/toast-client";

export function SuperadminLoginForm() {
  const [identityNo, setIdentityNo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Şifre doğrulandı ama TOTP/yedek kod bekleniyor (2FA zaten kuruluysa).
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/superadmin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityNo, password }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      const msg = data.message || "Giriş başarısız";
      setError(msg);
      try { showToastSafe({ title: 'Hata', message: msg, type: 'error' }); } catch {}
      return;
    }

    if (data.requiresTwoFactor) {
      setPendingToken(data.pendingToken);
      return;
    }

    // Şifre doğru ama 2FA henüz kurulmamış — sunucu sınırlı bir oturum açtı,
    // zorunlu kurulum ekranına yönlendir (bkz. mustSetup2fa).
    window.location.href = data.mustSetup2fa ? "/superadmin/2fa-zorunlu" : "/superadmin/panel";
  };

  const onSubmitCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!pendingToken || code.trim().length < 6) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/superadmin/verify-2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken, code: code.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      const msg = data.message || "Kod hatalı";
      setError(msg);
      try { showToastSafe({ title: 'Hata', message: msg, type: 'error' }); } catch {}
      return;
    }

    window.location.href = "/superadmin/panel";
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex items-center justify-center p-4">
      {pendingToken ? (
        <form onSubmit={onSubmitCode} className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-7 text-white shadow-2xl">
          <div className="mb-6">
            <p className="text-xs tracking-widest text-emerald-300">İKİ FAKTÖRLÜ DOĞRULAMA</p>
            <h1 className="mt-2 text-3xl font-black">Doğrulama Kodu</h1>
            <p className="mt-1 text-sm text-slate-300">Kimlik doğrulayıcı uygulamanızdaki 6 haneli kodu veya bir yedek kodu girin.</p>
          </div>

          <label className="mb-4 block text-sm font-semibold text-slate-200">
            Kod
            <input
              className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2.5 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-300"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              required
            />
          </label>

          {error && <p className="mb-3 text-sm text-rose-300">{error}</p>}

          <button disabled={loading} className="w-full rounded-xl bg-emerald-500 p-3 text-sm font-bold text-slate-900 hover:bg-emerald-400 transition disabled:opacity-50">
            {loading ? "Doğrulanıyor..." : "Doğrula ve Giriş Yap"}
          </button>
          <button
            type="button"
            onClick={() => { setPendingToken(null); setCode(""); setError(null); }}
            className="mt-3 w-full text-center text-xs text-slate-400 hover:text-slate-200"
          >
            ← Geri dön
          </button>
        </form>
      ) : (
        <form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-7 text-white shadow-2xl">
          <div className="mb-6">
            <p className="text-xs tracking-widest text-emerald-300">YÖNETİM PANELİ</p>
            <h1 className="mt-2 text-3xl font-black">Yönetici Girişi</h1>
            <p className="mt-1 text-sm text-slate-300">Sistem yönetimi için kimlik bilgilerinizi girin.</p>
          </div>

          <label className="mb-4 block text-sm font-semibold text-slate-200">
            TC Kimlik No
            <input
              className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              value={identityNo}
              onChange={(e) => setIdentityNo(e.target.value)}
              placeholder="11 haneli"
              required
            />
          </label>

          <label className="mb-4 block text-sm font-semibold text-slate-200">
            Şifre
            <input
              className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="mb-3 text-sm text-rose-300">{error}</p>}

          <button disabled={loading} className="w-full rounded-xl bg-emerald-500 p-3 text-sm font-bold text-slate-900 hover:bg-emerald-400 transition disabled:opacity-50">
            {loading ? "Doğrulanıyor..." : "Sisteme Giriş"}
          </button>
        </form>
      )}
    </main>
  );
}
