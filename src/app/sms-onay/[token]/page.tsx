"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  BellRing,
  CalendarCheck2,
  Check,
  CheckCircle2,
  LoaderCircle,
  MessageSquareText,
  ShieldCheck,
  X,
} from "lucide-react";
import { DentalMark } from "@/components/brand/DentalMark";
import { SMS_CONSENT_EXPLANATION_ITEMS } from "@/lib/sms-consent-copy";

type LoadState =
  | { phase: "loading" }
  | { phase: "invalid"; message: string }
  | { phase: "ready"; institutionName: string; patientInitial: string }
  | { phase: "done"; decision: "ENABLED" | "DISABLED" };

const itemIcons = [CalendarCheck2, BellRing, MessageSquareText];

export default function SmsOnayPage() {
  const params = useParams();
  const token = String(params?.token || "");
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/public/sms-consent/${token}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setState({ phase: "invalid", message: data?.message || "Bu bağlantı geçersiz." });
          return;
        }
        setState({ phase: "ready", institutionName: data.institutionName || "", patientInitial: data.patientInitial || "H" });
      })
      .catch(() => setState({ phase: "invalid", message: "Bağlantı hatası, lütfen tekrar deneyin." }));
  }, [token]);

  const submit = async (decision: "ENABLED" | "DISABLED") => {
    setSubmitError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/sms-consent/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data?.message || "Tercihiniz kaydedilemedi, lütfen tekrar deneyin.");
        return;
      }
      setState({ phase: "done", decision });
    } catch {
      setSubmitError("Bağlantı hatası, lütfen tekrar deneyin.");
    } finally {
      setSubmitting(false);
    }
  };

  if (state.phase === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f8f7] p-4" aria-busy="true">
        <div className="text-center text-teal-800">
          <LoaderCircle className="mx-auto h-9 w-9 animate-spin" />
          <p className="mt-3 text-sm font-semibold">Onay bağlantısı kontrol ediliyor</p>
        </div>
      </main>
    );
  }

  if (state.phase === "invalid") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f8f7] p-5">
        <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 text-center shadow-[0_24px_70px_-36px_rgba(15,118,110,0.35)]">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-600"><ShieldCheck className="h-7 w-7" /></span>
          <h1 className="mt-5 text-xl font-bold text-slate-950">Bağlantı kullanılamıyor</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{state.message}</p>
          <p className="mt-4 text-xs leading-5 text-slate-400">Yeni bir izin bağlantısı için kliniğinizle iletişime geçebilirsiniz.</p>
        </section>
      </main>
    );
  }

  if (state.phase === "done") {
    const approved = state.decision === "ENABLED";
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f8f7] p-5">
        <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 text-center shadow-[0_24px_70px_-36px_rgba(15,118,110,0.35)]">
          <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${approved ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
            {approved ? <Check className="h-7 w-7" strokeWidth={2.5} /> : <X className="h-7 w-7" />}
          </span>
          <h1 className="mt-5 text-xl font-bold text-slate-950">Tercihiniz kaydedildi</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {approved
              ? "SMS iletişim izniniz etkinleştirildi. Bu ekranı güvenle kapatabilirsiniz."
              : "SMS iletişim izni vermeme tercihiniz kaydedildi. Fikrinizi değiştirirseniz kliniğinizle iletişime geçebilirsiniz."}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f8f7] px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_28px_80px_-40px_rgba(15,118,110,0.38)]">
        <header className="border-b border-slate-100 bg-[#f8fbfa] px-6 py-6 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100"><DentalMark className="h-7 w-7" /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-950">{state.institutionName}</p>
                <p className="mt-0.5 text-xs text-slate-500">Güvenli iletişim tercihi</p>
              </div>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white" aria-label="Hasta baş harfi">{state.patientInitial}</span>
          </div>
        </header>

        <div className="px-6 py-7 sm:px-8 sm:py-9">
          <div className="flex items-start gap-4">
            <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 sm:flex"><MessageSquareText className="h-6 w-6" /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">SMS iletişim izni</p>
              <h1 className="mt-1.5 text-2xl font-bold text-slate-950">İletişim tercihinizi belirleyin</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">Kliniğinizin aşağıdaki konularda size SMS gönderebilmesi için tercihinizi kaydedin.</p>
            </div>
          </div>

          <ul className="mt-6 grid gap-3" aria-label="SMS kullanım amaçları">
            {SMS_CONSENT_EXPLANATION_ITEMS.map((item, index) => {
              const Icon = itemIcons[index % itemIcons.length];
              return (
                <li key={item} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700"><Icon className="h-4 w-4" /></span>
                  <span className="text-sm leading-6 text-slate-700">{item}</span>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 flex items-start gap-2.5 rounded-lg bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
            <p>Tercihiniz yalnızca bu klinikle iletişiminiz için kullanılır ve seçiminiz kayda alınır.</p>
          </div>

          {submitError && <p role="alert" aria-live="polite" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">{submitError}</p>}

          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button type="button" disabled={submitting} onClick={() => void submit("ENABLED")} className="flex h-12 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-bold text-white shadow-[0_10px_24px_-12px_rgba(15,118,110,0.9)] transition hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60">
              {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} İzin Veriyorum
            </button>
            <button type="button" disabled={submitting} onClick={() => void submit("DISABLED")} className="flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">
              <X className="h-4 w-4" /> İzin Vermiyorum
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
