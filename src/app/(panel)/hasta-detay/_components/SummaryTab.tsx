"use client";

import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  CalendarClock,
  CalendarPlus,
  ClipboardList,
  FlaskConical,
  HeartPulse,
  MessageSquareText,
  Pencil,
  Stethoscope,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/Input";
import { formatDateText } from "@/components/ui/Money";
import { formatPhoneNumber } from "@/lib/format";
import { showToastSafe } from "@/lib/toast-client";
import { getOrderSummary, LAB_STAGE_LABEL, stageDetail } from "@/lib/lab-workflow";
import { usePatientFile } from "./PatientFileContext";
import {
  ageFrom,
  errorMessageOf,
  genderLabel,
  getItemDueDate,
  getItemRemaining,
  healthFlagsOf,
  isOpenInstallment,
  isPendingExam,
  money,
  roundMoney,
  type SmsPreference,
} from "./patient-file-shared";
import { SmsConsentCard } from "./SmsConsentCard";

type NextStep = {
  id: string;
  icon: ComponentType<{ className?: string }>;
  tone: "critical" | "warning" | "info" | "neutral";
  title: string;
  detail: string;
  action?: { label: string; onClick?: () => void; href?: string };
};

const TONE_ICON: Record<NextStep["tone"], string> = {
  critical: "bg-red-50 text-red-600",
  warning: "bg-amber-50 text-amber-600",
  info: "bg-primary/10 text-primary",
  neutral: "bg-slate-100 text-slate-500",
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

function Card({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`ui-surface p-4 sm:p-5 ${className}`} aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-slate-800">{children}</dd>
    </div>
  );
}

export function SummaryTab({ currentUserName }: { currentUserName: string }) {
  const {
    data,
    patientId,
    reload,
    can,
    canOpenTab,
    selectTab,
    hidePatientPhone,
    canEditPatient,
    balance,
    clinicTasks,
    openPayment,
    openEditPatient,
    appointmentHref,
  } = usePatientFile();
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [showAllNotes, setShowAllNotes] = useState(false);

  const healthFlags = healthFlagsOf(data);
  const notes = useMemo(() => parseNotes(data.notes), [data.notes]);
  const age = ageFrom(data.birthDate);

  const nextSteps = useMemo<NextStep[]>(() => {
    const steps: NextStep[] = [];
    const now = Date.now();

    if (canOpenTab("odeme")) {
      const overdue = data.taksitPlanlari
        .flatMap((plan) => plan.taksitler || [])
        .filter((item) => isOpenInstallment(item) && item.status === "GECIKTI");
      if (overdue.length > 0) {
        const overdueTotal = roundMoney(overdue.reduce((sum, item) => sum + getItemRemaining(item), 0));
        const oldest = overdue.map(getItemDueDate).sort()[0];
        steps.push({
          id: "overdue",
          icon: Wallet,
          tone: "critical",
          title: `${overdue.length} taksit gecikti · ${money(overdueTotal)}`,
          detail: oldest ? `En eski vade ${formatDateText(oldest)}. Tahsilat alınınca taksitler otomatik kapanır.` : "Tahsilat alınınca taksitler otomatik kapanır.",
          action: can("payments:write") ? { label: "Tahsilat al", onClick: () => openPayment() } : { label: "Taksitleri gör", onClick: () => selectTab("odeme") },
        });
      } else if (balance.totalDebt > 0.004) {
        steps.push({
          id: "debt",
          icon: Wallet,
          tone: "warning",
          title: `Kalan borç ${money(balance.totalDebt)}`,
          detail: `Yapılan tedaviler ${money(balance.discountedTotal)}${balance.discountRate > 0 ? ` (%${balance.discountRate} indirimli)` : ""}, alınan ${money(balance.totalPaid)}.`,
          action: can("payments:write") ? { label: "Tahsilat al", onClick: () => openPayment() } : { label: "Hesabı gör", onClick: () => selectTab("odeme") },
        });
      }
    }

    if (canOpenTab("randevular")) {
      const upcoming = data.appointments
        .filter((appointment) => new Date(appointment.startAt).getTime() >= now && !["IPTAL", "TAMAMLANDI", "GELMEDI"].includes(appointment.status))
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      const next = upcoming[0];
      if (next) {
        steps.push({
          id: "next-appointment",
          icon: CalendarClock,
          tone: "info",
          title: `Sıradaki randevu: ${formatDateText(next.startAt, "long")} ${formatDateText(next.startAt, "time")}`,
          detail: [next.doctor?.fullName, upcoming.length > 1 ? `${upcoming.length - 1} randevu daha var` : ""].filter(Boolean).join(" · ") || "Hekim belirtilmedi",
          action: { label: "Randevular", onClick: () => selectTab("randevular") },
        });
      } else if (can("appointments:write")) {
        const pendingCount = data.examinations.filter(isPendingExam).length;
        steps.push({
          id: "no-appointment",
          icon: CalendarPlus,
          tone: pendingCount > 0 ? "warning" : "neutral",
          title: "İleri tarihli randevusu yok",
          detail: pendingCount > 0 ? `${pendingCount} bekleyen tedavisi var; kontrol randevusu verilebilir.` : "Gerekirse kontrol randevusu verin.",
          action: { label: "Randevu ver", href: appointmentHref },
        });
      }
    }

    if (canOpenTab("tedavi")) {
      const pending = data.examinations.filter(isPendingExam);
      if (pending.length > 0) {
        steps.push({
          id: "pending-treatments",
          icon: Stethoscope,
          tone: "info",
          title: `${pending.length} tedavi yapılmayı bekliyor`,
          detail: pending.slice(0, 3).map((exam) => `${exam.treatmentName}${exam.toothNo ? ` (${exam.toothNo})` : ""}`).join(", ") + (pending.length > 3 ? "…" : ""),
          action: { label: "Tedaviye git", onClick: () => selectTab("tedavi") },
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

    if (canOpenTab("gorevler")) {
      const openTasks = clinicTasks.filter((task) => task.status === "ACIK" || task.status === "BEKLEMEDE");
      if (openTasks.length > 0) {
        const overdueTask = openTasks.some((task) => task.dueAt && new Date(task.dueAt).getTime() < now);
        steps.push({
          id: "tasks",
          icon: ClipboardList,
          tone: overdueTask ? "warning" : "neutral",
          title: openTasks.length === 1 ? `Görev: ${openTasks[0].title}` : `${openTasks.length} açık görev`,
          detail: openTasks.length === 1
            ? (openTasks[0].dueAt ? `Son tarih ${formatDateText(openTasks[0].dueAt, "datetime")}` : "Son tarih yok")
            : openTasks.slice(0, 2).map((task) => task.title).join(", "),
          action: { label: "Görevler", onClick: () => selectTab("gorevler") },
        });
      }
    }
    return steps;
  }, [data, balance, clinicTasks, canOpenTab, can, openPayment, selectTab, appointmentHref]);

  const saveNote = async () => {
    const text = noteText.trim();
    if (!text || noteSaving) return;
    setNoteSaving(true);
    setNoteError("");
    try {
      // Notu en güncel metnin sonuna ekle: başka biri az önce not eklediyse
      // onun notu silinmesin.
      const latestResponse = await fetch(`/api/patients/${patientId}`, { cache: "no-store", headers: { "x-silent-refresh": "1" } });
      const latest = await latestResponse.json().catch(() => null);
      if (!latestResponse.ok) throw new Error(errorMessageOf(latest, "Hasta bilgisi okunamadı; not kaydedilmedi."));
      const stamp = formatDateText(new Date(), "datetime");
      const existing = typeof latest?.notes === "string" ? latest.notes : "";
      const nextNotes = `${existing ? `${existing}\n` : ""}[${stamp} - ${currentUserName || "Personel"}] ${text}`;
      const response = await fetch(`/api/patients/${patientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: nextNotes }),
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

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <Card title="Yapılacaklar">
          {nextSteps.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <span>Bu hasta için bekleyen iş yok.</span>
              {can("appointments:write") && <Button variant="secondary" size="sm" href={appointmentHref} icon={CalendarPlus}>Randevu ver</Button>}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {nextSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <li key={step.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0 sm:flex-nowrap">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_ICON[step.tone]}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{step.detail}</p>
                    </div>
                    {step.action && (
                      <Button variant="secondary" size="sm" className="ml-12 sm:ml-0" href={step.action.href} onClick={step.action.onClick}>
                        {step.action.label}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Notlar">
          {canEditPatient && (
            <form
              className="mb-4 space-y-2"
              onSubmit={(event) => { event.preventDefault(); void saveNote(); }}
            >
              <FormField label="Yeni not" htmlFor="hd-note" error={noteError || undefined} hint="Not, adınız ve saatle birlikte hastanın notlarına eklenir.">
                <Textarea
                  id="hd-note"
                  rows={2}
                  maxLength={2000}
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="Örn. Hasta öğleden sonra aranmak istiyor."
                />
              </FormField>
              <div className="flex justify-end">
                <Button type="submit" size="sm" loading={noteSaving} disabled={!noteText.trim()}>Notu kaydet</Button>
              </div>
            </form>
          )}
          {notes.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">Henüz not yok.</p>
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
              {notes.length > 5 && (
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAllNotes((current) => !current)}>
                  {showAllNotes ? "Son 5 notu göster" : `Tüm notları göster (${notes.length})`}
                </Button>
              )}
            </>
          )}
        </Card>
      </div>

      <aside className="min-w-0 space-y-4">
        <Card
          title="Hasta bilgileri"
          action={canEditPatient ? <Button variant="ghost" size="sm" icon={Pencil} onClick={openEditPatient}>Düzenle</Button> : undefined}
        >
          <dl className="divide-y divide-slate-100">
            {!hidePatientPhone && (
              <InfoRow label="Telefon">
                {data.phone ? <a href={`tel:${data.phoneCountryCode && data.phoneCountryCode !== "+90" ? data.phoneCountryCode : "0"}${data.phone.replace(/^0/, "")}`} className="text-primary hover:underline">{data.phoneCountryCode && data.phoneCountryCode !== "+90" ? `${data.phoneCountryCode} ${data.phone}` : formatPhoneNumber(data.phone)}</a> : <span className="text-slate-300">—</span>}
              </InfoRow>
            )}
            <InfoRow label="Doğum tarihi">
              {data.birthDate ? `${formatDateText(data.birthDate)}${age !== null ? ` (${age} yaş)` : ""}` : <span className="text-slate-300">—</span>}
            </InfoRow>
            {genderLabel(data.gender) && <InfoRow label="Cinsiyet">{genderLabel(data.gender)}</InfoRow>}
            {data.insurance && <InfoRow label="Kurum / sigorta">{data.insurance}</InfoRow>}
            {Number(data.discountRate) > 0 && <InfoRow label="İndirim">%{data.discountRate}</InfoRow>}
            {data.profession && <InfoRow label="Meslek">{data.profession}</InfoRow>}
            {data.referrer && <InfoRow label="Referans">{data.referrer}</InfoRow>}
            {data.address && <InfoRow label="Adres">{data.address}</InfoRow>}
            <InfoRow label="Kayıt tarihi">{formatDateText(data.createdAt)}</InfoRow>
          </dl>
        </Card>

        <Card title="Sağlık bilgileri" action={canEditPatient ? <Button variant="ghost" size="sm" icon={Pencil} onClick={openEditPatient}>Düzenle</Button> : undefined}>
          {healthFlags.length === 0 && !data.medications && !data.surgeries && !data.otherDiseases && !data.bloodType ? (
            <p className="flex items-center gap-2 text-sm text-slate-500"><HeartPulse className="h-4 w-4 text-slate-400" aria-hidden="true" />Bilinen sağlık uyarısı yok.</p>
          ) : (
            <div className="space-y-3">
              {healthFlags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {healthFlags.map((flag) => <Badge key={flag} tone="critical">{flag}</Badge>)}
                </div>
              )}
              {data.hasContagiousDisease && data.contagiousDiseaseNote && (
                <p className="text-sm text-red-700">{data.contagiousDiseaseNote}</p>
              )}
              <dl className="divide-y divide-slate-100">
                {data.medications && <InfoRow label="Kullandığı ilaçlar">{data.medications}</InfoRow>}
                {data.surgeries && <InfoRow label="Ameliyatlar">{data.surgeries}</InfoRow>}
                {data.otherDiseases && <InfoRow label="Diğer">{data.otherDiseases}</InfoRow>}
                {data.bloodType && <InfoRow label="Kan grubu">{data.bloodType}</InfoRow>}
              </dl>
            </div>
          )}
        </Card>

        {data.smsPreference !== undefined && can("sms:read") && (
          <SmsConsentCard
            patientId={patientId}
            preference={(data.smsPreference ?? null) as SmsPreference | null}
            latestToken={data.smsConsentTokens?.[0] ?? null}
            canResend={canEditPatient}
            onChanged={() => void reload(true)}
            icon={MessageSquareText}
          />
        )}
      </aside>
    </div>
  );
}
