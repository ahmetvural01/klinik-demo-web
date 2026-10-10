"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Select } from "@/components/ui/Input";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Toolbar } from "@/components/ui/Toolbar";
import { createSceneIllustration } from "@/components/ui/SceneIllustration";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { matchesSearch } from "@/components/yonetim/search-text";
import { confirmDialog } from "@/lib/confirm-client";
import { invalidateCachedGet } from "@/lib/client-cache";
import { isEffectiveDoctor, roleLabel } from "@/lib/staff-roles";
import { showToastSafe } from "@/lib/toast-client";
import { StaffFormModal } from "./_components/StaffFormModal";
import SubeErisimiTab, { isLocalMember, type ManagedBranch, type ManagedStaff } from "./_components/SubeErisimiTab";
import { STAFF_ROLE_ORDER } from "./_components/staff-shared";

const StaffEmptyIcon = createSceneIllustration("personel");

type Staff = {
  id: string;
  fullName: string;
  /** Yalnız personel kaydı yazabilene gelir (api/staff?details=1). */
  identityNo?: string;
  role: string;
  isActive: boolean;
  /** Yalnız hakediş özetini gören (finance:read) görür (api/staff); null = bu doktora oran girilmemiş. */
  kkYuzde?: number | string | null;
  profile?: { workStart?: string | null; workEnd?: string | null; photoUrl?: string | null; hideAsDoctor?: boolean | null } | null;
  /** Bu şubedeki erişimi kapatılmış (pasife alınmış) personel. */
  passive?: boolean;
};

type StatusFilter = "aktif" | "pasif" | "tumu";
type PersonelTab = "ekip" | "erisim";

const ROLE_FILTERS = [
  { value: "", label: "Tüm roller" },
  { value: "HEKIM", label: "Hasta tedavi edenler" },
  ...STAFF_ROLE_ORDER.map((role) => ({ value: role, label: roleLabel(role) })),
];

/** Yönetici hasta da tedavi ediyorsa (bkz. lib/staff-roles) unvanı birlikte gösterilir. */
function staffRoleText(person: Staff) {
  if (person.role === "YONETICI" && isEffectiveDoctor({ ...person, isActive: true })) return `${roleLabel("YONETICI")} · doktor`;
  return roleLabel(person.role);
}

/** Mesai yalnız randevu alan doktorlar için anlamlıdır; rolün yanında gösterilir (ayrı sütun hep "—" idi). */
function workHours(person: Staff) {
  if (person.passive || !isEffectiveDoctor({ ...person, isActive: true })) return null;
  const start = person.profile?.workStart;
  const end = person.profile?.workEnd;
  return start && end ? `${start} – ${end}` : null;
}

/** Doktorun hakediş oranı hiç girilmemişse gösterilir (alan yalnız oranları görebilene gelir). */
function missingRates(person: Staff) {
  return !person.passive && Object.prototype.hasOwnProperty.call(person, "kkYuzde") && person.kkYuzde == null && isEffectiveDoctor({ ...person, isActive: true });
}

function StatusBadges({ person }: { person: Staff }) {
  return (
    <>
      {(person.passive || !person.isActive) && <Badge tone="neutral">Pasif</Badge>}
      {missingRates(person) && <Badge tone="warning">Hakediş oranı girilmemiş</Badge>}
    </>
  );
}

export default function PersonelPage() {
  const searchParams = useSearchParams();
  const { can, role, userId } = usePermissions();
  const canWriteStaff = can("staff:write");
  // Pasife alınan personel /api/staff listesinde gelmez; şube yöneticisi
  // onları şube erişim listesinden görür ve buradan geri açabilir.
  const canManageBranch = can("branches:assign");
  // Oranları sunucu da yalnız finance:read sahibine gönderir (api/staff).
  const viewerSeesRates = can("finance:read");
  // Yönetici rolünü yalnız yönetici verebilir (api/staff aynı kuralı uygular).
  const canAssignManagerRole = role === "YONETICI" || role === "SUPERADMIN";

  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffLoaded, setStaffLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manage, setManage] = useState<{ branch: ManagedBranch | null; staff: ManagedStaff[] } | null>(null);
  const [manageLoading, setManageLoading] = useState(canManageBranch);
  const [manageError, setManageError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("aktif");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // details=1: fotoğraflar (ve yazma yetkisinde TC). Seçicilerin kullandığı
      // varsayılan liste bunları taşımaz.
      const response = await fetch("/api/staff?details=1", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data)) throw new Error(data?.message || "Personel listesi yüklenemedi.");
      setStaff(data);
      setStaffLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Personel listesi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Pasif personel ve şube erişimi aynı uçtan; iki sekme tek yüklemeyi paylaşır.
  const loadManage = useCallback(async () => {
    if (!canManageBranch) return;
    setManageLoading(true);
    setManageError(null);
    try {
      const response = await fetch("/api/branches?manage=1", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.branch || !Array.isArray(data?.staff)) throw new Error(data?.message || "Şube erişimleri yüklenemedi.");
      setManage({ branch: { id: data.branch.id, name: data.branch.name }, staff: data.staff });
    } catch (loadError) {
      setManageError(loadError instanceof Error ? loadError.message : "Şube erişimleri yüklenemedi.");
    } finally {
      setManageLoading(false);
    }
  }, [canManageBranch]);

  // Önceden pasif liste ancak personel listesi gelince isteniyordu (sıralı); artık paralel.
  const loadAll = useCallback(async () => {
    await Promise.all([loadStaff(), loadManage()]);
  }, [loadManage, loadStaff]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const passiveStaff = useMemo<Staff[]>(() => {
    if (!manage?.branch) return [];
    const branchId = manage.branch.id;
    const activeIds = new Set(staff.map((person) => person.id));
    return manage.staff
      .filter((member) => {
        const membership = member.branchMemberships[0];
        // Bu şubede kaydı olup erişimi kapatılmış ve başka bir şubenin
        // kadrosunda olmayan kişi = bu şubeden ayrılan personel.
        return membership && !membership.isActive && !activeIds.has(member.id) && (!member.homeBranch || member.homeBranch.id === branchId);
      })
      .map((member) => ({ id: member.id, fullName: member.fullName, role: member.role, isActive: member.isActive, passive: true }));
  }, [manage, staff]);
  // Süzgeç hapları şube erişim verisi gelmeden de çizilir (sayı sonra
  // eklenir): önceden veri gelince araç çubuğuna sonradan ekleniyor, satır kayıyordu.
  const passiveAvailable = canManageBranch && !(manageError && !manage);

  // "Şube erişimi" sekmesi yalnız başka şubede çalışan personel varsa anlamlıdır.
  const guestCount = useMemo(() => (manage?.branch ? manage.staff.filter((member) => !isLocalMember(member, manage.branch?.id)).length : 0), [manage]);
  // Erişim listesi gelene kadar `?tab=erisim` (eski /ayar?tab=subeler) sekmeyi açık tutar.
  const rawTab = searchParams.get("tab");
  const showAccessTab = canManageBranch && (guestCount > 0 || (rawTab === "erisim" && !manage));
  const tabKeys = useMemo<PersonelTab[]>(() => (showAccessTab ? ["ekip", "erisim"] : ["ekip"]), [showAccessTab]);
  const [tab, setTab] = useTabParam<PersonelTab>(tabKeys, "ekip");

  // Başka şubeden çalışan yoksa (tek şubeli kurum) "Şube erişimi" sekmesi yok:
  // eski adres Ekip'e döner. Önceden boş sekme açılıyor, Ekip'e geçince sekme
  // çubuğu kayboluyor ve geri dönülemiyordu.
  useEffect(() => {
    if (rawTab === "erisim" && manage && guestCount === 0) setTab("ekip");
  }, [guestCount, manage, rawTab, setTab]);

  // ---- Personel penceresi: ?yeni=1 (üst bardaki "Yeni" menüsü, eski /personel-ekle) ve ?id= ----
  const newParam = searchParams.get("yeni") === "1";
  const idParam = searchParams.get("id");
  useEffect(() => {
    if (!canWriteStaff) return;
    if (newParam) setModal({ open: true, id: null });
    else if (idParam) setModal({ open: true, id: idParam });
  }, [canWriteStaff, idParam, newParam]);

  const writeModalParam = (id: string | null | undefined) => {
    const params = new URLSearchParams(window.location.search);
    params.delete("yeni");
    params.delete("id");
    if (id === null) params.set("yeni", "1");
    else if (id) params.set("id", id);
    const text = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${text ? `?${text}` : ""}`);
  };
  const openNew = () => {
    setModal({ open: true, id: null });
    writeModalParam(null);
  };
  const openEdit = (id: string) => {
    setModal({ open: true, id });
    writeModalParam(id);
  };
  // Pencere kapanınca liste, arama ve süzgeçler olduğu gibi kalır.
  const closeModal = () => {
    setModal((current) => ({ ...current, open: false }));
    writeModalParam(undefined);
  };
  const onModalDone = (message: string, options?: { duration?: number }) => {
    showToastSafe({ message, type: "success", duration: options?.duration });
    closeModal();
    void loadAll();
  };

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
      await loadAll();
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
        // TC listede gösterilmez; yalnız yazma yetkisinde gelir ve numarayla aranabilir.
        return matchesSearch([person.fullName, staffRoleText(person)], search) || (digits.length >= 3 && Boolean(person.identityNo?.includes(digits)));
      })
      .sort((a, b) => Number(Boolean(a.passive)) - Number(Boolean(b.passive)) || a.fullName.localeCompare(b.fullName, "tr"));
  }, [filterRole, filterStatus, passiveStaff, search, staff]);

  const filterCount = (filterRole ? 1 : 0) + (filterStatus !== "aktif" ? 1 : 0);

  // Satırda görünür tek eylem: pasif personeli yeniden aktif etmek. Aktif
  // personelin kaydı satıra tıklayınca açılır; ayrıca kutulu kalem düğmesi
  // gerekmez (sadelik K3).
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
    return null;
  };

  const roleCell = (person: Staff) => {
    const hours = workHours(person);
    return (
      <div className="min-w-0">
        <p className="text-sm text-slate-800">{staffRoleText(person)}</p>
        {hours && <p className="mt-0.5 text-xs tabular-nums text-slate-500">Mesai {hours}</p>}
      </div>
    );
  };

  const columns: ListTableColumn<Staff>[] = [
    {
      key: "personel",
      header: "Personel",
      render: (person) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={person.fullName} src={person.profile?.photoUrl} size="md" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{person.fullName}</p>
            <div className="mt-0.5 flex flex-wrap gap-1.5 empty:hidden"><StatusBadges person={person} /></div>
          </div>
        </div>
      ),
    },
    { key: "rol", header: "Rol", render: roleCell },
    // Eylem sütunu yalnız pasif personel listelenebiliyorken (yeniden aktif etme) gerekir.
    ...(canManageBranch && filterStatus !== "aktif" ? [{
      key: "islem",
      header: "",
      align: "right" as const,
      render: rowAction,
    }] : []),
  ];

  const emptyText = staff.length === 0 && filterStatus === "aktif" && !search && !filterRole
    ? "Henüz personel eklenmedi"
    : filterStatus === "pasif" && passiveStaff.length === 0
      ? "Pasife alınmış personel yok"
      : "Aramanızla eşleşen personel yok";
  const listEmpty = staff.length === 0 && filterStatus === "aktif" && !search && !filterRole;

  return (
    <section className="space-y-3">
      <PageHeader
        icon="person"
        title="Personel"
        actions={canWriteStaff && tab === "ekip" ? <Button icon={UserPlus} onClick={openNew}>Yeni personel</Button> : undefined}
      />

      {showAccessTab && (
        <Tabs
          ariaLabel="Personel bölümleri"
          items={[{ key: "ekip", label: "Ekip" }, { key: "erisim", label: "Şube erişimi" }]}
          value={tab}
          onChange={setTab}
        />
      )}

      {tab === "erisim" && showAccessTab ? (
        <SubeErisimiTab
          branch={manage?.branch || null}
          staff={manage?.staff || []}
          loading={manageLoading}
          error={manageError}
          onReload={loadAll}
          onOpenStaff={canWriteStaff ? openEdit : undefined}
        />
      ) : (
        <>
          {/* Arama ve süzgeçler listenin kartının üst şeridinde (sadelik K1: ayrı süzgeç kartı yok). */}
          <ListTable
            toolbar={(
              <Toolbar
                filters={(
                  <>
                    <Select aria-label="Rol" value={filterRole} onChange={(event) => setFilterRole(event.target.value)} className="sm:w-52">
                      {ROLE_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </Select>
                    {passiveAvailable && (
                      <ChoiceCards
                        label="Durum"
                        labelHidden
                        variant="pills"
                        value={filterStatus}
                        onChange={setFilterStatus}
                        options={[
                          { value: "aktif", label: "Çalışanlar" },
                          { value: "pasif", label: "Pasif", count: manage ? passiveStaff.length : undefined },
                          { value: "tumu", label: "Tümü" },
                        ]}
                      />
                    )}
                  </>
                )}
                filterCount={filterCount}
              >
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder={canWriteStaff ? "Ad, rol veya TC kimlik no ara" : "Ad veya rol ara"}
                  slashShortcut
                  wrapperClassName="flex-1 min-w-[220px]"
                />
              </Toolbar>
            )}
            columns={columns}
            rows={filtered}
            rowKey={(person) => `${person.passive ? "p" : "a"}-${person.id}`}
            loading={(loading && !staffLoaded) || (filterStatus !== "aktif" && manageLoading && !manage)}
            error={staffLoaded ? null : error}
            staleError={staffLoaded ? error : null}
            onRetry={() => void loadAll()}
            skeletonRows={7}
            emptyText={emptyText}
            emptyDescription={listEmpty && canWriteStaff ? "Ekibinizi ekleyin; her personel kendi TC kimlik numarasıyla giriş yapar." : undefined}
            emptyAction={listEmpty && canWriteStaff ? <Button icon={UserPlus} onClick={openNew}>Yeni personel</Button> : undefined}
            emptyIcon={StaffEmptyIcon}
            emptyIllustrative
            onRowClick={canWriteStaff ? (person) => openEdit(person.id) : undefined}
            isRowClickable={(person) => !person.passive}
            getRowAriaLabel={(person) => `${person.fullName} kaydını aç`}
            rowClassName={(person) => (person.passive || !person.isActive ? "opacity-70" : "")}
            mobileCard={(person) => (
              <div className="flex items-center gap-3">
                <Avatar name={person.fullName} src={person.profile?.photoUrl} size="md" />
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
        </>
      )}

      {canWriteStaff && (
        <StaffFormModal
          open={modal.open}
          staffId={modal.id}
          onClose={closeModal}
          onDone={onModalDone}
          currentUserId={userId}
          viewerSeesRates={viewerSeesRates}
          canAssignManagerRole={canAssignManagerRole}
          canManageBranch={canManageBranch}
        />
      )}
    </section>
  );
}
