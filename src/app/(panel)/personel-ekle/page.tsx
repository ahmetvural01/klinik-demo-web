"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, IdCard, Percent, Power, Upload, UserCog, X } from "lucide-react";
import { confirmDialog } from "@/lib/confirm-client";
import { downscaleImageToDataUrl } from "@/lib/image-upload";
import { cachedGet, invalidateCachedGet } from "@/lib/client-cache";
import { showToastSafe } from "@/lib/toast-client";
import { roleLabel } from "@/lib/staff-roles";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { Button } from "@/components/ui/Button";
import { FormErrorBanner, FormField, FormSection } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";

// Hakediş hesabı oran girilmemiş hekimde bu değerleri kullanır (bkz.
// /api/hakedis); formda da aynı değerler önerilir.
const DEFAULT_RATES = { kkYuzde: "3", genelYuzde: "15", maasYuzde: "40" } as const;

const RATE_FIELDS = [
  { key: "kkYuzde", label: "Kart komisyonu %", hint: "Kartla alınan tahsilattan düşülen banka komisyonu" },
  { key: "genelYuzde", label: "Genel gider payı %", hint: "Hekimin cirosundan düşülen genel gider payı" },
  { key: "maasYuzde", label: "Hekim payı %", hint: "Giderler düşüldükten sonra hekime ödenen pay" },
] as const;

const ROLE_OPTIONS = ["DOKTOR", "ASISTAN", "BANKO", "MUHASEBE", "YONETICI"] as const;

type StaffForm = {
  identityNo: string;
  fullName: string;
  role: string;
  password: string;
  showAsDoctor: boolean;
  isActive: boolean;
  workStart: string;
  workEnd: string;
  photoUrl: string;
  kkYuzde: string;
  genelYuzde: string;
  maasYuzde: string;
};

const EMPTY_FORM: StaffForm = {
  identityNo: "",
  fullName: "",
  role: "ASISTAN",
  password: "",
  showAsDoctor: false,
  isActive: true,
  workStart: "08:30",
  workEnd: "18:00",
  photoUrl: "",
  ...DEFAULT_RATES,
};

const isEffectiveDoctorRole = (role: string, showAsDoctor: boolean) => role === "DOKTOR" || (role === "YONETICI" && showAsDoctor);

function rateError(value: string) {
  const number = Number(value);
  return value.trim() === "" || !Number.isFinite(number) || number < 0 || number > 100 ? "0 ile 100 arasında olmalı." : undefined;
}

async function readMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return (data && typeof data.message === "string" && data.message) || fallback;
}

function PersonelEkleContent() {
  const router = useRouter();
  const search = useSearchParams();
  const { role: currentRole, can } = usePermissions();
  const canManageBranch = can("branches:assign");
  const editId = search.get("id");
  const isEdit = Boolean(editId);
  // Komisyon oranlarını yalnız klinik yöneticisi görür (API diğer rollere
  // göndermez). Oranı görmeyen birinin formu varsayılan değerleri gönderip
  // hekimin gerçek oranlarını ezmesin diye alan hiç gösterilmez/gönderilmez.
  const viewerSeesRates = currentRole === "YONETICI" || currentRole === "SUPERADMIN";

  const [form, setForm] = useState<StaffForm>(EMPTY_FORM);
  const [originalRole, setOriginalRole] = useState<string | null>(null);
  const [ratesLoaded, setRatesLoaded] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeBranchName, setActiveBranchName] = useState<string | null>(null);
  const [activeBranchError, setActiveBranchError] = useState<string | null>(null);
  const [branchReloadKey, setBranchReloadKey] = useState(0);
  const [staffReloadKey, setStaffReloadKey] = useState(0);
  // Sunucu kendi hesabını ve şube yöneticisini bu ekrandan pasife almayı /
  // rolünü değiştirmeyi reddeder (409); form bunları baştan kilitli gösterir.
  const [isSelf, setIsSelf] = useState(false);
  const [isBranchManager, setIsBranchManager] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setActiveBranchError(null);
    fetch("/api/branches", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.message || "Aktif şube bilgisi yüklenemedi.");
        if (!data?.activeBranch?.name) throw new Error("Personelin ekleneceği aktif şube belirlenemedi.");
        return data;
      })
      .then((data) => setActiveBranchName(data.activeBranch.name))
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setActiveBranchError(fetchError instanceof Error ? fetchError.message : "Aktif şube bilgisi yüklenemedi.");
      });
    return () => controller.abort();
  }, [branchReloadKey]);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    cachedGet<{ id?: string } | null>("/api/auth/me", 60_000)
      .then((me) => { if (!cancelled) setIsSelf(Boolean(me?.id && me.id === editId)); })
      .catch(() => undefined);
    if (canManageBranch) {
      fetch("/api/branches?manage=1", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (cancelled || !Array.isArray(data?.staff)) return;
          const member = data.staff.find((item: { id: string }) => item.id === editId);
          setIsBranchManager(Boolean(member?.branchMemberships?.[0]?.isBranchManager));
        })
        .catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, [canManageBranch, editId]);

  useEffect(() => {
    if (!editId) return;
    const controller = new AbortController();
    setLoadingEdit(true);
    setLoadError(null);
    fetch(`/api/staff/${editId}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.message || "Personel bilgileri yüklenemedi.");
        const hasRates = Object.prototype.hasOwnProperty.call(data, "kkYuzde");
        setRatesLoaded(hasRates);
        setOriginalRole(data.role || null);
        setForm({
          identityNo: data.identityNo || "",
          fullName: data.fullName || "",
          role: data.role || "ASISTAN",
          password: "",
          showAsDoctor: !data.profile?.hideAsDoctor,
          isActive: data.isActive !== false,
          workStart: data.profile?.workStart || "08:30",
          workEnd: data.profile?.workEnd || "18:00",
          photoUrl: data.profile?.photoUrl || "",
          kkYuzde: String(data.kkYuzde ?? DEFAULT_RATES.kkYuzde),
          genelYuzde: String(data.genelYuzde ?? DEFAULT_RATES.genelYuzde),
          maasYuzde: String(data.maasYuzde ?? DEFAULT_RATES.maasYuzde),
        });
      })
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setLoadError(fetchError instanceof Error ? fetchError.message : "Personel bilgileri yüklenemedi.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingEdit(false);
      });
    return () => controller.abort();
  }, [editId, staffReloadKey]);

  const isDoctor = isEffectiveDoctorRole(form.role, form.showAsDoctor);
  const showRates = isDoctor && viewerSeesRates && (!isEdit || ratesLoaded);
  // Klinik yöneticisi rolünü yalnız yöneticiler verebilir (API de reddeder);
  // seçenek diğer rollere hiç gösterilmez.
  const roleOptions = ROLE_OPTIONS.filter((option) => option !== "YONETICI" || viewerSeesRates || originalRole === "YONETICI");

  const errors = {
    identityNo: !/^\d{11}$/.test(form.identityNo) ? "TC kimlik no 11 haneli olmalıdır." : undefined,
    fullName: form.fullName.trim().length < 2 ? "Ad soyad en az 2 harf olmalıdır." : undefined,
    password: form.password && (form.password.length < 8 || form.password.length > 72) ? "Şifre 8-72 karakter olmalıdır." : undefined,
    workHours: isDoctor && form.workStart && form.workEnd && form.workStart >= form.workEnd ? "Mesai bitişi başlangıçtan sonra olmalıdır." : undefined,
    kkYuzde: showRates ? rateError(form.kkYuzde) : undefined,
    genelYuzde: showRates ? rateError(form.genelYuzde) : undefined,
    maasYuzde: showRates ? rateError(form.maasYuzde) : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const visibleError = (key: keyof typeof errors) => (submitted || (key === "identityNo" && form.identityNo.length > 0 && form.identityNo.length !== 11) ? errors[key] : undefined);

  const update = (patch: Partial<StaffForm>) => setForm((current) => ({ ...current, ...patch }));

  const ratesBody = () => ({
    kkYuzde: Number(form.kkYuzde),
    genelYuzde: Number(form.genelYuzde),
    maasYuzde: Number(form.maasYuzde),
  });

  const save = async () => {
    setSubmitted(true);
    setError(null);
    if (hasErrors) {
      setError("Kırmızı ile işaretli alanları düzeltin.");
      return;
    }
    setSaving(true);

    const body: Record<string, unknown> = {
      identityNo: form.identityNo,
      fullName: form.fullName.trim(),
      role: form.role,
      hideAsDoctor: !form.showAsDoctor,
      workStart: form.workStart,
      workEnd: form.workEnd,
      photoUrl: form.photoUrl.trim() || null,
    };
    if (form.password) body.password = form.password;
    if (isEdit && showRates) Object.assign(body, ratesBody());

    try {
      const response = await fetch(isEdit ? `/api/staff/${editId}` : "/api/staff", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError(await readMessage(response, "Kayıt yapılamadı."));
        return;
      }

      if (!isEdit) {
        // Yeni personel kaydı fotoğraf ve hekim oranlarını almıyor; bunlar
        // girildiyse aynı kayda hemen ikinci adımda işlenir. Önceden form
        // bu alanları gösterip sessizce kaybediyordu.
        const created = await response.json().catch(() => null);
        const followUp: Record<string, unknown> = {};
        if (form.photoUrl.trim()) followUp.photoUrl = form.photoUrl.trim();
        // Oranlar varsayılan bırakılsa da açıkça kaydedilir: boş (null) oran
        // Hakediş ekranında 3/15/40, gider kontrolünde 0 sayılıyordu.
        if (showRates) Object.assign(followUp, ratesBody());
        if (created?.id && Object.keys(followUp).length > 0) {
          const extra = await fetch(`/api/staff/${created.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(followUp),
          }).catch(() => null);
          if (!extra || !extra.ok) {
            invalidateCachedGet("/api/staff");
            showToastSafe({
              title: "Personel eklendi, bir bilgi kaydedilemedi",
              message: `${form.fullName.trim()} eklendi ancak fotoğraf veya ödeme oranları kaydedilemedi. Düzenleme ekranından tekrar deneyin.`,
              type: "error",
              duration: 6000,
            });
            router.push(`/personel-ekle?id=${created.id}`);
            return;
          }
        }
      }

      invalidateCachedGet("/api/staff");
      showToastSafe({
        message: isEdit
          ? `${form.fullName.trim()} kaydı güncellendi.`
          : `${form.fullName.trim()} eklendi. İlk girişte şifre olarak TC kimlik numarasını kullanıp kendi şifresini belirleyecek.`,
        type: "success",
        duration: isEdit ? 3000 : 6000,
      });
      router.push("/personel");
    } catch {
      setError("Bağlantı hatası — kayıt yapılamadı. Lütfen tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  // Pasife alma ayrı ve anında yapılan bir işlemdir: önceden yalnız formdaki
  // durumu değiştiriyor, kullanıcı "Kaydet"e basmadan çıkınca hiçbir şey
  // olmuyordu.
  const changeStatus = async () => {
    if (!editId) return;
    const name = form.fullName.trim() || "Bu personel";
    const makePassive = form.isActive;
    if (makePassive && !(await confirmDialog({
      title: `${name} pasife alınsın mı?`,
      message: "Bu şubeye giriş yapamaz; randevu ve işlem ekranlarında seçilemez. Geçmiş kayıtları silinmez. Gelecek randevusu veya açık tedavi planı varsa önce başka hekime devredilmelidir.",
      danger: true,
      confirmText: "Pasife al",
    }))) return;
    setStatusSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/staff/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !makePassive }),
      });
      if (!response.ok) {
        setError(await readMessage(response, "Personelin durumu değiştirilemedi."));
        return;
      }
      invalidateCachedGet("/api/staff");
      if (makePassive) {
        showToastSafe({
          message: canManageBranch
            ? `${name} pasife alındı. Geri açmak için Personel listesinde Durum: "Pasife alınanlar" seçin.`
            : `${name} pasife alındı. Geri açmak için klinik yöneticinize başvurun.`,
          type: "success",
          duration: 6000,
        });
        router.push("/personel");
        return;
      }
      update({ isActive: true });
      showToastSafe({ message: `${name} yeniden aktif.`, type: "success" });
    } catch {
      setError("Bağlantı hatası — durum değiştirilemedi. Lütfen tekrar deneyin.");
    } finally {
      setStatusSaving(false);
    }
  };

  const header = (
    <PageHeader
      icon="person"
      title={isEdit ? (form.fullName.trim() || "Personeli düzenle") : "Yeni personel"}
      description={isEdit
        ? "Bilgileri değiştirip Kaydet'e basın."
        : activeBranchName
          ? <>Personel <b>{activeBranchName}</b> şubesine eklenecek.</>
          : "Yeni personelin bilgilerini girin."}
      back={{ href: "/personel", label: "Personel" }}
    />
  );

  if (loadingEdit) {
    return (
      <section className="space-y-4">
        {header}
        <div className="flex h-40 items-center justify-center"><Spinner className="h-6 w-6 text-primary" /></div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="space-y-4">
        {header}
        <LoadErrorState message={loadError} onRetry={() => setStaffReloadKey((value) => value + 1)} />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {header}

      {activeBranchError && !isEdit && (
        <LoadErrorState compact message={activeBranchError} onRetry={() => setBranchReloadKey((value) => value + 1)} />
      )}

      {isEdit && !form.isActive && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Bu personel pasif. Giriş yapamaz ve randevu ekranlarında seçilemez. Sayfanın altındaki &quot;Yeniden aktif et&quot; ile açabilirsiniz.
        </div>
      )}

      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <FormSection icon={IdCard} title="Kimlik ve giriş" description="Personel sisteme TC kimlik numarasıyla giriş yapar.">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="TC kimlik no" htmlFor="personel-tc" required error={visibleError("identityNo")}>
              <Input
                id="personel-tc"
                className="font-mono"
                placeholder="11 haneli"
                inputMode="numeric"
                autoComplete="off"
                maxLength={11}
                value={form.identityNo}
                onChange={(event) => update({ identityNo: event.target.value.replace(/\D/g, "").slice(0, 11) })}
              />
            </FormField>
            <FormField label="Ad soyad" htmlFor="personel-ad" required error={visibleError("fullName")}>
              <Input id="personel-ad" autoComplete="off" value={form.fullName} maxLength={120} onChange={(event) => update({ fullName: event.target.value })} />
            </FormField>
            <FormField
              label="Rol"
              htmlFor="personel-rol"
              required
              hint={isBranchManager
                ? "Şube yöneticisinin rolü bu ekrandan değiştirilemez; gerekirse destek ekibine yazın."
                : "Rol, personelin hangi ekranları görüp neler yapabileceğini belirler."}
            >
              <Select id="personel-rol" value={form.role} disabled={isBranchManager} onChange={(event) => update({ role: event.target.value })}>
                {roleOptions.map((option) => <option key={option} value={option}>{roleLabel(option)}</option>)}
              </Select>
            </FormField>
            {isEdit ? (
              <FormField
                label="Yeni şifre (isteğe bağlı)"
                htmlFor="personel-sifre"
                error={visibleError("password") || (form.password && form.password.length < 8 ? "Şifre en az 8 karakter olmalıdır." : undefined)}
                hint="Yalnız şifresini unutan personel için doldurun. Kaydedince eski oturumları kapanır."
              >
                <Input id="personel-sifre" placeholder="En az 8 karakter" type="password" minLength={8} maxLength={72} autoComplete="new-password" value={form.password} onChange={(event) => update({ password: event.target.value })} />
              </FormField>
            ) : (
              <div className="flex items-end">
                <p className="w-full rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs leading-5 text-primary-strong">
                  İlk şifre TC kimlik numarasıdır. Personel ilk girişte kendi şifresini belirler.
                </p>
              </div>
            )}
            {form.role === "YONETICI" && (
              <div className="md:col-span-2">
                <Switch
                  checked={form.showAsDoctor}
                  onChange={(checked) => update({ showAsDoctor: checked })}
                  label="Bu yönetici hasta da tedavi ediyor"
                  description="Açıkken randevu, hakediş ve hasta ekranlarındaki hekim listesinde görünür."
                />
              </div>
            )}
          </div>
        </FormSection>

        {isDoctor && (
          <FormSection icon={Clock} title="Mesai" description="Hekime bu saatlerin dışında randevu verilemez.">
            <div className="grid max-w-md grid-cols-2 gap-3">
              <FormField label="Başlangıç" htmlFor="personel-mesai-baslangic" error={visibleError("workHours")}>
                <Input id="personel-mesai-baslangic" type="time" value={form.workStart} onChange={(event) => update({ workStart: event.target.value })} />
              </FormField>
              <FormField label="Bitiş" htmlFor="personel-mesai-bitis">
                <Input id="personel-mesai-bitis" type="time" value={form.workEnd} onChange={(event) => update({ workEnd: event.target.value })} />
              </FormField>
            </div>
          </FormSection>
        )}

        {showRates && (
          <FormSection
            icon={Percent}
            title="Hakediş oranları"
            description={`${activeBranchName ? `Yalnız ${activeBranchName} şubesindeki tahsilatlara uygulanır. ` : ""}Emin değilseniz önerilen değerleri değiştirmeyin.`}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              {RATE_FIELDS.map((field) => (
                <FormField key={field.key} label={field.label} htmlFor={`personel-${field.key}`} hint={field.hint} error={visibleError(field.key)}>
                  <Input
                    id={`personel-${field.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={0.1}
                    value={form[field.key]}
                    onChange={(event) => update({ [field.key]: event.target.value } as Partial<StaffForm>)}
                  />
                </FormField>
              ))}
            </div>
          </FormSection>
        )}

        <FormSection icon={Upload} title="Fotoğraf (isteğe bağlı)" description="Boş bırakılırsa adının baş harfleri gösterilir.">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setPhotoError(null);
              if (file.size > 8 * 1024 * 1024) { setPhotoError("Dosya en fazla 8 MB olabilir."); return; }
              try {
                update({ photoUrl: await downscaleImageToDataUrl(file) });
              } catch {
                setPhotoError("Fotoğraf işlenemedi. JPG, PNG veya WEBP deneyin.");
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            {form.photoUrl.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.photoUrl.trim()} alt="Fotoğraf önizleme" className="h-14 w-14 rounded-full border border-slate-200 object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-slate-300 text-xs text-slate-400">Yok</div>
            )}
            <Button variant="secondary" size="sm" icon={Upload} onClick={() => fileInputRef.current?.click()}>
              {form.photoUrl.trim() ? "Değiştir" : "Fotoğraf seç"}
            </Button>
            {form.photoUrl.trim() && (
              <Button variant="ghost" size="sm" icon={X} onClick={() => update({ photoUrl: "" })}>
                Kaldır
              </Button>
            )}
          </div>
          {photoError && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{photoError}</p>}
        </FormSection>

        <FormErrorBanner message={error} />

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => router.push("/personel")}>Vazgeç</Button>
          <Button type="submit" loading={saving} disabled={statusSaving}>Kaydet</Button>
        </div>
      </form>

      {isEdit && (
        <FormSection
          icon={UserCog}
          title={form.isActive ? "İşten ayrılan personel" : "Personeli yeniden aç"}
          description={isSelf
            ? "Kendi hesabınızı pasife alamazsınız."
            : isBranchManager
              ? "Şube yöneticisi bu ekrandan pasife alınamaz; gerekirse destek ekibine yazın."
              : form.isActive
                ? "İşten ayrılan personeli silmek yerine pasife alın: geçmiş randevu, tahsilat ve kayıtlar korunur."
                : "Pasif personel yeniden aktif edilirse tekrar giriş yapabilir ve seçilebilir."}
        >
          {!isSelf && !isBranchManager && (
            <Button
              variant={form.isActive ? "danger" : "secondary"}
              size="sm"
              icon={Power}
              loading={statusSaving}
              disabled={saving}
              onClick={() => void changeStatus()}
            >
              {form.isActive ? "Pasife al" : "Yeniden aktif et"}
            </Button>
          )}
        </FormSection>
      )}
    </section>
  );
}

export default function PersonelEklePage() {
  return (
    <Suspense fallback={<div className="flex h-40 items-center justify-center"><Spinner className="h-6 w-6 text-primary" /></div>}>
      <PersonelEkleContent />
    </Suspense>
  );
}
