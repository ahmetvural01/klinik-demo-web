"use client";

import { useMemo, useState } from "react";
import { Lock, ShieldCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { FormModal } from "@/components/ui/FormModal";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { SearchInput } from "@/components/ui/SearchInput";
import { Toolbar } from "@/components/ui/Toolbar";
import { PERMISSION_DETAILS, PERMISSION_GROUPS } from "@/lib/role-permissions";
import { roleLabel } from "@/lib/staff-roles";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { matchesSearch } from "@/components/yonetim/search-text";
import { RATE_LABELS, formatRate } from "./staff-shared";

export type BranchMembership = {
  isPrimary: boolean;
  isActive: boolean;
  isBranchManager: boolean;
  permissionCodes: unknown;
  genelYuzde: string | number | null;
  kkYuzde: string | number | null;
  maasYuzde: string | number | null;
};

export type ManagedStaff = {
  id: string;
  fullName: string;
  role: string;
  isActive: boolean;
  branchMemberships: BranchMembership[];
  allowedPermissionCodes: string[];
  homeBranch: { id: string; name: string } | null;
};

export type ManagedBranch = { id: string; name: string };

const CATEGORY_LABELS = { klinik: "Klinik", finans: "Finans", yonetim: "Yönetim", iletisim: "İletişim", sistem: "Sistem" } as const;

// İzin matrisinin sabit sütunları — kod sonekleri (`xxx:read` vb.) bu üç ana
// eylem tipine düşer. Bu üçe uymayan kodlar satırın "Ek izinler" hücresinde
// ayrı ayrı işaretlenebilir çip olarak kalır.
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

function codesOf(membership?: BranchMembership) {
  return Array.isArray(membership?.permissionCodes)
    ? membership.permissionCodes.filter((code): code is string => typeof code === "string")
    : null;
}

function suffixOf(code: string) {
  return code.slice(code.indexOf(":") + 1);
}

// "Finans — Gelir/Gider Görüntüleme" -> "Gelir/Gider Görüntüleme".
function shortTitle(code: string) {
  const title = PERMISSION_DETAILS[code]?.title || code;
  const dashIndex = title.indexOf("—");
  return dashIndex >= 0 ? title.slice(dashIndex + 1).trim() : title;
}

function extraLabel(code: string) {
  return EXTRA_SUFFIX_LABELS[suffixOf(code)] || shortTitle(code);
}

function accessSummary(member: ManagedStaff) {
  const membership = member.branchMemberships[0];
  if (!member.isActive) return { tone: "neutral" as const, text: "Pasif personel" };
  if (!membership?.isActive) return { tone: "neutral" as const, text: "Erişimi yok" };
  const custom = codesOf(membership);
  return { tone: "info" as const, text: custom == null ? "Rolünün tüm izinleri" : `${custom.length} seçili izin` };
}

// Bu şubenin kendi personeli: ana şubesi burası olan ya da başka bir ana
// şubesi olmayıp bu şubede kaydı bulunan kişi. Onlar "Ekip" sekmesinde yönetilir.
export function isLocalMember(member: ManagedStaff, branchId: string | undefined) {
  return member.homeBranch?.id === branchId || (!member.homeBranch && member.branchMemberships.length > 0);
}

type Props = {
  branch: ManagedBranch | null;
  staff: ManagedStaff[];
  loading: boolean;
  error: string | null;
  onReload: () => Promise<void> | void;
  /** Şubeye özel hakediş oranları personel penceresinde değişir (tek yer). */
  onOpenStaff?: (id: string) => void;
};

/**
 * Personel > Şube erişimi: başka şubenin personelinin BU şubede çalışabilmesi.
 * Önceden Ayarlar'da bir sekmeydi (konusu personel); "rolü değişmez" uyarısı
 * üç yerde tekrar ediyordu, izin penceresi 27 satırlık matrisi her zaman
 * gösteriyordu. Kurallar aynı: rol tavanı aşılamaz, şube yöneticisi
 * bağlantısı kaldırılamaz, pasif personele erişim verilemez,
 * `permissionCodes: null` = rolün tüm izinleri.
 */
export default function SubeErisimiTab({ branch, staff, loading, error, onReload, onOpenStaff }: Props) {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ManagedStaff | null>(null);
  const [inheritRole, setInheritRole] = useState(true);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const guestCandidates = useMemo(() => staff
    .filter((member) => !isLocalMember(member, branch?.id))
    .filter((member) => matchesSearch([member.fullName, roleLabel(member.role), member.homeBranch?.name], query)),
  [query, staff, branch]);

  const updateAccess = async (member: ManagedStaff, enabled: boolean, extra: Record<string, unknown> = {}, successMessage?: string) => {
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
        message: successMessage || (enabled
          ? `${member.fullName} artık ${branch?.name || "bu şube"} için çalışabilir.`
          : `${member.fullName} için ${branch?.name || "bu şube"} erişimi kaldırıldı.`),
        type: "success",
      });
      setEditing(null);
      await onReload();
      return true;
    } catch (caught) {
      showToastSafe({ title: "İşlem tamamlanamadı", message: caught instanceof Error ? caught.message : "Lütfen tekrar deneyin.", type: "error" });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const openPermissions = (member: ManagedStaff) => {
    const currentCodes = codesOf(member.branchMemberships[0]);
    setEditing(member);
    setInheritRole(currentCodes === null);
    setSelectedCodes(currentCodes || member.allowedPermissionCodes);
  };

  const savePermissions = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      // Oranlar burada gönderilmez: gönderilmeyen oran sunucuda değişmez.
      await updateAccess(editing, true, { permissionCodes: inheritRole ? null : selectedCodes });
    } finally {
      setSaving(false);
    }
  };

  // Şubeye özel oranı kaldırıp doktorun genel oranlarına döner (önceki
  // ekranda oran alanlarını boşaltmakla yapılıyordu; personel penceresi boş
  // oran kabul etmediği için bu yol ayrıca korunur). Hakedişi etkiler: sorulur.
  const resetBranchRates = async () => {
    if (!editing) return;
    const member = editing;
    if (!(await confirmDialog({
      title: "Genel oranlara dönülsün mü?",
      message: `${member.fullName} için bu şubeye özel hakediş oranları kaldırılır; bundan sonraki hakediş genel oranlarıyla hesaplanır. Geçmiş aylar değişmez.`,
      confirmText: "Genel oranlara dön",
    }))) return;
    setSaving(true);
    try {
      await updateAccess(member, true, { kkYuzde: null, genelYuzde: null, maasYuzde: null }, `${member.fullName} için bu şubede artık genel hakediş oranları geçerli.`);
    } finally {
      setSaving(false);
    }
  };

  const toggleGroup = (codes: readonly string[]) => {
    const allowed = codes.filter((code) => editing?.allowedPermissionCodes.includes(code));
    const allSelected = allowed.every((code) => selectedCodes.includes(code));
    setSelectedCodes((current) => allSelected ? current.filter((code) => !allowed.includes(code)) : Array.from(new Set([...current, ...allowed])));
  };

  const toggleCode = (code: string) => {
    setSelectedCodes((current) => current.includes(code) ? current.filter((value) => value !== code) : [...current, code]);
  };

  const rowActions = (member: ManagedStaff) => {
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
        {!lockedReason && (
          <Button
            size="sm"
            variant={hasAccess ? "ghost" : "secondary"}
            icon={hasAccess ? UserMinus : UserPlus}
            loading={busyId === member.id}
            disabled={Boolean(busyId)}
            onClick={() => void updateAccess(member, !hasAccess)}
          >
            {hasAccess ? "Erişimi kaldır" : "Erişim ver"}
          </Button>
        )}
      </div>
    );
  };

  const personCell = (member: ManagedStaff) => (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
        {member.fullName}
        {/* Kaldırılamama nedeni (önceden yalnız pasif düğmenin ipucundaydı). */}
        {member.branchMemberships[0]?.isBranchManager && <Badge tone="neutral">Şube yöneticisi</Badge>}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{roleLabel(member.role)} · Ana şube: {member.homeBranch?.name || "—"}</p>
    </div>
  );

  const columns: ListTableColumn<ManagedStaff>[] = [
    { key: "personel", header: "Personel", render: personCell },
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

  const editingMembership = editing?.branchMemberships[0];
  const branchRates = editingMembership && [editingMembership.kkYuzde, editingMembership.genelYuzde, editingMembership.maasYuzde].some((value) => value !== null && value !== "")
    ? RATE_LABELS.map(([key, label]) => `${label} ${formatRate(editingMembership[key])}`).join(" · ")
    : null;
  const viewOnlyCodes = editing ? editing.allowedPermissionCodes.filter((code) => suffixOf(code) === "read") : [];

  return (
    <div className="space-y-3">
      {/* "Rolü değişmez" bilgisi TEK yerde (önceden liste açıklaması, pencere açıklaması ve sarı kutuda üç kez). */}
      <Callout tone="info">
        Başka şubede çalışan personele <b>{branch?.name || "bu şube"}</b> için erişim verin. Rolü ve kendi şubesindeki yetkileri değişmez.
      </Callout>

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Personel, rol veya şube ara" wrapperClassName="flex-1 min-w-[220px]" />
      </Toolbar>

      <ListTable
        columns={columns}
        rows={guestCandidates}
        rowKey={(member) => member.id}
        loading={loading && staff.length === 0}
        error={staff.length === 0 ? error : null}
        staleError={staff.length > 0 ? error : null}
        onRetry={() => void onReload()}
        emptyIcon={Users}
        emptyText={query ? "Aramanızla eşleşen personel yok" : "Başka şubede çalışan personel yok"}
        emptyDescription={query ? undefined : "Kurumunuzun diğer şubelerine personel eklendiğinde burada görünür."}
        rowClassName={(member) => (member.isActive ? "" : "opacity-60")}
        mobileCard={(member) => {
          const summary = accessSummary(member);
          return (
            <div className="space-y-2">
              {personCell(member)}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={summary.tone}>{summary.text}</Badge>
                {rowActions(member)}
              </div>
            </div>
          );
        }}
      />

      <FormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing && branch ? `${editing.fullName} — ${branch.name} izinleri` : "Şube izinleri"}
        description={editing?.homeBranch ? `Ana şubesi ${editing.homeBranch.name}.` : undefined}
        size={inheritRole ? "md" : "xl"}
        onSubmit={() => savePermissions()}
        submitting={saving}
      >
        {editing && branch && (
          <>
            <ChoiceCards
              label="Bu şubedeki izinler"
              value={inheritRole ? "rol" : "secili"}
              onChange={(next) => setInheritRole(next === "rol")}
              columns={2}
              options={[
                { value: "rol", label: "Rolünün tüm izinleri", description: "Rol izinleri değişince bu şubeye de yansır." },
                { value: "secili", label: "Seçili izinler", description: "Yalnız aşağıda işaretlediklerinizi kullanır." },
              ]}
            />

            {/* Matris yalnız "Seçili izinler"de çizilir; rolde hiç olmayan
                bölümler (işaretlenemeyen satırlar) gösterilmez. */}
            {!inheritRole && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">{selectedCodes.length} izin seçili</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedCodes(viewOnlyCodes)}>Yalnız görüntüleme</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedCodes(editing.allowedPermissionCodes)}>Tümünü seç</Button>
                  </div>
                </div>
                {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map((category) => {
                  const groups = PERMISSION_GROUPS.filter((group) => group.category === category
                    && group.key !== "branches"
                    && group.permissions.some((code) => editing.allowedPermissionCodes.includes(code)));
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
                              const extras = group.permissions.filter((code) => !ACTION_COLUMNS.some((col) => suffixOf(code) === col.suffix));
                              const selectedInRow = group.permissions.filter((code) => selectedCodes.includes(code)).length;
                              return (
                                <tr key={group.key} className={selectedInRow > 0 ? "bg-primary/5" : ""}>
                                  <td className="px-3 py-2.5 align-top">
                                    <button
                                      type="button"
                                      onClick={() => toggleGroup(group.permissions)}
                                      className="text-left text-sm font-semibold text-slate-800 hover:text-primary"
                                      title="Bu satırdaki tüm izinleri aç/kapat"
                                    >
                                      {group.label}
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
            )}

            {/* Şubeye özel hakediş oranları tek yerde, personel penceresinde
                düzenlenir; burada yalnız gösterilir. */}
            {editing.role === "DOKTOR" && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-sm">
                <p className="min-w-0 text-slate-600">
                  <span className="font-semibold text-slate-800">Hakediş oranları: </span>
                  {branchRates || "Genel oranlar geçerli"}
                </p>
                {editingMembership?.isActive && (
                  <div className="flex flex-wrap gap-1.5">
                    {branchRates && (
                      <Button size="sm" variant="ghost" disabled={saving} onClick={() => void resetBranchRates()}>
                        Genel oranlara dön
                      </Button>
                    )}
                    {onOpenStaff && (
                      <Button size="sm" variant="ghost" disabled={saving} onClick={() => { const id = editing.id; setEditing(null); onOpenStaff(id); }}>
                        Oranları değiştir
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </FormModal>
    </div>
  );
}
