"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Power } from "lucide-react";
import { confirmDialog } from "@/lib/confirm-client";
import { invalidateCachedGet } from "@/lib/client-cache";
import { roleLabel } from "@/lib/staff-roles";
import { isValidTurkishIdentityNumber } from "@/lib/tc-kimlik";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Disclosure } from "@/components/ui/Disclosure";
import { FormField } from "@/components/ui/FormField";
import { FormModal } from "@/components/ui/FormModal";
import { ImageUploadField } from "@/components/ui/ImageUploadField";
import { Input } from "@/components/ui/Input";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { FormSkeleton } from "@/components/ui/PageSkeleton";
import { Switch } from "@/components/ui/Switch";
import { TimeRangeInput, timeRangeError } from "@/components/ui/TimeRangeInput";
import { DEFAULT_RATES, RATE_HINTS, RATE_LABELS, ROLE_SUMMARIES, STAFF_ROLE_ORDER, formatRate, type RateKey } from "./staff-shared";

type StaffForm = {
  identityNo: string;
  fullName: string;
  role: string;
  password: string;
  showAsDoctor: boolean;
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
  workStart: "08:30",
  workEnd: "18:00",
  photoUrl: "",
  ...DEFAULT_RATES,
};

const PASSWORD_MESSAGE = "Şifre 8-72 karakter olmalıdır.";
const isEffectiveDoctorRole = (role: string, showAsDoctor: boolean) => role === "DOKTOR" || (role === "YONETICI" && showAsDoctor);

function rateError(value: string) {
  const number = Number(value);
  return value.trim() === "" || !Number.isFinite(number) || number < 0 || number > 100 ? "0 ile 100 arasında olmalı." : undefined;
}

async function readBody(response: Response) {
  return response.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

type Reassignment = { message: string; doctorId: string };

type Props = {
  open: boolean;
  /** null = yeni personel. */
  staffId: string | null;
  onClose: () => void;
  /** Kayıt/pasife alma bitti: liste yenilensin, pencere kapansın. */
  onDone: (message: string, options?: { duration?: number }) => void;
  /** Oturumdaki kullanıcı (kendi hesabını pasife alamaz). */
  currentUserId: string | null;
  /** Hakediş oranlarını yalnız hakediş özetini de gören (finance:read) görür ve gönderir (API diğerlerine göndermez). */
  viewerSeesRates: boolean;
  canManageBranch: boolean;
  /**
   * Yönetici rolünü verebilir mi? (API yalnız yönetici ve süperadmine izin verir.)
   * Verilmezse `viewerSeesRates` kullanılır (eski davranış).
   */
  canAssignManagerRole?: boolean;
};

/**
 * Yeni personel / personel düzenleme penceresi (önceden ayrı /personel-ekle
 * sayfasıydı; dönünce listedeki arama ve süzgeç kayboluyordu). Rol en üstte:
 * hangi alanların görüneceğini o belirler. Fotoğraf ve şifre sıfırlama yalnız
 * düzenlemede, "Diğer" altında. Doktor mesaisi ve hakediş oranları yalnız
 * burada düzenlenir (Profilim ve Şube erişimi yalnız gösterir).
 */
export function StaffFormModal({ open, staffId, onClose, onDone, currentUserId, viewerSeesRates, canManageBranch, canAssignManagerRole = viewerSeesRates }: Props) {
  const isEdit = Boolean(staffId);
  const [form, setForm] = useState<StaffForm>(EMPTY_FORM);
  const [initial, setInitial] = useState<StaffForm>(EMPTY_FORM);
  const [originalRole, setOriginalRole] = useState<string | null>(null);
  const [ratesLoaded, setRatesLoaded] = useState(false);
  const [ratesMissing, setRatesMissing] = useState(false);
  const [ratesTouched, setRatesTouched] = useState(false);
  const [isBranchManager, setIsBranchManager] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Adresteki kayıt yok (`/personel?id=<olmayan>`): yeniden denemek anlamsız.
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverField, setServerField] = useState<"identityNo" | null>(null);
  const [reassignment, setReassignment] = useState<Reassignment | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);

  // Pencere her açılışta temiz başlar (yeni) ya da kaydı yükler (düzenle).
  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    setServerError(null);
    setServerField(null);
    setReassignment(null);
    setRatesTouched(false);
    setExtrasOpen(false);
    if (!staffId) {
      setForm(EMPTY_FORM);
      setInitial(EMPTY_FORM);
      setOriginalRole(null);
      setRatesLoaded(false);
      setRatesMissing(false);
      setIsBranchManager(false);
      setLoadError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    setNotFound(false);
    fetch(`/api/staff/${staffId}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await readBody(response);
        if (response.status === 404) setNotFound(true);
        if (!response.ok || !data) throw new Error((data?.message as string) || "Personel bilgileri yüklenemedi.");
        const profile = (data.profile || null) as { workStart?: string | null; workEnd?: string | null; photoUrl?: string | null; hideAsDoctor?: boolean | null } | null;
        const hasRates = Object.prototype.hasOwnProperty.call(data, "kkYuzde");
        const rateText = (key: RateKey) => (data[key] === null || data[key] === undefined ? DEFAULT_RATES[key] : String(data[key]));
        const next: StaffForm = {
          identityNo: typeof data.identityNo === "string" ? data.identityNo : "",
          fullName: typeof data.fullName === "string" ? data.fullName : "",
          role: typeof data.role === "string" ? data.role : "ASISTAN",
          password: "",
          // Doktor yöneticiye çevrilirse "Hasta da tedavi ediyor" açık gelir
          // (önceki personel formundaki davranış).
          showAsDoctor: data.role === "YONETICI" || data.role === "DOKTOR" ? !profile?.hideAsDoctor : false,
          workStart: profile?.workStart || "08:30",
          workEnd: profile?.workEnd || "18:00",
          photoUrl: profile?.photoUrl || "",
          kkYuzde: rateText("kkYuzde"),
          genelYuzde: rateText("genelYuzde"),
          maasYuzde: rateText("maasYuzde"),
        };
        setForm(next);
        setInitial(next);
        setOriginalRole(next.role);
        setRatesLoaded(hasRates);
        setRatesMissing(hasRates && data.kkYuzde == null);
        setIsBranchManager(Boolean(data.isBranchManager));
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : "Personel bilgileri yüklenemedi.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, staffId, reloadKey]);

  const isSelf = Boolean(isEdit && currentUserId && currentUserId === staffId);
  const isDoctor = isEffectiveDoctorRole(form.role, form.showAsDoctor);
  const showRates = isDoctor && viewerSeesRates && (!isEdit || ratesLoaded);
  // Yönetici rolünü yalnız yöneticiler verebilir (API de reddeder).
  const roleOptions = STAFF_ROLE_ORDER.filter((option) => option !== "YONETICI" || canAssignManagerRole || originalRole === "YONETICI");
  const identityChanged = !isEdit || form.identityNo !== initial.identityNo;

  const errors = useMemo(() => ({
    identityNo: form.identityNo.length !== 11
      ? "TC kimlik no 11 haneli olmalıdır."
      : identityChanged && !isValidTurkishIdentityNumber(form.identityNo)
        ? "Geçerli bir TC kimlik no yazın; numarayı kimlikten kontrol edin."
        : undefined,
    fullName: form.fullName.trim().length < 2 ? "Ad soyad en az 2 harf olmalıdır." : undefined,
    password: form.password && (form.password.length < 8 || form.password.length > 72) ? PASSWORD_MESSAGE : undefined,
    workHours: isDoctor ? timeRangeError({ start: form.workStart, end: form.workEnd }, { required: true }) || undefined : undefined,
    kkYuzde: showRates ? rateError(form.kkYuzde) : undefined,
    genelYuzde: showRates ? rateError(form.genelYuzde) : undefined,
    maasYuzde: showRates ? rateError(form.maasYuzde) : undefined,
  }), [form, identityChanged, isDoctor, showRates]);
  const hasErrors = Object.values(errors).some(Boolean);
  // TC'de 11 hane yazılınca algoritma hatası hemen görünür; diğerleri kaydetmeye çalışınca.
  const visibleError = (key: keyof typeof errors) => (
    submitted || (key === "identityNo" && form.identityNo.length === 11) ? errors[key] : undefined
  );
  const identityError = (serverField === "identityNo" ? serverError || undefined : undefined) || visibleError("identityNo");

  const update = (patch: Partial<StaffForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    if ("identityNo" in patch && serverField === "identityNo") {
      setServerField(null);
      setServerError(null);
    }
  };
  const updateRate = (key: RateKey, value: string) => {
    setRatesTouched(true);
    update({ [key]: value } as Partial<StaffForm>);
  };

  const ratesBody = () => ({
    kkYuzde: Number(form.kkYuzde),
    genelYuzde: Number(form.genelYuzde),
    maasYuzde: Number(form.maasYuzde),
  });
  const ratesChanged = RATE_LABELS.some(([key]) => form[key] !== initial[key]);

  const focusFirstError = () => {
    const order: Array<[keyof typeof errors, string]> = [
      ["identityNo", "personel-tc"],
      ["fullName", "personel-ad"],
      ["workHours", "personel-mesai"],
      ["kkYuzde", "personel-kkYuzde"],
      ["genelYuzde", "personel-genelYuzde"],
      ["maasYuzde", "personel-maasYuzde"],
      ["password", "personel-sifre"],
    ];
    const first = order.find(([key]) => errors[key]);
    if (!first) return;
    if (first[0] === "password") setExtrasOpen(true);
    window.setTimeout(() => document.getElementById(first[1])?.focus(), 0);
  };

  const save = async () => {
    setSubmitted(true);
    setServerError(null);
    setServerField(null);
    setReassignment(null);
    if (hasErrors) {
      focusFirstError();
      return;
    }
    setSaving(true);
    const fullName = form.fullName.trim();
    const body: Record<string, unknown> = {
      identityNo: form.identityNo,
      fullName,
      role: form.role,
      // "Hasta da tedavi ediyor" yalnız klinik yöneticisinin ayarıdır. Diğer
      // rollerde gönderilmez: doktor düzenlenirken `hideAsDoctor: true`
      // gitmesi sunucuda "hekim listesinden çıkarılıyor" sayılıyor, gelecek
      // randevusu olan doktorun adı/mesaisi/oranı bile 409 ile kaydedilemiyordu.
      ...(form.role === "YONETICI" ? { hideAsDoctor: !form.showAsDoctor } : {}),
      workStart: form.workStart,
      workEnd: form.workEnd,
    };
    if (isEdit) {
      if (form.photoUrl !== initial.photoUrl) body.photoUrl = form.photoUrl.trim() || null;
      if (form.password) body.password = form.password;
      // Oranlar yalnız değiştirildiyse gönderilir: önceden yalnız ad değişse
      // de her kayıtta oran yazılıyor, oran geçmişine satır düşüyordu.
      if (showRates && ratesTouched && ratesChanged) Object.assign(body, ratesBody());
    } else if (showRates) {
      // Yeni doktorun oranları kayıtla birlikte gider (boş oran hakedişte
      // varsayılan, gider kontrolünde 0 sayılıyordu). Önceden kayıttan sonra
      // ayrı bir PUT atılıyor, oran geçmişine aynı değerli iki satır düşüyordu.
      Object.assign(body, ratesBody());
    }

    try {
      const response = await fetch(isEdit ? `/api/staff/${staffId}` : "/api/staff", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readBody(response);
      if (!response.ok) {
        const message = (data?.message as string) || "Kayıt yapılamadı.";
        if (data?.requiresReassignment || data?.requiresReschedule) {
          setReassignment({ message, doctorId: staffId || "" });
        } else {
          setServerError(message);
          if (data?.field === "identityNo") setServerField("identityNo");
        }
        return;
      }

      invalidateCachedGet("/api/staff");
      onDone(isEdit
        ? `${fullName} kaydı güncellendi.`
        : `${fullName} eklendi. İlk girişte şifre olarak TC kimlik numarasını kullanıp kendi şifresini belirleyecek.`,
      { duration: isEdit ? 3000 : 6000 });
    } catch {
      setServerError("Bağlantı hatası — kayıt yapılamadı. Lütfen tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  // Pasife alma ayrı ve anında yapılan bir işlemdir (Kaydet'e bağlı değil).
  const deactivate = async () => {
    if (!staffId) return;
    const name = form.fullName.trim() || "Bu personel";
    const clinical = isEffectiveDoctorRole(initial.role, initial.showAsDoctor);
    if (!(await confirmDialog({
      title: `${name} pasife alınsın mı?`,
      message: clinical
        ? "Bu şubeye giriş yapamaz; randevu ve işlem ekranlarında seçilemez. Geçmiş kayıtları silinmez. Gelecek randevusu varsa önce başka doktora devredilmelidir."
        : "Bu şubeye giriş yapamaz ve işlem ekranlarında seçilemez. Geçmiş kayıtları silinmez.",
      danger: true,
      confirmText: "Pasife al",
    }))) return;
    setStatusSaving(true);
    setServerError(null);
    setReassignment(null);
    try {
      const response = await fetch(`/api/staff/${staffId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      const data = await readBody(response);
      if (!response.ok) {
        const message = (data?.message as string) || "Personelin durumu değiştirilemedi.";
        if (data?.requiresReassignment) setReassignment({ message, doctorId: staffId });
        else setServerError(message);
        return;
      }
      invalidateCachedGet("/api/staff");
      onDone(canManageBranch
        ? `${name} pasife alındı. Geri açmak için listede "Pasif" süzgecini seçin.`
        : `${name} pasife alındı. Geri açmak için klinik yöneticinize başvurun.`,
      { duration: 6000 });
    } catch {
      setServerError("Bağlantı hatası — durum değiştirilemedi. Lütfen tekrar deneyin.");
    } finally {
      setStatusSaving(false);
    }
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const title = isEdit ? (notFound ? "Personel bulunamadı" : initial.fullName || "Personel") : "Yeni personel";
  const canDeactivate = isEdit && !loading && !loadError && !isSelf && !isBranchManager;
  const ratesSummary = RATE_LABELS.map(([key, label]) => `${label} ${formatRate(form[key])}`).join(" · ");

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={title}
      // Rol yalnız kayıt yüklenince yazılır (yüklenirken/hatada varsayılan "Asistan" görünüyordu).
      description={isEdit && !loading && !loadError ? roleLabel(initial.role) : undefined}
      module="person"
      size="lg"
      onSubmit={() => save()}
      submitting={saving}
      // Düzenlemede değişiklik yokken Kaydet pasif: önceden boş kayıt PUT
      // gidiyor, "Alan değişikliği yok" işlem kaydı ve kurum geneli yenileme oluşuyordu.
      submitDisabled={loading || Boolean(loadError) || statusSaving || (isEdit && !dirty)}
      // Kayıt bulunamadıysa kaydedilecek bir şey yok: pasif "Kaydet" yerine yalnız "Kapat".
      hideSubmit={notFound}
      cancelLabel={loadError ? "Kapat" : undefined}
      error={serverField ? null : serverError}
      isDirty={dirty}
      dangerAction={canDeactivate ? { label: "Pasife al", icon: Power, onClick: () => void deactivate(), loading: statusSaving, disabled: saving } : undefined}
    >
      {loading ? (
        <FormSkeleton fields={4} columns={2} footer={false} framed={false} />
      ) : loadError ? (
        <LoadErrorState
          compact
          message={notFound ? "Bu personel kaydı bulunamadı; pasife alınmış ya da başka şubeye ait olabilir." : loadError}
          onRetry={notFound ? undefined : () => setReloadKey((key) => key + 1)}
        />
      ) : (
        <>
          {reassignment && (
            <Callout
              tone="warning"
              action={reassignment.doctorId ? (
                <Button size="sm" variant="secondary" icon={CalendarDays} href={`/randevu?doctorId=${encodeURIComponent(reassignment.doctorId)}`}>
                  Randevularını aç
                </Button>
              ) : undefined}
            >
              {reassignment.message}
            </Callout>
          )}

          <ChoiceCards
            label="Rol"
            required
            variant="pills"
            value={form.role}
            onChange={(role) => update({ role })}
            options={roleOptions.map((option) => ({
              value: option,
              label: roleLabel(option),
              // Neden seçeneklerin altında bir kez (ipucu) yazılır; her seçenekte tekrar edilmez.
              disabled: isBranchManager && option !== form.role,
            }))}
            hint={isBranchManager ? "Şube yöneticisinin rolü bu ekrandan değiştirilemez." : ROLE_SUMMARIES[form.role]}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="TC kimlik no"
              htmlFor="personel-tc"
              required
              error={identityError}
              hint={!isEdit ? "Giriş TC ile yapılır; ilk şifre TC'dir, ilk girişte değiştirilir." : undefined}
            >
              <Input
                id="personel-tc"
                autoFocus={!isEdit}
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
          </div>

          {form.role === "YONETICI" && (
            <Switch
              checked={form.showAsDoctor}
              onChange={(checked) => update({ showAsDoctor: checked })}
              label="Hasta da tedavi ediyor"
              description="Açıkken randevu, hakediş ve hasta ekranlarındaki doktor listesinde görünür."
            />
          )}

          {isDoctor && (
            <TimeRangeInput
              id="personel-mesai"
              label="Mesai"
              required
              value={{ start: form.workStart, end: form.workEnd }}
              onChange={(range) => update({ workStart: range.start, workEnd: range.end })}
              error={submitted ? errors.workHours : undefined}
              hint="Bu saatlerin dışında randevu verilmez."
            />
          )}

          {showRates && (
            <Disclosure
              title="Hakediş oranları"
              summary={ratesMissing && !ratesTouched ? "Girilmemiş — varsayılan oranlar kullanılıyor" : ratesSummary}
              defaultOpen={!isEdit ? false : ratesMissing}
            >
              <div className="grid gap-4 sm:grid-cols-3">
                {RATE_LABELS.map(([key, label]) => (
                  <FormField key={key} label={`${label} %`} htmlFor={`personel-${key}`} hint={RATE_HINTS[key]} error={visibleError(key)}>
                    <Input
                      id={`personel-${key}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step={0.1}
                      value={form[key]}
                      onChange={(event) => updateRate(key, event.target.value)}
                    />
                  </FormField>
                ))}
              </div>
            </Disclosure>
          )}

          {isEdit && (
            <Disclosure
              title="Fotoğraf ve şifre"
              summary={form.password ? "Yeni şifre kaydedilecek" : form.photoUrl ? "Fotoğraf var" : "Fotoğraf yok"}
              open={extrasOpen}
              onOpenChange={setExtrasOpen}
            >
              <div className="space-y-4">
                <ImageUploadField
                  label="Fotoğraf"
                  shape="round"
                  value={form.photoUrl}
                  onChange={(dataUrl) => update({ photoUrl: dataUrl })}
                  maxDimension={320}
                  placeholder={<Avatar name={form.fullName} size="lg" />}
                />
                <FormField
                  label="Yeni şifre"
                  htmlFor="personel-sifre"
                  error={visibleError("password")}
                  hint="Yalnız şifresini unutan personel için. Kaydedince eski oturumları kapanır."
                >
                  <Input id="personel-sifre" placeholder="En az 8 karakter" type="password" maxLength={72} autoComplete="new-password" value={form.password} onChange={(event) => update({ password: event.target.value })} />
                </FormField>
              </div>
            </Disclosure>
          )}
        </>
      )}
    </FormModal>
  );
}
