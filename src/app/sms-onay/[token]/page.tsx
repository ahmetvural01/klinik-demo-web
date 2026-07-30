"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SMS_CONSENT_EXPLANATION_ITEMS } from "@/lib/sms-consent-copy";

type LoadState =
  | { phase: "loading" }
  | { phase: "invalid"; message: string }
  | { phase: "ready"; institutionName: string; patientInitial: string }
  | { phase: "done"; decision: "ENABLED" | "DISABLED" };

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
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
      </main>
    );
  }

  if (state.phase === "invalid") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-700">{state.message}</p>
        </div>
      </main>
    );
  }

  if (state.phase === "done") {
    const approved = state.decision === "ENABLED";
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div
          className={`max-w-sm rounded-2xl border p-6 text-center shadow-sm ${
            approved ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
          }`}
        >
          <div
            className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-2xl ${
              approved ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {approved ? "✓" : "✕"}
          </div>
          <p className={`text-base font-bold ${approved ? "text-emerald-800" : "text-slate-700"}`}>
            Tercihiniz kaydedildi
          </p>
          <p className={`mt-1 text-sm ${approved ? "text-emerald-700" : "text-slate-500"}`}>
            {approved
              ? "SMS ile iletişim onayınız kaydedildi. Bu ekranı kapatabilirsiniz."
              : "SMS ile iletişim izniniz kaydedildi. Fikrinizi değiştirirseniz kliniğinizle iletişime geçebilirsiniz."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{state.institutionName}</p>
        <h1 className="mt-1 text-lg font-bold text-slate-800">SMS İletişim İzni</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Kliniğimiz tarafından size;
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-600">
          {SMS_CONSENT_EXPLANATION_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          gibi SMS&apos;ler gönderebilmemiz için onayınız gerekmektedir.
        </p>

        {submitError && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{submitError}</p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => submit("ENABLED")}
            className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
          >
            ONAYLIYORUM
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => submit("DISABLED")}
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
          >
            ONAYLAMIYORUM
          </button>
        </div>
      </div>
    </main>
  );
}
