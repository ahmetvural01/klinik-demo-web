"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, RotateCcw, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { ActiveFilters, Toolbar, type ActiveFilter } from "@/components/ui/Toolbar";
import { createSceneIllustration } from "@/components/ui/SceneIllustration";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { matchesSearch } from "@/components/yonetim/search-text";
import { confirmDialog } from "@/lib/confirm-client";
import { invalidateCachedGet } from "@/lib/client-cache";
import { isEffectiveDoctor, roleLabel } from "@/lib/staff-roles";
import { showToastSafe } from "@/lib/toast-client";

const StaffEmptyIcon = createSceneIllustration("personel");

type Staff = {
  id: string;
  fullName: string;
  identityNo?: string;
  role: string;
  isActive: boolean;
  /** Yalnız yönetici görür (api/staff); null = bu hekime oran girilmemiş. */
  kkYuzde?: number | string | null;
  profile?: { workStart?: string | null; workEnd?: string | null; photoUrl?: string | null; hideAsDoctor?: boolean | null } | null;
  /** Bu şubedeki erişimi kapatılmış (pasife alınmış) personel. */
  passive?: boolean;
};

type ManagedStaff = {
  id: string;
  fullName: string;
  role: string;
  isActive: boolean;
  homeBranch: { id: string } | null;
  branchMemberships: Array<{ isActive: boolean }>;
};

type StatusFilter = "aktif" | "pasif" | "tumu";

const ROLE_FILTERS = [
  { value: "", label: "Tüm roller" },
  { value: "HEKIM", label: "Hasta tedavi edenler" },
  { value: "YONETICI", label: roleLabel("YONETICI") },
  { value: "DOKTOR", label: roleLabel("DOKTOR") },
  { value: "ASISTAN", label: roleLabel("ASISTAN") },
  { value: "BANKO", label: roleLabel("BANKO") },
  { value: "MUHASEBE", label: roleLabel("MUHASEBE") },
] as const;

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "aktif", label: "Çalışanlar" },
  { value: "pasif", label: "Pasife alınanlar" },
  { value: "tumu", label: "Tümü" },
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr-TR") ?? "")
    .join("");
}

/** Yönetici hasta da tedavi ediyorsa (bkz. lib/staff-roles) unvanı birlikte gösterilir. */
function staffRoleText(person: Staff) {
  if (person.role === "YONETICI" && isEffectiveDoctor({ ...person, isActive: true })) return `${roleLabel("YONETICI")} · hekim`;
  return roleLabel(person.role);
}

function Avatar({ person }: { person: Staff }) {
  return person.profile?.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={person.profile.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full border border-slate-200 object-cover" />
  ) : (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-xs font-bold text-primary" aria-hidden="true">
      {initials(person.fullName) || "P"}
    </span>
  );
}

/** Mesai saati yalnız randevu alan hekimler için anlamlıdır (randevu saat sınırı). */
function workHours(person: Staff) {
  if (!isEffectiveDoctor({ ...person, isActive: true })) return null;
  const start = person.profile?.workStart;
  const end = person.profile?.workEnd;
  return start && end ? `${start} – ${end}` : null;
}

/** Hekimin hakediş oranı hiç girilmemişse yöneticiye gösterilir (alan yalnız yöneticiye gelir). */
function missingRates(person: Staff) {
  return !person.passive && Object.prototype.hasOwnProperty.call(person, "kkYuzde") && person.kkYuzde == null && isEffectiveDoctor({ ...person, isActive: true });
}

function StatusBadges({ person }: { person: Staff }) {
  return (
    <>
      {(person.passive || !person.isActive) && <Badge tone="neutral">Pasif</Badge>}
      {missingRates(person) && <Badge tone="warning" title="Hakediş hesabı bu hekim için varsayılan oranları kullanıyor.">Hakediş oranı girilmemiş</Badge>}
    </>
  );
}

export default function PersonelPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const canWriteStaff = can("staff:write");
  // Pasife alınan personel /api/staff listesinde gelmez; şube yöneticisi
  // onları şube erişim listesinden görür ve buradan geri açabilir.
  const canManageBranch = can("branches:assign");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [passiveStaff, setPassiveStaff] = useState<Staff[]>([]);
  const [passiveAvailable, setPassiveAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("aktif");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Üst bardaki "Yeni" menüsü ve diğer ekranlar ?yeni=1 ile doğrudan forma gelir.
  useEffect(() => {
    if (searchParams.get("yeni") === "1" && canWriteStaff) router.replace("/personel-ekle");
  }, [canWriteStaff, router, searchParams]);

  const loadPassive = useCallback(async (activeIds: Set<string>) => {
    if (!canManageBranch) return;
    try {
      const response = await fetch("/api/branches?manage=1", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      if (!Array.isArray(data?.staff) || !data?.branch?.id) return;
      const branchId: string = data.branch.id;
      const passive = (data.staff as ManagedStaff[])
        .filter((member) => {
          const membership = member.branchMemberships[0];
          // Bu şubede kaydı olup erişimi kapatılmış ve başka bir şubenin
          // kadrosunda olmayan kişi = bu şubeden ayrılan personel.
          return membership && !membership.isActive && !activeIds.has(member.id) && (!member.homeBranch || member.homeBranch.id === branchId);
        })
        .map((member) => ({ id: member.id, fullName: member.fullName, role: member.role, isActive: member.isActive, passive: true }));
      setPassiveStaff(passive);
      setPassiveAvailable(true);
    } catch {
      // Pasif liste isteğe bağlıdır; yüklenemezse yalnız çalışanlar görünür.
    }
  }, [canManageBranch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/staff", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data)) throw new Error(data?.message || "Personel listesi yüklenemedi.");
      setStaff(data);
      void loadPassive(new Set((data as Staff[]).map((person) => person.id)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Personel listesi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [loadPassive]);

  useEffect(() => { void load(); }, [load]);

  const reactivate = async (person: Staff) => {
    if (!(await confirmDialog({
      title: `${person.fullName} yeniden aktif edilsin mi?`,
      message: "Tekrar giriş yapabilir; randevu ve işlem ekranlarında seçilebilir. Eski şifresi geçerli olur.",
      confirmText: "Aktif et",
    }))) return;
    setBusyId(person.id);
    try {
      const response = await fetch(`/api/staff/${person.id}/branches`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        showToastSafe({ title: "Aktif edilemedi", message: data?.message || "Lütfen tekrar deneyin.", type: "error" });
        return;
      }
      invalidateCachedGet("/api/staff");
      showToastSafe({ message: `${person.fullName} yeniden aktif. Çalışanlar listesinde görünüyor.`, type: "success" });
      setFilterStatus("aktif");
      await load();
    } catch {
      showToastSafe({ title: "Aktif edilemedi", message: "Bağlantınızı kontrol edip tekrar deneyin.", type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const digits = search.replace(/\D/g, "");
    const source = filterStatus === "aktif" ? staff : filterStatus === "pasif" ? passiveStaff : [...staff, ...passiveStaff];
    return source
      .filter((person) => {
        if (filterRole === "HEKIM" && !isEffectiveDoctor({ ...person, isActive: true })) return false;
        if (filterRole && filterRole !== "HEKIM" && person.role !== filterRole) return false;
        if (!search.trim()) return true;
        // TC kimlik no listede gösterilmez ama numarayla aranabilir.
        return matchesSearch([person.fullName, staffRoleText(person)], search) || (digits.length >= 3 && Boolean(person.identityNo?.includes(digits)));
      })
      .sort((a, b) => Number(Boolean(a.passive)) - Number(Boolean(b.passive)) || a.fullName.localeCompare(b.fullName, "tr"));
  }, [filterRole, filterStatus, passiveStaff, search, staff]);

  const activeFilters: ActiveFilter[] = [
    ...(filterRole ? [{ key: "rol", label: ROLE_FILTERS.find((item) => item.value === filterRole)?.label || filterRole, onRemove: () => setFilterRole("") }] : []),
    ...(filterStatus !== "aktif" ? [{ key: "durum", label: STATUS_FILTERS.find((item) => item.value === filterStatus)?.label || "", onRemove: () => setFilterStatus("aktif") }] : []),
  ];

  const openEdit = (person: Staff) => {
    if (person.passive) return;
    router.push(`/personel-ekle?id=${person.id}`);
  };

  const rowAction = (person: Staff) => {
    if (person.passive) {
      return canManageBranch ? (
        <Button
          size="sm"
          variant="secondary"
          icon={RotateCcw}
          loading={busyId === person.id}
          disabled={Boolean(busyId) || !person.isActive}
          title={!person.isActive ? "Hesap platform tarafından kapatılmış; destek ekibine başvurun." : undefined}
          onClick={() => void reactivate(person)}
        >
          Yeniden aktif et
        </Button>
      ) : null;
    }
    return canWriteStaff ? <IconButton icon={Pencil} title={`${person.fullName} kaydını düzenle`} size="sm" href={`/personel-ekle?id=${person.id}`} /> : null;
  };

  const columns: ListTableColumn<Staff>[] = [
    {
      key: "personel",
      header: "Personel",
      render: (person) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar person={person} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{person.fullName}</p>
            <div className="mt-0.5 flex flex-wrap gap-1.5"><StatusBadges person={person} /></div>
          </div>
        </div>
      ),
    },
    { key: "rol", header: "Rol", render: (person) => staffRoleText(person) },
    {
      key: "mesai",
      header: "Mesai",
      render: (person) => workHours(person) || <EmptyValue />,
    },
    ...(canWriteStaff || canManageBranch ? [{
      key: "islem",
      header: "",
      align: "right" as const,
      render: rowAction,
    }] : []),
  ];

  const emptyText = staff.length === 0 && filterStatus === "aktif"
    ? "Henüz personel eklenmedi"
    : filterStatus === "pasif" && passiveStaff.length === 0
      ? "Pasife alınmış personel yok"
      : "Aramanızla eşleşen personel yok";

  return (
    <section className="space-y-3">
      <PageHeader
        icon="person"
        title="Personel"
        description="Klinik ekibi, rolleri ve hekimlerin mesai saatleri. Düzenlemek için kişiye tıklayın."
        actions={canWriteStaff ? <Button icon={UserPlus} href="/personel-ekle">Yeni personel</Button> : undefined}
      />

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Ad, rol veya TC kimlik no ara" slashShortcut wrapperClassName="flex-1 min-w-[220px]" />
        <Select aria-label="Rol" value={filterRole} onChange={(event) => setFilterRole(event.target.value)} className="sm:w-52">
          {ROLE_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </Select>
        {passiveAvailable && (
          <Select aria-label="Durum" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as StatusFilter)} className="sm:w-48">
            {STATUS_FILTERS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.value === "pasif" && passiveStaff.length > 0 ? `${item.label} (${passiveStaff.length})` : item.label}
              </option>
            ))}
          </Select>
        )}
      </Toolbar>
      <ActiveFilters filters={activeFilters} onClearAll={() => { setFilterRole(""); setFilterStatus("aktif"); }} />

      <ListTable
        columns={columns}
        rows={filtered}
        rowKey={(person) => `${person.passive ? "p" : "a"}-${person.id}`}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        skeletonRows={7}
        emptyText={emptyText}
        emptyDescription={staff.length === 0 && filterStatus === "aktif" && canWriteStaff ? "Ekibinizi ekleyin; her personel kendi TC kimlik numarasıyla giriş yapar." : undefined}
        emptyAction={staff.length === 0 && filterStatus === "aktif" && canWriteStaff ? <Button icon={UserPlus} href="/personel-ekle">Yeni personel</Button> : undefined}
        emptyIcon={StaffEmptyIcon}
        emptyIllustrative
        onRowClick={canWriteStaff ? openEdit : undefined}
        getRowAriaLabel={(person) => `${person.fullName} kaydını aç`}
        rowClassName={(person) => (person.passive || !person.isActive ? "opacity-70" : "")}
        mobileCard={(person) => (
          <div className="flex items-center gap-3">
            <Avatar person={person} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900">{person.fullName}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {staffRoleText(person)}
                {workHours(person) ? ` · ${workHours(person)}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5 empty:hidden"><StatusBadges person={person} /></div>
            </div>
            {person.passive && rowAction(person)}
          </div>
        )}
      />
    </section>
  );
}
