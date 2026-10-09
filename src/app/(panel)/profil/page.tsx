"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, KeyRound, LogOut, ShieldCheck, Trash2, Upload } from "lucide-react";
import { confirmDialog } from "@/lib/confirm-client";
import { downscaleImageToDataUrl } from "@/lib/image-upload";
import { invalidateCachedGet } from "@/lib/client-cache";
import { showToastSafe } from "@/lib/toast-client";
import { roleLabel } from "@/lib/staff-roles";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormErrorBanner, FormField, FormSection } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Switch } from "@/components/ui/Switch";
import PanelLoading from "@/components/ui/PanelLoading";

// Sunucu (api/profile/password) en az 8 karakter ister; ekran da aynı kuralı
// söyler. Önceden ekran "en az 6" diyordu, 6-7 karakter önce kabul edilip
// sonra reddediliyordu.
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

type ProfileState = {
  fullName: string;
  role: string;
  workStart: string;
  workEnd: string;
  showAsDoctor: boolean;
  photoUrl: string;
};

type WorkState = Pick<ProfileState, "workStart" | "workEnd" | "showAsDoctor">;

const EMPTY_PROFILE: ProfileState = { fullName: "", role: "", workStart: "08:30", workEnd: "18:00", showAsDoctor: false, photoUrl: "" };

async function readError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  if (data && typeof data.message === "string" && data.message) return data.message as string;
  if (data && typeof data.error === "string" && data.error) return data.error as string;
  return fallback;
}

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("tr-TR") ?? "").join("") || "?";
}

export default function ProfilPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<ProfileState>(EMPTY_PROFILE);
  const [savedWork, setSavedWork] = useState<WorkState>({ workStart: "08:30", workEnd: "18:00", showAsDoctor: false });
  const [mustChangePassword, setMustChangePassword] = useState(searchParams.get("forcePasswordChange") === "1");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [workSaving, setWorkSaving] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);

  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [password, setPassword] = useState({ old: "", next: "", confirm: "" });
  const [passwordSubmitted, setPasswordSubmitted] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorSaving, setTwoFactorSaving] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [loggingOutOthers, setLoggingOutOthers] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    fetch("/api/profile", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) throw new Error(data?.message || "Profil bilgileri yüklenemedi.");
        return data;
      })
      .then((data) => {
        const next: ProfileState = {
          fullName: data.fullName || "",
          role: data.role || "",
          workStart: data.profile?.workStart || "08:30",
          workEnd: data.profile?.workEnd || "18:00",
          showAsDoctor: data.role === "YONETICI" ? !data.profile?.hideAsDoctor : false,
          photoUrl: data.profile?.photoUrl || "",
        };
        setProfile(next);
        setSavedWork({ workStart: next.workStart, workEnd: next.workEnd, showAsDoctor: next.showAsDoctor });
        setTwoFactorEnabled(Boolean(data.twoFactorEnabled));
        if (data.mustChangePassword) setMustChangePassword(true);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : "Profil bilgileri yüklenemedi.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const isDoctorRole = profile.role === "DOKTOR";
  const showsWorkHours = isDoctorRole || profile.role === "YONETICI";
  const treatsPatients = isDoctorRole || profile.showAsDoctor;
  const workDirty = profile.workStart !== savedWork.workStart || profile.workEnd !== savedWork.workEnd || profile.showAsDoctor !== savedWork.showAsDoctor;
  const workHoursInvalid = treatsPatients && profile.workStart && profile.workEnd && profile.workStart >= profile.workEnd;

  const passwordErrors = {
    old: !password.old ? "Mevcut şifrenizi yazın." : undefined,
    next: password.next.length < PASSWORD_MIN || password.next.length > PASSWORD_MAX ? `Yeni şifre ${PASSWORD_MIN}-${PASSWORD_MAX} karakter olmalı.` : undefined,
    confirm: password.confirm !== password.next ? "İki şifre aynı değil." : undefined,
  };
  const passwordFilled = Boolean(password.old || password.next || password.confirm);

  const savePhoto = async (dataUrl: string) => {
    setPhotoSaving(true);
    setPhotoError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl: dataUrl || null }),
      });
      if (!response.ok) {
        setPhotoError(await readError(response, "Fotoğraf kaydedilemedi."));
        return;
      }
      setProfile((current) => ({ ...current, photoUrl: dataUrl }));
      invalidateCachedGet("/api/auth/me");
      invalidateCachedGet("/api/staff");
      showToastSafe({ message: dataUrl ? "Fotoğrafınız güncellendi." : "Fotoğrafınız kaldırıldı.", type: "success" });
    } catch {
      setPhotoError("Fotoğraf kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setPhotoSaving(false);
    }
  };

  const onPhotoSelected = async (file: File) => {
    setPhotoError(null);
    if (file.size > 8 * 1024 * 1024) {
      setPhotoError("Dosya en fazla 8 MB olabilir.");
      return;
    }
    try {
      await savePhoto(await downscaleImageToDataUrl(file));
    } catch {
      setPhotoError("Fotoğraf işlenemedi. JPG, PNG veya WEBP deneyin.");
    }
  };

  const removePhoto = async () => {
    if (!(await confirmDialog({ title: "Fotoğraf kaldırılsın mı?", message: "Fotoğrafınızın yerine adınızın baş harfleri görünür.", confirmText: "Kaldır" }))) return;
    void savePhoto("");
  };

  const saveWork = async () => {
    if (workHoursInvalid) {
      setWorkError("Mesai bitişi başlangıçtan sonra olmalı.");
      return;
    }
    setWorkSaving(true);
    setWorkError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workStart: profile.workStart,
          workEnd: profile.workEnd,
          ...(profile.role === "YONETICI" ? { hideAsDoctor: !profile.showAsDoctor } : {}),
        }),
      });
      if (!response.ok) {
        setWorkError(await readError(response, "Çalışma saatleri kaydedilemedi."));
        return;
      }
      setSavedWork({ workStart: profile.workStart, workEnd: profile.workEnd, showAsDoctor: profile.showAsDoctor });
      invalidateCachedGet("/api/auth/me");
      invalidateCachedGet("/api/staff");
      showToastSafe({ message: "Çalışma saatleriniz kaydedildi. Randevu ekranı bu saatlere göre çalışır.", type: "success" });
    } catch {
      setWorkError("Kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setWorkSaving(false);
    }
  };

  const changePassword = async () => {
    setPasswordSubmitted(true);
    setPasswordError(null);
    if (passwordErrors.old || passwordErrors.next || passwordErrors.confirm) return;
    setPasswordSaving(true);
    try {
      const response = await fetch("/api/profile/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: password.old, newPassword: password.next }),
      });
      if (!response.ok) {
        setPasswordError(await readError(response, "Şifre değiştirilemedi."));
        return;
      }
      setPassword({ old: "", next: "", confirm: "" });
      setPasswordSubmitted(false);
      if (mustChangePassword) {
        // İlk şifre belirlendi: kullanıcıyı bekletmeden işine götür.
        showToastSafe({ message: "Şifreniz kaydedildi. Bundan sonra bu şifreyle giriş yapacaksınız.", type: "success", duration: 5000 });
        setMustChangePassword(false);
        router.replace("/anasayfa");
        return;
      }
      showToastSafe({ message: "Şifreniz değiştirildi. Diğer cihazlardaki oturumlarınız kapatıldı.", type: "success" });
    } catch {
      setPasswordError("Şifre değiştirilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const startTwoFactorSetup = async () => {
    setTwoFactorSaving(true);
    try {
      const response = await fetch("/api/profile/2fa/setup", { method: "POST" });
      if (!response.ok) {
        showToastSafe({ message: await readError(response, "Kurulum başlatılamadı."), type: "error" });
        return;
      }
      setTwoFactorSetup(await response.json());
    } catch {
      showToastSafe({ message: "Kurulum başlatılamadı. Bağlantınızı kontrol edin.", type: "error" });
    } finally {
      setTwoFactorSaving(false);
    }
  };

  const confirmTwoFactor = async () => {
    if (twoFactorCode.length < 6) return;
    setTwoFactorSaving(true);
    try {
      const response = await fetch("/api/profile/2fa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: twoFactorCode }),
      });
      if (!response.ok) {
        showToastSafe({ message: await readError(response, "Kod hatalı."), type: "error" });
        return;
      }
      const data = await response.json().catch(() => ({}));
      setTwoFactorEnabled(true);
      setTwoFactorSetup(null);
      setTwoFactorCode("");
      setBackupCodes(Array.isArray(data.backupCodes) ? data.backupCodes : []);
      showToastSafe({ message: "İki aşamalı doğrulama açıldı.", type: "success" });
    } catch {
      showToastSafe({ message: "Doğrulama tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.", type: "error" });
    } finally {
      setTwoFactorSaving(false);
    }
  };

  const disableTwoFactor = async () => {
    if (!disablePassword) {
      showToastSafe({ message: "Devam etmek için şifrenizi yazın.", type: "error" });
      return;
    }
    if (!(await confirmDialog({
      title: "İki aşamalı doğrulama kapatılsın mı?",
      message: "Girişte yalnız şifreniz sorulur; hesabınız daha az korunur.",
      danger: true,
      confirmText: "Kapat",
    }))) return;
    setTwoFactorSaving(true);
    try {
      const response = await fetch("/api/profile/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePassword }),
      });
      if (!response.ok) {
        showToastSafe({ message: await readError(response, "Kapatılamadı."), type: "error" });
        return;
      }
      setTwoFactorEnabled(false);
      setShowDisableForm(false);
      setDisablePassword("");
      showToastSafe({ message: "İki aşamalı doğrulama kapatıldı.", type: "success" });
    } catch {
      showToastSafe({ message: "Kapatılamadı. Bağlantınızı kontrol edin.", type: "error" });
    } finally {
      setTwoFactorSaving(false);
    }
  };

  const logoutOtherDevices = async () => {
    if (!(await confirmDialog({
      title: "Diğer oturumlar kapatılsın mı?",
      message: "Bu cihaz açık kalır. Başka bir bilgisayarda veya telefonda açık unuttuğunuz oturumlar hemen kapanır.",
      confirmText: "Diğer oturumları kapat",
    }))) return;
    setLoggingOutOthers(true);
    try {
      const response = await fetch("/api/profile/logout-all", { method: "POST" });
      showToastSafe(response.ok
        ? { message: "Diğer cihazlardaki oturumlarınız kapatıldı.", type: "success" }
        : { message: await readError(response, "İşlem tamamlanamadı."), type: "error" });
    } catch {
      showToastSafe({ message: "İşlem tamamlanamadı. Bağlantınızı kontrol edin.", type: "error" });
    } finally {
      setLoggingOutOthers(false);
    }
  };

  const header = (
    <PageHeader
      icon="profile"
      title="Profil"
      description={mustChangePassword ? "Devam etmeden önce kendi şifrenizi belirleyin." : "Fotoğrafınız, şifreniz ve hesap güvenliğiniz."}
    />
  );

  if (loading) {
    return (
      <section className="space-y-4">
        {header}
        <PanelLoading />
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="space-y-4">
        {header}
        <LoadErrorState message={loadError} onRetry={() => setReloadKey((value) => value + 1)} />
      </section>
    );
  }

  const passwordForm = (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void changePassword();
      }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <FormField
          label={mustChangePassword ? "Şu anki şifre (TC kimlik no)" : "Mevcut şifre"}
          htmlFor="profil-sifre-mevcut"
          required
          error={passwordSubmitted ? passwordErrors.old : undefined}
        >
          <Input id="profil-sifre-mevcut" type="password" autoComplete="current-password" value={password.old} onChange={(event) => setPassword((current) => ({ ...current, old: event.target.value }))} />
        </FormField>
        <FormField
          label="Yeni şifre"
          htmlFor="profil-sifre-yeni"
          required
          hint={`En az ${PASSWORD_MIN} karakter`}
          error={passwordSubmitted || password.next.length > PASSWORD_MAX ? passwordErrors.next : undefined}
        >
          <Input id="profil-sifre-yeni" type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} value={password.next} onChange={(event) => setPassword((current) => ({ ...current, next: event.target.value }))} />
        </FormField>
        <FormField
          label="Yeni şifre (tekrar)"
          htmlFor="profil-sifre-tekrar"
          required
          error={passwordSubmitted || (password.confirm.length >= password.next.length && password.confirm.length > 0) ? passwordErrors.confirm : undefined}
        >
          <Input id="profil-sifre-tekrar" type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} value={password.confirm} onChange={(event) => setPassword((current) => ({ ...current, confirm: event.target.value }))} />
        </FormField>
      </div>
      <FormErrorBanner message={passwordError} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={mustChangePassword || passwordFilled ? "primary" : "secondary"} icon={KeyRound} loading={passwordSaving}>
          {mustChangePassword ? "Şifremi kaydet ve devam et" : "Şifreyi değiştir"}
        </Button>
        {!mustChangePassword && <p className="text-xs text-slate-500">Şifre değişince diğer cihazlardaki oturumlarınız kapanır.</p>}
      </div>
    </form>
  );

  // İlk girişte (şifre TC kimlik no iken) yalnız şifre formu gösterilir:
  // kullanıcı başka hiçbir şeyle uğraşmadan tek işi tamamlar.
  if (mustChangePassword) {
    return (
      <section className="space-y-4">
        {header}
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <b>Hoş geldiniz, {profile.fullName || "yeni kullanıcı"}.</b> Hesabınız TC kimlik numaranızla açıldı. Güvenliğiniz için şimdi yalnız sizin bildiğiniz bir şifre belirleyin.
        </div>
        <FormSection icon={KeyRound} title="Şifrenizi belirleyin" description="Bundan sonra sisteme bu şifreyle gireceksiniz.">
          {passwordForm}
        </FormSection>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {header}

      <div className="ui-surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void onPhotoSelected(file);
          }}
        />
        {profile.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.photoUrl} alt={profile.fullName} className="h-16 w-16 shrink-0 rounded-full border border-slate-200 object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-xl font-bold text-primary">
            {initialsOf(profile.fullName)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-slate-900">{profile.fullName || "—"}</p>
          <p className="mt-0.5 text-sm text-slate-500">{roleLabel(profile.role)}{profile.role === "YONETICI" && profile.showAsDoctor ? " · hasta da tedavi ediyor" : ""}</p>
          {photoError && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{photoError}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={Upload} loading={photoSaving} onClick={() => photoInputRef.current?.click()}>
            {profile.photoUrl ? "Fotoğrafı değiştir" : "Fotoğraf ekle"}
          </Button>
          {profile.photoUrl && (
            <Button variant="ghost" size="sm" icon={Trash2} disabled={photoSaving} onClick={() => void removePhoto()}>
              Kaldır
            </Button>
          )}
        </div>
      </div>

      <FormSection icon={KeyRound} title="Şifre" description="Şifrenizi kimseyle paylaşmayın; unutursanız klinik yöneticiniz yenisini verebilir.">
        {passwordForm}
      </FormSection>

      <FormSection
        icon={ShieldCheck}
        title="İki aşamalı doğrulama"
        description="Girişte şifreye ek olarak telefonunuzdaki doğrulama uygulamasından (Google Authenticator, Authy vb.) 6 haneli kod sorulur."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={twoFactorEnabled ? "success" : "neutral"} size="md">{twoFactorEnabled ? "Açık" : "Kapalı"}</Badge>
            {!twoFactorEnabled && !twoFactorSetup && (
              <Button variant="secondary" size="sm" loading={twoFactorSaving} onClick={() => void startTwoFactorSetup()}>Aç</Button>
            )}
            {twoFactorEnabled && !showDisableForm && (
              <Button variant="ghost" size="sm" onClick={() => setShowDisableForm(true)}>Kapat</Button>
            )}
          </div>

          {twoFactorSetup && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-700"><b>1.</b> Telefonunuzdaki doğrulama uygulamasıyla bu kodu okutun.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={twoFactorSetup.qrCodeDataUrl} alt="İki aşamalı doğrulama QR kodu" className="h-40 w-40 rounded-lg border border-slate-200 bg-white p-2" />
              <p className="text-xs text-slate-500">Okutamıyorsanız uygulamaya bu anahtarı yazın: <span className="font-mono font-semibold text-slate-700">{twoFactorSetup.secret}</span></p>
              <p className="text-sm text-slate-700"><b>2.</b> Uygulamada görünen 6 haneli kodu yazın.</p>
              <div className="flex flex-wrap items-end gap-2">
                <FormField label="Doğrulama kodu" htmlFor="profil-2fa-kod">
                  <Input
                    id="profil-2fa-kod"
                    value={twoFactorCode}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    className="w-40 text-center font-mono tracking-[0.3em]"
                    onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                </FormField>
                <Button disabled={twoFactorCode.length < 6} loading={twoFactorSaving} onClick={() => void confirmTwoFactor()}>Onayla</Button>
                <Button variant="secondary" onClick={() => { setTwoFactorSetup(null); setTwoFactorCode(""); }}>Vazgeç</Button>
              </div>
            </div>
          )}

          {backupCodes && (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-bold text-amber-800">Yedek kodlar — bir daha gösterilmeyecek, bir yere yazın</p>
              <p className="text-xs text-amber-700">Telefonunuza ulaşamazsanız bu kodlardan biriyle giriş yapabilirsiniz. Her kod bir kez kullanılır.</p>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm text-amber-900 sm:grid-cols-4">
                {backupCodes.map((code) => <div key={code} className="rounded-md bg-white px-2 py-1.5 text-center">{code}</div>)}
              </div>
              <Button variant="secondary" size="sm" onClick={() => setBackupCodes(null)}>Kodları kaydettim</Button>
            </div>
          )}

          {twoFactorEnabled && showDisableForm && (
            <form
              className="flex flex-wrap items-end gap-2 rounded-lg border border-red-200 bg-red-50 p-4"
              onSubmit={(event) => { event.preventDefault(); void disableTwoFactor(); }}
            >
              <FormField label="Kapatmak için şifrenizi yazın" htmlFor="profil-2fa-sifre">
                <Input id="profil-2fa-sifre" type="password" autoComplete="current-password" value={disablePassword} onChange={(event) => setDisablePassword(event.target.value)} className="sm:w-64" />
              </FormField>
              <Button type="submit" variant="danger" loading={twoFactorSaving}>Kapat</Button>
              <Button variant="secondary" onClick={() => { setShowDisableForm(false); setDisablePassword(""); }}>Vazgeç</Button>
            </form>
          )}
        </div>
      </FormSection>

      <FormSection icon={LogOut} title="Diğer oturumlar" description="Başka bir bilgisayarda veya telefonda oturumunuzu açık unuttuysanız buradan kapatın. Bu cihaz açık kalır.">
        <Button variant="secondary" icon={LogOut} loading={loggingOutOthers} onClick={() => void logoutOtherDevices()}>
          Diğer cihazlardaki oturumları kapat
        </Button>
      </FormSection>

      {showsWorkHours && (
        <FormSection
          icon={Clock}
          title="Çalışma saatleri"
          description="Randevu ekranı size bu saatlerin dışında randevu verdirmez. Klinik yöneticisi Personel ekranından da değiştirebilir."
        >
          <form
            className="space-y-4"
            noValidate
            onSubmit={(event) => { event.preventDefault(); void saveWork(); }}
          >
            {profile.role === "YONETICI" && (
              <Switch
                checked={profile.showAsDoctor}
                onChange={(checked) => setProfile((current) => ({ ...current, showAsDoctor: checked }))}
                label="Hasta da tedavi ediyorum"
                description="Açıkken randevu, hakediş ve hasta ekranlarındaki hekim listesinde görünürsünüz."
              />
            )}
            {treatsPatients && (
              <div className="grid max-w-md grid-cols-2 gap-3">
                <FormField label="Başlangıç" htmlFor="profil-mesai-baslangic" error={workHoursInvalid ? "Bitiş başlangıçtan sonra olmalı." : undefined}>
                  <Input id="profil-mesai-baslangic" type="time" value={profile.workStart} onChange={(event) => setProfile((current) => ({ ...current, workStart: event.target.value }))} />
                </FormField>
                <FormField label="Bitiş" htmlFor="profil-mesai-bitis">
                  <Input id="profil-mesai-bitis" type="time" value={profile.workEnd} onChange={(event) => setProfile((current) => ({ ...current, workEnd: event.target.value }))} />
                </FormField>
              </div>
            )}
            <FormErrorBanner message={workError} />
            {workDirty && (
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={workSaving}>Kaydet</Button>
                <Button variant="secondary" disabled={workSaving} onClick={() => { setProfile((current) => ({ ...current, ...savedWork })); setWorkError(null); }}>Vazgeç</Button>
              </div>
            )}
          </form>
        </FormSection>
      )}
    </section>
  );
}
