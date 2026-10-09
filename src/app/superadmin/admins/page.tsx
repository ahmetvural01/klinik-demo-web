"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, UserCheck, UserX, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { dateTime, shortDate } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet, saSend } from "@/components/superadmin/sa-fetch";

type Admin = {
  id: string;
  fullName: string;
  identityNoMasked: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  isSelf: boolean;
};

const EMPTY = { fullName: "", identityNo: "", email: "", password: "" };

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const values = new Uint32Array(12);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

/**
 * Platform yöneticileri — bu paneli kullanabilen hesaplar. Her satırda sabit
 * "Tam erişim" rozeti (bilgi değeri yoktu) yerine son giriş ve iki adımlı
 * doğrulama durumu; pasife alma satırdan, onaylı. TC kimlik no maskeli.
 */
export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    saGet<Admin[]>("/api/superadmin/admins", "Platform yöneticileri yüklenemedi.", controller.signal)
      .then((data) => setAdmins(Array.isArray(data) ? data : []))
      .catch((error) => {
        if (!isAbort(error)) setLoadError(errorMessage(error, "Platform yöneticileri yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const toggleActive = async (admin: Admin) => {
    const deactivating = admin.isActive;
    const ok = await confirmDialog(deactivating ? {
      title: "Yönetici pasife alınsın mı?",
      message: `${admin.fullName} artık platform yönetimine giremez; açık oturumu da kapanır.${admin.isSelf ? " Bu sizin hesabınız: hemen çıkış yapmış olursunuz." : ""}`,
      confirmText: "Pasife al",
      cancelText: "Vazgeç",
      danger: true,
    } : {
      title: "Yönetici yeniden aktif edilsin mi?",
      message: `${admin.fullName} platform yönetimine yeniden girebilir.`,
      confirmText: "Aktif et",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    setBusyId(admin.id);
    try {
      await saSend(`/api/superadmin/admins/${admin.id}`, "PATCH", { isActive: !admin.isActive }, "Yönetici güncellenemedi.");
      showToastSafe({ type: "success", message: deactivating ? `${admin.fullName} pasife alındı.` : `${admin.fullName} yeniden aktif.`, icon: "person" });
      reload();
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Yönetici güncellenemedi.") });
    } finally {
      setBusyId(null);
    }
  };

  const create = async () => {
    if (!form.fullName.trim()) return setFormError("Ad soyad yazın.");
    if (!/^\d{11}$/.test(form.identityNo.trim())) return setFormError("TC kimlik numarası 11 rakam olmalı.");
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) return setFormError("Geçerli bir e-posta yazın.");
    if (form.password.length < 8 || form.password.length > 72) return setFormError("Şifre 8-72 karakter olmalı.");
    setSaving(true);
    setFormError(null);
    try {
      await saSend("/api/superadmin/admins", "POST", {
        fullName: form.fullName.trim(),
        identityNo: form.identityNo.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
      }, "Yönetici eklenemedi.");
      showToastSafe({ type: "success", message: `${form.fullName.trim()} platform yöneticisi olarak eklendi. Giriş bilgisini kendisine iletin.`, icon: "person" });
      setForm(EMPTY);
      setOpen(false);
      reload();
    } catch (error) {
      setFormError(errorMessage(error, "Yönetici eklenemedi."));
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (admin: Admin) => <Badge tone={admin.isActive ? "success" : "neutral"}>{admin.isActive ? "Aktif" : "Pasif"}</Badge>;
  const twoFactor = (admin: Admin) => (admin.twoFactorEnabled ? <Badge tone="success">Açık</Badge> : <Badge tone="warning">Kapalı</Badge>);
  const action = (admin: Admin) => (
    <IconButton
      icon={admin.isActive ? UserX : UserCheck}
      title={admin.isActive ? "Pasife al" : "Yeniden aktif et"}
      tone={admin.isActive ? "danger" : "primary"}
      size="sm"
      disabled={busyId === admin.id}
      onClick={() => void toggleActive(admin)}
    />
  );

  const columns: ListTableColumn<Admin>[] = [
    {
      key: "name",
      header: "Ad soyad",
      render: (admin) => (
        <div>
          <p className="font-semibold text-slate-900">{admin.fullName}{admin.isSelf && <span className="ml-1.5 text-xs font-normal text-slate-500">(siz)</span>}</p>
          <p className="text-xs text-slate-500">{[admin.identityNoMasked, admin.email].filter(Boolean).join(" · ")}</p>
        </div>
      ),
    },
    { key: "lastLogin", header: "Son giriş", render: (admin) => dateTime(admin.lastLoginAt) || <EmptyValue /> },
    { key: "twoFactor", header: "İki adımlı doğrulama", render: twoFactor },
    { key: "status", header: "Durum", render: statusBadge },
    { key: "createdAt", header: "Eklenme", render: (admin) => shortDate(admin.createdAt) || <EmptyValue /> },
    { key: "actions", header: "", align: "right", render: action },
  ];

  return (
    <section className="space-y-4">
      <PageHeader
        icon="person"
        title="Platform Yöneticileri"
        description="Bu paneli kullanabilen hesaplar. Her yönetici tüm bölümlere erişir."
        actions={<Button icon={Plus} onClick={() => { setFormError(null); setOpen(true); }}>Yeni yönetici</Button>}
      />

      <ListTable<Admin>
        columns={columns}
        rows={admins}
        rowKey={(admin) => admin.id}
        loading={loading}
        error={loadError}
        onRetry={reload}
        rowClassName={(admin) => (admin.isActive ? "" : "opacity-60")}
        emptyText="Platform yöneticisi yok"
        mobileCard={(admin) => (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="font-semibold text-slate-900">{admin.fullName}{admin.isSelf ? " (siz)" : ""}</p>
              <p className="text-xs text-slate-500">Son giriş: {dateTime(admin.lastLoginAt) || "—"}</p>
              <div className="flex flex-wrap items-center gap-1.5">{statusBadge(admin)}<span className="text-xs text-slate-500">İki adımlı:</span>{twoFactor(admin)}</div>
            </div>
            {action(admin)}
          </div>
        )}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Yeni platform yöneticisi"
        description="Bu kişi tüm klinikleri, faturaları ve platform ayarlarını yönetebilir."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button loading={saving} onClick={() => void create()}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormErrorBanner message={formError} />
          <FormField label="Ad soyad" htmlFor="admin-name" required>
            <Input id="admin-name" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} />
          </FormField>
          <FormField label="TC kimlik no" htmlFor="admin-tc" required hint="Girişte kullanılır">
            <Input id="admin-tc" inputMode="numeric" maxLength={11} value={form.identityNo} onChange={(event) => setForm((current) => ({ ...current, identityNo: event.target.value.replace(/\D/g, "") }))} />
          </FormField>
          <FormField label="E-posta" htmlFor="admin-email">
            <Input id="admin-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          </FormField>
          <FormField label="Geçici şifre" htmlFor="admin-password" required hint="En az 8 karakter. Kişiye güvenli yoldan iletin.">
            <div className="flex gap-1.5">
              <Input id="admin-password" value={form.password} autoComplete="new-password" onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
              <IconButton icon={Wand2} title="Şifre üret" onClick={() => setForm((current) => ({ ...current, password: generatePassword() }))} />
            </div>
          </FormField>
        </div>
      </Modal>
    </section>
  );
}
