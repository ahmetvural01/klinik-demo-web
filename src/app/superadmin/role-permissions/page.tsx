"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Toolbar } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { SaveBar } from "@/components/ui/SaveBar";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { roleLabel } from "@/lib/staff-roles";
import { dateTime } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet, saSend } from "@/components/superadmin/sa-fetch";

type PermissionGroup = { key: string; label: string; icon: string; category: string; permissions: string[] };
type PermissionDetail = { code: string; title: string; description: string; risk: "yuksek" | "orta" | "dusuk" };

type Payload = {
  version: number;
  updatedAt: string;
  updatedBy: string;
  roles: string[];
  permissionGroups: PermissionGroup[];
  permissionDetails?: Record<string, PermissionDetail>;
  allPermissions: string[];
  map: Record<string, string[]>;
};

const CATEGORY_KEYS = ["tumu", "klinik", "finans", "yonetim", "iletisim", "sistem"] as const;
const CATEGORY_LABELS: Record<(typeof CATEGORY_KEYS)[number], string> = {
  tumu: "Tümü",
  klinik: "Klinik",
  finans: "Finans",
  yonetim: "Yönetim",
  iletisim: "İletişim",
  sistem: "Sistem",
};

const RISK: Record<PermissionDetail["risk"], { label: string; tone: BadgeTone }> = {
  yuksek: { label: "Kritik", tone: "critical" },
  orta: { label: "Orta", tone: "warning" },
  dusuk: { label: "Düşük", tone: "neutral" },
};

function expand(list: string[] | undefined, all: string[]): string[] {
  const perms = list || [];
  return perms.includes("*") ? [...all] : perms.filter((perm) => all.includes(perm));
}

/**
 * Rol Yetkileri — klinik rollerinin tüm kliniklerde neye erişebileceği.
 * Değişiklikler yapışkan alt çubuktan kaydedilir; kaydetmeden önce rol bazında
 * fark özeti ve kritik yetki uyarısı gösterilir. Rol kartlarındaki "Tümünü
 * Aç/Kapat" kaldırıldı (kritik yetkiler dahil 80 yetkiyi tek tıkla açıyordu);
 * toplu seçim yalnız grup düzeyinde. Telefonda tek rol seçilerek düzenlenir.
 */
export default function RolePermissionsPage() {
  const [category, setCategory] = useTabParam(CATEGORY_KEYS, "tumu", "kategori");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [map, setMap] = useState<Record<string, string[]>>({});
  const [savedMap, setSavedMap] = useState<Record<string, string[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [mobileRole, setMobileRole] = useState("DOKTOR");

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    saGet<Payload>("/api/superadmin/role-permissions", "Rol yetkileri yüklenemedi.", controller.signal)
      .then((data) => {
        if (!data || !Array.isArray(data.permissionGroups) || !Array.isArray(data.roles)) throw new Error("Rol yetkileri beklenmeyen biçimde geldi.");
        const normalized = Object.fromEntries(data.roles.map((role) => [role, expand(data.map?.[role], data.allPermissions)]));
        setPayload(data);
        setMap(normalized);
        setSavedMap(normalized);
      })
      .catch((error) => {
        if (!isAbort(error)) setLoadError(errorMessage(error, "Rol yetkileri yüklenemedi."));
      });
    return () => controller.abort();
  }, [reloadKey]);

  const diff = useMemo(() => {
    if (!payload) return [];
    return payload.roles.map((role) => {
      const before = new Set(savedMap[role] || []);
      const after = new Set(map[role] || []);
      const added = [...after].filter((perm) => !before.has(perm));
      const removed = [...before].filter((perm) => !after.has(perm));
      const critical = [...added, ...removed].filter((perm) => payload.permissionDetails?.[perm]?.risk === "yuksek");
      return { role, added, removed, critical };
    }).filter((item) => item.added.length > 0 || item.removed.length > 0);
  }, [map, savedMap, payload]);
  const isDirty = diff.length > 0;

  // Kaydedilmemiş değişiklikle sayfadan çıkarken tarayıcı uyarır.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const groups = useMemo(() => {
    if (!payload) return [];
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return payload.permissionGroups
      .filter((group) => category === "tumu" || group.category === category)
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter((perm) => {
          if (!q) return true;
          const detail = payload.permissionDetails?.[perm];
          return group.label.toLocaleLowerCase("tr-TR").includes(q)
            || (detail?.title || perm).toLocaleLowerCase("tr-TR").includes(q)
            || (detail?.description || "").toLocaleLowerCase("tr-TR").includes(q);
        }),
      }))
      .filter((group) => group.permissions.length > 0);
  }, [payload, search, category]);

  const has = (role: string, perm: string) => (map[role] || []).includes(perm);

  const toggle = (role: string, perm: string) => {
    setMap((current) => {
      const list = current[role] || [];
      return { ...current, [role]: list.includes(perm) ? list.filter((item) => item !== perm) : [...list, perm] };
    });
  };

  const setGroup = (role: string, perms: string[], enable: boolean) => {
    setMap((current) => {
      const list = current[role] || [];
      return { ...current, [role]: enable ? Array.from(new Set([...list, ...perms])) : list.filter((item) => !perms.includes(item)) };
    });
  };

  const detail = useCallback((perm: string): PermissionDetail => payload?.permissionDetails?.[perm] ?? { code: perm, title: perm, description: "", risk: "dusuk" }, [payload]);

  const save = async () => {
    if (!payload) return;
    const lines = diff.map((item) => `• ${roleLabel(item.role)}: ${item.added.length} yetki eklendi, ${item.removed.length} yetki kaldırıldı${item.critical.length ? ` — kritik: ${item.critical.map((perm) => detail(perm).title).slice(0, 3).join(", ")}${item.critical.length > 3 ? "…" : ""}` : ""}`);
    const managerLoses = diff.find((item) => item.role === "YONETICI" && item.removed.length > 0);
    const ok = await confirmDialog({
      title: "Yetki değişiklikleri kaydedilsin mi?",
      message: [
        "Bu değişiklik TÜM kliniklerde hemen geçerli olur:",
        lines.join("\n"),
        managerLoses ? "Dikkat: Klinik yöneticisinden yetki kaldırıyorsunuz; klinikler bu işleri kendi başına yapamaz hale gelebilir." : "",
      ].filter(Boolean).join("\n\n"),
      confirmText: "Kaydet",
      cancelText: "Vazgeç",
      danger: Boolean(managerLoses) || diff.some((item) => item.critical.length > 0),
    });
    if (!ok) return;
    setSaving(true);
    try {
      // "Tüm yetkiler" (*) olarak kayıtlı bir rol hâlâ tümüne sahipse yine *
      // gönderilir; aksi halde ileride eklenecek yeni yetkileri alamazdı.
      const outgoing = Object.fromEntries(Object.entries(map).map(([role, perms]) => [
        role,
        (payload.map?.[role] || []).includes("*") && perms.length >= payload.allPermissions.length ? ["*"] : perms,
      ]));
      const result = await saSend<{ version: number; updatedAt: string; updatedBy: string; map?: Record<string, string[]> }>("/api/superadmin/role-permissions", "PUT", { map: outgoing, version: payload.version }, "Yetkiler kaydedilemedi.");
      setPayload((current) => (current ? { ...current, version: result.version, updatedAt: result.updatedAt, updatedBy: result.updatedBy, map: result.map ?? outgoing } : current));
      setSavedMap(map);
      showToastSafe({ type: "success", message: "Rol yetkileri kaydedildi; tüm kliniklerde geçerli.", icon: "settings" });
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Yetkiler kaydedilemedi.") });
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    if (!payload) return;
    const ok = await confirmDialog({
      title: "Tüm rol yetkileri varsayılana dönsün mü?",
      message: "Yaptığınız tüm özelleştirmeler silinir ve her rol ilk kurulumdaki yetkilerine döner. Tüm kliniklerde hemen geçerli olur.",
      confirmText: "Varsayılana döndür",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await saSend("/api/superadmin/role-permissions", "POST", { action: "reset", version: payload.version }, "Varsayılana döndürülemedi.");
      showToastSafe({ type: "success", message: "Rol yetkileri varsayılana döndü.", icon: "settings" });
      setReloadKey((value) => value + 1);
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Varsayılana döndürülemedi.") });
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <PageHeader
      icon="settings"
      title="Rol Yetkileri"
      description="Klinik rollerinin neleri görüp yapabileceği. Değişiklik tüm kliniklerde hemen geçerli olur."
      stats={payload ? [{ label: "Son değişiklik", value: `${dateTime(payload.updatedAt) ?? "—"}${payload.updatedBy && !payload.updatedBy.startsWith("migration") ? ` · ${payload.updatedBy}` : ""}` }] : undefined}
      actions={payload ? <Button variant="secondary" icon={RotateCcw} disabled={saving} onClick={() => void resetDefaults()}>Varsayılana döndür</Button> : undefined}
    />
  );

  if (loadError && !payload) {
    return (
      <section className="space-y-4">
        {header}
        <LoadErrorState message={loadError} onRetry={() => setReloadKey((value) => value + 1)} />
      </section>
    );
  }

  if (!payload) {
    return (
      <section className="space-y-4">
        {header}
        <div className="ui-surface overflow-hidden"><ListRowSkeleton rows={6} /></div>
      </section>
    );
  }

  const total = payload.allPermissions.length;

  return (
    <section className="space-y-4">
      {header}

      <div className="flex flex-wrap gap-2" aria-label="Rollerin yetki sayısı">
        {payload.roles.map((role) => (
          <span key={role} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">{roleLabel(role)}</span>
            <span className="tabular-nums">{(map[role] || []).length}/{total}</span>
          </span>
        ))}
      </div>

      <Tabs ariaLabel="Yetki kategorisi" size="sm" value={category} onChange={setCategory} items={CATEGORY_KEYS.map((key) => ({ key, label: CATEGORY_LABELS[key] }))} />

      <div className="ui-surface overflow-hidden">
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Yetki ara (ör. dışa aktarma, randevu)" wrapperClassName="flex-1 min-w-[220px]" />
          <div className="md:hidden">
            <Select aria-label="Düzenlenecek rol" value={mobileRole} onChange={(event) => setMobileRole(event.target.value)}>
              {payload.roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
            </Select>
          </div>
        </Toolbar>
      </div>

      {groups.length === 0 ? (
        <EmptyState title="Bu aramaya uyan yetki yok" description="Aramayı veya kategoriyi değiştirin." />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.key} className="ui-surface overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                <h2 className="text-sm font-bold text-slate-900">{group.label}</h2>
                <span className="text-xs text-slate-500">{group.permissions.length} yetki</span>
              </div>

              {/* Masaüstü: tüm roller yan yana; başlık satırı kaydırırken görünür kalır. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="sticky top-0 z-[1] bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Yetki</th>
                      {payload.roles.map((role) => (
                        <th key={role} className="w-28 px-2 py-2 text-center">
                          <p className="text-xs font-semibold text-slate-700">{roleLabel(role)}</p>
                          <p className="mt-0.5 flex items-center justify-center gap-1 text-xs font-normal">
                            <button type="button" className="rounded px-1 text-primary hover:bg-primary/10" onClick={() => setGroup(role, group.permissions, true)} aria-label={`${roleLabel(role)} için ${group.label} yetkilerinin tümünü aç`}>Tümü</button>
                            <span className="text-slate-300">/</span>
                            <button type="button" className="rounded px-1 text-slate-500 hover:bg-slate-100" onClick={() => setGroup(role, group.permissions, false)} aria-label={`${roleLabel(role)} için ${group.label} yetkilerinin tümünü kapat`}>Hiçbiri</button>
                          </p>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.permissions.map((perm) => {
                      const info = detail(perm);
                      return (
                        <tr key={perm} className="hover:bg-slate-50/60">
                          <td className="px-4 py-2.5 align-top">
                            <p className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-800">
                              {info.title}
                              {info.risk !== "dusuk" && <Badge tone={RISK[info.risk].tone}>{RISK[info.risk].label}</Badge>}
                            </p>
                            {info.description && <p className="mt-0.5 text-xs leading-5 text-slate-500">{info.description}</p>}
                          </td>
                          {payload.roles.map((role) => (
                            <td key={role} className="px-2 py-2.5 text-center align-top">
                              <input
                                type="checkbox"
                                checked={has(role, perm)}
                                onChange={() => toggle(role, perm)}
                                aria-label={`${roleLabel(role)} — ${info.title}`}
                                className="h-[18px] w-[18px] cursor-pointer accent-primary"
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Telefon: seçilen tek rol için liste. */}
              <ul className="divide-y divide-slate-100 md:hidden">
                {group.permissions.map((perm) => {
                  const info = detail(perm);
                  return (
                    <li key={perm}>
                      <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={has(mobileRole, perm)}
                          onChange={() => toggle(mobileRole, perm)}
                          className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-primary"
                        />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-800">
                            {info.title}
                            {info.risk !== "dusuk" && <Badge tone={RISK[info.risk].tone}>{RISK[info.risk].label}</Badge>}
                          </span>
                          {info.description && <span className="mt-0.5 block text-xs leading-5 text-slate-500">{info.description}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <SaveBar
        dirty={isDirty}
        saving={saving}
        onSave={() => void save()}
        onDiscard={() => setMap(savedMap)}
        message={`Kaydedilmemiş değişiklik: ${diff.map((item) => roleLabel(item.role)).join(", ")}`}
      />
    </section>
  );
}
