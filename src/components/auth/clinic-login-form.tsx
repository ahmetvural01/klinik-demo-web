"use client";

import { FormEvent, useState } from "react";
import { showToastSafe } from "@/lib/toast-client";

export function ClinicLoginForm() {
  const [institution, setInstitution] = useState("");
  const [identityNo, setIdentityNo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institution, identityNo, password, rememberMe: remember }),
    });

    setLoading(false);

    if (!res.ok) {
      const message = await res.json().catch(() => ({ message: "Giriş başarısız" }));
      const msg = message.message || "Giriş başarısız";
      setError(msg);
      try { showToastSafe({ title: 'Hata', message: msg, type: 'error' }); } catch {}
      return;
    }

    window.location.href = "/anasayfa";
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(140deg,#f8fbfd_0%,#eefdf8_45%,#fff9ef_100%)] p-4 md:p-8">
      <div className="pointer-events-none absolute -left-20 top-20 h-80 w-80 rounded-full bg-cyan-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-8 h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl" />

      <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl lg:grid-cols-2">
        <aside className="relative bg-[linear-gradient(160deg,#0f172a_0%,#0f2f4a_55%,#114a5f_100%)] p-8 text-white md:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.22),transparent_35%),radial-gradient(circle_at_85%_10%,rgba(16,185,129,0.22),transparent_30%)]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <p className="inline-flex items-center rounded-full border border-white/25 px-3 py-1 text-xs font-semibold tracking-[0.2em]">KLİNİKMODERN</p>
              <h1 className="mt-6 text-3xl font-black leading-tight md:text-4xl">Klinik operasyonunu hızlandıran güvenli giriş ekranı.</h1>
              <p className="mt-4 max-w-md text-sm text-slate-200">
                Personeliniz, yetkilerine göre tek bir panelden hasta, randevu, tedavi ve ödeme süreçlerine güvenli şekilde erişsin.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-3 text-sm">
              <div className="rounded-xl border border-white/20 bg-white/10 p-3">JWT + HttpOnly cookie ile güvenli oturum yönetimi</div>
              <div className="rounded-xl border border-white/20 bg-white/10 p-3">Role-based yetkilendirme ile modüler erişim</div>
              <div className="rounded-xl border border-white/20 bg-white/10 p-3">Klinik ekipleri için hızlı ve sade giriş deneyimi</div>
            </div>

            <p className="mt-8 text-xs text-slate-300">KlinikModern • Klinik Giriş Paneli</p>
          </div>
        </aside>

        <form onSubmit={onSubmit} className="p-7 md:p-10">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-2xl font-black text-slate-900">Klinik Girişi</h2>
            <p className="mt-1 text-sm text-slate-500">Kurum bilgisi ve personel kimliği ile devam edin.</p>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block text-sm font-semibold text-slate-700">
              Kurum Kodu veya Kısa Adı
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="ornekklinik"
                autoComplete="organization"
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
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            <div className="flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-cyan-600" />
                Oturumu açık tut
              </label>
              <span className="text-xs text-slate-500">Güvenli bağlantı aktif</span>
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
