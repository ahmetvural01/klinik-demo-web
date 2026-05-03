"use client";

import { useEffect, useState } from "react";

const roleLabel: Record<string, string> = {
  YONETICI: "Yönetici", DOKTOR: "Diş Hekimi", ASISTAN: "Asistan",
  BANKO: "Banko Görevlisi", MUHASEBE: "Muhasebe",
};

export default function ProfilPage() {
  const [profile, setProfile] = useState({ fullName: "", role: "", workStart: "08:00", workEnd: "17:00" });
  const [password, setPassword] = useState({ old: "", new: "", confirm: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setProfile(p => ({ ...p, ...d })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workStart: profile.workStart, workEnd: profile.workEnd })
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
    <div className="flex items-center justify-center h-40">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-bold text-white ring-4 ring-blue-100">
            {initials}
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{profile.fullName || "—"}</p>
            <span className="inline-block rounded-full bg-blue-100 px-3 py-0.5 text-xs font-bold text-blue-700">
              {roleLabel[profile.role] ?? profile.role}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Mesai Saatleri */}
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100 space-y-4">
          <h3 className="text-sm font-bold text-slate-800">Mesai Saatleri</h3>
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
          <button onClick={updateProfile} disabled={saving}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>

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
    </div>
  );
}

