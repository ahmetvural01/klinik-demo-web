"use client";

import { useState } from "react";
import { ShieldAlert, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { showToastSafe } from "@/lib/toast-client";

// Süperadmin hesapları tüm kliniklerin hasta verisine erişebiliyor — bu
// yüzden 2FA bu rol için isteğe bağlı değil. Bu ekrana sadece 2FA'sı henüz
// kurulmamış bir süperadmin oturumu düşer (bkz. middleware.ts mustSetup2fa);
// kurulum tamamlanana kadar başka hiçbir sayfaya/işleme erişilemez.
export default function SuperadminForce2faPage() {
  const [setup, setSetup] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const startSetup = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/2fa/setup", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToastSafe({ title: "Hata", message: data?.error || "Kurulum başlatılamadı", type: "error" });
        return;
      }
      setSetup(data);
    } finally {
      setSaving(false);
    }
  };

  const confirmSetup = async () => {
    if (!code.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile/2fa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToastSafe({ title: "Hata", message: data?.error || "Kod hatalı", type: "error" });
        return;
      }
      setBackupCodes(data.backupCodes || []);
      showToastSafe({ title: "Tamamlandı", message: "İki faktörlü doğrulama etkinleştirildi", type: "success" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-base font-black text-slate-900">İki Faktörlü Doğrulama Zorunludur</h1>
            <p className="text-xs text-slate-500">Süperadmin hesapları tüm kliniklerin verisine erişebildiği için 2FA kurulumu tamamlanmadan panele devam edilemez.</p>
          </div>
        </div>

        {backupCodes ? (
          <div className="mt-5 space-y-3">
            <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Kurulum tamamlandı.
            </p>
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Yedek Kodlar (bir daha gösterilmeyecek, saklayın)</p>
              <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">
                {backupCodes.map((c) => <div key={c} className="rounded-lg bg-white px-2 py-1.5 text-center">{c}</div>)}
              </div>
            </div>
            <Button className="w-full" onClick={() => { window.location.href = "/superadmin/panel"; }}>
              Panele Devam Et
            </Button>
          </div>
        ) : setup ? (
          <div className="mt-5 space-y-3">
            <img src={setup.qrCodeDataUrl} alt="2FA QR kodu" className="mx-auto h-40 w-40 rounded-lg border border-slate-200 bg-white p-2" />
            <p className="text-center text-[11px] text-slate-400">
              QR kodu okutamıyorsanız manuel girin: <span className="font-mono font-semibold text-slate-600">{setup.secret}</span>
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6 haneli kod"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-center text-lg tracking-widest outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              maxLength={6}
            />
            <Button className="w-full" onClick={() => void confirmSetup()} disabled={code.length < 6} loading={saving}>
              Doğrula ve Etkinleştir
            </Button>
          </div>
        ) : (
          <Button className="mt-5 w-full" onClick={() => void startSetup()} loading={saving}>
            Kuruluma Başla
          </Button>
        )}
      </div>
    </main>
  );
}
