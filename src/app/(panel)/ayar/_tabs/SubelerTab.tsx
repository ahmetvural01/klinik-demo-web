"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Building2, Crown, Lock, MapPin, ShieldCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { Modal } from "@/components/ui/Modal";
import { SearchInput } from "@/components/ui/SearchInput";
import { Switch } from "@/components/ui/Switch";
import { Toolbar } from "@/components/ui/Toolbar";
import { PERMISSION_DETAILS, PERMISSION_GROUPS } from "@/lib/role-permissions";
import { roleLabel } from "@/lib/staff-roles";
import { showToastSafe } from "@/lib/toast-client";
import { matchesSearch } from "@/components/yonetim/search-text";
import { SettingsListHeader } from "./SettingsListHeader";

type Membership = {
  isPrimary: boolean;
  isActive: boolean;
  isBranchManager: boolean;
  permissionCodes: unknown;
  genelYuzde: string | number | null;
  kkYuzde: string | number | null;
  maasYuzde: string | number | null;
};

type StaffMember = {
  id: string;
  fullName: string;
  role: string;
  isActive: boolean;
  branchMemberships: Membership[];
  allowedPermissionCodes: string[];
  homeBranch: { id: string; name: string } | null;
};

type Branch = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  colorCode: string;
  isHeadquarters: boolean;
};

const CATEGORY_LABELS = { klinik: "Klinik", finans: "Finans", yonetim: "Yönetim", iletisim: "İletişim", sistem: "Sistem" } as const;

// İzin matrisinin sabit sütunları — kod sonekleri (`xxx:read` vb.) bu üç ana
// eylem tipine düşer. Bu üçe uymayan (approve, print, refund, phone, merge,
// export, schedule, read-all, bulk, close, stats, password, center vb.) kodlar
// satırın "Ek izinler" hücresinde ayrı ayrı işaretlenebilir çip olarak kalır.
const ACTION_COLUMNS = [
  { suffix: "read", label: "Görüntüle" },
  { suffix: "write", label: "Ekle / düzenle" },
  { suffix: "delete", label: "Sil" },
] as const;

const EXTRA_SUFFIX_LABELS: Record<string, string> = {
  approve: "Onay / iptal",
  print: "Yazdır",
  complete: "Tamamlama",
  refund: "İade",
  merge: "Birleştirme",
  phone: "Telefon görme",
  export: "Dışa aktarma",
  schedule: "Mesai düzenleme",
  "read-all": "Tüm kayıtları görme",
  bulk: "Toplu gönderim",
  close: "Kapatma",
  stats: "İleri istatistik",
  password: "Şifre değiştirme",
  center: "Merkez erişimi",
};

// Personel formundaki (Personel > Doktor ödeme oranları) adlarla aynı.
const RATE_FIELDS = [
  ["kkYuzde", "Kart komisyonu %"],
  ["genelYuzde", "Genel gider payı %"],
  ["maasYuzde", "Hekim payı %"],
] as const;

function codesOf(membership?: Membership) {
  return Array.isArray(membership?.permissionCodes)
    ? membership.permissionCodes.filter((code): code is string => typeof code === "string")
    : null;
}

function suffixOf(code: string) {
  return code.slice(code.indexOf(":") + 1);
}

// "Finans — Gelir/Gider Görüntüleme" -> "Gelir/Gider Görüntüleme"; başlıkta
// ayraç yoksa olduğu gibi kullanılır. Amaç: her işlem izninin (görüntüleme,
// düzenleme, dışa aktarma vb.) grup içinde AYRI AYRI açılıp kapanabilmesi —
// bir şubenin muhasebecisine başka bir şubenin finansını yalnızca
// görüntüleme (düzenleme olmadan) gibi kısıtlı senaryolar kurulabilsin.
function shortTitle(code: string) {
  const title = PERMISSION_DETAILS[code]?.title || code;
  const dashIndex = title.indexOf("—");
  return dashIndex >= 0 ? title.slice(dashIndex + 1).trim() : title;
}

function extraLabel(code: string) {
  return EXTRA_SUFFIX_LABELS[suffixOf(code)] || shortTitle(code);
}

function accessSummary(member: StaffMember) {
  const membership = member.branchMemberships[0];
  if (!member.isActive) return { tone: "neutral" as const, text: "Pasif personel" };
  if (!membership?.isActive) return { tone: "neutral" as const, text: "Erişimi yok" };
  const custom = codesOf(membership);
  return { tone: "info" as const, text: custom == null ? "Rolünün tüm izinleri" : `${custom.length} seçili izin` };
}

// Bu şubenin kendi personeli: ana şubesi burası olan ya da başka bir ana
// şubesi olmayıp bu şubede kaydı bulunan kişi. Pasife alınan personelin ana
// şube bilgisi silindiği için önceden "misafir adayı" gibi görünüyordu; bu
// kişiler Personel sayfasında yönetilir ("Pasife alınanlar" filtresi).
function isLocalMember(member: StaffMember, branchId: string | undefined) {
  return member.homeBranch?.id === branchId || (!member.homeBranch && member.branchMemberships.length > 0);
}

export default function SubelerTab() {
  const [branch, setBranch] = useState<Branch | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [inheritRole, setInheritRole] = useState(true);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [rates, setRates] = useState({ genelYuzde: "", kkYuzde: "", maasYuzde: "" });

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/branches?manage=1", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.branch || !Array.isArray(data?.staff)) throw new Error(data?.message || "Şube erişimleri yüklenemedi.");
      setBranch(data.branch);
      setStaff(data.staff);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Şube erişimleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  // Bu ekranın TEK amacı: bir personelin KENDİ şubesi dışındaki (misafir)
  // erişimini yönetmek. Kendi/ana şubesindeki yetkileri zaten rolünden gelir
  // ve burada değiştirilemez — aksi halde "rol yetkisini mi değiştiriyorum,
  // şube erişimini mi?" karışıklığı olur (bkz. kullanıcı geri bildirimi).
  const homeStaffCount = useMemo(
    () => staff.filter((member) => isLocalMember(member, branch?.id) && member.branchMemberships[0]?.isActive).length,
    [staff, branch],
  );
  const guestCandidates = useMemo(() => staff
    .filter((member) => !isLocalMember(member, branch?.id))
    .filter((member) => matchesSearch([member.fullName, roleLabel(member.role), member.homeBranch?.name], query)),
  [query, staff, branch]);

  const updateAccess = async (member: StaffMember, enabled: boolean, extra: Record<string, unknown> = {}) => {
    setBusyId(member.id);
    try {
      const response = await fetch(`/api/staff/${member.id}/branches`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, ...extra }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Şube erişimi güncellenemedi.");
      showToastSafe({
        message: enabled
          ? `${member.fullName} artık ${branch?.name || "bu şube"} için çalışabilir.`
          : `${member.fullName} için ${branch?.name || "bu şube"} erişimi kaldırıldı.`,
        type: "success",
      });
      setEditing(null);
      await load();
    } catch (error) {
      showToastSafe({ title: "İşlem tamamlanamadı", message: error instanceof Error ? error.message : "Lütfen tekrar deneyin.", type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const openPermissions = (member: StaffMember) => {
    if (member.homeBranch?.id === branch?.id) return;
    const membership = member.branchMemberships[0];
    const currentCodes = codesOf(membership);
    setEditing(member);
    setInheritRole(currentCodes === null);
    setSelectedCodes(currentCodes || member.allowedPermissionCodes);
    setRates({
      genelYuzde: membership?.genelYuzde == null ? "" : String(membership.genelYuzde),
      kkYuzde: membership?.kkYuzde == null ? "" : String(membership.kkYuzde),
      maasYuzde: membership?.maasYuzde == null ? "" : String(membership.maasYuzde),
    });
  };

  const toggleGroup = (codes: readonly string[]) => {
    const allowed = codes.filter((code) => editing?.allowedPermissionCodes.includes(code));
    const allSelected = allowed.every((code) => selectedCodes.includes(code));
    setSelectedCodes((current) => allSelected ? current.filter((code) => !allowed.includes(code)) : Array.from(new Set([...current, ...allowed])));
  };

  const toggleCode = (code: string) => {
    setSelectedCodes((current) => current.includes(code) ? current.filter((value) => value !== code) : [...current, code]);
  };

  const rowActions = (member: StaffMember) => {
    const membership = member.branchMemberships[0];
    const hasAccess = Boolean(membership?.isActive);
    const lockedReason = membership?.isBranchManager
      ? "Şube yöneticisi bağlantısı bu ekrandan kaldırılamaz."
      : !member.isActive ? "Pasif personelin erişimi değiştirilemez." : undefined;
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {hasAccess && (
          <Button size="sm" variant="secondary" icon={ShieldCheck} disabled={Boolean(busyId)} onClick={() => openPermissions(member)}>
            İzinler
          </Button>
        )}
        <Button
          size="sm"
          variant={hasAccess ? "ghost" : "secondary"}
          icon={hasAccess ? UserMinus : UserPlus}
          loading={busyId === member.id}
          disabled={Boolean(lockedReason) || Boolean(busyId)}
          title={lockedReason}
          onClick={() => void updateAccess(member, !hasAccess)}
        >
          {hasAccess ? "Erişimi kaldır" : "Erişim ver"}
        </Button>
      </div>
    );
  };

  const columns: ListTableColumn<StaffMember>[] = [
    {
      key: "personel",
      header: "Personel",
      render: (member) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{member.fullName}</p>
          <p className="mt-0.5 text-xs text-slate-500">{roleLabel(member.role)} · Ana şube: {member.homeBranch?.name || "tanımsız"}</p>
        </div>
      ),
    },
    {
      key: "erisim",
      header: `${branch?.name || "Bu şube"} erişimi`,
      render: (member) => {
        const summary = accessSummary(member);
        return <Badge tone={summary.tone}>{summary.text}</Badge>;
      },
    },
    { key: "actions", header: "", align: "right", render: rowActions },
  ];

  if (loadError && !branch) return <LoadErrorState message={loadError} onRetry={() => void load()} />;

  return (
    <div className="space-y-3">
      <SettingsListHeader
        title="Şube erişimi"
        description={(
          <>
            Başka şubede çalışan bir personelin <b>{branch?.name || "bu şube"}</b> için de randevu, hasta ve kasa işlemi yapması gerekiyorsa buradan erişim verin.
            Personelin rolü ve kendi şubesindeki yetkileri değişmez.
          </>
        )}
      />

      {branch && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm">
          <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
            <span className="flex h-6 w-6 items-center justify-center rounded-md text-white" style={{ backgroundColor: branch.colorCode }}>
              <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            {branch.name}
            {branch.isHeadquarters && <Badge tone="warning" icon={Crown}>Merkez</Badge>}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {[branch.address, branch.district, branch.city].filter(Boolean).join(", ") || "Adres girilmemiş"}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {homeStaffCount} kişi bu şubenin kendi personeli —{" "}
            <Link href="/personel" className="font-semibold text-primary hover:underline">Personel sayfasında yönetilir</Link>
          </span>
        </div>
      )}

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Personel, rol veya şube ara" wrapperClassName="flex-1 min-w-[220px]" />
      </Toolbar>

      <ListTable
        columns={columns}
        rows={guestCandidates}
        rowKey={(member) => member.id}
        loading={loading}
        error={branch ? loadError : null}
        onRetry={() => void load()}
        emptyIcon={Users}
        emptyText={query ? "Aramanızla eşleşen personel yok" : "Başka şubede çalışan personel yok"}
        emptyDescription={query ? undefined : "Kurumunuzun diğer şubelerine personel eklendiğinde burada görünür."}
        rowClassName={(member) => (member.isActive ? "" : "opacity-60")}
        mobileCard={(member) => {
          const summary = accessSummary(member);
          return (
            <div className="space-y-2">
              <div>
                <p className="font-semibold text-slate-900">{member.fullName}</p>
                <p className="mt-0.5 text-xs text-slate-500">{roleLabel(member.role)} · Ana şube: {member.homeBranch?.name || "tanımsız"}</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={summary.tone}>{summary.text}</Badge>
                {rowActions(member)}
              </div>
            </div>
          );
        }}
      />

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing && branch ? `${editing.fullName} — ${branch.name} izinleri` : "Şube izinleri"}
        description={editing?.homeBranch ? `Ana şubesi ${editing.homeBranch.name}. Burada yalnız ${branch?.name} için ek erişim ayarlanır.` : undefined}
        size="xl"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Vazgeç</Button>
            <Button
              loading={busyId === editing?.id}
              onClick={() => editing && void updateAccess(editing, true, { permissionCodes: inheritRole ? null : selectedCodes, ...rates })}
            >
              Kaydet
            </Button>
          </>
        )}
      >
        {editing && branch && (
          <div className="space-y-5">
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <p className="text-xs leading-5 text-amber-800">
                Bu pencere {editing.fullName} adlı personelin rolünü değiştirmez. Örneğin başka şubedeki muhasebeciye bu şubenin finansını yalnız görüntüleme izni verebilirsiniz.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <Switch
                checked={inheritRole}
                onChange={setInheritRole}
                label="Rolünün tüm izinlerini kullansın"
                description="Açıkken rol izinleri değiştiğinde bu şubeye de otomatik yansır. Kapatırsanız aşağıdan yalnız izin vermek istediklerinizi seçin."
              />
            </div>

            <div className={`space-y-5 ${inheritRole ? "pointer-events-none opacity-45" : ""}`} aria-disabled={inheritRole || undefined}>
              {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map((category) => {
                const groups = PERMISSION_GROUPS.filter((group) => group.category === category && group.key !== "branches");
                if (!groups.length) return null;
                return (
                  <div key={category}>
                    <p className="mb-2 text-xs font-bold text-slate-500">{CATEGORY_LABELS[category]}</p>
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full min-w-[560px] text-left">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                            <th className="px-3 py-2">Bölüm</th>
                            {ACTION_COLUMNS.map((col) => <th key={col.suffix} className="px-2 py-2 text-center">{col.label}</th>)}
                            <th className="px-3 py-2">Ek izinler</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {groups.map((group) => {
                            const rowLocked = !group.permissions.some((code) => editing.allowedPermissionCodes.includes(code));
                            const extras = group.permissions.filter((code) => !ACTION_COLUMNS.some((col) => suffixOf(code) === col.suffix));
                            const selectedInRow = group.permissions.filter((code) => selectedCodes.includes(code)).length;
                            return (
                              <tr key={group.key} className={rowLocked ? "bg-slate-50/60" : selectedInRow > 0 ? "bg-primary/5" : ""}>
                                <td className="px-3 py-2.5 align-top">
                                  <button
                                    type="button"
                                    disabled={rowLocked}
                                    onClick={() => toggleGroup(group.permissions)}
                                    className={`flex items-center gap-1.5 text-left text-sm font-semibold ${rowLocked ? "cursor-not-allowed text-slate-400" : "text-slate-800 hover:text-primary"}`}
                                    title={rowLocked ? "Bu personelin rolünde bu bölüm yok" : "Bu satırdaki tüm izinleri aç/kapat"}
                                  >
                                    <span aria-hidden="true">{group.icon}</span>
                                    <span>{group.label}</span>
                                    {rowLocked && <Lock className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />}
                                  </button>
                                </td>
                                {ACTION_COLUMNS.map((col) => {
                                  const code = group.permissions.find((candidate) => suffixOf(candidate) === col.suffix);
                                  if (!code) return <td key={col.suffix} className="px-2 py-2.5 text-center text-slate-300">—</td>;
                                  const inCeiling = editing.allowedPermissionCodes.includes(code);
                                  return (
                                    <td key={col.suffix} className="px-2 py-2.5 text-center">
                                      <input
                                        type="checkbox"
                                        aria-label={`${group.label} — ${col.label}`}
                                        className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-30"
                                        checked={inCeiling && selectedCodes.includes(code)}
                                        disabled={!inCeiling}
                                        title={!inCeiling ? "Bu personelin rolünde bu izin yok" : PERMISSION_DETAILS[code]?.description}
                                        onChange={() => toggleCode(code)}
                                      />
                                    </td>
                                  );
                                })}
                                <td className="px-3 py-2.5">
                                  {extras.length === 0 ? <span className="text-slate-300">—</span> : (
                                    <div className="flex flex-wrap gap-1.5">
                                      {extras.map((code) => {
                                        const inCeiling = editing.allowedPermissionCodes.includes(code);
                                        const checked = selectedCodes.includes(code);
                                        return (
                                          <label
                                            key={code}
                                            title={!inCeiling ? "Bu personelin rolünde bu izin yok" : PERMISSION_DETAILS[code]?.description}
                                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${!inCeiling ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : checked ? "cursor-pointer border-primary/40 bg-primary/10 text-primary" : "cursor-pointer border-slate-200 bg-white text-slate-600 hover:border-primary/30"}`}
                                          >
                                            <input type="checkbox" className="sr-only" checked={inCeiling && checked} disabled={!inCeiling} onChange={() => toggleCode(code)} />
                                            {!inCeiling && <Lock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />}
                                            {extraLabel(code)}
                                          </label>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>
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

            {editing.role === "DOKTOR" && (
              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-bold text-slate-900">Bu şubeye özel hakediş oranları</h3>
                <p className="mt-0.5 text-xs text-slate-500">Yalnız {branch.name} tahsilatlarına uygulanır. Boş bırakılırsa hekimin genel oranları geçerlidir.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {RATE_FIELDS.map(([key, label]) => (
                    <FormField key={key} label={label} htmlFor={`sube-oran-${key}`}>
                      <Input
                        id={`sube-oran-${key}`}
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={rates[key]}
                        onChange={(event) => setRates((current) => ({ ...current, [key]: event.target.value }))}
                      />
                    </FormField>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
