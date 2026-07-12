"use client";

import { useEffect, useRef, useState } from "react";
import { confirmDialog } from "@/lib/confirm-client";
import { downscaleImageToDataUrl } from "@/lib/image-upload";

const roleLabel: Record<string, string> = {
  YONETICI: "Yönetici", DOKTOR: "Diş Hekimi", ASISTAN: "Asistan",
  BANKO: "Banko Görevlisi", MUHASEBE: "Muhasebe",
};

export default function ProfilPage() {
  const [profile, setProfile] = useState({ fullName: "", role: "", workStart: "08:00", workEnd: "17:00", showAsDoctor: false, photoUrl: "" });
  const [password, setPassword] = useState({ old: "", new: "", confirm: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorSaving, setTwoFactorSaving] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisableForm, setShowDisableForm] = useState(false);

  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setProfile(p => ({
          ...p,
          fullName: d.fullName || "",
          role: d.role || "",
          workStart: d.profile?.workStart || "08:30",
          workEnd: d.profile?.workEnd || "18:00",
          showAsDoctor: d.role === "YONETICI" ? !Boolean(d.profile?.hideAsDoctor) : false,
          photoUrl: d.profile?.photoUrl || "",
        }));
        setTwoFactorEnabled(Boolean(d.twoFactorEnabled));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const startTwoFactorSetup = async () => {
    setTwoFactorSaving(true);
    try {
      const res = await fetch("/api/profile/2fa/setup", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast("error", data?.error || "Kurulum başlatılamadı"); return; }
      setTwoFactorSetup(data);
    } finally {
      setTwoFactorSaving(false);
    }
  };

  const confirmTwoFactor = async () => {
    if (!twoFactorCode.trim()) return;
    setTwoFactorSaving(true);
    try {
      const res = await fetch("/api/profile/2fa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: twoFactorCode.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast("error", data?.error || "Kod hatalı"); return; }
      setTwoFactorEnabled(true);
      setTwoFactorSetup(null);
      setTwoFactorCode("");
      setBackupCodes(data.backupCodes || []);
      showToast("success", "İki faktörlü doğrulama etkinleştirildi");
    } finally {
      setTwoFactorSaving(false);
    }
  };

  const disableTwoFactor = async () => {
    if (!disablePassword) { showToast("error", "Şifrenizi girin"); return; }
    if (!(await confirmDialog({ message: "İki faktörlü doğrulama devre dışı bırakılsın mı? Hesabınız daha az korumalı olur.", danger: true, confirmText: "Devre Dışı Bırak" }))) return;
    setTwoFactorSaving(true);
    try {
      const res = await fetch("/api/profile/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast("error", data?.error || "Devre dışı bırakılamadı"); return; }
      setTwoFactorEnabled(false);
      setShowDisableForm(false);
      setDisablePassword("");
      showToast("success", "İki faktörlü doğrulama devre dışı bırakıldı");
    } finally {
      setTwoFactorSaving(false);
    }
  };

  const savePhoto = async (dataUrl: string) => {
    setPhotoSaving(true);
    setPhotoError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl: dataUrl || null }),
      });
      if (res.ok) {
        setProfile(p => ({ ...p, photoUrl: dataUrl }));
        showToast("success", dataUrl ? "Fotoğraf güncellendi" : "Fotoğraf kaldırıldı");
      } else {
        showToast("error", "Fotoğraf kaydedilemedi");
      }
    } catch {
      showToast("error", "Bağlantı hatası");
    } finally {
      setPhotoSaving(false);
    }
  };

  const onPhotoSelected = async (file: File) => {
    setPhotoError(null);
    if (file.size > 8 * 1024 * 1024) { setPhotoError("Dosya en fazla 8MB olabilir."); return; }
    try {
      const dataUrl = await downscaleImageToDataUrl(file);
      await savePhoto(dataUrl);
    } catch {
      setPhotoError("Fotoğraf işlenemedi. Lütfen JPG, PNG veya WEBP deneyin.");
    }
  };

  const updateProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workStart: profile.workStart,
          workEnd: profile.workEnd,
          ...(profile.role === "YONETICI" ? { hideAsDoctor: !profile.showAsDoctor } : {}),
        })
      });
      if (res.ok) showToast("success", "Profil güncellendi");
      else showToast("error", "Güncelleme başarısız");
    } catch { showToast("error", "Bağlantı hatası"); }
    finally { setSaving(false); }
  };

  const changePassword = async () => {
    if (!password.old || !password.new) return showToast("error", "Tüm alanları doldurun");
    if (password.new !== password.confirm) return showToast("error", "Şifreler eşleşmiyor");
    if (password.new.length < 6) return showToast("error", "Şifre en az 6 karakter olmalı");
    setSaving(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: password.old, newPassword: password.new })
      });
      if (res.ok) {
        showToast("success", "Şifre başarıyla değiştirildi");
        setPassword({ old: "", new: "", confirm: "" });
      } else {
        const d = await res.json();
        showToast("error", d.message || "Şifre değiştirilemedi");
      }
    } catch { showToast("error", "Bağlantı hatası"); }
    finally { setSaving(false); }
  };

  const initials = profile.fullName
    ? profile.fullName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  if (loading) return (
    <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="h-6 w-28 animate-pulse rounded bg-slate-100" />
      <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <div className="h-16 w-16 animate-pulse rounded-full bg-slate-100" />
        <div className="space-y-2">
          <div className="h-4 w-44 animate-pulse rounded bg-slate-100" />
          <div className="h-5 w-28 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-5 top-5 z-[100] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
          toast.type === "success" ? "bg-emerald-500" : "bg-red-500"
        }`}>
          {toast.type === "success" ? "✓" : "✕"} {toast.text}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-slate-900">Profilim</h1>
        <p className="mt-0.5 text-sm text-slate-500">Hesap ayarları ve güvenlik</p>
      </div>

      {/* Kullanıcı kartı */}
      <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void onPhotoSelected(file);
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {profile.photoUrl ? (
            <img src={profile.photoUrl} alt={profile.fullName} className="h-16 w-16 rounded-full object-cover ring-4 ring-blue-100" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-bold text-white ring-4 ring-blue-100">
              {initials}
            </div>
          )}
          <div className="flex-1">
            <p className="text-xl font-bold text-slate-900">{profile.fullName || "—"}</p>
            <span className="inline-block rounded-full bg-blue-100 px-3 py-0.5 text-xs font-bold text-blue-700">
              {roleLabel[profile.role] ?? profile.role}
            </span>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoSaving}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {photoSaving ? "Kaydediliyor…" : "Fotoğraf Değiştir"}
              </button>
              {profile.photoUrl && (
                <button type="button" onClick={() => void savePhoto("")} disabled={photoSaving} className="rounded-lg border border-red-100 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                  Kaldır
                </button>
              )}
            </div>
            {photoError && <p className="mt-1 text-xs text-red-600">{photoError}</p>}
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Mesai Saatleri — yalnızca doktor / doktor olarak işaretlenebilen
            yönetici için anlamlı; diğer roller randevu ekranında hiç
            kullanılmadığı için bu kartı hiç görmez. */}
        {(profile.role === "DOKTOR" || profile.role === "YONETICI") && (
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100 space-y-4">
          <h3 className="text-sm font-bold text-slate-800">Mesai Saatleri</h3>
          {profile.role === "YONETICI" && (
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={profile.showAsDoctor}
                onChange={e => setProfile(p => ({ ...p, showAsDoctor: e.target.checked }))}
                className="accent-primary"
              />
              Beni doktor olarak goster
            </label>
          )}
          {(profile.role === "DOKTOR" || profile.showAsDoctor) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase">Başlangıç</label>
                <input type="time" value={profile.workStart}
                  onChange={e => setProfile(p => ({ ...p, workStart: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase">Bitiş</label>
                <input type="time" value={profile.workEnd}
                  onChange={e => setProfile(p => ({ ...p, workEnd: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
          )}
          <button onClick={updateProfile} disabled={saving}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
        )}

        {/* Şifre Değiştir */}
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100 space-y-4">
          <h3 className="text-sm font-bold text-slate-800">Şifre Değiştir</h3>
          <div className="space-y-3">
            {[
              { key: "old", label: "Mevcut Şifre", placeholder: "Mevcut şifreyi girin" },
              { key: "new", label: "Yeni Şifre", placeholder: "En az 6 karakter" },
              { key: "confirm", label: "Yeni Şifre Tekrar", placeholder: "Yeni şifreyi tekrar girin" },
            ].map(f => (
              <div key={f.key}>
                <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase">{f.label}</label>
                <input type="password"
                  value={(password as Record<string, string>)[f.key]}
                  onChange={e => setPassword(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            ))}
            <button onClick={changePassword} disabled={saving}
              className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50">
              {saving ? "Değiştiriliyor…" : "Şifre Değiştir"}
            </button>
          </div>
        </div>
      </div>

      {/* İki Faktörlü Doğrulama */}
      <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800">İki Faktörlü Doğrulama</h3>
            <p className="mt-0.5 text-xs text-slate-500">Girişte şifreye ek olarak kimlik doğrulama uygulamasından (Google Authenticator, Authy vb.) kod istenir.</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${twoFactorEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {twoFactorEnabled ? "Aktif" : "Kapalı"}
          </span>
        </div>

        {!twoFactorEnabled && !twoFactorSetup && (
          <button onClick={startTwoFactorSetup} disabled={twoFactorSaving} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
            {twoFactorSaving ? "Hazırlanıyor…" : "Etkinleştir"}
          </button>
        )}

        {twoFactorSetup && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm text-slate-600">1. Kimlik doğrulama uygulamanızla aşağıdaki QR kodu okutun.</p>
            <img src={twoFactorSetup.qrCodeDataUrl} alt="2FA QR kodu" className="mx-auto h-40 w-40 rounded-lg border border-slate-200 bg-white p-2" />
            <p className="mt-2 text-center text-[11px] text-slate-400">QR kodu okutamıyorsanız manuel girin: <span className="font-mono font-semibold text-slate-600">{twoFactorSetup.secret}</span></p>
            <p className="mb-2 mt-4 text-sm text-slate-600">2. Uygulamada görünen 6 haneli kodu girin.</p>
            <div className="flex gap-2">
              <input
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-lg tracking-[0.3em] focus:border-primary focus:outline-none"
              />
              <button onClick={confirmTwoFactor} disabled={twoFactorSaving || twoFactorCode.length < 6} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {twoFactorSaving ? "Onaylanıyor…" : "Onayla"}
              </button>
            </div>
            <button onClick={() => { setTwoFactorSetup(null); setTwoFactorCode(""); }} className="mt-2 text-xs font-semibold text-slate-400 hover:text-slate-600">Vazgeç</button>
          </div>
        )}

        {backupCodes && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-2 text-sm font-bold text-amber-800">Yedek Kodlar — bir daha gösterilmeyecek, kaydedin</p>
            <p className="mb-3 text-xs text-amber-700">Kimlik doğrulama uygulamanıza erişemezseniz bu kodlardan birini kullanarak giriş yapabilirsiniz. Her kod yalnızca bir kez kullanılabilir.</p>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm text-amber-900 sm:grid-cols-4">
              {backupCodes.map((code) => <div key={code} className="rounded-lg bg-white px-2 py-1.5 text-center">{code}</div>)}
            </div>
            <button onClick={() => setBackupCodes(null)} className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">Kaydettim, kapat</button>
          </div>
        )}

        {twoFactorEnabled && !showDisableForm && (
          <button onClick={() => setShowDisableForm(true)} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100">
            Devre Dışı Bırak
          </button>
        )}

        {twoFactorEnabled && showDisableForm && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <label className="mb-1 block text-xs font-semibold text-red-700">Devam etmek için şifrenizi girin</label>
            <div className="flex gap-2">
              <input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} className="flex-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm focus:border-red-400 focus:outline-none" />
              <button onClick={disableTwoFactor} disabled={twoFactorSaving} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                {twoFactorSaving ? "…" : "Onayla"}
              </button>
            </div>
            <button onClick={() => { setShowDisableForm(false); setDisablePassword(""); }} className="mt-2 text-xs font-semibold text-red-400 hover:text-red-600">Vazgeç</button>
          </div>
        )}
      </div>
    </div>
  );
}

