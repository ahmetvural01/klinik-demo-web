"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { CalendarCheck2, CalendarX2, Link2Off, Phone, RefreshCw } from "lucide-react";
import { DentalMark } from "@/components/brand/DentalMark";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Spinner } from "@/components/ui/Spinner";
import { StatusPage } from "@/components/ui/StatusPage";

type PatientAnswer = "GELECEK" | "GELEMEYECEK";
type Clinic = { name: string; phone: string | null; logoUrl: string | null };
type Info = {
  clinic: Clinic;
  dateText: string;
  doctorName: string;
  open: boolean;
  closedReason: "CANCELLED" | "PAST" | "DONE" | null;
  response: PatientAnswer | null;
};

type State =
  | { phase: "loading" }
  | { phase: "failed"; message: string }
  | { phase: "invalid" }
  | { phase: "ready"; info: Info };

const LOAD_FAILED = "Bağlantınızı kontrol edip yeniden deneyin.";

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function CallClinic({ clinic }: { clinic: Clinic }) {
  if (!clinic.phone) return null;
  return <Button variant="secondary" icon={Phone} href={telHref(clinic.phone)} fullWidth className="h-12 text-base">Kliniği ara</Button>;
}

/**
 * Hatırlatma mesajındaki bağlantı: hasta tek dokunuşla geleceğini ya da
 * gelemeyeceğini bildirir. Gelemeyecekse randevu iptal edilir ve klinik
 * yeni randevu için hastayı arar (takip kendiliğinden açılır).
 */
export default function RandevuOnayPage() {
  const params = useParams();
  const token = String(params?.token || "");
  const [state, setState] = useState<State>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<PatientAnswer | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetch(`/api/public/appointment-response/${token}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (response.status === 404) setState({ phase: "invalid" });
        else if (!response.ok) setState({ phase: "failed", message: data?.message || LOAD_FAILED });
        else setState({ phase: "ready", info: data as Info });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ phase: "failed", message: LOAD_FAILED });
      });
    return () => controller.abort();
  }, [token, attempt]);

  const submit = async (answer: PatientAnswer) => {
    if (pending || state.phase !== "ready") return;
    const info = state.info;
    setPending(answer);
    setError("");
    try {
      const result = await fetch(`/api/public/appointment-response/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: answer }),
      });
      const data = await result.json().catch(() => ({}));
      if (!result.ok) {
        setError(data?.message || "Yanıtınız kaydedilemedi, lütfen yeniden deneyin.");
        // Randevu bu arada iptal edildi ya da saati geçti: güncel durum gösterilir.
        if (result.status === 410) setAttempt((value) => value + 1);
        return;
      }
      setState({
        phase: "ready",
        info: { ...info, response: answer, open: answer === "GELECEK", closedReason: answer === "GELEMEYECEK" ? "CANCELLED" : null },
      });
      setConfirmCancel(false);
    } catch {
      setError("Bağlantı kurulamadı, lütfen yeniden deneyin.");
    } finally {
      setPending(null);
    }
  };

  if (state.phase === "loading") return <StatusPage fullScreen tone="info" icon={Spinner} title="Randevunuz açılıyor…" description={null} />;
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
    return <StatusPage fullScreen icon={Link2Off} title="Bu bağlantı geçersiz" description="Sorunuz varsa kliniğinizi arayın." />;
  }

  const { info } = state;
  const declined = info.response === "GELEMEYECEK";
  const confirmed = info.response === "GELECEK" && info.open;

  return (
    <main className="min-h-dvh bg-[rgb(var(--app-bg))] px-4 py-5 sm:py-10">
      <section aria-labelledby="randevu-onay-baslik" className="mx-auto w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <header className="flex items-start gap-3 border-b border-slate-100 pb-4">
          {info.clinic.logoUrl ? (
            <Image src={info.clinic.logoUrl} alt="" width={40} height={40} unoptimized className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-0.5" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
              <DentalMark className="h-6 w-6" />
            </span>
          )}
          <p className="min-w-0 break-words text-sm font-bold leading-5 text-slate-900">{info.clinic.name}</p>
        </header>

        <h1 id="randevu-onay-baslik" className="mt-4 font-display text-xl font-extrabold text-slate-900">Randevunuz</h1>
        <p className="mt-1 text-base font-semibold text-slate-900">{info.dateText}</p>
        <p className="text-sm text-slate-600">{info.doctorName}</p>

        {error && <Callout tone="critical" role="alert" className="mt-4">{error}</Callout>}

        {declined ? (
          <div className="mt-5 space-y-3">
            <Callout tone="info" icon={CalendarX2} title="Randevunuz iptal edildi">
              Klinik yeni bir randevu için sizi arayacak.
            </Callout>
            <CallClinic clinic={info.clinic} />
          </div>
        ) : !info.open ? (
          <div className="mt-5 space-y-3">
            <Callout tone="info">
              {info.closedReason === "CANCELLED" ? "Bu randevu iptal edilmiş." : info.closedReason === "PAST" ? "Randevu saati geçti." : "Bu randevu için yanıt gerekmiyor."}
            </Callout>
            <CallClinic clinic={info.clinic} />
          </div>
        ) : confirmCancel ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-slate-700">Randevunuz iptal edilecek ve saat başka bir hastaya verilebilecek. Emin misiniz?</p>
            <Button variant="danger" fullWidth className="h-12 text-base" loading={pending === "GELEMEYECEK"} disabled={pending !== null} onClick={() => void submit("GELEMEYECEK")}>
              Evet, iptal et
            </Button>
            <Button variant="secondary" fullWidth className="h-12 text-base" disabled={pending !== null} onClick={() => setConfirmCancel(false)}>
              Vazgeç
            </Button>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {confirmed ? (
              <Callout tone="success" icon={CalendarCheck2} title="Geleceğiniz kaydedildi">
                Sizi bekliyoruz. Fikriniz değişirse aşağıdan bildirebilirsiniz.
              </Callout>
            ) : (
              <Button fullWidth className="h-12 text-base" loading={pending === "GELECEK"} disabled={pending !== null} onClick={() => void submit("GELECEK")}>
                Geleceğim
              </Button>
            )}
            <Button variant="secondary" fullWidth className="h-12 text-base" disabled={pending !== null} onClick={() => setConfirmCancel(true)}>
              Gelemeyeceğim
            </Button>
            <CallClinic clinic={info.clinic} />
          </div>
        )}
      </section>
    </main>
  );
}
