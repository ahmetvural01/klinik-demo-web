"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { showToastSafe } from "@/lib/toast-client";
import { Button } from "@/components/ui/Button";
import { ModuleIcon } from "@/components/ui/ModuleIcon";

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

    window.location.href = "/superadmin/panel";
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
    <main className="auth-shell auth-shell-dark flex min-h-screen items-center justify-center p-4">
      {pendingToken ? (
        <form onSubmit={onSubmitCode} className="auth-panel auth-panel-dark w-full max-w-md p-7 text-white">
          <div className="auth-brand-row mb-6">
            <span className="auth-panel-icon auth-panel-icon-dark"><ShieldCheck className="h-5 w-5" /></span>
            <div>
            <p className="auth-eyebrow auth-eyebrow-dark">İki faktörlü doğrulama</p>
            <h1 className="mt-2 text-3xl font-black">Doğrulama Kodu</h1>
            <p className="mt-1 text-sm text-slate-300">Kimlik doğrulayıcı uygulamanızdaki 6 haneli kodu veya bir yedek kodu girin.</p>
            </div>
          </div>

          <label className="auth-label auth-label-dark mb-4 block text-sm font-semibold">
            Kod
            <input
              className="auth-input auth-input-dark mt-1 w-full px-3 py-2.5 text-center text-lg tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              required
            />
          </label>

          {error && <p className="auth-status auth-status-error-dark mb-3 text-sm">{error}</p>}

          <Button type="submit" loading={loading} fullWidth icon={ArrowRight} className="auth-submit-dark">
            {loading ? "Doğrulanıyor..." : "Doğrula ve Giriş Yap"}
          </Button>
          <Button
            type="button" variant="ghost"
            onClick={() => { setPendingToken(null); setCode(""); setError(null); }}
            fullWidth className="auth-back-dark mt-3"
          >
            Geri dön
          </Button>
        </form>
      ) : (
        <form onSubmit={onSubmit} className="auth-panel auth-panel-dark w-full max-w-md p-7 text-white">
          <div className="auth-brand-row mb-6">
            <span className="auth-panel-icon auth-panel-icon-dark"><ModuleIcon module="settings" size="md" /></span>
            <div>
            <p className="auth-eyebrow auth-eyebrow-dark">Yönetim paneli</p>
            <h1 className="mt-2 text-3xl font-black">Yönetici Girişi</h1>
            <p className="mt-1 text-sm text-slate-300">Sistem yönetimi için kimlik bilgilerinizi girin.</p>
            </div>
          </div>

          <label className="auth-label auth-label-dark mb-4 block text-sm font-semibold">
            TC Kimlik No
            <input
              className="auth-input auth-input-dark mt-1 w-full px-3 py-2.5 text-sm"
              value={identityNo}
              onChange={(e) => setIdentityNo(e.target.value)}
              placeholder="11 haneli"
              required
            />
          </label>

          <label className="auth-label auth-label-dark mb-4 block text-sm font-semibold">
            Şifre
            <input
              className="auth-input auth-input-dark mt-1 w-full px-3 py-2.5 text-sm"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="auth-status auth-status-error-dark mb-3 text-sm">{error}</p>}

          <Button type="submit" loading={loading} fullWidth icon={ArrowRight} className="auth-submit-dark">
            {loading ? "Doğrulanıyor..." : "Sisteme Giriş"}
          </Button>
        </form>
      )}
    </main>
  );
}
