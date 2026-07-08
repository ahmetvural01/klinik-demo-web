"use client";

import { FormEvent, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";

export function LoginForm() {
  const [institution, setInstitution] = useState("");
  const [identityNo, setIdentityNo] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const { showToast } = useToast();

  const onSubmit = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institution, identityNo, password, rememberMe: remember })
    });

    setLoading(false);

    if (!res.ok) {
      const message = await res.json().catch(() => ({ message: "Giriş başarısız" }));
      setError(message.message || "Giriş başarısız");
      return;
    }
    try { showToast({ title: 'Giriş Başarılı', message: 'Panele yönlendiriliyorsunuz', duration: 2500, type: 'success' }); } catch {}
    window.location.href = "/anasayfa";
  };

  return (
    <div className="flex min-h-screen">
      {/* Sol panel — marka */}
      <div className="hidden flex-col items-start justify-between bg-primary p-12 lg:flex lg:w-5/12">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
              <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C8 2 5 5 5 8c0 2 .5 3.5 1 5l1 4.5C7.5 19 8.5 22 10 22h4c1.5 0 2.5-3 3-4.5l1-4.5c.5-1.5 1-3 1-5 0-3-3-6-7-6z"/>
              </svg>
            </div>
            <span className="text-xl font-black text-white">KlinikModern</span>
          </div>
          <div className="mt-16">
            <h2 className="text-4xl font-black leading-tight text-white">Kliniğinizi<br />profesyonelce<br />yönetin.</h2>
            <p className="mt-5 text-base leading-relaxed text-white/70">Randevu, hasta takibi, tedavi planlama, ödeme yönetimi ve raporlama — hepsi tek platformda.</p>
          </div>
          <div className="mt-12 space-y-3">
            {["Gerçek zamanlı randevu takvimi","Diş şeması & tedavi geçmişi","Otomatik SMS hatırlatma","Gelişmiş finansal raporlama"].map((f) => (
              <div key={f} className="flex items-center gap-2.5 text-sm text-white/80">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/15">
                  <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
                {f}
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-white/40">© {new Date().getFullYear()} KlinikModern. Tüm hakları saklıdır.</p>
      </div>

      {/* Sağ panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C8 2 5 5 5 8c0 2 .5 3.5 1 5l1 4.5C7.5 19 8.5 22 10 22h4c1.5 0 2.5-3 3-4.5l1-4.5c.5-1.5 1-3 1-5 0-3-3-6-7-6z"/>
              </svg>
            </div>
            <span className="font-black text-primary">KlinikModern</span>
          </div>

          <h1 className="text-2xl font-black text-slate-900">Hesabınıza giriş yapın</h1>
          <p className="mt-1 text-sm text-slate-500">Klinik ve kimlik bilgilerinizi girin.</p>

          <div className="mt-4 rounded-md border border-slate-100 bg-white p-3 text-sm text-slate-600">
            Demo erişiminiz yoksa önce <a href="/#demo" className="font-semibold text-primary underline">demo talep formunu</a> doldurun. Size özel süreli demo kurumu oluşturulur.
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Kurum Kimliği</label>
              <input required autoComplete="organization" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm placeholder-slate-400 shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="Kurumun sisteme kayıtlı adı" value={institution} onChange={(e) => setInstitution(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">TC Kimlik / Personel No</label>
              <input required autoComplete="username" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm placeholder-slate-400 shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="TC Kimlik veya personel numarası" value={identityNo} onChange={(e) => setIdentityNo(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Şifre</label>
              <div className="relative">
                <input required type={showPass ? "text" : "password"} autoComplete="current-password" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-3 pr-10 text-sm placeholder-slate-400 shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShowPass((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600" tabIndex={-1}>
                  {showPass
                    ? <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-600">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-primary" />
              <span>Oturumumu açık tut</span>
            </label>
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-60">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                  Giriş yapılıyor…
                </span>
              ) : "Giriş Yap"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
