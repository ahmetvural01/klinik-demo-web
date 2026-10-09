"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Crown, MapPin, Pencil, Plus, Power } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { clientMutation } from "@/lib/client-mutation";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { roleLabel } from "@/lib/staff-roles";

type Manager = { id: string; fullName: string; role: string };
type Branch = {
  id: string; name: string; code: string | null; phone: string | null; email: string | null;
  address: string | null; district: string | null; city: string | null; colorCode: string;
  isHeadquarters: boolean; isActive: boolean;
  memberships: { userId: string; user: { fullName: string } }[];
  _count: { memberships: number; appointments: number; clinicUnits: number };
};

const EMPTY = { name: "", code: "", phone: "", email: "", address: "", district: "", city: "", colorCode: "#0f766e", managerIds: [] as string[] };
const COLORS: { value: string; label: string }[] = [
  { value: "#0f766e", label: "Yeşil" },
  { value: "#2563eb", label: "Mavi" },
  { value: "#7c3aed", label: "Mor" },
  { value: "#db2777", label: "Pembe" },
  { value: "#d97706", label: "Turuncu" },
  { value: "#dc2626", label: "Kırmızı" },
];

/**
 * Kliniğin şubeleri ve şube yöneticileri (klinik dosyası › Şubeler).
 * Ortak ListTable (telefonda kart görünümü), Modal (Vazgeç / Kaydet) ve
 * onaylı "Pasife al" kullanır. Önceden 10 px yazılı elle yazılmış tablo,
 * onaysız ve sonuç bildirimsiz pasife alma vardı.
 */
export function BranchesPanel({ institutionId, onChanged }: { institutionId: string; onChanged?: () => void }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [managerQuery, setManagerQuery] = useState("");
  const snapshot = useRef(JSON.stringify(EMPTY));

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/superadmin/institutions/${institutionId}/branches`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.branches)) throw new Error(data?.message || "Şubeler yüklenemedi.");
      setBranches(data.branches);
      setManagers(Array.isArray(data.managers) ? data.managers : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Şubeler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [institutionId]);

  useEffect(() => { void load(); }, [load]);

  const showCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormError(null);
    setManagerQuery("");
    snapshot.current = JSON.stringify(EMPTY);
    setOpen(true);
  };

  const showEdit = (branch: Branch) => {
    const next = {
      name: branch.name, code: branch.code || "", phone: branch.phone || "", email: branch.email || "",
      address: branch.address || "", district: branch.district || "", city: branch.city || "",
      colorCode: branch.colorCode, managerIds: branch.memberships.map((item) => item.userId),
    };
    setEditing(branch);
    setForm(next);
    setFormError(null);
    setManagerQuery("");
    snapshot.current = JSON.stringify(next);
    setOpen(true);
  };

  const save = async () => {
    if (form.name.trim().length < 2) {
      setFormError("Şube adı en az 2 karakter olmalı.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await clientMutation(
        `/api/superadmin/institutions/${institutionId}/branches`,
        { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? { id: editing.id, ...form } : form) },
        "Şube kaydedilemedi.",
      );
      showToastSafe({ type: "success", message: editing ? `${form.name} güncellendi.` : `${form.name} şubesi açıldı.`, icon: "institutions" });
      setOpen(false);
      await load();
      onChanged?.();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Şube kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (branch: Branch) => {
    if (branch.isActive) {
      const ok = await confirmDialog({
        title: "Şube pasife alınsın mı?",
        message: `"${branch.name}" şubesinde yeni randevu ve kayıt açılamaz; şubeye bağlı personel bu şubeyi seçemez. Mevcut kayıtlar silinmez, istediğiniz zaman yeniden aktif edebilirsiniz.`,
        confirmText: "Pasife al",
        cancelText: "Vazgeç",
        danger: true,
      });
      if (!ok) return;
    }
    setTogglingId(branch.id);
    try {
      await clientMutation(
        `/api/superadmin/institutions/${institutionId}/branches`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: branch.id, isActive: !branch.isActive }) },
        "Şube durumu değiştirilemedi.",
      );
      showToastSafe({ type: "success", message: branch.isActive ? `${branch.name} pasife alındı.` : `${branch.name} yeniden aktif.`, icon: "institutions" });
      await load();
      onChanged?.();
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Şube durumu değiştirilemedi." });
    } finally {
      setTogglingId(null);
    }
  };

  const visibleManagers = useMemo(() => {
    const q = managerQuery.trim().toLocaleLowerCase("tr-TR");
    return managers.filter((manager) => !q || manager.fullName.toLocaleLowerCase("tr-TR").includes(q));
  }, [managers, managerQuery]);

  const location = (branch: Branch) => [branch.district, branch.city].filter(Boolean).join(", ");

  const rowActions = (branch: Branch) => (
    <div className="flex items-center justify-end gap-1.5">
      <IconButton icon={Pencil} title="Düzenle" size="sm" onClick={() => showEdit(branch)} />
      {!branch.isHeadquarters && (
        <IconButton
          icon={Power}
          title={branch.isActive ? "Pasife al" : "Yeniden aktif et"}
          tone={branch.isActive ? "danger" : "primary"}
          size="sm"
          disabled={togglingId === branch.id}
          onClick={() => void toggleActive(branch)}
        />
      )}
    </div>
  );

  const nameCell = (branch: Branch) => (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ color: branch.colorCode, backgroundColor: `${branch.colorCode}1a` }}>
        <MapPin className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-semibold text-slate-900">
          <span className="truncate">{branch.name}</span>
          {branch.isHeadquarters && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Merkez şube" />}
        </p>
        <p className="text-xs text-slate-500">{location(branch) || (branch.isHeadquarters ? "Merkez şube" : "Konum yazılmamış")}</p>
      </div>
    </div>
  );

  const managersCell = (branch: Branch) => branch.memberships.length
    ? <span className="text-sm text-slate-700">{branch.memberships.map((item) => item.user.fullName).join(", ")}</span>
    : <span className="text-xs font-semibold text-amber-700">Yönetici atanmamış</span>;

  const columns: ListTableColumn<Branch>[] = [
    { key: "name", header: "Şube", render: nameCell },
    { key: "managers", header: "Şube yöneticileri", render: managersCell },
    { key: "usage", header: "Kullanım", render: (branch) => <span className="text-sm text-slate-600">{branch._count.memberships} personel · {branch._count.appointments} randevu</span> },
    { key: "status", header: "Durum", render: (branch) => <Badge tone={branch.isActive ? "success" : "neutral"}>{branch.isActive ? "Aktif" : "Pasif"}</Badge> },
    { key: "actions", header: "", align: "right", render: rowActions },
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Şubeler</h2>
          <p className="text-sm text-slate-500">Kliniğin şubeleri ve her şubenin yöneticileri.</p>
        </div>
        <Button icon={Plus} onClick={showCreate}>Yeni şube</Button>
      </div>

      <ListTable
        columns={columns}
        rows={branches}
        rowKey={(branch) => branch.id}
        loading={loading}
        error={loadError}
        onRetry={() => void load()}
        emptyText="Henüz şube yok"
        rowClassName={(branch) => (branch.isActive ? "" : "opacity-60")}
        mobileCard={(branch) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              {nameCell(branch)}
              <Badge tone={branch.isActive ? "success" : "neutral"}>{branch.isActive ? "Aktif" : "Pasif"}</Badge>
            </div>
            <p className="text-xs text-slate-600">Yönetici: {branch.memberships.length ? branch.memberships.map((item) => item.user.fullName).join(", ") : <span className="font-semibold text-amber-700">atanmamış</span>}</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">{branch._count.memberships} personel · {branch._count.appointments} randevu</span>
              {rowActions(branch)}
            </div>
          </div>
        )}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        isDirty={open && JSON.stringify(form) !== snapshot.current}
        title={editing ? "Şubeyi düzenle" : "Yeni şube"}
        description="Şubenin adresini ve bu şubeyi yönetecek kişileri seçin."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button loading={saving} onClick={() => void save()}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormErrorBanner message={formError} />
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Şube adı" htmlFor="branch-name" required>
              <Input id="branch-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </FormField>
            <FormField label="Kısa kod" htmlFor="branch-code" hint="Ör. KDK (listelerde kısaltma)">
              <Input id="branch-code" className="uppercase" maxLength={12} value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} />
            </FormField>
            <FormField label="Telefon" htmlFor="branch-phone">
              <Input id="branch-phone" type="tel" inputMode="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
            </FormField>
            <FormField label="E-posta" htmlFor="branch-email">
              <Input id="branch-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            </FormField>
            <FormField label="İl" htmlFor="branch-city">
              <Input id="branch-city" value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} />
            </FormField>
            <FormField label="İlçe" htmlFor="branch-district">
              <Input id="branch-district" value={form.district} onChange={(event) => setForm((current) => ({ ...current, district: event.target.value }))} />
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Adres" htmlFor="branch-address">
                <Input id="branch-address" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
              </FormField>
            </div>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-xs font-bold text-slate-800">Şube rengi (takvimde ayırt etmek için)</legend>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  type="button"
                  key={color.value}
                  aria-label={color.label}
                  aria-pressed={form.colorCode === color.value}
                  onClick={() => setForm((current) => ({ ...current, colorCode: color.value }))}
                  className={`h-8 w-8 rounded-md border-2 ${form.colorCode === color.value ? "border-slate-900 ring-2 ring-slate-300 ring-offset-2" : "border-white"}`}
                  style={{ backgroundColor: color.value }}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="border-t border-slate-100 pt-4">
            <legend className="sr-only">Şube yöneticileri</legend>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-slate-800">Şube yöneticileri</p>
                <p className="text-xs text-slate-500">Seçilen kişiler bu şubenin personel erişimini yönetir.</p>
              </div>
              {managers.length > 6 && (
                <SearchInput value={managerQuery} onChange={setManagerQuery} placeholder="Yönetici ara" size="sm" wrapperClassName="w-full sm:w-56" />
              )}
            </div>
            {managers.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">Klinikte aktif yönetici yok. Önce Personel sekmesinden yönetici ekleyin.</p>
            ) : (
              <div className="mt-2 grid max-h-52 gap-2 overflow-y-auto md:grid-cols-2">
                {visibleManagers.map((manager) => {
                  const selected = form.managerIds.includes(manager.id);
                  return (
                    <button
                      key={manager.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setForm((current) => ({ ...current, managerIds: selected ? current.managerIds.filter((id) => id !== manager.id) : [...current.managerIds, manager.id] }))}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-left ${selected ? "border-primary/30 bg-primary/5" : "border-slate-200 hover:bg-slate-50"}`}
                    >
                      <span>
                        <span className="block text-sm font-semibold text-slate-800">{manager.fullName}</span>
                        <span className="text-xs text-slate-500">{roleLabel(manager.role) || <EmptyValue />}</span>
                      </span>
                      <span className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? "border-primary bg-primary text-white" : "border-slate-300 text-transparent"}`}>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
        </div>
      </Modal>
    </section>
  );
}
