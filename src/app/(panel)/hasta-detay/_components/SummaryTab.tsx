"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { CalendarClock, CalendarPlus, FlaskConical, Stethoscope, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { DescriptionList, type DescriptionItem } from "@/components/ui/DescriptionList";
import { IconFrame, type IconAccent } from "@/components/ui/IconFrame";
import { Textarea } from "@/components/ui/Input";
import { formatDateText } from "@/components/ui/Money";
import { showToastSafe } from "@/lib/toast-client";
import { getOrderSummary, LAB_STAGE_LABEL, stageDetail } from "@/lib/lab-workflow";
import { usePatientFile } from "./PatientFileContext";
import {
  errorMessageOf,
  getItemDueDate,
  getItemRemaining,
  isOpenInstallment,
  isPendingExam,
  money,
  roundMoney,
  type SmsPreference,
} from "./patient-file-shared";
import { SmsConsentCard } from "./SmsConsentCard";
import { TasksSection } from "./TasksSection";

type NextStep = {
  id: string;
  icon: ComponentType<{ className?: string }>;
  tone: "critical" | "warning" | "info" | "neutral";
  title: string;
  detail: string;
  action?: { label: string; onClick?: () => void; href?: string };
};

const TONE_ACCENT: Record<NextStep["tone"], IconAccent> = {
  critical: "rose",
  warning: "amber",
  info: "teal",
  neutral: "neutral",
};

type NoteEntry = { at: string; author: string; text: string };

/**
 * Hasta notu tek metin olarak saklanır; her ek "[tarih saat - kişi] not"
 * satırıyla sona eklenir. Ekranda en yeni not en üstte, kim ve ne zaman
 * yazdığıyla gösterilir. Bu biçime uymayan eski notlar olduğu gibi kalır.
 */
function parseNotes(notes?: string | null): NoteEntry[] {
  if (!notes?.trim()) return [];
  const entries: NoteEntry[] = [];
  for (const line of notes.split(/\r?\n/)) {
    const match = line.match(/^\[([^\]]+?) - ([^\]]+)\]\s?(.*)$/);
    if (match) entries.push({ at: match[1].trim(), author: match[2].trim(), text: match[3] });
    else if (entries.length > 0) entries[entries.length - 1].text += `\n${line}`;
    else entries.push({ at: "", author: "", text: line });
  }
  return entries
    .map((entry) => ({ ...entry, text: entry.text.trim() }))
    .filter((entry) => entry.text)
    .reverse();
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{children}</h3>;
}

/**
 * Özet: bankonun "bu hasta için bugün ne yapmalıyım" sorusu (Yapılacaklar),
 * notlar, hastaya bağlı görevler ve başlıkta olmayan hasta bilgileri. Kimlik
 * (yaş, cinsiyet, telefon), risk rozetleri ve borç başlıkta TEK yerde durur;
 * burada tekrar edilmez. Bilgileri düzenlemek için tek giriş başlıktaki
 * "Düzenle"dir.
 */
export function SummaryTab() {
  const {
    data,
    patientId,
    reload,
    can,
    canOpenTab,
    selectTab,
    canEditPatient,
    balance,
    openPayment,
    appointmentHref,
    openEditPatient,
    intent,
    clearIntent,
  } = usePatientFile();
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [showAllNotes, setShowAllNotes] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // "İşlem ekle > Not ekle": not kutusuna odaklan.
  useEffect(() => {
    if (intent !== "note") return;
    clearIntent();
    noteRef.current?.scrollIntoView({ block: "center" });
    noteRef.current?.focus();
  }, [intent, clearIntent]);

  const notes = useMemo(() => parseNotes(data.notes), [data.notes]);

  const nextSteps = useMemo<NextStep[]>(() => {
    const steps: NextStep[] = [];
    const now = Date.now();

    if (canOpenTab("odeme")) {
      const overduePlans = data.taksitPlanlari.filter((plan) => (plan.taksitler || []).some((item) => isOpenInstallment(item) && item.status === "GECIKTI"));
      const overdue = overduePlans.flatMap((plan) => plan.taksitler || []).filter((item) => isOpenInstallment(item) && item.status === "GECIKTI");
      if (overdue.length > 0) {
        const overdueTotal = roundMoney(overdue.reduce((sum, item) => sum + getItemRemaining(item), 0));
        const oldest = overdue.map(getItemDueDate).sort()[0];
        const planDoctor = overduePlans.find((plan) => plan.doctor?.fullName)?.doctor?.fullName;
        steps.push({
          id: "overdue",
          icon: Wallet,
          tone: "critical",
          title: `${overdue.length} taksit gecikti · ${money(overdueTotal)}`,
          // Taksit, yalnız plan hekimi adına alınan tahsilatla kapanır (sunucu kuralı).
          detail: [oldest ? `En eski vade ${formatDateText(oldest)}` : "", planDoctor ? `tahsilatı ${planDoctor} adına alın` : ""].filter(Boolean).join(" · "),
          action: can("payments:write") ? { label: "Tahsilat al", onClick: () => openPayment() } : { label: "Taksitleri gör", onClick: () => selectTab("odeme") },
        });
      } else if (balance.totalDebt > 0.004) {
        // Tutar başlıkta yazıyor; burada borcun nereden geldiği ve eylem.
        steps.push({
          id: "debt",
          icon: Wallet,
          tone: "warning",
          title: "Tahsilat bekliyor",
          detail: `Yapılan tedaviler ${money(balance.discountedTotal)}${balance.discountRate > 0 ? ` (%${balance.discountRate} indirimli)` : ""}, alınan ${money(balance.totalPaid)}.`,
          action: can("payments:write") ? { label: "Tahsilat al", onClick: () => openPayment() } : { label: "Hesabı gör", onClick: () => selectTab("odeme") },
        });
      }
    }

    const upcoming = canOpenTab("randevular")
      ? data.appointments
        .filter((appointment) => new Date(appointment.startAt).getTime() >= now && !["IPTAL", "TAMAMLANDI", "GELMEDI"].includes(appointment.status))
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      : [];
    if (upcoming[0]) {
      const next = upcoming[0];
      steps.push({
        id: "next-appointment",
        icon: CalendarClock,
        tone: "info",
        title: `Sıradaki randevu: ${formatDateText(next.startAt, "long")} ${formatDateText(next.startAt, "time")}`,
        detail: [next.doctor?.fullName, upcoming.length > 1 ? `${upcoming.length - 1} randevu daha var` : ""].filter(Boolean).join(" · ") || "Hekim belirtilmedi",
        action: { label: "Randevular", onClick: () => selectTab("randevular") },
      });
    }

    const pending = canOpenTab("tedavi") ? data.examinations.filter(isPendingExam) : [];
    if (pending.length > 0) {
      steps.push({
        id: "pending-treatments",
        icon: Stethoscope,
        tone: "info",
        title: `${pending.length} yapılacak tedavi`,
        detail: pending.slice(0, 3).map((exam) => `${exam.treatmentName}${exam.toothNo ? ` (${exam.toothNo})` : ""}`).join(", ") + (pending.length > 3 ? "…" : ""),
        action: { label: "Tedaviye git", onClick: () => selectTab("tedavi") },
      });
      // Yapılacak tedavisi olup ileri randevusu olmayan hasta: kontrol randevusu.
      if (!upcoming[0] && canOpenTab("randevular") && can("appointments:write")) {
        steps.push({
          id: "no-appointment",
          icon: CalendarPlus,
          tone: "warning",
          title: "İleri tarihli randevusu yok",
          detail: "Yapılacak tedavisi için randevu verilebilir.",
          action: { label: "Yeni randevu", href: appointmentHref },
        });
      }
    }

    if (canOpenTab("lab")) {
      const open = data.labOrders
        .map((order) => ({ order, summary: getOrderSummary({ labType: order.labType, notes: order.notes || null, status: order.status, invoices: [], trips: order.trips || [] }) }))
        .filter(({ summary }) => !summary.cancelled && !summary.isDone);
      if (open.length > 0) {
        const first = open[0];
        const late = open.some(({ summary }) => summary.late);
        steps.push({
          id: "lab",
          icon: FlaskConical,
          tone: late ? "critical" : "neutral",
          title: open.length === 1 ? `Lab işi: ${first.order.labType} · ${LAB_STAGE_LABEL[first.summary.stage]}` : `${open.length} açık lab işi`,
          detail: open.length === 1 ? stageDetail(first.summary) : open.slice(0, 3).map(({ order, summary }) => `${order.labType} (${LAB_STAGE_LABEL[summary.stage]})`).join(", "),
          action: { label: "Laboratuvar", onClick: () => selectTab("lab") },
        });
      }
    }
    return steps;
  }, [data, balance, canOpenTab, can, openPayment, selectTab, appointmentHref]);

  const saveNote = async () => {
    const text = noteText.trim();
    if (!text || noteSaving) return;
    setNoteSaving(true);
    setNoteError("");
    try {
      // Not sunucuda damgalanıp en güncel notların sonuna eklenir: önceden önce
      // bütün hasta dosyası okunup sonra bütün not metni geri yazılıyordu;
      // arada başkasının eklediği not silinebiliyordu.
      const response = await fetch(`/api/patients/${encodeURIComponent(patientId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appendNote: text }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessageOf(body, "Not kaydedilemedi."));
      setNoteText("");
      showToastSafe({ type: "success", message: "Not eklendi." });
      void reload(true);
    } catch (saveError) {
      setNoteError(saveError instanceof Error ? saveError.message : "Not kaydedilemedi.");
    } finally {
      setNoteSaving(false);
    }
  };

  const visibleNotes = showAllNotes ? notes : notes.slice(0, 5);

  const tcVisible = Boolean(data.tcNo) && data.tcNo !== "***";
  const generalItems: DescriptionItem[] = [
    { key: "tc", label: data.isForeigner ? "Kimlik / pasaport no" : "TC kimlik no", value: <span className="tabular-nums">{data.tcNo}</span>, hidden: !tcVisible },
    { key: "birth", label: "Doğum tarihi", value: data.birthDate ? formatDateText(data.birthDate) : null },
    { key: "insurance", label: "Kurum / sigorta", value: data.insurance, hidden: !data.insurance },
    { key: "discount", label: "İndirim", value: `%${data.discountRate}`, hidden: !(Number(data.discountRate) > 0) },
    { key: "profession", label: "Meslek", value: data.profession, hidden: !data.profession },
    { key: "referrer", label: "Referans", value: data.referrer, hidden: !data.referrer },
    { key: "address", label: "Adres", value: data.address, hidden: !data.address },
    { key: "created", label: "Kayıt tarihi", value: formatDateText(data.createdAt) },
  ];
  const healthItems: DescriptionItem[] = [
    { key: "contagious", label: "Bulaşıcı hastalık", value: <span className="text-red-700">{data.contagiousDiseaseNote}</span>, hidden: !(data.hasContagiousDisease && data.contagiousDiseaseNote) },
    { key: "medications", label: "Kullandığı ilaçlar", value: data.medications, hidden: !data.medications },
    { key: "surgeries", label: "Ameliyatlar", value: data.surgeries, hidden: !data.surgeries },
    { key: "other", label: "Diğer hastalıklar", value: data.otherDiseases, hidden: !data.otherDiseases },
    { key: "blood", label: "Kan grubu", value: data.bloodType, hidden: !data.bloodType },
  ];
  const hasHealthRows = healthItems.some((item) => !item.hidden);
  const hasHealthFlags = data.hasAllergy || data.hasHepatitis || data.hasKidney || data.hasDiabetes || data.hasHeart || data.hasBloodIssue || data.hasContagiousDisease;
  const showSms = data.smsPreference !== undefined && can("sms:read");

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <Section title="Yapılacaklar" padding={nextSteps.length > 0 ? "none" : "md"}>
          {nextSteps.length === 0 ? (
            <p className="text-sm text-slate-500">Bu hasta için bekleyen iş yok.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {nextSteps.map((step) => (
                <li key={step.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                  <IconFrame icon={step.icon} size="md" accent={TONE_ACCENT[step.tone]} />
                  {/* Telefonda metin satırın tamamını alır, düğme alta (ml-11) iner:
                      önceden düğme yanda kalıyor, metin ~150 px'e sıkışıp "tahsilatı
                      Dr. X adına alın" gibi ayrıntı kesiliyordu. */}
                  <div className="min-w-0 flex-1 basis-[calc(100%-2.75rem)] sm:basis-0">
                    <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                    {step.detail && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500" title={step.detail}>{step.detail}</p>}
                  </div>
                  {step.action && (
                    <Button variant="secondary" size="sm" className="ml-11 sm:ml-0" href={step.action.href} onClick={step.action.onClick}>
                      {step.action.label}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Notlar">
          {canEditPatient && (
            <form className="mb-4 space-y-2" onSubmit={(event) => { event.preventDefault(); void saveNote(); }}>
              <Textarea
                ref={noteRef}
                id="hd-note"
                rows={2}
                maxLength={2000}
                aria-label="Yeni not"
                aria-invalid={noteError ? true : undefined}
                aria-describedby={noteError ? "hd-note-error" : undefined}
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="Not yazın…"
              />
              {noteError && <p id="hd-note-error" role="alert" className="text-xs font-medium text-red-600">{noteError}</p>}
              <div className="flex justify-end">
                <Button type="submit" size="sm" variant="secondary" loading={noteSaving} disabled={!noteText.trim()}>Kaydet</Button>
              </div>
            </form>
          )}
          {notes.length === 0 ? (
            <p className="text-sm text-slate-500">Henüz not yok.</p>
          ) : (
            <>
              <ol className="space-y-2">
                {visibleNotes.map((note, index) => (
                  <li key={`${note.at}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
                    <p className="whitespace-pre-wrap text-sm text-slate-800">{note.text}</p>
                    {(note.at || note.author) && (
                      <p className="mt-1 text-xs text-slate-500">{[note.at, note.author].filter(Boolean).join(" · ")}</p>
                    )}
                  </li>
                ))}
              </ol>
              <div className="mt-2 flex flex-wrap gap-2">
                {notes.length > 5 && (
                  <Button variant="ghost" size="sm" onClick={() => setShowAllNotes((current) => !current)} aria-expanded={showAllNotes}>
                    {showAllNotes ? "Son 5 notu göster" : `Tüm notları göster (${notes.length})`}
                  </Button>
                )}
                {/* Yanlış yazılan notu düzeltmenin yeri hasta formundaki "Diğer bilgiler"dir. */}
                {canEditPatient && (
                  <Button variant="ghost" size="sm" onClick={() => openEditPatient("diger")}>Notu düzelt</Button>
                )}
              </div>
            </>
          )}
        </Section>

        {can("clinictasks:read") && <TasksSection />}
      </div>

      <aside className="min-w-0">
        <Section title="Hasta bilgileri">
          <div className="space-y-5">
            <DescriptionList layout="rows" items={generalItems} />
            {(hasHealthRows || !hasHealthFlags) && (
              <div>
                <SubHeading>Sağlık</SubHeading>
                {hasHealthRows
                  ? <DescriptionList layout="rows" items={healthItems} />
                  : <p className="text-sm text-slate-500">Bilinen sağlık uyarısı yok.</p>}
              </div>
            )}
            {showSms && (
              <div>
                <SubHeading>İletişim</SubHeading>
                <SmsConsentCard
                  patientId={patientId}
                  preference={(data.smsPreference ?? null) as SmsPreference | null}
                  latestToken={data.smsConsentTokens?.[0] ?? null}
                  canResend={canEditPatient}
                  onChanged={() => void reload(true)}
                />
              </div>
            )}
          </div>
        </Section>
      </aside>
    </div>
  );
}
