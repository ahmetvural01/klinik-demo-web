"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { CheckCircle2, Link2Off, Phone, RefreshCw, XCircle } from "lucide-react";
import { DentalMark } from "@/components/brand/DentalMark";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Spinner } from "@/components/ui/Spinner";
import { StatusPage } from "@/components/ui/StatusPage";
import { SMS_CONSENT_EXPLANATION_ITEMS } from "@/lib/sms-consent-copy";

type Decision = "ENABLED" | "DISABLED";
type InvalidStatus = "NOT_FOUND" | "USED" | "EXPIRED" | "SUPERSEDED";

/** Hastanın kliniği tanıyıp arayabilmesi için (api/public/sms-consent alanları). */
type Clinic = { name: string; phone: string | null; logoUrl: string | null };

type LoadState =
  | { phase: "loading" }
  | { phase: "failed"; message: string }
  | { phase: "invalid"; message: string; status: InvalidStatus | null; clinic: Clinic | null }
  | { phase: "ready"; clinic: Clinic; patientInitial: string }
  | { phase: "done"; decision: Decision; clinic: Clinic | null };

const LOAD_FAILED = "Bağlantınızı kontrol edip yeniden deneyin.";

// Duruma özel başlık: hasta neden karar veremediğini ilk satırda okur.
const INVALID_TITLE: Record<InvalidStatus, string> = {
  NOT_FOUND: "Bu bağlantı geçersiz",
  USED: "Tercihiniz bu bağlantıyla kaydedilmiş",
  EXPIRED: "Bağlantının süresi doldu",
  SUPERSEDED: "Size daha yeni bir bağlantı gönderildi",
};
const INVALID_STATUSES: readonly InvalidStatus[] = ["NOT_FOUND", "USED", "EXPIRED", "SUPERSEDED"];

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clinicFrom(data: unknown): Clinic | null {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const name = text(record.institutionName);
  const phone = text(record.institutionPhone);
  if (!name && !phone) return null;
  return { name, phone: phone || null, logoUrl: text(record.logoUrl) || null };
}

function statusFrom(data: unknown): InvalidStatus | null {
  const value = data && typeof data === "object" ? (data as { status?: unknown }).status : undefined;
  return INVALID_STATUSES.find((status) => status === value) ?? null;
}

/** "0322 802 81 62" → "tel:03228028162" (boşluk ve ayraç arama bağlantısını bozar). */
function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function CallClinicButton({ clinic, variant = "primary" }: { clinic: Clinic | null; variant?: "primary" | "secondary" }) {
  if (!clinic?.phone) return null;
  return (
    <Button variant={variant} icon={Phone} href={telHref(clinic.phone)} aria-label={`Kliniği ara: ${clinic.phone}`}>
      Kliniği ara
    </Button>
  );
}

/**
 * Hastanın SMS izni sayfası — telefonda TEK ekran, TEK karar. Önceden 9 madde
 * ayrı kartlarda (anlamsız ikonlarla) listeleniyordu; düğmeler 390 px'te
 * 1072. pikseldeydi, "İzin Vermiyorum"a basınca gösterge yanlış düğmede
 * dönüyordu, ağ hatası "bağlantı kullanılamıyor" diye gösteriliyordu.
 * Madde metinleri sabit yasal metindir (sms-consent-copy.ts) — değiştirilmez.
 */
export default function SmsOnayPage() {
  const params = useParams();
  const token = String(params?.token || "");
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<Decision | null>(null);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetch(`/api/public/sms-consent/${token}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (response.status === 410 || response.status === 404) {
          setState({ phase: "invalid", message: data?.message || "Bu bağlantı geçersiz.", status: statusFrom(data), clinic: clinicFrom(data) });
        } else if (!response.ok) {
          // 429 / sunucu hatası bağlantının geçersiz olduğu anlamına gelmez: yeniden denenebilir.
          setState({ phase: "failed", message: data?.message || LOAD_FAILED });
        } else {
          setState({ phase: "ready", clinic: clinicFrom(data) || { name: "", phone: null, logoUrl: null }, patientInitial: text(data?.patientInitial) });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ phase: "failed", message: LOAD_FAILED });
      });
    return () => controller.abort();
  }, [token, attempt]);

  const submit = async (decision: Decision) => {
    if (pending) return;
    const clinic = state.phase === "ready" ? state.clinic : null;
    setSubmitError("");
    setPending(decision);
    try {
      const response = await fetch(`/api/public/sms-consent/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 410) {
        // Başka sekmede kullanılmış ya da süresi dolmuş: düğmeler artık işe yaramaz.
        setState({ phase: "invalid", message: data?.message || "Bu bağlantı artık geçerli değil.", status: statusFrom(data), clinic });
        return;
      }
      if (!response.ok) {
        setSubmitError(data?.message || "Tercihiniz kaydedilemedi, lütfen yeniden deneyin.");
        return;
      }
      setState({ phase: "done", decision, clinic });
    } catch {
      setSubmitError("Bağlantı kurulamadı, lütfen yeniden deneyin.");
    } finally {
      setPending(null);
    }
  };

  if (state.phase === "loading") {
    return <StatusPage fullScreen tone="info" icon={Spinner} title="Bağlantı kontrol ediliyor…" description={null} />;
  }

  if (state.phase === "failed") {
    return (
      <StatusPage
        fullScreen
        tone="warning"
        title="Sayfa yüklenemedi"
        description={state.message}
        actions={<Button icon={RefreshCw} onClick={() => { setState({ phase: "loading" }); setAttempt((value) => value + 1); }}>Yeniden dene</Button>}
      />
    );
  }

  if (state.phase === "invalid") {
    // Süresi dolmuş / yenisi gönderilmiş mesajları zaten kliniğe yönlendiriyor; tekrar yazılmaz.
    const mentionsClinic = /klini/i.test(state.message);
    return (
      <StatusPage
        fullScreen
        icon={Link2Off}
        title={state.status ? INVALID_TITLE[state.status] : "Bu bağlantı kullanılamıyor"}
        description={(
          <>
            {mentionsClinic ? state.message : `${state.message} Sorunuz varsa kliniğinizle iletişime geçin.`}
            {state.clinic?.name && <span className="mt-1 block font-semibold text-slate-800">{state.clinic.name}</span>}
          </>
        )}
        actions={<CallClinicButton clinic={state.clinic} />}
      />
    );
  }

  if (state.phase === "done") {
    const approved = state.decision === "ENABLED";
    return (
      <StatusPage
        fullScreen
        tone={approved ? "success" : "neutral"}
        icon={approved ? CheckCircle2 : XCircle}
        title={approved ? "İzniniz kaydedildi" : "Tercihiniz kaydedildi"}
        description={approved
          ? "Bu sayfayı kapatabilirsiniz."
          // Gönderim kuralı: izin yoksa hiçbir SMS gitmez (notification-dispatch).
          : "Size randevu hatırlatmaları dahil SMS gönderilmeyecek. Fikrinizi değiştirirseniz kliniğinizle iletişime geçin."}
        actions={approved ? undefined : <CallClinicButton clinic={state.clinic} variant="secondary" />}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-[rgb(var(--app-bg))] px-4 py-5 sm:py-10">
      <section aria-labelledby="sms-onay-baslik" className="mx-auto w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <header className="flex items-start gap-3 border-b border-slate-100 pb-4">
          {/* Kliniğin logosu varsa hasta mesajın kimden geldiğini tanır; yoksa marka işareti. */}
          {state.clinic.logoUrl ? (
            <Image src={state.clinic.logoUrl} alt="" width={40} height={40} unoptimized className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-0.5" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
              <DentalMark className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0">
            {/* Klinik adı kesilmez, sarmalanır (telefonda "…Pol…" diye kesiliyordu). */}
            <p className="break-words text-sm font-bold leading-5 text-slate-900">{state.clinic.name}</p>
            {state.patientInitial && <p className="mt-0.5 text-xs text-slate-500">{state.patientInitial}. adına gönderildi</p>}
          </div>
        </header>

        <h1 id="sms-onay-baslik" className="mt-4 font-display text-xl font-extrabold text-slate-900">SMS izni</h1>
        <p className="mt-1 text-sm leading-6 text-slate-600">Kliniğinizin aşağıdaki konularda size SMS gönderebilmesi için tercihinizi kaydedin.</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700 marker:text-slate-400" aria-label="SMS kullanım amaçları">
          {SMS_CONSENT_EXPLANATION_ITEMS.map((item) => <li key={item}>{item}</li>)}
        </ul>

        {submitError && <Callout tone="critical" role="alert" className="mt-4">{submitError}</Callout>}

        {/* İki seçenek eşit boy ve görünürlükte (rıza özgür olmalı); seçim anında ek onay adımı yok. */}
        <div className="mt-5 grid gap-3">
          <Button fullWidth className="h-12 text-base" loading={pending === "ENABLED"} disabled={pending !== null} onClick={() => void submit("ENABLED")}>
            Onaylıyorum
          </Button>
          <Button variant="secondary" fullWidth className="h-12 text-base" loading={pending === "DISABLED"} disabled={pending !== null} onClick={() => void submit("DISABLED")}>
            Onaylamıyorum
          </Button>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">Seçiminiz kayda alınır ve yalnız bu klinikle iletişiminiz için kullanılır.</p>
      </section>
    </main>
  );
}
