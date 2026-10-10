"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { confirmDialog } from "@/lib/confirm-client";
import { invalidateCachedGet } from "@/lib/client-cache";
import { showToastSafe } from "@/lib/toast-client";
import { roleLabel } from "@/lib/staff-roles";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { FormModal } from "@/components/ui/FormModal";
import { ImageUploadField } from "@/components/ui/ImageUploadField";
import { Input } from "@/components/ui/Input";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { DetailSkeleton } from "@/components/ui/PageSkeleton";
import { Section } from "@/components/ui/Section";
import { SettingsList, SettingsRow } from "@/components/ui/SettingsList";
import { Switch } from "@/components/ui/Switch";
import { TimeRangeInput, timeRangeError } from "@/components/ui/TimeRangeInput";

// Sunucu (api/profile/password) en az 8 karakter ister; ekran da aynı kuralı söyler.
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;
const GHOST_REASON = "Platform yöneticisinin klinik oturumunda hesap ayarları değiştirilemez.";

type ProfileState = {
  fullName: string;
  role: string;
  workStart: string;
  workEnd: string;
  showAsDoctor: boolean;
  photoUrl: string;
};

type WorkState = Pick<ProfileState, "workStart" | "workEnd" | "showAsDoctor">;

// Mesai girilmemişse sunucu (api/profile) da bu saatleri kullanır.
const EMPTY_PROFILE: ProfileState = { fullName: "", role: "", workStart: "08:30", workEnd: "18:00", showAsDoctor: false, photoUrl: "" };
const EMPTY_PASSWORD = { old: "", next: "", confirm: "" };

/**
 * Sunucu hatası: metin ve (varsa) hatanın ait olduğu alan. Şifre ve iki
 * aşamalı doğrulama uçları yanlış şifre/kodda `field` döndürür
 * ("currentPassword", "code", "password"); hata o alanın altında gösterilir.
 */
async function readErrorDetail(response: Response, fallback: string): Promise<{ message: string; field: string | null }> {
  const data = await response.json().catch(() => null);
  const field = data && typeof data.field === "string" && data.field ? (data.field as string) : null;
  if (data && typeof data.message === "string" && data.message) return { message: data.message as string, field };
  if (data && typeof data.error === "string" && data.error) return { message: data.error as string, field };
  return { message: fallback, field };
}

async function readError(response: Response, fallback: string) {
  return (await readErrorDetail(response, fallback)).message;
}

function focusField(id: string) {
  window.requestAnimationFrame(() => document.getElementById(id)?.focus());
}

type PasswordValue = typeof EMPTY_PASSWORD;

function passwordErrorsOf(password: PasswordValue) {
  return {
    old: !password.old ? "Mevcut şifrenizi yazın." : undefined,
    next: password.next.length < PASSWORD_MIN || password.next.length > PASSWORD_MAX ? `Yeni şifre ${PASSWORD_MIN}-${PASSWORD_MAX} karakter olmalı.` : undefined,
    confirm: password.confirm !== password.next ? "İki şifre aynı değil." : undefined,
  };
}

/** Şifre alanları — ilk giriş ekranında sayfada, sonra "Şifreyi değiştir" penceresinde. */
function PasswordFields({ value, onChange, submitted, firstLogin, currentPasswordError }: {
  value: PasswordValue;
  onChange: (next: PasswordValue) => void;
  submitted: boolean;
  firstLogin: boolean;
  /** Sunucunun "mevcut şifre yanlış" yanıtı (field: "currentPassword"). */
  currentPasswordError?: string | null;
}) {
  const errors = passwordErrorsOf(value);
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <FormField label={firstLogin ? "Şu anki şifre (TC kimlik no)" : "Mevcut şifre"} htmlFor="profil-sifre-mevcut" required error={(submitted ? errors.old : undefined) || currentPasswordError || undefined}>
        <Input id="profil-sifre-mevcut" autoFocus type="password" autoComplete="current-password" value={value.old} onChange={(event) => onChange({ ...value, old: event.target.value })} />
      </FormField>
      <FormField
        label="Yeni şifre"
        htmlFor="profil-sifre-yeni"
        required
        hint={`En az ${PASSWORD_MIN} karakter`}
        error={submitted || value.next.length > PASSWORD_MAX ? errors.next : undefined}
      >
        <Input id="profil-sifre-yeni" type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} value={value.next} onChange={(event) => onChange({ ...value, next: event.target.value })} />
      </FormField>
      <FormField
        label="Yeni şifre (tekrar)"
        htmlFor="profil-sifre-tekrar"
        required
        error={submitted || (value.confirm.length >= value.next.length && value.confirm.length > 0) ? errors.confirm : undefined}
      >
        <Input id="profil-sifre-tekrar" type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} value={value.confirm} onChange={(event) => onChange({ ...value, confirm: event.target.value })} />
      </FormField>
    </div>
  );
}

/**
 * Profilim: kimlik (ad, rol, fotoğraf), mesai ve giriş güvenliği. Şifre, iki
 * aşamalı doğrulama ve diğer oturumlar tek "Giriş güvenliği" bölümünde
 * satırdır; formlar pencerede açılır (önceden üç form sayfada sürekli açıktı,
 * aynı anda birden çok birincil düğme görünüyordu). Doktor kendi mesaisini
 * burada da değiştirebilir (api/profile PUT; yönetici Personel'den de
 * değiştirir) — Kaydet yalnız değişiklik varken görünür.
 */
export default function ProfilPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<ProfileState>(EMPTY_PROFILE);
  const [savedWork, setSavedWork] = useState<WorkState>({ workStart: EMPTY_PROFILE.workStart, workEnd: EMPTY_PROFILE.workEnd, showAsDoctor: false });
  const [workSubmitted, setWorkSubmitted] = useState(false);
  const [workSaving, setWorkSaving] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(searchParams.get("forcePasswordChange") === "1");
  const [ghost, setGhost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState(EMPTY_PASSWORD);
  const [passwordSubmitted, setPasswordSubmitted] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  // Alan hataları (sunucu `field` döndürdüğünde ya da alan boşken): genel şerit yerine alanın altında.
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorSaving, setTwoFactorSaving] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [twoFactorCodeError, setTwoFactorCodeError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disablePasswordError, setDisablePasswordError] = useState<string | null>(null);
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
          workStart: data.profile?.workStart || EMPTY_PROFILE.workStart,
          workEnd: data.profile?.workEnd || EMPTY_PROFILE.workEnd,
          showAsDoctor: data.role === "YONETICI" ? !data.profile?.hideAsDoctor : false,
          photoUrl: data.profile?.photoUrl || "",
        };
        setProfile(next);
        setSavedWork({ workStart: next.workStart, workEnd: next.workEnd, showAsDoctor: next.showAsDoctor });
        setTwoFactorEnabled(Boolean(data.twoFactorEnabled));
        setGhost(Boolean(data.ghostSession));
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
  const treatsPatients = isDoctorRole || profile.showAsDoctor;
  const showsWork = isDoctorRole || profile.role === "YONETICI";
  const workDirty = profile.workStart !== savedWork.workStart || profile.workEnd !== savedWork.workEnd || profile.showAsDoctor !== savedWork.showAsDoctor;
  const workRangeError = treatsPatients ? timeRangeError({ start: profile.workStart, end: profile.workEnd }, { required: true }) : null;

  const saveWork = async () => {
    setWorkSubmitted(true);
    setWorkError(null);
    if (workRangeError) return;
    setWorkSaving(true);
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
        // 409: mesai dışında kalan ya da devredilmesi gereken gelecek randevular.
        setWorkError(await readError(response, "Mesai kaydedilemedi."));
        return;
      }
      setSavedWork({ workStart: profile.workStart, workEnd: profile.workEnd, showAsDoctor: profile.showAsDoctor });
      setWorkSubmitted(false);
      invalidateCachedGet("/api/auth/me");
      invalidateCachedGet("/api/staff");
      showToastSafe({ message: "Mesainiz kaydedildi. Randevu ekranı bu saatlere göre çalışır.", type: "success" });
    } catch {
      setWorkError("Kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setWorkSaving(false);
    }
  };

  const discardWork = () => {
    setProfile((current) => ({ ...current, ...savedWork }));
    setWorkSubmitted(false);
    setWorkError(null);
  };

  // Fotoğraf seçilince hemen kaydedilir; hata alanın altında görünür.
  const savePhoto = async (dataUrl: string) => {
    // Kaldırma geri alınamaz bir anlık kayıt: önceki ekrandaki gibi önce sorulur.
    if (!dataUrl && !(await confirmDialog({
      title: "Fotoğraf kaldırılsın mı?",
      message: "Fotoğrafınızın yerine adınızın baş harfleri görünür.",
      confirmText: "Kaldır",
    }))) return;
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoUrl: dataUrl || null }),
    }).catch(() => null);
    if (!response) throw new Error("Fotoğraf kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    if (!response.ok) throw new Error(await readError(response, "Fotoğraf kaydedilemedi."));
    setProfile((current) => ({ ...current, photoUrl: dataUrl }));
    invalidateCachedGet("/api/auth/me");
    invalidateCachedGet("/api/staff");
    showToastSafe({ message: dataUrl ? "Fotoğrafınız güncellendi." : "Fotoğrafınız kaldırıldı.", type: "success" });
  };

  const changePassword = async (event?: FormEvent) => {
    event?.preventDefault();
    setPasswordSubmitted(true);
    setPasswordError(null);
    setCurrentPasswordError(null);
    const errors = passwordErrorsOf(password);
    if (errors.old || errors.next || errors.confirm) return;
    setPasswordSaving(true);
    try {
      const response = await fetch("/api/profile/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: password.old, newPassword: password.next }),
      });
      if (!response.ok) {
        const detail = await readErrorDetail(response, "Şifre değiştirilemedi.");
        if (detail.field === "currentPassword") {
          setCurrentPasswordError(detail.message);
          focusField("profil-sifre-mevcut");
        } else {
          setPasswordError(detail.message);
        }
        return;
      }
      setPassword(EMPTY_PASSWORD);
      setPasswordSubmitted(false);
      setPasswordOpen(false);
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

  const openPassword = () => {
    setPassword(EMPTY_PASSWORD);
    setPasswordSubmitted(false);
    setPasswordError(null);
    setCurrentPasswordError(null);
    setPasswordOpen(true);
  };

  // Mevcut şifre yeniden yazılınca sunucunun "yanlış" uyarısı kalkar.
  const updatePassword = (next: PasswordValue) => {
    if (next.old !== password.old) setCurrentPasswordError(null);
    setPassword(next);
  };

  const startTwoFactorSetup = async () => {
    setTwoFactorSaving(true);
    setTwoFactorError(null);
    try {
      const response = await fetch("/api/profile/2fa/setup", { method: "POST" });
      if (!response.ok) {
        showToastSafe({ message: await readError(response, "Kurulum başlatılamadı."), type: "error" });
        return;
      }
      setTwoFactorCode("");
      setTwoFactorCodeError(null);
      setTwoFactorSetup(await response.json());
    } catch {
      showToastSafe({ message: "Kurulum başlatılamadı. Bağlantınızı kontrol edin.", type: "error" });
    } finally {
      setTwoFactorSaving(false);
    }
  };

  const confirmTwoFactor = async () => {
    setTwoFactorError(null);
    if (twoFactorCode.length < 6) {
      setTwoFactorCodeError("Uygulamadaki 6 haneli kodu yazın.");
      focusField("profil-2fa-kod");
      return;
    }
    setTwoFactorCodeError(null);
    setTwoFactorSaving(true);
    try {
      const response = await fetch("/api/profile/2fa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: twoFactorCode }),
      });
      if (!response.ok) {
        const detail = await readErrorDetail(response, "Kod hatalı.");
        if (detail.field === "code") {
          setTwoFactorCodeError(detail.message);
          focusField("profil-2fa-kod");
        } else {
          setTwoFactorError(detail.message);
        }
        return;
      }
      const data = await response.json().catch(() => ({}));
      setTwoFactorEnabled(true);
      setTwoFactorSetup(null);
      setTwoFactorCode("");
      setBackupCodes(Array.isArray(data.backupCodes) ? data.backupCodes : []);
      showToastSafe({ message: "İki aşamalı doğrulama açıldı.", type: "success" });
    } catch {
      setTwoFactorError("Doğrulama tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setTwoFactorSaving(false);
    }
  };

  const disableTwoFactor = async () => {
    setTwoFactorError(null);
    if (!disablePassword) {
      setDisablePasswordError("Devam etmek için şifrenizi yazın.");
      focusField("profil-2fa-sifre");
      return;
    }
    setDisablePasswordError(null);
    setTwoFactorSaving(true);
    try {
      const response = await fetch("/api/profile/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePassword }),
      });
      if (!response.ok) {
        const detail = await readErrorDetail(response, "Kapatılamadı.");
        if (detail.field === "password") {
          setDisablePasswordError(detail.message);
          focusField("profil-2fa-sifre");
        } else {
          setTwoFactorError(detail.message);
        }
        return;
      }
      setTwoFactorEnabled(false);
      setDisableOpen(false);
      setDisablePassword("");
      showToastSafe({ message: "İki aşamalı doğrulama kapatıldı.", type: "success" });
    } catch {
      setTwoFactorError("Kapatılamadı. Bağlantınızı kontrol edin.");
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

  const header = <PageHeader icon="profile" title="Profilim" description={mustChangePassword ? "Devam etmeden önce kendi şifrenizi belirleyin." : undefined} />;

  if (loading) {
    return (
      <section className="space-y-4">
        {header}
        <DetailSkeleton pairs={4} columns={1} />
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

  // İlk girişte (şifre TC kimlik no iken) yalnız şifre formu gösterilir:
  // kullanıcı başka hiçbir şeyle uğraşmadan tek işi tamamlar.
  if (mustChangePassword) {
    return (
      <section className="space-y-4">
        {header}
        <Callout tone="warning" title={`Hoş geldiniz, ${profile.fullName || "yeni kullanıcı"}.`}>
          Hesabınız TC kimlik numaranızla açıldı. Güvenliğiniz için şimdi yalnız sizin bildiğiniz bir şifre belirleyin.
        </Callout>
        <Section icon={KeyRound} title="Şifrenizi belirleyin" description="Bundan sonra sisteme bu şifreyle gireceksiniz.">
          <form className="space-y-4" noValidate onSubmit={(event) => void changePassword(event)}>
            <PasswordFields value={password} onChange={updatePassword} submitted={passwordSubmitted} firstLogin currentPasswordError={currentPasswordError} />
            <FormErrorBanner message={passwordError} />
            <Button type="submit" icon={KeyRound} loading={passwordSaving} disabled={ghost} title={ghost ? GHOST_REASON : undefined}>Şifremi kaydet ve devam et</Button>
          </form>
        </Section>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {header}

      {ghost && <Callout tone="neutral">{GHOST_REASON}</Callout>}

      <Section title={profile.fullName || "—"} description={`${roleLabel(profile.role)}${profile.role === "YONETICI" && profile.showAsDoctor ? " · hasta da tedavi ediyor" : ""}`}>
        <ImageUploadField
          label="Fotoğraf"
          shape="round"
          value={profile.photoUrl}
          onChange={savePhoto}
          maxDimension={320}
          placeholder={<Avatar name={profile.fullName} size="lg" />}
          disabled={ghost}
        />
      </Section>

      {showsWork && (
        <Section
          icon={Clock}
          title="Mesai"
          description={treatsPatients ? "Randevu ekranı bu saatlerin dışında randevu verdirmez." : undefined}
        >
          <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); void saveWork(); }}>
            {profile.role === "YONETICI" && (
              <Switch
                checked={profile.showAsDoctor}
                onChange={(checked) => setProfile((current) => ({ ...current, showAsDoctor: checked }))}
                label="Hasta da tedavi ediyorum"
                description="Açıkken randevu, hakediş ve hasta ekranlarındaki doktor listesinde görünürsünüz."
                disabled={ghost}
              />
            )}
            {treatsPatients && (
              <TimeRangeInput
                id="profil-mesai"
                label="Mesai saatleri"
                labelHidden
                required
                startLabel="Mesai başlangıcı"
                endLabel="Mesai bitişi"
                disabled={ghost}
                value={{ start: profile.workStart, end: profile.workEnd }}
                onChange={(range) => setProfile((current) => ({ ...current, workStart: range.start, workEnd: range.end }))}
                error={workSubmitted ? workRangeError || undefined : undefined}
              />
            )}
            <FormErrorBanner message={workError} />
            {workDirty && (
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" loading={workSaving} disabled={ghost}>Kaydet</Button>
                <Button size="sm" variant="secondary" disabled={workSaving} onClick={discardWork}>Vazgeç</Button>
              </div>
            )}
          </form>
        </Section>
      )}

      <Section icon={ShieldCheck} title="Giriş güvenliği" padding="none">
        <SettingsList aria-label="Giriş güvenliği">
          <SettingsRow
            icon={KeyRound}
            title="Şifre"
            description="Değişince diğer cihazlardaki oturumlarınız kapanır."
            actions={<Button size="sm" variant="secondary" disabled={ghost} title={ghost ? GHOST_REASON : undefined} onClick={openPassword}>Şifreyi değiştir</Button>}
          />
          <SettingsRow
            icon={ShieldCheck}
            title="İki aşamalı doğrulama"
            description="Girişte telefonunuzdaki doğrulama uygulamasından 6 haneli kod sorulur."
            status={<Badge tone={twoFactorEnabled ? "success" : "neutral"}>{twoFactorEnabled ? "Açık" : "Kapalı"}</Badge>}
            actions={twoFactorEnabled ? (
              <Button size="sm" variant="ghost" disabled={ghost} title={ghost ? GHOST_REASON : undefined} onClick={() => { setDisablePassword(""); setDisablePasswordError(null); setTwoFactorError(null); setDisableOpen(true); }}>Kapat</Button>
            ) : (
              <Button size="sm" variant="secondary" loading={twoFactorSaving && !twoFactorSetup} disabled={ghost} title={ghost ? GHOST_REASON : undefined} onClick={() => void startTwoFactorSetup()}>Aç</Button>
            )}
          />
          <SettingsRow
            icon={LogOut}
            title="Diğer cihazlardaki oturumlar"
            description="Açık unuttuğunuz oturumları kapatır; bu cihaz açık kalır."
            actions={<Button size="sm" variant="secondary" loading={loggingOutOthers} disabled={ghost} title={ghost ? GHOST_REASON : undefined} onClick={() => void logoutOtherDevices()}>Oturumları kapat</Button>}
          />
        </SettingsList>
      </Section>

      <FormModal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Şifreyi değiştir"
        size="lg"
        onSubmit={() => changePassword()}
        submitting={passwordSaving}
        error={passwordError}
        submitLabel="Şifreyi değiştir"
      >
        <PasswordFields value={password} onChange={updatePassword} submitted={passwordSubmitted} firstLogin={false} currentPasswordError={currentPasswordError} />
      </FormModal>

      <FormModal
        open={Boolean(twoFactorSetup)}
        onClose={() => { setTwoFactorSetup(null); setTwoFactorCode(""); setTwoFactorError(null); setTwoFactorCodeError(null); }}
        title="İki aşamalı doğrulamayı aç"
        size="md"
        onSubmit={() => confirmTwoFactor()}
        submitting={twoFactorSaving}
        error={twoFactorError}
        submitLabel="Onayla"
      >
        {twoFactorSetup && (
          <>
            <p className="text-sm text-slate-700"><b>1.</b> Telefonunuzdaki doğrulama uygulamasıyla (Google Authenticator, Authy…) bu kodu okutun.</p>
            <Image src={twoFactorSetup.qrCodeDataUrl} alt="İki aşamalı doğrulama QR kodu" width={160} height={160} unoptimized className="h-40 w-40 rounded-lg border border-slate-200 bg-white p-2" />
            <p className="text-xs text-slate-500">Okutamıyorsanız uygulamaya bu anahtarı yazın: <span className="break-all font-mono font-semibold text-slate-700">{twoFactorSetup.secret}</span></p>
            <FormField label="2. Uygulamada görünen 6 haneli kod" htmlFor="profil-2fa-kod" required error={twoFactorCodeError || undefined}>
              <Input
                id="profil-2fa-kod"
                autoFocus
                value={twoFactorCode}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className="w-40 text-center font-mono tracking-[0.3em]"
                onChange={(event) => {
                  setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setTwoFactorCodeError(null);
                }}
              />
            </FormField>
          </>
        )}
      </FormModal>

      <FormModal
        open={disableOpen}
        onClose={() => { setDisableOpen(false); setDisablePassword(""); setDisablePasswordError(null); setTwoFactorError(null); }}
        title="İki aşamalı doğrulama kapatılsın mı?"
        description="Girişte yalnız şifreniz sorulur; hesabınız daha az korunur."
        size="sm"
        onSubmit={() => disableTwoFactor()}
        submitting={twoFactorSaving}
        error={twoFactorError}
        submitLabel="Kapat"
        submitVariant="danger"
      >
        <FormField label="Şifreniz" htmlFor="profil-2fa-sifre" required error={disablePasswordError || undefined}>
          <Input id="profil-2fa-sifre" autoFocus type="password" autoComplete="current-password" value={disablePassword} onChange={(event) => { setDisablePassword(event.target.value); setDisablePasswordError(null); }} />
        </FormField>
      </FormModal>

      <Modal
        open={Boolean(backupCodes)}
        onClose={() => setBackupCodes(null)}
        title="Yedek kodlar"
        description="Bir daha gösterilmeyecek; bir yere yazın. Telefonunuza ulaşamazsanız bu kodlardan biriyle giriş yapabilirsiniz. Her kod bir kez kullanılır."
        size="md"
        closeOnBackdrop={false}
        footer={<Button onClick={() => setBackupCodes(null)}>Kodları kaydettim</Button>}
      >
        <div className="grid grid-cols-2 gap-2 font-mono text-sm text-slate-900 sm:grid-cols-4">
          {(backupCodes || []).map((code) => <div key={code} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-center">{code}</div>)}
        </div>
      </Modal>
    </section>
  );
}
