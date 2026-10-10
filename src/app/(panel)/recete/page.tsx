"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { formatDate, formatPhoneNumber } from "@/lib/format";

type Drug = { name: string; dose?: string; usage?: string; duration?: string; note?: string };

type PrintData = {
  prescription: {
    id: string;
    patientId: string;
    drugs: string;
    note?: string | null;
    createdAt: string;
    status?: string;
    voidedAt?: string | null;
    doctor?: { id: string; fullName: string } | null;
  };
  clinic: { name: string; address: string; phone: string };
  patient: {
    id: string;
    fullName: string;
    tcNo: string | null;
    tcHidden: boolean;
    isForeigner?: boolean;
    birthDate?: string | null;
    gender?: string | null;
    phone: string | null;
  };
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: PrintData }
  | { status: "missing"; message: string }
  | { status: "error"; message: string };

// Yazdırırken yalnız reçete belgesi basılır (ekrandaki önizleme ile kâğıt AYNI
// bileşendir). Önceden yazdırma ayrı bir HTML şablonunu innerHTML ile
// oluşturuyordu: ilaç adı / hekim notu kaçışsız basıldığı için not alanına
// yazılan HTML/JS reçeteyi basan kişinin oturumunda çalışıyordu (saklı XSS);
// iptal edilmiş reçete de kâğıtta "REÇETE" yazıyordu.
const PRINT_CSS = `
@media print {
  @page { size: A5 portrait; margin: 7mm; }
  body * { visibility: hidden !important; }
  #rx-document, #rx-document * { visibility: visible !important; }
  #rx-document { position: fixed !important; left: 0; top: 0; width: 100% !important; max-width: none !important; min-height: 0 !important; margin: 0 !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

function parseDrugs(raw: string): Drug[] {
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        name: String(item.name ?? ""),
        dose: typeof item.dose === "string" ? item.dose : "",
        usage: typeof item.usage === "string" ? item.usage : "",
        duration: typeof item.duration === "string" ? item.duration : "",
        note: typeof item.note === "string" ? item.note : "",
      }))
      .filter((drug) => drug.name.trim());
  } catch {
    // Eski kayıtlarda ilaçlar satır satır düz metin.
    return String(raw || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => ({ name: line }));
  }
}

function genderLabel(gender?: string | null) {
  const value = (gender || "").toUpperCase();
  if (value === "ERKEK" || value === "M" || value === "E") return "Erkek";
  if (value === "KADIN" || value === "F" || value === "K") return "Kadın";
  return "";
}

function ageOf(birthDate?: string | null) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

/** Elle doldurulacak boş satır (ör. T.C. numarasını görme yetkisi olmayan kullanıcının çıktısında). */
function BlankLine({ width = "w-32" }: { width?: string }) {
  return <span aria-label="boş" className={`inline-block ${width} border-b border-slate-400 align-bottom`}>&nbsp;</span>;
}

function PrescriptionDocument({ data }: { data: PrintData }) {
  const { prescription, clinic, patient } = data;
  const drugs = parseDrugs(prescription.drugs);
  const isVoid = prescription.status === "VOID";
  const gender = genderLabel(patient.gender);
  const age = ageOf(patient.birthDate);
  const contactLine = [clinic.address, clinic.phone ? formatPhoneNumber(clinic.phone) : ""].filter(Boolean).join(" · ");

  return (
    <article
      id="rx-document"
      aria-label="Reçete belgesi"
      className="relative mx-auto flex w-full max-w-[148mm] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-6 text-slate-800 shadow-sm sm:min-h-[210mm]"
    >
      {isVoid && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-[24deg] rounded-lg border-4 border-red-500/60 px-6 py-2 text-3xl font-black tracking-[0.2em] text-red-500/60">İPTAL EDİLMİŞTİR</span>
        </div>
      )}

      <header className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold leading-tight text-slate-900">{clinic.name || <BlankLine width="w-48" />}</h2>
          {contactLine && <p className="mt-1 text-xs text-slate-600">{contactLine}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-lg font-black tracking-[0.18em] ${isVoid ? "text-red-600" : "text-slate-900"}`}>{isVoid ? "İPTAL EDİLMİŞ REÇETE" : "REÇETE"}</p>
          <p className="mt-0.5 text-xs text-slate-600">{formatDate(prescription.createdAt)}</p>
        </div>
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
        <div className="col-span-2 sm:col-span-1"><dt className="inline text-slate-500">Ad Soyad: </dt><dd className="inline font-semibold text-slate-900">{patient.fullName}</dd></div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="inline text-slate-500">T.C. No: </dt>
          <dd className="inline font-semibold tabular-nums text-slate-900">{patient.tcNo || <BlankLine />}</dd>
        </div>
        {(gender || age !== null) && (
          <div><dt className="inline text-slate-500">Cinsiyet / yaş: </dt><dd className="inline text-slate-800">{[gender, age !== null ? `${age} yaş` : ""].filter(Boolean).join(", ")}</dd></div>
        )}
        {patient.birthDate && (
          <div><dt className="inline text-slate-500">Doğum tarihi: </dt><dd className="inline tabular-nums text-slate-800">{new Date(patient.birthDate).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</dd></div>
        )}
        {patient.phone && (
          <div><dt className="inline text-slate-500">Telefon: </dt><dd className="inline tabular-nums text-slate-800">{formatPhoneNumber(patient.phone)}</dd></div>
        )}
      </dl>

      <section className="mt-4 flex-1" aria-label="İlaçlar">
        <h3 className="border-b border-slate-800 pb-1 text-xs font-bold uppercase tracking-wider text-slate-800">İlaçlar</h3>
        {drugs.length === 0 ? (
          <p className="mt-2 text-xs italic text-slate-500">Reçeteye ilaç eklenmemiş.</p>
        ) : (
          <ol className="mt-2 space-y-2.5">
            {drugs.map((drug, index) => (
              <li key={`${drug.name}-${index}`} className="border-b border-dashed border-slate-200 pb-2">
                <p className="text-sm font-semibold text-slate-900">{index + 1}. {drug.name}</p>
                {[drug.dose, drug.usage, drug.duration].some(Boolean) && (
                  <p className="mt-0.5 text-xs text-slate-700">{[drug.dose, drug.usage, drug.duration].filter(Boolean).join(" · ")}</p>
                )}
                {drug.note && <p className="mt-0.5 text-xs italic text-slate-500">Not: {drug.note}</p>}
              </li>
            ))}
          </ol>
        )}
        {prescription.note && (
          <div className="mt-3 rounded-md border border-slate-300 px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Tanı / hekim notu</p>
            {/* Düz metin olarak basılır (HTML yorumlanmaz). */}
            <p className="mt-0.5 whitespace-pre-line text-xs text-slate-800">{prescription.note}</p>
          </div>
        )}
      </section>

      <footer className="mt-8 flex justify-end">
        <div className="min-w-[10rem] border-t border-slate-500 pt-1 text-center">
          <p className="text-xs font-semibold text-slate-900">{prescription.doctor?.fullName || <BlankLine />}</p>
          <p className="text-[11px] text-slate-500">İmza / Kaşe</p>
        </div>
      </footer>
    </article>
  );
}

export default function PrescriptionPage() {
  const { can } = usePermissions();
  const search = useSearchParams();
  const prescriptionId = search.get("id") || "";
  const patientIdParam = search.get("patientId") || "";

  // İlk çizimde "bulunamadı" yanıp sönmesin: kimlik varsa yükleniyor ile başlar.
  const [state, setState] = useState<LoadState>(() => (prescriptionId ? { status: "loading" } : { status: "missing", message: "Reçete seçilmedi." }));

  const load = useCallback(async () => {
    if (!prescriptionId) {
      setState({ status: "missing", message: "Reçete seçilmedi." });
      return;
    }
    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/prescriptions/${encodeURIComponent(prescriptionId)}?print=1`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (response.status === 404) {
        setState({ status: "missing", message: body?.message || "Reçete bulunamadı." });
        return;
      }
      if (!response.ok || !body?.prescription) throw new Error(body?.message || "Reçete yüklenemedi.");
      setState({ status: "ready", data: body as PrintData });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Reçete yüklenemedi." });
    }
  }, [prescriptionId]);

  useEffect(() => { void load(); }, [load]);

  const data = state.status === "ready" ? state.data : null;
  const patientId = data?.patient.id || patientIdParam;
  const backHref = patientId ? `/hasta-detay?id=${encodeURIComponent(patientId)}&tab=recete` : "/hasta";
  const isVoid = data?.prescription.status === "VOID";

  // "Kaydet ve yazdır"dan gelindiyse (?yazdir=1) reçete çizilince yazdırma
  // penceresi bir kez açılır; iptal edilmiş reçete yazdırılmaz. Parametre
  // adresten silinir: yenileme ya da geri dönüş yeniden yazdırmasın.
  const wantsPrint = search.get("yazdir") === "1";
  const printedRef = useRef(false);
  const readyToPrint = state.status === "ready" && !isVoid;
  useEffect(() => {
    if (!wantsPrint || !readyToPrint || printedRef.current) return;
    // Sayfa (ve yazı tipleri) çizildikten sonra.
    const timer = window.setTimeout(() => {
      printedRef.current = true;
      window.print();
      const params = new URLSearchParams(window.location.search);
      params.delete("yazdir");
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [wantsPrint, readyToPrint]);

  const missingClinic = data ? [!data.clinic.name && "klinik adı", !data.clinic.address && "adres", !data.clinic.phone && "telefon"].filter(Boolean) : [];

  return (
    <section className="mx-auto max-w-4xl space-y-3 pb-8">
      <style>{PRINT_CSS}</style>
      <PageHeader
        icon="clipboard"
        title="Reçete"
        back={{ href: backHref, label: patientId ? "Hasta dosyası" : "Hastalar" }}
        description={data ? [data.patient.fullName, formatDate(data.prescription.createdAt), data.prescription.doctor?.fullName].filter(Boolean).join(" · ") : undefined}
        actions={data ? (
          <Button icon={Printer} onClick={() => window.print()} disabled={isVoid} title={isVoid ? "İptal edilmiş reçete yazdırılamaz" : undefined}>
            Yazdır
          </Button>
        ) : undefined}
      />

      {state.status === "loading" && <PageSkeleton header={false} body="form" rows={6} columns={1} label="Reçete yükleniyor" />}
      {state.status === "error" && <LoadErrorState message={state.message} onRetry={() => void load()} />}
      {state.status === "missing" && (
        <EmptyState
          title={state.message}
          description="Reçeteyi hasta dosyasının Reçete sekmesinden açın."
          action={<Button variant="secondary" href={backHref}>{patientId ? "Hasta dosyasına dön" : "Hastalar"}</Button>}
        />
      )}

      {data && (
        <>
          {isVoid && (
            <Callout tone="critical" compact role="alert">
              Bu reçete {data.prescription.voidedAt ? `${formatDate(data.prescription.voidedAt)} tarihinde ` : ""}iptal edildi; yazdırılamaz.
            </Callout>
          )}
          {missingClinic.length > 0 && (
            <Callout
              tone="warning"
              compact
              action={can("settings:write") ? <Button size="sm" variant="secondary" href="/ayar">Ayarlar</Button> : undefined}
            >
              Klinik bilgilerinde {missingClinic.join(", ")} girilmemiş; çıktıda bu satır boş kalır.
            </Callout>
          )}
          {data.patient.tcHidden && (
            <Callout tone="neutral" compact>T.C. kimlik numarasını görme yetkiniz olmadığı için çıktıda boş bırakıldı; elle yazılabilir.</Callout>
          )}
          <PrescriptionDocument data={data} />
        </>
      )}
    </section>
  );
}
