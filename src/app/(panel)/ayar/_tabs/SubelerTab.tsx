"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CalendarDays, Check, Crown, Lock, MapPin, Percent, Search, ShieldCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PERMISSION_DETAILS, PERMISSION_GROUPS } from "@/lib/role-permissions";
import { showToastSafe } from "@/lib/toast-client";

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
  _count: { memberships: number; clinicUnits: number; appointments: number; homePatients: number };
};

const ROLE_LABELS: Record<string, string> = { YONETICI: "Yönetici", DOKTOR: "Diş Hekimi", ASISTAN: "Asistan", BANKO: "Banko", MUHASEBE: "Muhasebe" };
const CATEGORY_LABELS = { klinik: "Klinik", finans: "Finans", yonetim: "Yönetim", iletisim: "İletişim", sistem: "Sistem" } as const;

// İzin matrisinin sabit sütunları — kod sonekleri (`xxx:read` vb.) bu üç ana
// eylem tipine düşer. Bu üçe uymayan (approve, print, refund, phone, merge,
// export, schedule, read-all, bulk, close, stats, password, center vb.) kodlar
// satırın "Ek İzinler" hücresinde ayrı ayrı işaretlenebilir çip olarak kalır.
const ACTION_COLUMNS = [
  { suffix: "read", label: "Görüntüle" },
  { suffix: "write", label: "Oluştur / Düzenle" },
  { suffix: "delete", label: "Sil" },
] as const;

const EXTRA_SUFFIX_LABELS: Record<string, string> = {
  approve: "Onay / İptal",
  print: "Yazdır",
  complete: "Tamamlama",
  refund: "İade",
  merge: "Birleştirme",
  phone: "Telefon Görüntüleme",
  export: "Dışa Aktarma",
  schedule: "Mesai Düzenleme",
  "read-all": "Tüm Kayıtları Görme",
  bulk: "Toplu Gönderim",
  close: "Kapatma",
  stats: "İleri İstatistik",
  password: "Şifre Değiştirme",
  center: "Merkez Erişimi",
};

function codesOf(membership?: Membership) {
  return Array.isArray(membership?.permissionCodes)
    ? membership.permissionCodes.filter((code): code is string => typeof code === "string")
    : null;
}

function suffixOf(code: string) {
  return code.slice(code.indexOf(":") + 1);
}

export default function SubelerTab() {
  const [branch, setBranch] = useState<Branch | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [inheritRole, setInheritRole] = useState(true);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [rates, setRates] = useState({ genelYuzde: "", kkYuzde: "", maasYuzde: "" });

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/branches?manage=1", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.branch || !Array.isArray(data?.staff)) throw new Error(data?.message || "Şube yetkileri yüklenemedi.");
      setBranch(data.branch);
      setStaff(data.staff);
    } catch (error) {
      showToastSafe({ title: "Erişim yönetimi açılamadı", message: error instanceof Error ? error.message : "Lütfen tekrar deneyin.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return staff.filter((member) => `${member.fullName} ${ROLE_LABELS[member.role] || member.role}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [query, staff]);

  // Bu ekranın TEK amacı: bir personelin KENDİ şubesi dışındaki (misafir)
  // erişimini yönetmek. Kendi/ana şubesindeki yetkileri zaten rolünden gelir
  // ve burada değiştirilemez — aksi halde "rol yetkisini mi değiştiriyorum,
  // şube erişimini mi?" karışıklığı olur (bkz. kullanıcı geri bildirimi).
  const homeStaff = useMemo(() => filtered.filter((member) => member.homeBranch?.id === branch?.id), [filtered, branch]);
  const guestCandidates = useMemo(() => filtered.filter((member) => member.homeBranch?.id !== branch?.id), [filtered, branch]);

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
      showToastSafe({ title: "Şube erişimi güncellendi", message: member.fullName, type: "success" });
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

  const toggleGroup = (codes: string[]) => {
    const allowed = codes.filter((code) => editing?.allowedPermissionCodes.includes(code));
    const allSelected = allowed.every((code) => selectedCodes.includes(code));
    setSelectedCodes((current) => allSelected ? current.filter((code) => !allowed.includes(code)) : Array.from(new Set([...current, ...allowed])));
  };

  const toggleCode = (code: string) => {
    setSelectedCodes((current) => current.includes(code) ? current.filter((value) => value !== code) : [...current, code]);
  };

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

  if (loading) return <div className="py-16 text-center text-sm font-semibold text-slate-400">Şube erişim matrisi hazırlanıyor...</div>;
  if (!branch) return <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Bu şubede erişim yönetimi yetkiniz bulunmuyor.</div>;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="h-1" style={{ backgroundColor: branch.colorCode }} />
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white shadow-sm" style={{ backgroundColor: branch.colorCode }}><Building2 className="h-5 w-5" /></span>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-black text-slate-950">{branch.name}</h3>{branch.isHeadquarters && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700"><Crown className="h-3 w-3" /> Merkez</span>}</div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" />{[branch.address, branch.district, branch.city].filter(Boolean).join(", ") || "Adres bilgisi tanımlanmamış"}</p>
              <p className="mt-2 text-[11px] font-medium text-slate-500">Şube kaydı ve etkinlik durumu bu ekrandan değiştirilemez.</p>
            </div>
          </div>
          <div className="flex divide-x divide-slate-200 rounded-md border border-slate-200 bg-slate-50">
            <span className="px-4 py-2 text-center"><Users className="mx-auto h-4 w-4 text-blue-600" /><b className="mt-1 block text-xs">{branch._count.memberships}</b><small className="text-[9px] text-slate-400">Personel</small></span>
            <span className="px-4 py-2 text-center"><CalendarDays className="mx-auto h-4 w-4 text-emerald-600" /><b className="mt-1 block text-xs">{branch._count.appointments}</b><small className="text-[9px] text-slate-400">Randevu</small></span>
          </div>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="text-sm font-black text-slate-900">Diğer Şube Personeline Misafir Erişimi</h3><p className="mt-1 text-xs text-slate-500">Bu ekran yalnızca <b>başka bir şubede çalışan</b> personele <b>{branch.name}</b> için ek/misafir erişim tanımlar. Personelin kendi rolünü veya kendi şubesindeki yetkilerini değiştirmez.</p></div>
          <label className="flex h-9 w-full max-w-xs items-center gap-2 rounded-md border border-slate-200 bg-white px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10"><Search className="h-4 w-4 text-slate-400" /><input className="min-w-0 flex-1 bg-transparent text-xs font-medium outline-none" placeholder="Personel veya rol ara" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left">
            <thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase text-slate-500"><th className="px-4 py-3">Personel</th><th className="hidden px-4 py-3 sm:table-cell">Misafir Erişimi</th><th className="px-4 py-3 text-right">İşlem</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {guestCandidates.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-xs text-slate-400">Başka şubede çalışan personel bulunamadı.</td></tr>}
              {guestCandidates.map((member) => {
                const membership = member.branchMemberships[0];
                const hasAccess = Boolean(membership?.isActive);
                const customCount = codesOf(membership)?.length;
                return <tr key={member.id} className={!member.isActive ? "opacity-50" : ""}>
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><span className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-black ${hasAccess ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{member.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span><div><p className="text-xs font-bold text-slate-900">{member.fullName}</p><p className="mt-0.5 text-[10px] text-slate-500">{ROLE_LABELS[member.role] || member.role}{member.homeBranch ? ` · Ana şube: ${member.homeBranch.name}` : ""}</p></div></div></td>
                  <td className="hidden px-4 py-3 sm:table-cell"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${hasAccess ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}><ShieldCheck className="h-3.5 w-3.5" />{hasAccess ? customCount == null ? "Rol varsayılanı" : `${customCount} özel izin` : "Erişim yok"}</span></td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-2">{hasAccess && <Button size="sm" variant="secondary" icon={member.role === "DOKTOR" ? Percent : ShieldCheck} onClick={() => openPermissions(member)}>Erişimi Yönet</Button>}<Button size="sm" variant={hasAccess ? "ghost" : "primary"} icon={hasAccess ? UserMinus : UserPlus} loading={busyId === member.id} disabled={!member.isActive || membership?.isBranchManager || Boolean(busyId)} title={membership?.isBranchManager ? "Şube yöneticisi bağlantısı bu ekrandan kaldırılamaz." : !member.isActive ? "Pasif personelin erişimi değiştirilemez." : undefined} onClick={() => void updateAccess(member, !hasAccess)}>{hasAccess ? "Erişimi Kaldır" : "Misafir Erişimi Ver"}</Button></div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div><h3 className="text-sm font-black text-slate-900">Bu Şubenin Kendi Personeli</h3><p className="mt-1 text-xs text-slate-500">Bunlar <b>{branch.name}</b>&apos;nin ana personelidir — yetkileri rollerinden gelir ve buradan değiştirilemez. Rol yetkilerini değiştirmek için <b>Rol Yetkileri</b> ekranını kullanın.</p></div>
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left">
            <thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase text-slate-500"><th className="px-4 py-3">Personel</th><th className="px-4 py-3 text-right">Kaynak</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {homeStaff.length === 0 && <tr><td colSpan={2} className="px-4 py-6 text-center text-xs text-slate-400">Bu şubeye ana olarak kayıtlı personel bulunamadı.</td></tr>}
              {homeStaff.map((member) => (
                <tr key={member.id} className={!member.isActive ? "opacity-50" : ""}>
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-xs font-black text-slate-500">{member.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span><div><p className="text-xs font-bold text-slate-900">{member.fullName}</p><p className="mt-0.5 text-[10px] text-slate-500">{ROLE_LABELS[member.role] || member.role}{member.branchMemberships[0]?.isBranchManager ? " · Şube yöneticisi" : ""}</p></div></div></td>
                  <td className="px-4 py-3 text-right"><span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500"><ShieldCheck className="h-3.5 w-3.5" />Rolden geliyor</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.fullName} · ${branch.name} Misafir Erişimi` : "Misafir Erişimi"}
        description={editing?.homeBranch ? `Ana şubesi: ${editing.homeBranch.name} — burada yalnızca ${branch.name} için ek erişim tanımlanıyor` : `${branch.name} için misafir erişim`}
        size="xl"
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Vazgeç</Button><Button icon={Check} loading={busyId === editing?.id} onClick={() => editing && void updateAccess(editing, true, { permissionCodes: inheritRole ? null : selectedCodes, ...rates })}>Yetkileri Kaydet</Button></>}
      >
        {editing && <div className="space-y-5">
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-[11px] leading-5 text-amber-800">
              Bu ekran <b>{editing.fullName}</b>&apos;nin ROLÜNÜ değiştirmez. <b>{editing.fullName}</b> normalde <b>{editing.homeBranch?.name || "başka bir şubede"}</b> çalışıyor — burada ona ek olarak <b>{branch.name}</b> şubesi için <b>misafir</b> erişim tanımlıyorsunuz (ör. &quot;A şubesindeki muhasebeci, B şubesinin finansını görebilsin ama düzenleyemesin&quot;).
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={inheritRole} onChange={(event) => setInheritRole(event.target.checked)} /><span><b className="block text-xs text-slate-900">Rol varsayılanlarını kullan</b><small className="mt-0.5 block text-[11px] leading-4 text-slate-500">Rol izinleri merkezi olarak değiştiğinde bu şubeye otomatik yansır. Kapattığınızda aşağıdaki izinler yalnızca daraltılabilir.</small></span></label>

          <div className={`space-y-5 ${inheritRole ? "pointer-events-none opacity-45" : ""}`}>
            {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map((category) => {
              const groups = PERMISSION_GROUPS.filter((group) => group.category === category && group.key !== "branches");
              if (!groups.length) return null;
              return <div key={category}>
                <p className="mb-2 text-[10px] font-black uppercase text-slate-400">{CATEGORY_LABELS[category]}</p>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[560px] text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2">Modül</th>
                        {ACTION_COLUMNS.map((col) => <th key={col.suffix} className="px-2 py-2 text-center">{col.label}</th>)}
                        <th className="px-3 py-2">Ek İzinler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {groups.map((group) => {
                        const rowLocked = !group.permissions.some((code) => editing.allowedPermissionCodes.includes(code));
                        const extras = group.permissions.filter((code) => !ACTION_COLUMNS.some((col) => suffixOf(code) === col.suffix));
                        const selectedInRow = group.permissions.filter((code) => selectedCodes.includes(code)).length;
                        return <tr key={group.key} className={rowLocked ? "bg-slate-50/60" : selectedInRow > 0 ? "bg-primary/5" : ""}>
                          <td className="px-3 py-2.5 align-top">
                            <button
                              type="button"
                              disabled={rowLocked}
                              onClick={() => toggleGroup(group.permissions)}
                              className={`flex items-center gap-1.5 text-left text-xs font-bold ${rowLocked ? "cursor-not-allowed text-slate-400" : "text-slate-800 hover:text-primary"}`}
                              title={rowLocked ? "Bu personelin rolünde bu modül yok" : "Bu satırdaki tüm izinleri aç/kapat"}
                            >
                              <span aria-hidden="true">{group.icon}</span>
                              <span>{group.label}</span>
                              {rowLocked && <Lock className="h-3 w-3 shrink-0 text-slate-400" />}
                            </button>
                          </td>
                          {ACTION_COLUMNS.map((col) => {
                            const code = group.permissions.find((candidate) => suffixOf(candidate) === col.suffix);
                            if (!code) return <td key={col.suffix} className="px-2 py-2.5 text-center text-slate-300">—</td>;
                            const inCeiling = editing.allowedPermissionCodes.includes(code);
                            const checked = selectedCodes.includes(code);
                            return <td key={col.suffix} className="px-2 py-2.5 text-center">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 accent-primary disabled:cursor-not-allowed disabled:opacity-30"
                                checked={inCeiling && checked}
                                disabled={!inCeiling}
                                title={!inCeiling ? "Bu personelin rolünde bu izin yok" : PERMISSION_DETAILS[code]?.description}
                                onChange={() => toggleCode(code)}
                              />
                            </td>;
                          })}
                          <td className="px-3 py-2.5">
                            {extras.length === 0 ? <span className="text-slate-300">—</span> : <div className="flex flex-wrap gap-1.5">
                              {extras.map((code) => {
                                const inCeiling = editing.allowedPermissionCodes.includes(code);
                                const checked = selectedCodes.includes(code);
                                return <label
                                  key={code}
                                  title={!inCeiling ? "Bu personelin rolünde bu izin yok" : PERMISSION_DETAILS[code]?.description}
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${!inCeiling ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : checked ? "cursor-pointer border-primary/40 bg-primary/10 text-primary" : "cursor-pointer border-slate-200 bg-white text-slate-600 hover:border-primary/30"}`}
                                >
                                  <input type="checkbox" className="hidden" checked={inCeiling && checked} disabled={!inCeiling} onChange={() => toggleCode(code)} />
                                  {!inCeiling && <Lock className="h-2.5 w-2.5 shrink-0" />}
                                  {extraLabel(code)}
                                </label>;
                              })}
                            </div>}
                          </td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>;
            })}
          </div>

          {editing.role === "DOKTOR" && <div className="border-t border-slate-200 pt-4"><div className="flex items-center gap-2"><Percent className="h-4 w-4 text-emerald-600" /><h4 className="text-xs font-black text-slate-900">Şubeye Özel Hakediş Oranları</h4></div><p className="mt-1 text-[11px] text-slate-500">Bu oranlar yalnızca {branch.name} tahsilatlarına uygulanır.</p><div className="mt-3 grid gap-3 sm:grid-cols-3">{([['genelYuzde','Genel %'],['kkYuzde','Kredi Kartı %'],['maasYuzde','Maaş %']] as const).map(([key,label]) => <label key={key}><span className="mb-1.5 block text-[10px] font-bold text-slate-600">{label}</span><input type="number" min="0" max="100" step="0.01" value={rates[key]} onChange={(event) => setRates((current) => ({ ...current, [key]: event.target.value }))} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /></label>)}</div></div>}
        </div>}
      </Modal>
    </div>
  );
}
