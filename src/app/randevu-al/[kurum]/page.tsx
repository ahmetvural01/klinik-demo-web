"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { CheckCircle2, Phone, RefreshCw, Send } from "lucide-react";
import { DentalMark } from "@/components/brand/DentalMark";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ChoiceCards, type ChoiceOption } from "@/components/ui/ChoiceCards";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { Disclosure } from "@/components/ui/Disclosure";
import { FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { FormSkeleton } from "@/components/ui/PageSkeleton";
import { QuickDatePicker, addDaysToDateKey, type QuickDateOption } from "@/components/ui/QuickDatePicker";
import { StatusPage } from "@/components/ui/StatusPage";
import { getLocalPhoneError, normalizeLocalPhone } from "@/lib/phone-number";
import { turkeyDateKey, turkeyLocalDateTimeToUtc } from "@/lib/tz";
import { buildScheduleByJsDay, checkWorkingDay, type DaySchedule } from "@/lib/working-hours-core";

type Doctor = { id: string; fullName: string };
type Branch = { id: string; name: string; city?: string | null; district?: string | null };
type Clinic = { name: string; logoUrl: string | null; phone: string | null; branches: Branch[]; dailySchedules: DaySchedule[] };
type LoadState = "loading" | "ready" | "not-found" | "busy" | "error";
type Period = "" | "SABAH" | "OGLE" | "OGLEDEN_SONRA";

const DAYS_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const DAYS_LONG = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const RESEND_SECONDS = 60;

// Saat tercihi: panel bu saatleri "Sabah / Öğle / Öğleden sonra" diye gösterir
// (randevu/appointment-utils preferredPeriodLabel). "Fark etmez" yalnız gün olarak gider.
const PERIOD_TIME: Record<Exclude<Period, "">, string> = { SABAH: "10:00", OGLE: "13:00", OGLEDEN_SONRA: "16:00" };
const PERIOD_OPTIONS: ChoiceOption<Period>[] = [
  { value: "", label: "Fark etmez" },
  { value: "SABAH", label: "Sabah" },
  { value: "OGLE", label: "Öğle" },
  { value: "OGLEDEN_SONRA", label: "Öğleden sonra" },
];

function jsDayOf(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function longDay(dateKey: string) {
  const [, month, day] = dateKey.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${DAYS_LONG[jsDayOf(dateKey)]}`;
}

/** Bugünden başlayarak klinik açık olan ilk `count` gün. */
function openDays(schedules: DaySchedule[], todayKey: string, count: number): string[] {
  const byDay = buildScheduleByJsDay(schedules);
  const result: string[] = [];
  for (let offset = 0; offset < 21 && result.length < count; offset += 1) {
    const key = addDaysToDateKey(todayKey, offset);
    if (!byDay.get(jsDayOf(key))?.isHoliday) result.push(key);
  }
  return result;
}

function displayPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  return ten.length === 10 ? `0${ten.slice(0, 3)} ${ten.slice(3, 6)} ${ten.slice(6, 8)} ${ten.slice(8)}` : phone;
}

function StepTitle({ number, children }: { number: number; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary" aria-hidden="true">{number}</span>
      {children}
    </h2>
  );
}

/**
 * Herkese açık online randevu talebi (hasta çoğunlukla telefondan gelir).
 * Tek sütun, iki adım: önce tercih (şube, doktor, gün, saat), sonra iletişim
 * ve telefon doğrulaması. Telefon "0532…", "532…" ya da "+90…" yazılabilir;
 * hem kod hem talep aynı kanonik numarayla gider (önceden sayfa 0'lı
 * numarayı gönderiyor, sunucu reddediyordu — talep hiç tamamlanamıyordu).
 * Kapalı günler seçilemez; kod gönderildikten sonra yeniden gönderme 60 sn
 * bekler (numara başına 15 dakikada 3 kod sınırı var).
 */
export default function RandevuAlPage() {
  const params = useParams();
  const kurum = String(params?.kurum || "");

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  // Kullanıcının seçtiği şube (istek bununla atılır) ve ekranda seçili görünen şube.
  const [requestedBranchId, setRequestedBranchId] = useState("");
  const [branchId, setBranchId] = useState("");

  const [doctorId, setDoctorId] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [period, setPeriod] = useState<Period>("");
  const [fullName, setFullName] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [tcNo, setTcNo] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [codeSentTo, setCodeSentTo] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [resendLeft, setResendLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [tried, setTried] = useState(false);
  const [submitted, setSubmitted] = useState<{ day: string; period: string; doctor: string | null } | null>(null);
  const [todayKey] = useState(() => turkeyDateKey());

  const phone = normalizeLocalPhone(phoneInput, "+90");
  const phoneError = phone ? getLocalPhoneError(phone, "+90") : "Cep telefonunuzu yazın.";
  const codeSent = codeSentTo !== "" && codeSentTo === phone;

  // Klinik bilgisi: ilk açılışta bir kez; şube değişince yalnız doktor listesi
  // yenilenir (önceden tüm sayfa "hazırlanıyor" ekranına dönüyor, ilk yanıttaki
  // şube seçimi ikinci bir isteği tetikliyordu).
  useEffect(() => {
    if (!kurum) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ kurum });
    if (requestedBranchId) query.set("branchId", requestedBranchId);
    if (requestedBranchId) setDoctorsLoading(true);
    fetch(`/api/public/booking/doctors?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          // Şube değişiminde yalnız doktor listesi boşalır ("klinik uygun doktoru atar").
          if (requestedBranchId) { setDoctors([]); return; }
          setLoadState(response.status === 404 ? "not-found" : response.status === 429 ? "busy" : "error");
          return;
        }
        const data = await response.json();
        if (controller.signal.aborted) return;
        setClinic({
          name: data.institutionName || "",
          logoUrl: typeof data.logoUrl === "string" && data.logoUrl ? data.logoUrl : null,
          phone: typeof data.institutionPhone === "string" && data.institutionPhone ? data.institutionPhone : null,
          branches: Array.isArray(data.branches) ? data.branches : [],
          dailySchedules: Array.isArray(data.dailySchedules) ? data.dailySchedules : [],
        });
        setDoctors(Array.isArray(data.doctors) ? data.doctors : []);
        if (typeof data.selectedBranchId === "string") setBranchId(data.selectedBranchId);
        setLoadState("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        if (requestedBranchId) setDoctors([]);
        else setLoadState("error");
      })
      .finally(() => { if (!controller.signal.aborted) setDoctorsLoading(false); });
    return () => controller.abort();
  }, [kurum, requestedBranchId, reloadKey]);

  useEffect(() => {
    if (resendLeft <= 0) return;
    const timer = window.setTimeout(() => setResendLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendLeft]);

  const quickDates = useMemo<QuickDateOption[]>(() => {
    if (!clinic) return [];
    return openDays(clinic.dailySchedules, todayKey, 5).map((key) => ({
      label: key === todayKey ? "Bugün" : key === addDaysToDateKey(todayKey, 1) ? "Yarın" : `${DAYS_SHORT[jsDayOf(key)]} ${Number(key.slice(8))}`,
      date: key,
    }));
  }, [clinic, todayKey]);

  const dateError = preferredDate && clinic && clinic.dailySchedules.length > 0 ? checkWorkingDay(preferredDate, clinic.dailySchedules, "Randevu talebi") : null;

  const sendCode = useCallback(async () => {
    setCodeError("");
    if (phoneError) { setCodeError(phoneError); return; }
    setSendingCode(true);
    try {
      const response = await fetch("/api/public/booking/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kurum, phone }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCodeError(data?.error || "Kod gönderilemedi. Lütfen biraz sonra tekrar deneyin.");
        return;
      }
      setCodeSentTo(phone);
      setCode("");
      setResendLeft(RESEND_SECONDS);
    } catch {
      setCodeError("Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setSendingCode(false);
    }
  }, [kurum, phone, phoneError]);

  const nameError = fullName.trim().length < 3 ? "Adınızı ve soyadınızı yazın." : undefined;
  const missingDate = !preferredDate ? "Bir gün seçin." : undefined;
  const codeFieldError = codeSent && !/^\d{6}$/.test(code) ? "Telefonunuza gelen 6 haneli kodu yazın." : undefined;

  // Alan hataları alanın altında yazar (aynı ileti altta ikinci kez çıkmaz);
  // imleç ilk hatalı alana gider. Alttaki kutu yalnız sunucu/bağlantı hatası içindir.
  const focusField = (id: string) => document.getElementById(id)?.focus();

  const submit = async () => {
    setTried(true);
    setError("");
    if (missingDate || dateError) { focusField("booking-date"); return; }
    if (nameError) { focusField("booking-name"); return; }
    if (phoneError) { focusField("booking-phone"); return; }
    if (!codeSent) { setCodeError("Önce telefonunuza doğrulama kodu gönderin."); focusField("booking-phone"); return; }
    if (codeFieldError) { focusField("booking-code"); return; }

    const preferredFrom = period
      ? turkeyLocalDateTimeToUtc(preferredDate, PERIOD_TIME[period]).toISOString()
      : `${preferredDate}T00:00:00.000Z`;
    setSubmitting(true);
    try {
      const response = await fetch("/api/public/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kurum,
          branchId: branchId || undefined,
          fullName: fullName.trim(),
          phone,
          code,
          tcNo: tcNo.trim() || undefined,
          doctorId: doctorId || undefined,
          preferredFrom,
          note: note.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || "Talep gönderilemedi. Lütfen tekrar deneyin.");
        return;
      }
      setSubmitted({
        day: longDay(preferredDate),
        period: PERIOD_OPTIONS.find((option) => option.value === period)?.label || "Fark etmez",
        doctor: doctors.find((doctor) => doctor.id === doctorId)?.fullName || null,
      });
    } catch {
      setError("Bağlantı kurulamadı. Bilgileriniz korundu; tekrar deneyin.");
    } finally {
      setSubmitting(false);
    }
  };

  const clinicPhoneAction = clinic?.phone
    ? <Button variant="secondary" icon={Phone} href={`tel:${clinic.phone.replace(/[^\d+]/g, "")}`}>{displayPhone(clinic.phone)}</Button>
    : null;

  if (loadState === "not-found") {
    return <StatusPage kind="not-found" fullScreen title="Klinik bağlantısı bulunamadı" description="Bağlantı eksik ya da artık kullanılmıyor olabilir. Kliniğinizden güncel randevu bağlantısını isteyin." />;
  }
  if (loadState === "busy" || loadState === "error") {
    return (
      <StatusPage
        kind="error"
        fullScreen
        title={loadState === "busy" ? "Şu an çok yoğunuz" : "Sayfa yüklenemedi"}
        description={loadState === "busy" ? "Kısa süre içinde çok fazla istek geldi. Bir dakika sonra tekrar deneyin." : "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin."}
        actions={<Button icon={RefreshCw} onClick={() => { setLoadState("loading"); setReloadKey((value) => value + 1); }}>Tekrar dene</Button>}
      />
    );
  }
  if (submitted) {
    return (
      <StatusPage
        tone="success"
        icon={CheckCircle2}
        fullScreen
        title="Talebiniz alındı"
        description={`${clinic?.name || "Klinik"} ekibi sizi arayıp randevu saatini kesinleştirecek.`}
        actions={clinicPhoneAction}
      >
        <div className="ui-surface px-4 py-3 text-left">
          <DescriptionList
            layout="rows"
            items={[
              { key: "gun", label: "Gün", value: submitted.day },
              { key: "saat", label: "Saat tercihi", value: submitted.period },
              { key: "doktor", label: "Doktor", value: submitted.doctor || "Fark etmez" },
            ]}
          />
        </div>
      </StatusPage>
    );
  }

  return (
    <main className="min-h-dvh bg-[rgb(var(--app-bg))] px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <header className="flex items-center gap-3">
          {clinic?.logoUrl ? (
            // Kurum logosu veri URL'si: optimize edilmeden olduğu gibi gösterilir.
            <Image src={clinic.logoUrl} alt="" width={48} height={48} unoptimized className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
              <DentalMark className="h-8 w-8" />
            </span>
          )}
          <div className="min-w-0">
            {loadState === "loading" ? (
              <span className="ui-skeleton-shimmer block h-6 w-48 rounded bg-slate-200" aria-hidden="true" />
            ) : (
              <h1 className="break-words font-display text-xl font-extrabold text-slate-900">{clinic?.name || "Randevu talebi"}</h1>
            )}
            <p className="text-sm text-slate-500">Online randevu talebi — klinik sizi arayıp saati kesinleştirir.</p>
          </div>
        </header>

        <section className="ui-surface p-4 sm:p-6">
          {loadState === "loading" ? (
            <FormSkeleton fields={5} columns={1} framed={false} footer={false} />
          ) : (
            <form className="space-y-6" noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
              <div className="space-y-4">
                <StepTitle number={1}>Tercihiniz</StepTitle>
                {clinic && clinic.branches.length > 1 && (
                  <ChoiceCards
                    label="Şube"
                    required
                    value={branchId}
                    onChange={(next) => { setBranchId(next); setRequestedBranchId(next); setDoctorId(""); setError(""); }}
                    options={clinic.branches.map((branch) => ({ value: branch.id, label: branch.name, description: branch.district || branch.city || undefined }))}
                  />
                )}
                <FormField label="Doktor" htmlFor="booking-doctor" hint={doctorsLoading ? "Doktorlar yükleniyor…" : undefined}>
                  <Select id="booking-doctor" value={doctorId} disabled={doctorsLoading || doctors.length === 0} onChange={(event) => setDoctorId(event.target.value)}>
                    <option value="">{doctors.length > 0 ? "Fark etmez" : "Klinik uygun doktoru atar"}</option>
                    {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.fullName}</option>)}
                  </Select>
                </FormField>
                <QuickDatePicker
                  label="Gün"
                  required
                  id="booking-date"
                  min="today"
                  value={preferredDate}
                  options={quickDates}
                  error={tried && (missingDate || dateError) ? (missingDate || dateError || undefined) : dateError || undefined}
                  onChange={(next) => { setPreferredDate(next); setError(""); }}
                />
                <ChoiceCards label="Saat tercihi" variant="pills" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
              </div>

              <div className="space-y-4 border-t border-slate-100 pt-5">
                <StepTitle number={2}>İletişim bilgileriniz</StepTitle>
                <FormField label="Ad soyad" required htmlFor="booking-name" error={tried ? nameError : undefined}>
                  <Input id="booking-name" name="name" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Adınız ve soyadınız" />
                </FormField>
                <FormField
                  label="Cep telefonu"
                  required
                  as="div"
                  htmlFor="booking-phone"
                  error={codeError || (tried && phoneError ? phoneError : undefined)}
                  hint={codeSent ? `Kod ${displayPhone(phone)} numarasına gönderildi; 5 dakika geçerli.` : "Numaranızı doğrulamak için SMS ile kod gönderilir."}
                >
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="booking-phone"
                      name="tel"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      maxLength={17}
                      value={phoneInput}
                      onChange={(event) => { setPhoneInput(event.target.value.replace(/[^\d\s+()-]/g, "")); setCodeError(""); }}
                      placeholder="0532 123 45 67"
                      className="sm:flex-1"
                    />
                    <Button
                      variant="secondary"
                      icon={Send}
                      loading={sendingCode}
                      disabled={Boolean(phoneError) || resendLeft > 0}
                      onClick={() => void sendCode()}
                      className="shrink-0"
                    >
                      {resendLeft > 0 ? `Yeniden gönder (${resendLeft})` : codeSent ? "Yeniden gönder" : "Kod gönder"}
                    </Button>
                  </div>
                </FormField>
                {codeSent && (
                  <FormField label="Doğrulama kodu" required htmlFor="booking-code" error={tried ? codeFieldError : undefined}>
                    <Input
                      id="booking-code"
                      name="one-time-code"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6 haneli kod"
                      className="font-semibold tracking-[0.22em] sm:max-w-[12rem]"
                    />
                  </FormField>
                )}
                <FormField label="Not" htmlFor="booking-note">
                  <Textarea id="booking-note" name="note" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ör. öğleden sonra daha uygun" />
                </FormField>
                <Disclosure title="Diğer bilgiler" summary="TC kimlik no (isteğe bağlı)">
                  <FormField label="TC kimlik no" htmlFor="booking-tc" hint="Kayıtlı hastaysanız eşleştirmeyi kolaylaştırır.">
                    <Input id="booking-tc" name="national-id" inputMode="numeric" value={tcNo} onChange={(event) => setTcNo(event.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="11 haneli" />
                  </FormField>
                </Disclosure>
              </div>

              {error && <Callout tone="critical" role="alert">{error}</Callout>}

              <div className="space-y-3">
                <Button type="submit" fullWidth icon={CheckCircle2} loading={submitting}>
                  Talebi gönder
                </Button>
                <p className="text-center text-xs leading-5 text-slate-500">
                  Bu bir talep; kesin randevu değildir. Klinik uygunluğu kontrol edip sizi arar.
                </p>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
