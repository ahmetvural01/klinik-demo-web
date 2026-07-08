"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { showToastSafe } from "@/lib/toast-client";

type Staff = {
  id: string;
  fullName: string;
  identityNo: string;
  institution: string;
  role: string;
  isActive: boolean;
  kkYuzde?:    number | null;
  genelYuzde?: number | null;
  maasYuzde?:  number | null;
  profile?: { workStart?: string; workEnd?: string; photoUrl?: string | null } | null;
};

const ROLE_COLORS: Record<string, string> = {
  YONETICI: "bg-indigo-100 text-indigo-700",
  DOKTOR: "bg-blue-100 text-blue-700",
  ASISTAN: "bg-emerald-100 text-emerald-700",
  BANKO: "bg-amber-100 text-amber-700",
  MUHASEBE: "bg-purple-100 text-purple-700",
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

function avatarDataUrl(name: string, role: string) {
  const text = initials(name) || "P";
  const palette: Record<string, { bg1: string; bg2: string }> = {
    YONETICI: { bg1: "#4338ca", bg2: "#7c3aed" },
    DOKTOR: { bg1: "#0369a1", bg2: "#0ea5e9" },
    ASISTAN: { bg1: "#047857", bg2: "#10b981" },
    BANKO: { bg1: "#b45309", bg2: "#f59e0b" },
    MUHASEBE: { bg1: "#6d28d9", bg2: "#a78bfa" },
  };
  const c = palette[role] || { bg1: "#334155", bg2: "#64748b" };
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop stop-color='${c.bg1}'/><stop offset='1' stop-color='${c.bg2}'/></linearGradient></defs>
    <rect width='120' height='120' fill='url(#g)' rx='60'/>
    <text x='60' y='72' text-anchor='middle' font-family='Arial, sans-serif' font-size='42' font-weight='700' fill='white'>${text}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default function PersonelPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "aktif" | "pasif">("");

  // Doktor ödeme oranı düzenleyici
  const [editYuzde, setEditYuzde] = useState<{ id: string; kk: string; genel: string; maas: string } | null>(null);
  const [savingYuzde, setSavingYuzde] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff");
      if (!res.ok) throw new Error("Personeller alınamadı");
      setStaff(await res.json());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      setError(msg);
      try { showToastSafe({ title: 'Hata', message: msg, type: 'error' }); } catch {}
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setActive = async (id: string, isActive: boolean) => {
    const target = staff.find((x) => x.id === id);
    if (!target) return;

    const res = await fetch(`/api/staff/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        institution: target.institution,
        identityNo: target.identityNo,
        fullName: target.fullName,
        role: target.role,
        isActive,
        workStart: target.profile?.workStart || "08:30",
        workEnd: target.profile?.workEnd || "18:00"
      })
    });

    if (!res.ok) {
      const msg = "Durum güncellenemedi";
      setError(msg);
      try { showToastSafe({ title: 'Hata', message: msg, type: 'error' }); } catch {}
      return;
    }

    await load();
  };

  const saveHakedisYuzde = async () => {
    if (!editYuzde) return;
    const target = staff.find(x => x.id === editYuzde.id);
    if (!target) return;
    setSavingYuzde(true);
    const res = await fetch(`/api/staff/${editYuzde.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        institution: target.institution,
        identityNo: target.identityNo,
        fullName: target.fullName,
        role: target.role,
        isActive: target.isActive,
        workStart: target.profile?.workStart || "08:30",
        workEnd: target.profile?.workEnd || "18:00",
        kkYuzde:    parseFloat(editYuzde.kk)    || 3,
        genelYuzde: parseFloat(editYuzde.genel)  || 15,
        maasYuzde:  parseFloat(editYuzde.maas)   || 40,
      })
    });
    setSavingYuzde(false);
    if (res.ok) { setEditYuzde(null); await load(); }
    else { const msg = "Yüzdeler kaydedilemedi"; setError(msg); try { showToastSafe({ title: 'Hata', message: msg, type: 'error' }); } catch {} }
  };

  return (
    <section className="space-y-5">
      {/* Doktor ödeme oranı düzenleyici */}
      {editYuzde && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl">
            <h2 className="mb-1 text-lg font-black text-slate-900">Doktor Ödeme Oranları</h2>
            <p className="mb-5 text-sm text-slate-500">Bu oranlar doktor raporlarında ve ödeme hesabında kullanılır. Emin değilseniz varsayılan değerleri koruyun.</p>
            <div className="space-y-4">
              {[
                { label: "KK Masraf %", key: "kk" as const, help: "Kredi kartı gelirinden düşülecek % (banka komisyonu)" },
                { label: "Genel Masraf %", key: "genel" as const, help: "Toplam cirodan düşülecek genel gider payı %" },
                { label: "Maaş %", key: "maas" as const, help: "Brütten doktora ödenecek %" },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{f.label}</label>
                  <input type="number" min={0} max={100} step={0.1}
                    value={editYuzde[f.key]}
                    onChange={e => setEditYuzde(prev => prev ? { ...prev, [f.key]: e.target.value } : null)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  <p className="mt-1 text-xs text-slate-400">{f.help}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setEditYuzde(null)} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">İptal</button>
              <button onClick={saveHakedisYuzde} disabled={savingYuzde}
                className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50">
                {savingYuzde ? "Kaydediliyor…" : "Oranları Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black text-slate-900">Personel</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{staff.length} kişi</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">{staff.filter(s => s.isActive).length} aktif</span>
        </div>
        <Link href="/personel-ekle" className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Yeni Personel Ekle
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Toplam Personel", value: staff.length },
          { label: "Aktif Çalışan", value: staff.filter(s => s.isActive).length },
          { label: "Diş Hekimi", value: staff.filter(s => s.role === "DOKTOR").length },
          { label: "Pasif Kayıt", value: staff.filter(s => !s.isActive).length },
        ].map(card => (
          <div key={card.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Arama & Filtre */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ad veya TC kimlik ara" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-3 text-sm placeholder-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 focus:border-primary focus:outline-none">
          <option value="">Tüm Unvanlar</option>
          <option value="YONETICI">Yönetici</option>
          <option value="DOKTOR">Diş Hekimi</option>
          <option value="ASISTAN">Asistan</option>
          <option value="BANKO">Banko Personeli</option>
          <option value="MUHASEBE">Muhasebe</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as "" | "aktif" | "pasif")} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 focus:border-primary focus:outline-none">
          <option value="">Tüm Durumlar</option>
          <option value="aktif">Aktif</option>
          <option value="pasif">Pasif</option>
        </select>
      </div>

      <div aria-busy={loading} />
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      {(() => {
        const filtered = staff.filter(s =>
          (!filterRole || s.role === filterRole) &&
          (!filterStatus || (filterStatus === "aktif" ? s.isActive : !s.isActive)) &&
          (!search || s.fullName.toLowerCase().includes(search.toLowerCase()) || s.identityNo.includes(search))
        );
        const roleOrder = ["YONETICI", "DOKTOR", "ASISTAN", "BANKO", "MUHASEBE"];
        const roleLabel: Record<string, string> = { YONETICI: "Yöneticiler", DOKTOR: "Diş Hekimleri", ASISTAN: "Asistanlar", BANKO: "Banko Personeli", MUHASEBE: "Muhasebe" };
        const grouped = roleOrder.reduce<Record<string, Staff[]>>((acc, r) => {
          const members = filtered.filter(s => s.role === r);
          if (members.length) acc[r] = members;
          return acc;
        }, {});
        const otherRoles = filtered.filter(s => !roleOrder.includes(s.role));
        if (otherRoles.length) grouped["DİĞER"] = otherRoles;

        if (filtered.length === 0 && !loading) {
          return (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <svg className="mb-2 h-10 w-10 text-slate-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <p className="text-sm">Personel bulunamadı</p>
            </div>
          );
        }

        return Object.entries(grouped).map(([role, members]) => (
          <div key={role}>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
              <span>{roleLabel[role] || role}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">{members.length}</span>
            </h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {members.map((p) => (
                <article key={p.id} className={`group relative rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:shadow-md ${!p.isActive ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-3">
                    {p.profile?.photoUrl ? (
                      <Image src={p.profile.photoUrl || ''} alt={p.fullName} width={48} height={48} className="h-12 w-12 flex-shrink-0 rounded-full border-2 border-slate-100 object-cover" />
                    ) : (
                        <Image src={avatarDataUrl(p.fullName, p.role)} alt={p.fullName} width={48} height={48} className="h-12 w-12 flex-shrink-0 rounded-full border-2 border-slate-100 object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate text-sm font-bold text-slate-900">{p.fullName}</h4>
                        <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {p.isActive ? "Aktif" : "Pasif"}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-slate-400">TC: {p.identityNo}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {p.profile?.workStart || "08:30"} — {p.profile?.workEnd || "18:00"}
                      </p>
                      <span className={`mt-1.5 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_COLORS[p.role] || "bg-slate-100 text-slate-600"}`}>
                        {roleLabel[p.role] || p.role}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-slate-50 pt-3">
                    <Link href={`/personel-ekle?id=${p.id}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50">
                      Personeli Düzenle
                    </Link>
                    <button
                      onClick={() => setActive(p.id, !p.isActive)}
                      className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${p.isActive ? "border-red-100 text-red-600 hover:bg-red-50" : "border-emerald-100 text-emerald-600 hover:bg-emerald-50"}`}
                    >
                      {p.isActive ? "Pasif Yap" : "Aktif Yap"}
                    </button>
                    {p.role === "DOKTOR" && (
                      <button
                        onClick={() => setEditYuzde({ id: p.id, kk: String(p.kkYuzde ?? 3), genel: String(p.genelYuzde ?? 15), maas: String(p.maasYuzde ?? 40) })}
                        className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/10 sm:ml-auto"
                        title="Doktor ödeme oranlarını ayarla"
                      >
                        Ödeme Oranları
                      </button>
                    )}
                  </div>
                  {p.role === "DOKTOR" && (
                    <div className="mt-2 flex flex-wrap gap-3 border-t border-slate-50 pt-2 text-xs text-slate-500">
                      <span>KK: <b className="text-slate-600">%{p.kkYuzde ?? 3}</b></span>
                      <span>Genel: <b className="text-slate-600">%{p.genelYuzde ?? 15}</b></span>
                      <span>Maaş: <b className="text-slate-600">%{p.maasYuzde ?? 40}</b></span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        ));
      })()}
    </section>
  );
}
