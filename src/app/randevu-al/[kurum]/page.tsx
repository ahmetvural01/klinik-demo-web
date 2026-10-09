"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  LoaderCircle,
  LockKeyhole,
  Phone,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { DentalMark } from "@/components/brand/DentalMark";
import { checkWorkingDay, type DaySchedule } from "@/lib/working-hours-core";

type Doctor = { id: string; fullName: string };
type Branch = { id: string; name: string; city?: string | null; district?: string | null };

const fieldClass =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10";

function PublicState({
  title,
  description,
  tone = "neutral",
}: {
  title: string;
  description: string;
  tone?: "neutral" | "success";
}) {
  const success = tone === "success";
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f8f7] p-5">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 text-center shadow-[0_24px_70px_-36px_rgba(15,118,110,0.35)]">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${success ? "bg-emerald-50 text-emerald-700" : "bg-teal-50 text-teal-700"}`}>
          {success ? <Check className="h-7 w-7" strokeWidth={2.5} /> : <DentalMark className="h-8 w-8" />}
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-950">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      </section>
    </main>
  );
}

export default function RandevuAlPage() {
  const params = useParams();
  const kurum = String(params?.kurum || "");

  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [institutionName, setInstitutionName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [dailySchedules, setDailySchedules] = useState<DaySchedule[]>([]);
  const [notFound, setNotFound] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [tcNo, setTcNo] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const [code, setCode] = useState("");
  const [codeSentTo, setCodeSentTo] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [codeError, setCodeError] = useState("");
  const phoneValid = /^0?5\d{9}$/.test(phone);
  const codeSent = codeSentTo === phone && codeSentTo !== "";

  const sendCode = async () => {
    setCodeError("");
    if (!phoneValid) {
      setCodeError("Geçerli bir cep telefonu numarası girin.");
      return;
    }
    setSendingCode(true);
    try {
      const res = await fetch("/api/public/booking/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kurum, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCodeError(data?.error || "Kod gönderilemedi.");
        return;
      }
      setCodeSentTo(phone);
      setCode("");
    } catch {
      setCodeError("Bağlantı hatası, lütfen tekrar deneyin.");
    } finally {
      setSendingCode(false);
    }
  };

  useEffect(() => {
    if (!kurum) return;
    const query = new URLSearchParams({ kurum });
    if (branchId) query.set("branchId", branchId);
    setLoadingDoctors(true);
    fetch(`/api/public/booking/doctors?${query.toString()}`)
      .then(async (r) => {
        if (!r.ok) {
          setNotFound(true);
          return;
        }
        const data = await r.json();
        setInstitutionName(data.institutionName || "");
        setLogoUrl(typeof data.logoUrl === "string" && data.logoUrl ? data.logoUrl : null);
        setDoctors(Array.isArray(data.doctors) ? data.doctors : []);
        setBranches(Array.isArray(data.branches) ? data.branches : []);
        if (typeof data.selectedBranchId === "string" && data.selectedBranchId !== branchId) {
          setBranchId(data.selectedBranchId);
        }
        setDailySchedules(Array.isArray(data.dailySchedules) ? data.dailySchedules : []);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingDoctors(false));
  }, [kurum, branchId]);

  const preferredDateError = useMemo(
    () =>
      preferredDate && dailySchedules.length > 0
        ? checkWorkingDay(preferredDate, dailySchedules, "Randevu talebi")
        : null,
    [preferredDate, dailySchedules]
  );

  const submit = async () => {
    setError("");
    if (fullName.trim().length < 3) {
      setError("Lütfen ad soyad girin.");
      return;
    }
    if (!/^0\d{10}$/.test(phone)) {
      setError("Telefon numarası 0 ile başlamalı ve 11 haneli olmalı.");
      return;
    }
    if (!codeSent) {
      setError("Önce telefon numaranızı doğrulayın.");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("Lütfen telefonunuza gelen 6 haneli kodu girin.");
      return;
    }
    if (!preferredDate) {
      setError("Lütfen tercih ettiğiniz tarihi seçin.");
      return;
    }
    if (preferredDateError) {
      setError(preferredDateError);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/public/booking", {
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
          preferredFrom: new Date(preferredDate).toISOString(),
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Talep gönderilemedi, lütfen tekrar deneyin.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Bağlantı hatası, lütfen tekrar deneyin.");
    } finally {
      setSubmitting(false);
    }
  };

  const minDate = (() => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  })();

  if (loadingDoctors) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f8f7] p-4" aria-busy="true">
        <div className="text-center text-teal-800">
          <LoaderCircle className="mx-auto h-9 w-9 animate-spin" />
          <p className="mt-3 text-sm font-semibold">Klinik bilgileri hazırlanıyor</p>
        </div>
      </main>
    );
  }

  if (notFound) {
    return <PublicState title="Klinik bağlantısı bulunamadı" description="Bağlantı eksik veya artık kullanılmıyor olabilir. Kliniğinizden güncel randevu bağlantısını isteyin." />;
  }

  if (submitted) {
    return (
      <PublicState
        tone="success"
        title="Randevu talebiniz alındı"
        description={`${institutionName} ekibi talebinizi değerlendirecek ve randevuyu kesinleştirmek için sizinle iletişime geçecek.`}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f8f7] px-4 py-6 sm:px-6 lg:flex lg:items-center lg:py-10">
      <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_30px_90px_-42px_rgba(15,118,110,0.4)] lg:grid-cols-[0.82fr_1.18fr]">
        <aside className="relative hidden min-h-[760px] overflow-hidden bg-slate-900 lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marketing/auth-dental-clinic.webp" alt="Modern diş kliniğinde dental koltuk ve dijital diş anatomisi ekranı" className="absolute inset-0 h-full w-full object-cover object-left" />
          <div className="absolute inset-0 bg-slate-950/48" />
          <div className="absolute inset-x-0 bottom-0 p-10 text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm">
              <BadgeCheck className="h-4 w-4 text-teal-200" /> Güvenli randevu talebi
            </div>
            <h2 className="mt-5 max-w-sm text-3xl font-bold leading-tight">Kliniğinize ulaşmanın en kolay yolu</h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-white/80">Tercihinizi iletin; klinik ekibi uygunluğu kontrol edip randevunuzu sizinle birlikte netleştirsin.</p>
            <div className="mt-7 grid gap-3 text-sm">
              <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-teal-200" /> Telefon doğrulamalı güvenli talep</div>
              <div className="flex items-center gap-3"><Clock3 className="h-5 w-5 text-teal-200" /> Klinik çalışma günlerine göre seçim</div>
            </div>
          </div>
        </aside>

        <section className="p-5 sm:p-8 lg:p-10">
          <header className="flex items-start gap-3 border-b border-slate-100 pb-6">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`${institutionName || "Kurum"} logosu`} className="h-12 w-12 rounded-lg border border-slate-200 bg-white object-contain p-1" />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                <DentalMark className="h-8 w-8" />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Online randevu</p>
              <h1 className="mt-1 break-words text-2xl font-bold text-slate-950">{institutionName || "Randevu talebi"}</h1>
              <p className="mt-1 text-sm text-slate-500">Bilgilerinizi iletin, klinik ekibi sizinle iletişime geçsin.</p>
            </div>
          </header>

          <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            {branches.length > 1 && (
              <div className="sm:col-span-2">
                <label htmlFor="booking-branch" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Building2 className="h-3.5 w-3.5 text-teal-600" /> Şube <span className="text-rose-500">*</span></label>
                <select
                  id="booking-branch"
                  name="branch"
                  value={branchId}
                  onChange={(event) => { setBranchId(event.target.value); setDoctorId(""); setError(""); }}
                  className={fieldClass}
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}{branch.district ? ` - ${branch.district}` : branch.city ? ` - ${branch.city}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label htmlFor="booking-name" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><UserRound className="h-3.5 w-3.5 text-teal-600" /> Ad Soyad <span className="text-rose-500">*</span></label>
              <input aria-label={"Adınız ve soyadınız"} id="booking-name" name="name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Adınız ve soyadınız" className={fieldClass} />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="booking-phone" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Phone className="h-3.5 w-3.5 text-teal-600" /> Cep Telefonu <span className="text-rose-500">*</span></label>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input aria-label={"Telefon numarası"} id="booking-phone" name="tel" autoComplete="tel" value={phone} onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 11)); setCodeError(""); }} placeholder="05XX XXX XX XX" inputMode="numeric" className={fieldClass} />
                <button type="button" onClick={() => void sendCode()} disabled={!phoneValid || sendingCode} className="h-11 rounded-lg border border-teal-700 px-4 text-xs font-bold text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400">
                  {sendingCode ? "Gönderiliyor..." : codeSent ? "Kodu Yenile" : "Doğrulama Kodu Gönder"}
                </button>
              </div>
              {codeError && <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-600">{codeError}</p>}
            </div>

            {codeSent && (
              <div className="sm:col-span-2">
                <label htmlFor="booking-code" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><LockKeyhole className="h-3.5 w-3.5 text-emerald-600" /> SMS Doğrulama Kodu <span className="text-rose-500">*</span></label>
                <input aria-label={"6 haneli kod"} id="booking-code" name="one-time-code" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 haneli kod" inputMode="numeric" className={`${fieldClass} border-emerald-200 bg-emerald-50/40 font-semibold tracking-[0.22em]`} />
              </div>
            )}

            <div>
              <label htmlFor="booking-tc" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><ShieldCheck className="h-3.5 w-3.5 text-teal-600" /> TC Kimlik No <span className="font-normal text-slate-400">(isteğe bağlı)</span></label>
              <input aria-label={"TC kimlik numarası"} id="booking-tc" name="national-id" value={tcNo} onChange={(e) => setTcNo(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="11 haneli" inputMode="numeric" className={fieldClass} />
            </div>

            <div>
              <label htmlFor="booking-doctor" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Stethoscope className="h-3.5 w-3.5 text-teal-600" /> Doktor <span className="font-normal text-slate-400">(isteğe bağlı)</span></label>
              <select id="booking-doctor" name="doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} disabled={doctors.length === 0} className={`${fieldClass} disabled:bg-slate-50 disabled:text-slate-400`}>
                <option value="">{doctors.length > 0 ? "Tercihim yok" : "Uygun doktor klinikçe atanacak"}</option>
                {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.fullName}</option>)}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="booking-date" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><CalendarDays className="h-3.5 w-3.5 text-teal-600" /> Tercih Ettiğiniz Gün <span className="text-rose-500">*</span></label>
              <input id="booking-date" name="date" type="date" min={minDate} value={preferredDate} onChange={(e) => { setPreferredDate(e.target.value); setError(""); }} className={fieldClass} />
              {preferredDateError && <p role="alert" className="mt-1.5 text-xs font-semibold text-amber-700">{preferredDateError}</p>}
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="booking-note" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><FileText className="h-3.5 w-3.5 text-teal-600" /> Kısa Not <span className="font-normal text-slate-400">(isteğe bağlı)</span></label>
              <textarea aria-label={"Şikayetiniz veya tercih ettiğiniz saat aralığı"} id="booking-note" name="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Şikayetiniz veya tercih ettiğiniz saat aralığı" className={`${fieldClass} h-auto min-h-24 resize-y py-3`} />
            </div>

            {error && <p role="alert" aria-live="polite" className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">{error}</p>}

            <div className="sm:col-span-2">
              <button type="submit" disabled={submitting || Boolean(preferredDateError) || !codeSent || code.length !== 6} className="group flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 text-sm font-bold text-white shadow-[0_10px_24px_-12px_rgba(15,118,110,0.9)] transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
                {submitting ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Gönderiliyor</> : <>Randevu Talebini Gönder <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}
              </button>
              <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">Bu işlem kesin randevu oluşturmaz. Klinik uygunluğu kontrol ettikten sonra sizinle iletişime geçer.</p>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
