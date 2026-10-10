"use client";

import Link from "next/link";
import { useState, type ComponentType, type ReactNode } from "react";
import { CalendarClock, CheckCircle2, ChevronRight, FlaskConical, Inbox, ListChecks, MessageSquareWarning, PhoneCall, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { Money } from "@/components/ui/Money";
import type { HomeSummary, HomeSummarySection } from "@/app/api/dashboard/today/home-summary-types";
import { StaleNotice } from "./StaleNotice";

type Tone = "critical" | "warning" | "info";

type TodoItem = {
  key: string;
  tone: Tone;
  icon: ComponentType<{ className?: string }>;
  title: string;
  detail?: ReactNode;
  href?: string;
  action?: { label: string; ariaLabel?: string; onClick: () => void };
  /** Başka ekranlardan bağlantı çapası (ör. Randevular > "Anasayfada kapat" → #acik-kalanlar). */
  anchorId?: string;
};

const TONE_ORDER: Record<Tone, number> = { critical: 0, warning: 1, info: 2 };
/** En acil bu kadar iş görünür; kalanı "N iş daha" ile açılır (liste randevuları aşağı itmesin). */
const VISIBLE_COUNT = 5;

const TONE_ICON_CLASS: Record<Tone, string> = {
  critical: "bg-red-50 text-red-600",
  warning: "bg-amber-50 text-amber-600",
  info: "bg-primary/10 text-primary",
};

const SECTION_NAMES: Partial<Record<HomeSummarySection, string>> = {
  appointments: "randevu",
  followUps: "hasta aramaları",
  tasks: "görevler",
  lab: "laboratuvar",
  installments: "taksitler",
  messaging: "mesaj gönderimi",
};

export type TodoPermissions = {
  appointmentsWrite: boolean;
  followUps: boolean;
  tasks: boolean;
  labWrite: boolean;
  installments: boolean;
  sms: boolean;
};

/** Özetten bugünün iş listesini kurar — yalnız sayısı olan ve kullanıcının işi olan kalemler. */
function buildItems(summary: HomeSummary, permissions: TodoPermissions, onOpenPast: () => void): TodoItem[] {
  const items: TodoItem[] = [];
  // Doktor görünümünde ön büro işleri (açık kalan randevu, online talep) listelenmez.
  const frontDesk = !summary.viewer.doctor;
  const appointments = frontDesk ? summary.appointments : undefined;

  if (permissions.appointmentsWrite && appointments && appointments.openPast > 0) {
    items.push({
      key: "acik-kalanlar",
      anchorId: "acik-kalanlar",
      tone: "warning",
      icon: CalendarClock,
      title: `Önceki günlerden ${appointments.openPast} randevu açık kaldı`,
      detail: "Tamamlandı ya da Gelmedi olarak işaretleyin",
      action: { label: "İşaretle", ariaLabel: "Açık kalan randevuları işaretle", onClick: onOpenPast },
    });
  }

  // "Bugün aranacak" gecikmişleri de kapsar (Yapılacaklar > Hasta aramaları ile aynı grup).
  if (permissions.followUps && summary.followUps && summary.followUps.dueToday > 0) {
    const { dueToday, overdue } = summary.followUps;
    items.push({
      key: "aramalar",
      tone: overdue > 0 ? "critical" : "warning",
      icon: PhoneCall,
      title: `Bugün aranacak ${dueToday} hasta`,
      detail: overdue > 0 ? `${overdue} aramanın günü geçti` : undefined,
      href: "/yapilacaklar?tab=arama",
    });
  }

  if (permissions.appointmentsWrite && appointments && (appointments.onlineRequests > 0 || appointments.waitlist > 0)) {
    const { onlineRequests, waitlist } = appointments;
    items.push({
      key: "talepler",
      tone: onlineRequests > 0 ? "warning" : "info",
      icon: Inbox,
      title: onlineRequests > 0 ? `${onlineRequests} online randevu talebi onay bekliyor` : `Bekleme listesinde ${waitlist} hasta`,
      detail: onlineRequests > 0 && waitlist > 0 ? `Bekleme listesinde ${waitlist} hasta` : undefined,
      href: `/randevu?talepler=${onlineRequests > 0 ? "online" : "bekleme"}`,
    });
  }

  if (permissions.tasks && summary.tasks && summary.tasks.due > 0) {
    const { due, overdue } = summary.tasks;
    items.push({
      key: "gorevler",
      tone: overdue > 0 ? "critical" : "warning",
      icon: ListChecks,
      title: `Zamanı gelen ${due} göreviniz var`,
      detail: overdue > 0 ? `${overdue} tanesinin son tarihi geçti` : undefined,
      // Menü rozeti ve zildeki sayıyla aynı kural: "Zamanı gelen" görünümü.
      href: "/yapilacaklar?tab=gorev&durum=zamani-gelen",
    });
  }

  if (permissions.labWrite && summary.lab) {
    const { late, clinic, mine } = summary.lab;
    // Hekimin kendi işleri sayıldıysa liste de onun işleriyle açılır (Lab ?doktor=).
    const doctorQuery = mine && summary.viewer.id ? `&doktor=${encodeURIComponent(summary.viewer.id)}` : "";
    if (late > 0) {
      items.push({
        key: "lab-gecikti",
        tone: "critical",
        icon: FlaskConical,
        title: mine ? `${late} lab işinizin dönüşü gecikti` : `${late} lab işinin dönüşü gecikti`,
        detail: "Laboratuvarı arayıp durumu sorun",
        href: `/lab?tab=laboratuvarda${doctorQuery}`,
      });
    }
    if (clinic > 0) {
      items.push({
        key: "lab-klinikte",
        tone: "info",
        icon: FlaskConical,
        title: mine ? `${clinic} lab işiniz klinikte` : `${clinic} lab işi klinikte`,
        detail: "Hasta prova ya da takma için çağrılmalı",
        href: `/lab?tab=klinikte${doctorQuery}`,
      });
    }
  }

  if (permissions.installments && summary.installments) {
    const { overdueCount, overdueAmount, weekCount, weekAmount } = summary.installments;
    if (overdueCount > 0) {
      items.push({
        key: "taksit-gecikti",
        tone: "critical",
        icon: Wallet,
        title: `${overdueCount} taksit gecikmiş`,
        detail: <>Toplam <Money value={overdueAmount} /></>,
        href: "/muhasebe?tab=alacaklar&gorunum=taksitler&durum=GECIKTI",
      });
    }
    if (weekCount > 0) {
      items.push({
        key: "taksit-hafta",
        tone: "info",
        icon: Wallet,
        title: `Bu hafta ${weekCount} taksitin vadesi geliyor`,
        detail: <>Toplam <Money value={weekAmount} /></>,
        href: "/muhasebe?tab=alacaklar&gorunum=taksitler",
      });
    }
  }

  if (permissions.sms && summary.messaging && summary.messaging.failed7d > 0) {
    items.push({
      key: "mesaj-gonderilemedi",
      tone: "warning",
      icon: MessageSquareWarning,
      title: `Son 7 günde ${summary.messaging.failed7d} mesaj gönderilemedi`,
      detail: "Nedenini gönderim geçmişinde görün",
      href: "/sms?tab=gecmis&durum=basarisiz",
    });
  }

  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => TONE_ORDER[a.item.tone] - TONE_ORDER[b.item.tone] || a.index - b.index)
    .map(({ item }) => item);
}

function TodoRow({ item }: { item: TodoItem }) {
  const Icon = item.icon;
  const body = (
    <>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE_ICON_CLASS[item.tone]}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-5 text-slate-800">{item.title}</span>
        {item.detail && <span className="mt-0.5 block text-xs leading-4 text-slate-500">{item.detail}</span>}
      </span>
    </>
  );
  if (item.action) {
    return (
      <li id={item.anchorId} className="flex scroll-mt-24 items-center gap-3 px-4 py-3">
        {body}
        <Button size="sm" variant="secondary" aria-label={item.action.ariaLabel} onClick={item.action.onClick}>{item.action.label}</Button>
      </li>
    );
  }
  return (
    <li id={item.anchorId} className="scroll-mt-24">
      <Link
        href={item.href || "#"}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
      >
        {body}
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </Link>
    </li>
  );
}

type TodoListProps = {
  summary: HomeSummary | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  permissions: TodoPermissions;
  onOpenPast: () => void;
  className?: string;
};

/**
 * "Yapılacaklar": bugün ilgilenilmesi gereken işler tek listede. Her satır
 * işin yapıldığı süzgeçli listeye götürür (açık kalan randevular bu ekranda
 * pencerede kapatılır). Sayılar menü rozetleri ve ilgili sayfalarla aynı
 * tanımdan gelir; bilinmeyen sayı "0" olarak gösterilmez.
 */
export function TodoList({ summary, loading, error, onRetry, permissions, onOpenPast, className = "" }: TodoListProps) {
  const [showAll, setShowAll] = useState(false);
  const items = summary ? buildItems(summary, permissions, onOpenPast) : [];
  // Başka ekranın bağlantı verdiği satır (#acik-kalanlar) kapalı listede de her zaman görünür.
  const collapsed = items.filter((item, index) => index < VISIBLE_COUNT || item.anchorId);
  const hiddenCount = items.length - collapsed.length;
  const shown = showAll || hiddenCount <= 1 ? items : collapsed;
  const failedNames = (summary?.failed || []).map((section) => SECTION_NAMES[section]).filter(Boolean) as string[];
  const notice = summary && error ? `${error} Son yüklenen liste gösteriliyor.` : failedNames.length > 0 ? `Bazı sayılar alınamadı (${failedNames.join(", ")}).` : null;

  return (
    <Section title="Yapılacaklar" padding="none" className={className}>
      {!summary ? (
        error && !loading ? (
          <div className="p-3"><LoadErrorState compact message={error} onRetry={onRetry} /></div>
        ) : (
          <ListRowSkeleton variant="row" leading="icon" rows={3} />
        )
      ) : items.length === 0 && failedNames.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-3 text-sm text-slate-600">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          Bekleyen iş yok
        </p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {shown.map((item) => <TodoRow key={item.key} item={item} />)}
          </ul>
          {hiddenCount > 1 && (
            <div className="border-t border-slate-100 px-4 py-2">
              <Button size="sm" variant="ghost" onClick={() => setShowAll((value) => !value)} aria-expanded={showAll}>
                {showAll ? "Daha az göster" : `${hiddenCount} iş daha`}
              </Button>
            </div>
          )}
        </>
      )}
      {notice && <StaleNotice onRetry={onRetry} busy={loading}>{notice}</StaleNotice>}
    </Section>
  );
}
