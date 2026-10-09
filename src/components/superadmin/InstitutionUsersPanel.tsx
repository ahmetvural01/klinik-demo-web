"use client";

import { useState } from "react";
import { Copy, KeyRound, UserCheck, UserX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { clientMutation } from "@/lib/client-mutation";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { roleLabel } from "@/lib/staff-roles";
import { shortDate } from "./sa-format";

export type InstitutionUser = {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
};

function temporaryPassword(): string {
  // Karışması kolay karakterler (0/O, 1/l/I) çıkarıldı; telefonda okunup
  // yazdırılabilsin diye 10 karakter.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const values = new Uint32Array(10);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

/**
 * Klinik dosyası › Personel. En sık destek isteği "yönetici şifresini unuttu /
 * hesabı kapalı" olduğu için satırda "Geçici şifre ver" ve "Pasife al / Aktif
 * et" var (mevcut süperadmin kullanıcı API'si; lisans limiti API'de denetlenir).
 * Önceden liste salt okunurdu ve rol ham kodla (YONETICI) görünüyordu.
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
  const [issued, setIssued] = useState<{ name: string; password: string } | null>(null);

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
      await clientMutation(
        `/api/superadmin/institutions/${institutionId}/users/${user.id}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !user.isActive }) },
        "Kullanıcı güncellenemedi.",
      );
      showToastSafe({ type: "success", message: user.isActive ? `${user.fullName} pasife alındı.` : `${user.fullName} yeniden aktif.` });
      onChanged();
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Kullanıcı güncellenemedi." });
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
    const password = temporaryPassword();
    setBusyId(user.id);
    try {
      await clientMutation(
        `/api/superadmin/institutions/${institutionId}/users/${user.id}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) },
        "Şifre değiştirilemedi.",
      );
      setIssued({ name: user.fullName, password });
      onChanged();
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Şifre değiştirilemedi." });
    } finally {
      setBusyId(null);
    }
  };

  const actions = (user: InstitutionUser) => (
    <div className="flex items-center justify-end gap-1.5">
      <IconButton icon={KeyRound} title="Geçici şifre ver" size="sm" disabled={busyId === user.id || !user.isActive} onClick={() => void resetPassword(user)} />
      <IconButton
        icon={user.isActive ? UserX : UserCheck}
        title={user.isActive ? "Pasife al" : "Yeniden aktif et"}
        tone={user.isActive ? "danger" : "primary"}
        size="sm"
        disabled={busyId === user.id}
        onClick={() => void toggleActive(user)}
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

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Personel</h2>
          <p className="text-sm text-slate-500">
            Aktif kullanıcı {limitText(limits.activeUsers, limits.maxUsers)} · aktif doktor {limitText(limits.activeDoctors, limits.maxDoctors)}. Yeni personeli klinik kendi Personel ekranından ekler.
          </p>
        </div>
      </div>
      <ListTable
        columns={columns}
        rows={users}
        rowKey={(user) => user.id}
        emptyText="Personel yok"
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

      <Modal
        open={Boolean(issued)}
        onClose={() => setIssued(null)}
        title="Geçici şifre oluşturuldu"
        description={issued ? `${issued.name} bu şifreyle giriş yapabilir.` : undefined}
        size="sm"
        trackFormChanges={false}
        footer={<Button onClick={() => setIssued(null)}>Tamam</Button>}
      >
        {issued && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <code className="select-all text-lg font-bold tracking-wider text-slate-900">{issued.password}</code>
              <Button
                variant="secondary"
                size="sm"
                icon={Copy}
                onClick={() => {
                  void navigator.clipboard.writeText(issued.password)
                    .then(() => showToastSafe({ type: "success", message: "Şifre kopyalandı." }))
                    .catch(() => showToastSafe({ type: "error", message: "Kopyalanamadı; şifreyi elle not edin." }));
                }}
              >
                Kopyala
              </Button>
            </div>
            <p className="text-xs leading-5 text-slate-500">Bu pencere kapanınca şifre bir daha gösterilmez. Kişiye güvenli bir yoldan iletin ve girişten sonra Profil ekranından kendi şifresini belirlemesini isteyin.</p>
          </div>
        )}
      </Modal>
    </section>
  );
}
