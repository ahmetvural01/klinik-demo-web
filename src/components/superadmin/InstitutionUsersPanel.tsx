"use client";

import { useEffect, useState } from "react";
import { KeyRound, Pencil, UserCheck, UserPlus, UserX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Modal } from "@/components/ui/Modal";
import { FormModal } from "@/components/ui/FormModal";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { CopyField } from "@/components/ui/CopyField";
import { Toolbar } from "@/components/ui/Toolbar";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { roleLabel } from "@/lib/staff-roles";
import { isValidTurkishIdentityNumber } from "@/lib/tc-kimlik";
import { shortDate } from "./sa-format";
import { errorMessage, saSend } from "./sa-fetch";
import { generateTemporaryPassword } from "./temp-password";
import { TempPasswordField } from "./TempPasswordField";

export type InstitutionUser = {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
};

type ClinicRole = "YONETICI" | "DOKTOR" | "ASISTAN" | "BANKO" | "MUHASEBE";
const ROLE_OPTIONS: { value: ClinicRole; label: string }[] = (["YONETICI", "DOKTOR", "ASISTAN", "BANKO", "MUHASEBE"] as const).map((value) => ({ value, label: roleLabel(value) }));

type NewUserForm = { fullName: string; identityNo: string; email: string; role: ClinicRole; password: string };
type NewUserErrors = Partial<Record<keyof NewUserForm, string>>;

/**
 * Klinik dosyası › Personel. En sık destek istekleri "yönetici şifresini
 * unuttu / hesabı kapalı / klinikte yönetici kalmadı / rolü yanlış" olduğu
 * için satırda "Geçici şifre ver", "…" menüsünde "Bilgileri düzenle" (ad,
 * e-posta, rol) ve "Pasife al / Aktif et", üstte "Yeni kullanıcı" var
 * (mevcut süperadmin kullanıcı API'si; lisans sınırı ve merkez şube üyeliği
 * API'de uygulanır; önceden API ad/e-posta/rol değiştirmeyi destekliyordu
 * ama ekrandan ulaşılamıyordu). Önceden ekleme yoktu: ekran "yeni personeli klinik
 * ekler" derken Şubeler formu "önce Personel sekmesinden yönetici ekleyin"
 * diyordu (çıkmaz).
 */
export function InstitutionUsersPanel({
  institutionId,
  users,
  limits,
  onChanged,
}: {
  institutionId: string;
  users: InstitutionUser[];
  limits: { activeUsers: number; maxUsers: number | null; activeDoctors: number; maxDoctors: number | null };
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; password: string; created: boolean } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<InstitutionUser | null>(null);

  const toggleActive = async (user: InstitutionUser) => {
    const ok = await confirmDialog({
      title: user.isActive ? "Kullanıcı pasife alınsın mı?" : "Kullanıcı yeniden aktif edilsin mi?",
      message: user.isActive
        ? `${user.fullName} artık sisteme giremez. Kayıtları silinmez.`
        : `${user.fullName} yeniden giriş yapabilir. Kliniğin aktif kullanıcı sınırı (${limits.maxUsers ?? "sınırsız"}) aşılıyorsa işlem yapılmaz.`,
      confirmText: user.isActive ? "Pasife al" : "Aktif et",
      cancelText: "Vazgeç",
      danger: user.isActive,
    });
    if (!ok) return;
    setBusyId(user.id);
    try {
      await saSend(`/api/superadmin/institutions/${institutionId}/users/${user.id}`, "PUT", { isActive: !user.isActive }, "Kullanıcı güncellenemedi.");
      showToastSafe({ type: "success", message: user.isActive ? `${user.fullName} pasife alındı.` : `${user.fullName} yeniden aktif.` });
      onChanged();
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Kullanıcı güncellenemedi.") });
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (user: InstitutionUser) => {
    const ok = await confirmDialog({
      title: "Geçici şifre verilsin mi?",
      message: `${user.fullName} için yeni bir geçici şifre oluşturulacak. Eski şifre ve açık oturumları hemen geçersiz olur. Yeni şifreyi yalnız bir kez göreceksiniz.`,
      confirmText: "Şifre oluştur",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (!ok) return;
    const password = generateTemporaryPassword();
    setBusyId(user.id);
    try {
      await saSend(`/api/superadmin/institutions/${institutionId}/users/${user.id}`, "PUT", { password }, "Şifre değiştirilemedi.");
      setIssued({ name: user.fullName, password, created: false });
      onChanged();
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Şifre değiştirilemedi.") });
    } finally {
      setBusyId(null);
    }
  };

  const actions = (user: InstitutionUser) => (
    <div className="flex items-center justify-end gap-1.5">
      <IconButton icon={KeyRound} title="Geçici şifre ver" size="sm" disabled={busyId === user.id || !user.isActive} onClick={() => void resetPassword(user)} />
      <ActionMenu
        label={`${user.fullName} için diğer işlemler`}
        items={[
          { key: "edit", label: "Bilgileri düzenle", description: "Ad, e-posta, rol", icon: Pencil, disabled: busyId === user.id, onSelect: () => setEditing(user) },
          user.isActive
            ? { key: "deactivate", label: "Pasife al", icon: UserX, danger: true, separatorBefore: true, disabled: busyId === user.id, onSelect: () => void toggleActive(user) }
            : { key: "activate", label: "Yeniden aktif et", icon: UserCheck, separatorBefore: true, disabled: busyId === user.id, onSelect: () => void toggleActive(user) },
        ]}
      />
    </div>
  );

  const statusBadge = (user: InstitutionUser) => <Badge tone={user.isActive ? "success" : "neutral"}>{user.isActive ? "Aktif" : "Pasif"}</Badge>;

  const columns: ListTableColumn<InstitutionUser>[] = [
    { key: "fullName", header: "Ad soyad", render: (user) => <span className="font-semibold text-slate-900">{user.fullName}</span> },
    { key: "role", header: "Rol", render: (user) => roleLabel(user.role) },
    { key: "email", header: "E-posta", render: (user) => user.email || <EmptyValue /> },
    { key: "isActive", header: "Durum", render: statusBadge },
    { key: "createdAt", header: "Eklenme", render: (user) => shortDate(user.createdAt) || <EmptyValue /> },
    { key: "actions", header: "", align: "right", render: actions },
  ];

  const limitText = (active: number, max: number | null) => `${active} / ${max ?? "sınırsız"}`;
  const userLimitFull = limits.maxUsers != null && limits.activeUsers >= limits.maxUsers;

  return (
    <>
      <ListTable
        header={(
          <Toolbar
            actions={(
              <Button
                size="sm"
                variant="secondary"
                icon={UserPlus}
                disabled={userLimitFull}
                title={userLimitFull ? "Aktif kullanıcı sınırı dolu; önce sınırı artırın (Düzenle) ya da bir kullanıcıyı pasife alın." : undefined}
                onClick={() => setCreateOpen(true)}
              >
                Yeni kullanıcı
              </Button>
            )}
          >
            <p className="text-sm text-slate-600">
              Aktif kullanıcı <span className="font-semibold tabular-nums text-slate-900">{limitText(limits.activeUsers, limits.maxUsers)}</span>
              {" · "}aktif doktor <span className="font-semibold tabular-nums text-slate-900">{limitText(limits.activeDoctors, limits.maxDoctors)}</span>
            </p>
          </Toolbar>
        )}
        columns={columns}
        rows={users}
        rowKey={(user) => user.id}
        emptyText="Personel yok"
        emptyDescription="Klinik yöneticisini “Yeni kullanıcı” ile açın."
        rowClassName={(user) => (user.isActive ? "" : "opacity-60")}
        mobileCard={(user) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{user.fullName}</p>
              <p className="text-xs text-slate-500">{roleLabel(user.role)}{user.email ? ` · ${user.email}` : ""}</p>
              <div className="mt-1.5">{statusBadge(user)}</div>
            </div>
            {actions(user)}
          </div>
        )}
      />

      <EditUserModal
        institutionId={institutionId}
        user={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />

      <NewUserModal
        open={createOpen}
        institutionId={institutionId}
        onClose={() => setCreateOpen(false)}
        onCreated={(name, password) => {
          setCreateOpen(false);
          setIssued({ name, password, created: true });
          onChanged();
        }}
      />

      <Modal
        open={Boolean(issued)}
        onClose={() => setIssued(null)}
        title={issued?.created ? "Kullanıcı eklendi" : "Geçici şifre oluşturuldu"}
        description={issued ? `${issued.name} bu şifreyle giriş yapabilir.` : undefined}
        size="sm"
        trackFormChanges={false}
        footer={<Button onClick={() => setIssued(null)}>Tamam</Button>}
      >
        {issued && (
          <CopyField
            label="Geçici şifre"
            value={issued.password}
            hint="Bu pencere kapanınca şifre bir daha gösterilmez. Kişiye güvenli bir yoldan iletin ve girişten sonra Profilim ekranından kendi şifresini belirlemesini isteyin."
          />
        )}
      </Modal>
    </>
  );
}

function NewUserModal({ open, institutionId, onClose, onCreated }: { open: boolean; institutionId: string; onClose: () => void; onCreated: (name: string, password: string) => void }) {
  const [form, setForm] = useState<NewUserForm>({ fullName: "", identityNo: "", email: "", role: "YONETICI", password: "" });
  const [errors, setErrors] = useState<NewUserErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Geçici şifre pencere açılınca önerilir (render sırasında rastgele değer üretilmez).
  useEffect(() => {
    if (open) setForm((current) => (current.password ? current : { ...current, password: generateTemporaryPassword() }));
  }, [open]);

  const set = <K extends keyof NewUserForm>(key: K, value: NewUserForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const close = () => {
    setErrors({});
    setError(null);
    onClose();
  };

  const save = async () => {
    const next: NewUserErrors = {};
    if (!form.fullName.trim()) next.fullName = "Ad soyad yazın.";
    if (!isValidTurkishIdentityNumber(form.identityNo)) next.identityNo = "Geçerli bir TC kimlik numarası yazın (11 rakam).";
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = "Geçerli bir e-posta yazın.";
    if (form.password.length < 8 || form.password.length > 72) next.password = "Şifre 8-72 karakter olmalı.";
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    setError(null);
    try {
      await saSend(`/api/superadmin/institutions/${institutionId}/users`, "POST", {
        fullName: form.fullName.trim(),
        identityNo: form.identityNo,
        email: form.email.trim() || undefined,
        role: form.role,
        password: form.password,
      }, "Kullanıcı eklenemedi.");
      const created = { name: form.fullName.trim(), password: form.password };
      setForm({ fullName: "", identityNo: "", email: "", role: "YONETICI", password: "" });
      onCreated(created.name, created.password);
    } catch (failure) {
      setError(errorMessage(failure, "Kullanıcı eklenemedi."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      open={open}
      onClose={close}
      title="Yeni kullanıcı"
      description="Kullanıcı kliniğin merkez şubesine eklenir; aktif kullanıcı ve doktor sınırı uygulanır."
      size="md"
      onSubmit={() => save()}
      submitting={saving}
      error={error}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Ad soyad" htmlFor="new-user-name" required error={errors.fullName}>
          <Input id="new-user-name" autoFocus value={form.fullName} onChange={(event) => set("fullName", event.target.value)} />
        </FormField>
        <FormField label="TC kimlik no" htmlFor="new-user-tc" required error={errors.identityNo} hint="Girişte kullanılır">
          <Input id="new-user-tc" inputMode="numeric" maxLength={11} value={form.identityNo} onChange={(event) => set("identityNo", event.target.value.replace(/\D/g, ""))} />
        </FormField>
      </div>
      <ChoiceCards<ClinicRole> label="Rol" required variant="pills" value={form.role} onChange={(value) => set("role", value)} options={ROLE_OPTIONS} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="E-posta" htmlFor="new-user-email" error={errors.email}>
          <Input id="new-user-email" type="email" value={form.email} onChange={(event) => set("email", event.target.value)} />
        </FormField>
        <TempPasswordField id="new-user-password" value={form.password} onChange={(value) => set("password", value)} error={errors.password} />
      </div>
    </FormModal>
  );
}

function EditUserModal({ institutionId, user, onClose, onSaved }: { institutionId: string; user: InstitutionUser | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<{ fullName: string; email: string; role: ClinicRole }>({ fullName: "", email: "", role: "DOKTOR" });
  const [errors, setErrors] = useState<{ fullName?: string; email?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({ fullName: user.fullName, email: user.email ?? "", role: (ROLE_OPTIONS.some((option) => option.value === user.role) ? user.role : "DOKTOR") as ClinicRole });
    setErrors({});
    setError(null);
  }, [user]);

  const save = async () => {
    if (!user) return;
    const next: { fullName?: string; email?: string } = {};
    if (!form.fullName.trim()) next.fullName = "Ad soyad yazın.";
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = "Geçerli bir e-posta yazın.";
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    setError(null);
    try {
      await saSend(`/api/superadmin/institutions/${institutionId}/users/${user.id}`, "PUT", {
        fullName: form.fullName.trim(),
        email: form.email.trim() || null,
        role: form.role,
      }, "Kullanıcı güncellenemedi.");
      showToastSafe({ type: "success", message: form.role !== user.role ? `${form.fullName.trim()} güncellendi; yeni rol bir sonraki girişte geçerli (açık oturumu kapatıldı).` : `${form.fullName.trim()} güncellendi.` });
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure, "Kullanıcı güncellenemedi."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      open={Boolean(user)}
      onClose={onClose}
      title="Kullanıcı bilgilerini düzenle"
      description={user ? `${user.fullName} · ${roleLabel(user.role)}` : undefined}
      size="md"
      onSubmit={() => save()}
      submitting={saving}
      error={error}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Ad soyad" htmlFor="edit-user-name" required error={errors.fullName}>
          <Input id="edit-user-name" autoFocus value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} />
        </FormField>
        <FormField label="E-posta" htmlFor="edit-user-email" error={errors.email}>
          <Input id="edit-user-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
        </FormField>
      </div>
      <ChoiceCards<ClinicRole>
        label="Rol"
        required
        variant="pills"
        value={form.role}
        onChange={(role) => setForm((current) => ({ ...current, role }))}
        options={ROLE_OPTIONS}
        hint={user && form.role !== user.role ? "Rol değişince kişinin açık oturumu kapanır; yeniden giriş yapar. Doktor sınırı uygulanır." : undefined}
      />
    </FormModal>
  );
}
