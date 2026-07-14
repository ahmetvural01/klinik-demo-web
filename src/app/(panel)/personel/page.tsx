"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Search, UserPlus, Users } from "lucide-react";
import { showToastSafe } from "@/lib/toast-client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type Staff = {
  id: string;
  fullName: string;
  identityNo: string;
  institution: string;
  role: string;
  isActive: boolean;
  profile?: { workStart?: string; workEnd?: string; photoUrl?: string | null; hideAsDoctor?: boolean } | null;
};

// "Doktor olarak göster" işaretli bir yönetici, randevu/hakediş ekranlarında
// zaten tam bir doktor gibi işlem görüyordu — personel listesindeki sayım ve
// gruplama bununla tutarsızdı (yönetici grubunda görünüp diş hekimi sayısına
// hiç yansımıyordu). Buradaki grup/sayım da aynı kuralı kullanır.
const effectiveGroupRole = (p: Staff) =>
  p.role === "DOKTOR" || (p.role === "YONETICI" && p.profile?.hideAsDoctor === false) ? "DOKTOR" : p.role;

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

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black text-slate-900">Personel</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{staff.length} kişi</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">{staff.filter(s => s.isActive).length} aktif</span>
        </div>
        <Button icon={UserPlus} href="/personel-ekle">
          Yeni Personel Ekle
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Toplam Personel", value: staff.length },
          { label: "Aktif Çalışan", value: staff.filter(s => s.isActive).length },
          { label: "Diş Hekimi", value: staff.filter(s => effectiveGroupRole(s) === "DOKTOR").length },
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
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
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

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      {loading && staff.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-slate-100 bg-slate-50" style={{ animationDelay: `${i * 40}ms` }} />
          ))}
        </div>
      ) : (() => {
        const filtered = staff.filter(s =>
          (!filterRole || effectiveGroupRole(s) === filterRole) &&
          (!filterStatus || (filterStatus === "aktif" ? s.isActive : !s.isActive)) &&
          (!search || s.fullName.toLowerCase().includes(search.toLowerCase()) || s.identityNo.includes(search))
        );
        const roleOrder = ["YONETICI", "DOKTOR", "ASISTAN", "BANKO", "MUHASEBE"];
        const roleLabel: Record<string, string> = { YONETICI: "Yöneticiler", DOKTOR: "Diş Hekimleri", ASISTAN: "Asistanlar", BANKO: "Banko Personeli", MUHASEBE: "Muhasebe" };
        const grouped = roleOrder.reduce<Record<string, Staff[]>>((acc, r) => {
          const members = filtered.filter(s => effectiveGroupRole(s) === r);
          if (members.length) acc[r] = members;
          return acc;
        }, {});
        const otherRoles = filtered.filter(s => !roleOrder.includes(effectiveGroupRole(s)));
        if (otherRoles.length) grouped["DİĞER"] = otherRoles;

        if (filtered.length === 0 && !loading) {
          return (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Users className="mb-2 h-10 w-10 text-slate-200" />
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
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              {members.map((p) => (
                <Link
                  key={p.id}
                  href={`/personel-ekle?id=${p.id}`}
                  className={`group relative flex flex-col items-center rounded-xl border border-slate-100 bg-white p-5 text-center shadow-sm transition hover:border-primary/30 hover:shadow-md ${!p.isActive ? "opacity-60" : ""}`}
                >
                  {!p.isActive && (
                    <span className="absolute right-3 top-3">
                      <Badge tone="critical">Pasif</Badge>
                    </span>
                  )}
                  {p.profile?.photoUrl ? (
                    <img src={p.profile.photoUrl || ''} alt={p.fullName} className="h-20 w-20 flex-shrink-0 rounded-full border-2 border-slate-100 object-cover" />
                  ) : (
                      <Image src={avatarDataUrl(p.fullName, p.role)} alt={p.fullName} width={80} height={80} className="h-20 w-20 flex-shrink-0 rounded-full border-2 border-slate-100 object-cover" />
                  )}
                  <h4 className="mt-3 truncate text-sm font-bold text-slate-900">{p.fullName}</h4>
                  <span className="mt-1.5">
                    <Badge tone="info" size="md">{roleLabel[effectiveGroupRole(p)] || p.role}</Badge>
                  </span>
                  <span className="mt-2 block text-xs font-bold text-primary opacity-0 transition group-hover:opacity-100">Düzenle →</span>
                </Link>
              ))}
            </div>
          </div>
        ));
      })()}
    </section>
  );
}
