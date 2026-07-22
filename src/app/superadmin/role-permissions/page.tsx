"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Save, RotateCcw, AlertTriangle } from "lucide-react";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

type Role = "YONETICI" | "DOKTOR" | "ASISTAN" | "BANKO" | "MUHASEBE";
type Category = "tumu" | "klinik" | "finans" | "yonetim" | "iletisim" | "sistem";

type PermissionGroup = {
  key: string;
  label: string;
  icon: string;
  category: string;
  permissions: string[];
};

type PermissionDetail = {
  code: string;
  title: string;
  description: string;
  risk: "yuksek" | "orta" | "dusuk";
};

type RoleMeta = { label: string; color: string; description: string };

type PermissionPayload = {
  version: number;
  updatedAt: string;
  updatedBy: string;
  roles: Role[];
  roleMeta?: Record<string, RoleMeta>;
  permissionGroups: PermissionGroup[];
  permissionDetails?: Record<string, PermissionDetail>;
  allPermissions: string[];
  map: Record<string, string[]>;
};

const CATEGORY_LABELS: Record<Category, { label: string; icon: string }> = {
  tumu:      { label: "Tümü",          icon: "🗂️" },
  klinik:    { label: "Klinik",        icon: "🏥" },
  finans:    { label: "Finans",        icon: "💰" },
  yonetim:   { label: "Yönetim",       icon: "📋" },
  iletisim:  { label: "İletişim",      icon: "💬" },
  sistem:    { label: "Sistem",        icon: "⚙️" },
};

const RISK_CONFIG: Record<PermissionDetail["risk"], { label: string; tone: BadgeTone }> = {
  yuksek: { label: "Kritik", tone: "critical" },
  orta:   { label: "Orta",   tone: "warning" },
  dusuk:  { label: "Düşük",  tone: "success" },
};

export default function RolePermissionsPage() {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState<Category>("tumu");
  const [payload, setPayload]   = useState<PermissionPayload | null>(null);
  const [map, setMap]           = useState<Record<string, string[]>>({});
  const [savedMap, setSavedMap] = useState<Record<string, string[]>>({});

  const isDirty = useMemo(() => JSON.stringify(map) !== JSON.stringify(savedMap), [map, savedMap]);

  const load = async () => {
    setLoading(true);
    const res  = await fetch("/api/superadmin/role-permissions");
    const data = await res.json();
    setPayload(data);
    setMap(data?.map || {});
    setSavedMap(data?.map || {});
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const filteredGroups = useMemo(() => {
    if (!payload) return [];
    const q = search.trim().toLowerCase();
    return payload.permissionGroups
      .filter(g => category === "tumu" || g.category === category)
      .map(g => ({
        ...g,
        permissions: g.permissions.filter(p => {
          const d = payload.permissionDetails?.[p];
          return !q ||
            p.toLowerCase().includes(q) ||
            g.label.toLowerCase().includes(q) ||
            (d?.title || "").toLowerCase().includes(q) ||
            (d?.description || "").toLowerCase().includes(q);
        }),
      }))
      .filter(g => g.permissions.length > 0);
  }, [payload, search, category]);

  const hasPerm = (role: string, perm: string) => {
    const perms = map[role] || [];
    return perms.includes("*") || perms.includes(perm);
  };

  const togglePerm = (role: string, perm: string) => {
    setMap(prev => {
      const cur = (prev[role] || []).includes("*") && payload
        ? [...payload.allPermissions]
        : [...(prev[role] || [])];
      const next = cur.includes(perm) ? cur.filter(p => p !== perm) : [...cur, perm];
      return { ...prev, [role]: next };
    });
  };

  const toggleGroup = (role: string, perms: string[], enable: boolean) => {
    setMap(prev => {
      const cur = (prev[role] || []).includes("*") && payload
        ? [...payload.allPermissions]
        : [...(prev[role] || [])];
      const next = enable
        ? Array.from(new Set([...cur, ...perms]))
        : cur.filter(p => !perms.includes(p));
      return { ...prev, [role]: next };
    });
  };

  const setRoleAll = (role: string, allPerms: string[], enabled: boolean) => {
    setMap(prev => ({ ...prev, [role]: enabled ? [...allPerms] : [] }));
  };

  const activeCount = (role: string) => {
    if (!payload) return 0;
    const perms = map[role] || [];
    if (perms.includes("*")) return payload.allPermissions.length;
    return payload.allPermissions.filter(p => perms.includes(p)).length;
  };

  const save = async () => {
    if (!payload) return;
    setSaving(true);
    const res = await fetch("/api/superadmin/role-permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ map }),
    });
    if (!res.ok) {
      showToastSafe({ title: "Hata", message: "Kaydetme sırasında hata oluştu.", type: "error" });
      setSaving(false);
      return;
    }
    const d = await res.json();
    setPayload(prev => prev ? { ...prev, version: d.version, updatedAt: d.updatedAt, updatedBy: d.updatedBy } : prev);
    setSavedMap(map);
    showToastSafe({ title: "Kaydedildi", message: `Yetkiler kaydedildi. Sürüm: ${d.version}`, type: "success" });
    setSaving(false);
  };

  const resetDefaults = async () => {
    if (!(await confirmDialog({ message: "Tüm rol izinleri varsayılan değerlere dönsün mü?", danger: true, confirmText: "Sıfırla" }))) return;
    setSaving(true);
    const res = await fetch("/api/superadmin/role-permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    if (!res.ok) {
      showToastSafe({ title: "Hata", message: "Sıfırlama sırasında hata oluştu.", type: "error" });
      setSaving(false);
      return;
    }
    await load();
    showToastSafe({ title: "Sıfırlandı", message: "Varsayılan yetkiler yüklendi.", type: "success" });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <p className="text-sm text-slate-500">Yetki haritası yükleniyor…</p>
        </div>
      </div>
    );
  }

  if (!payload) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Rol paneli yüklenemedi.</div>;
  }

  const getDetail = (perm: string): PermissionDetail =>
    payload.permissionDetails?.[perm] ?? { code: perm, title: perm, description: "Açıklama eklenmemiş.", risk: "dusuk" };

  const totalPerms = payload.allPermissions.length;

  return (
    <section className="space-y-6">

      {/* ── BAŞLIK ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Rol ve Yetki Yönetimi</h1>
          <p className="mt-1 text-sm text-slate-500">
            Her rol için erişim izinlerini detaylı düzenleyin. Değişiklikler kaydedildikten sonra tüm API ve sayfa kontrolleri anında güncellenir.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-right shadow-sm">
          <p className="text-xs text-slate-400">Sürüm <span className="font-bold text-slate-700">#{payload.version}</span></p>
          <p className="text-xs text-slate-400">Son güncelleme: <span className="text-slate-600">{new Date(payload.updatedAt).toLocaleString("tr-TR")}</span></p>
          <p className="text-xs text-slate-400">Güncelleyen: <span className="text-slate-600">{payload.updatedBy}</span></p>
        </div>
      </div>

      {/* ── ROL İSTATİSTİK KARTLARI ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {payload.roles.map(role => {
          const meta  = payload.roleMeta?.[role];
          const count = activeCount(role);
          const pct   = Math.round((count / totalPerms) * 100);
          return (
            <div key={role} className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{meta?.label ?? role}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{count}/{totalPerms}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 line-clamp-2 text-[11px] text-slate-400">{meta?.description}</p>
              <div className="mt-3 flex gap-1.5">
                <button onClick={() => setRoleAll(role, payload.allPermissions, true)}
                  className="flex-1 rounded-md bg-emerald-50 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100">
                  Tümünü Aç
                </button>
                <button onClick={() => setRoleAll(role, payload.allPermissions, false)}
                  className="flex-1 rounded-md bg-rose-50 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100">
                  Tümünü Kapat
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── KONTROL BANDI ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Kategori Sekmeleri */}
          <div className="flex flex-wrap gap-1">
            {(Object.entries(CATEGORY_LABELS) as [Category, { label: string; icon: string }][]).map(([key, val]) => (
              <button key={key} onClick={() => setCategory(key)}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  category === key ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
                }`}>
                <span>{val.icon}</span>{val.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Arama */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Yetki ara…"
                className="w-52 rounded-lg border border-slate-200 py-1.5 pl-7 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Dirty state uyarısı */}
            {isDirty && (
              <Badge tone="warning" icon={AlertTriangle} size="md">Kaydedilmemiş değişiklik</Badge>
            )}

            <Button size="sm" icon={Save} onClick={save} loading={saving}>
              Kaydet
            </Button>
            <Button size="sm" variant="secondary" icon={RotateCcw} onClick={resetDefaults} disabled={saving}>
              Varsayılanlara Dön
            </Button>
          </div>
        </div>
      </div>

      {/* ── YETKİ GRUPLARI ─────────────────────────────────────────────── */}
      {filteredGroups.length === 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
          Arama kriterlerine uyan yetki bulunamadı.
        </div>
      )}

      <div className="space-y-4">
        {filteredGroups.map(group => {
          const allGroupPerms = group.permissions;
          return (
            <div key={group.key} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              {/* Grup başlık */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{group.icon}</span>
                  <h3 className="text-sm font-bold text-slate-800">{group.label}</h3>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {allGroupPerms.length} yetki
                  </span>
                </div>
                {/* Grup bazlı toplu aç/kapat */}
                <div className="flex gap-1.5">
                  {payload.roles.map(role => (
                    <div key={role} className="flex gap-0.5">
                      <button
                        title={`${payload.roleMeta?.[role]?.label ?? role} — Tümünü Aç`}
                        onClick={() => toggleGroup(role, allGroupPerms, true)}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold transition hover:bg-emerald-100 hover:text-emerald-700">
                        +
                      </button>
                      <button
                        title={`${payload.roleMeta?.[role]?.label ?? role} — Tümünü Kapat`}
                        onClick={() => toggleGroup(role, allGroupPerms, false)}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold transition hover:bg-rose-100 hover:text-rose-700">
                        −
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="w-80 px-4 py-2 text-left">Yetki</th>
                      <th className="w-20 px-3 py-2 text-center">Risk</th>
                      {payload.roles.map(role => (
                        <th key={role} className="min-w-[80px] px-3 py-2 text-center">
                          {payload.roleMeta?.[role]?.label ?? role}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {group.permissions.map(perm => {
                      const detail = getDetail(perm);
                      const risk   = RISK_CONFIG[detail.risk];
                      return (
                        <tr key={perm} className="transition hover:bg-slate-50/50">
                          <td className="px-4 py-3 align-top">
                            <p className="font-semibold leading-snug text-slate-800">{detail.title}</p>
                            <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{detail.description}</p>
                            <code className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{perm}</code>
                          </td>
                          <td className="px-3 py-3 text-center align-top">
                            <Badge tone={risk.tone}>{risk.label}</Badge>
                          </td>
                          {payload.roles.map(role => {
                            const active = hasPerm(role, perm);
                            return (
                              <td key={role} className="px-3 py-3 text-center align-top">
                                <label className="inline-flex cursor-pointer items-center justify-center">
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={() => togglePerm(role, perm)}
                                    className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-primary"
                                  />
                                </label>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── ALT KAYDET BUTONU ──────────────────────────────────────────── */}
      {isDirty && (
        <div className="sticky bottom-4 flex justify-end">
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg">
            <span className="text-sm font-semibold text-amber-700">Kaydedilmemiş değişiklikler var.</span>
            <Button size="sm" icon={Save} onClick={save} loading={saving}>
              Kaydet
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
