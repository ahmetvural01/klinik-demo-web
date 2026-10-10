"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, CreditCard, Lock } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { ShellPopover } from "@/components/layout/shell-popover";

export type BillingStatus = {
  nextDueDate: string | null;
  daysUntilDue: number | null;
  isRestricted: boolean;
  restrictedNote: string | null;
};

const APPROACHING_WARNING_DAYS = 7;
const SUPPORT_HREF = "/destek?yeni=1";

/**
 * Tam şeridin göründüğü sayfalar (sadelik K7). Diğer sayfalarda yaklaşan/
 * geçen ödeme uyarısı içeriği itmez; üst barda küçük gösterge olur
 * (`BillingNoticeButton`, telefonda zil penceresinde `BillingNoticeDetails`).
 */
const FULL_BANNER_PATHS = ["/anasayfa", "/ayar"];

export function isFullBillingPath(pathname: string | null | undefined) {
  if (!pathname) return false;
  return FULL_BANNER_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function turkeyDateParts(iso: string) {
  // Sunucu ve tarayıcıda aynı çıksın diye Türkiye takvimiyle sabit biçim (#418).
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const turkey = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return {
    day: String(turkey.getUTCDate()).padStart(2, "0"),
    month: String(turkey.getUTCMonth() + 1).padStart(2, "0"),
    year: turkey.getUTCFullYear(),
  };
}

/** Ödeme uyarısının metinleri — şerit, üst bar göstergesi ve zil penceresi aynı bilgiyi gösterir. */
export type BillingNotice = {
  /** "critical": ödeme süresi doldu, kayıt kapalı (herkes görür) · "warning": yaklaşan/geçen ödeme (yönetici, muhasebe). */
  tone: "critical" | "warning";
  /** Tam başlık ("Ödeme tarihi 7 gün önce geçti (son tarih 03.10.2026)."). */
  title: string;
  /** Telefondaki tek satırlık kısa metin ("Ödeme 7 gün gecikti (03.10)"). */
  shortTitle: string;
  /** Ek açıklama (yalnız kısıtlamada). */
  detail?: string;
  /** "Destek'e yaz" gösterilsin mi (support:write). */
  canSupport: boolean;
};

function buildBillingNotice(status: BillingStatus, options: { canActOnBilling: boolean; canSupport: boolean }): BillingNotice | null {
  if (status.isRestricted) {
    return {
      tone: "critical",
      title: "Ödeme süresi doldu",
      shortTitle: "Ödeme süresi doldu: kayıt kapalı",
      detail: `Yeni kayıt, düzenleme ve silme kapalı; kayıtlarınızı görüntüleyebilirsiniz.${status.restrictedNote ? ` ${status.restrictedNote}` : ""}`,
      canSupport: false,
    };
  }
  if (!options.canActOnBilling || status.daysUntilDue === null || status.daysUntilDue > APPROACHING_WARNING_DAYS) return null;
  const parts = status.nextDueDate ? turkeyDateParts(status.nextDueDate) : null;
  const dueLabel = parts ? `${parts.day}.${parts.month}.${parts.year}` : "";
  const shortDue = parts ? ` (${parts.day}.${parts.month})` : "";
  const days = status.daysUntilDue;
  const timing = days < 0
    ? `Ödeme tarihi ${Math.abs(days)} gün önce geçti`
    : days === 0
      ? "Ödeme süreniz bugün doluyor"
      : `Ödeme süreniz ${days} gün içinde doluyor`;
  const shortTiming = days < 0
    ? `Ödeme ${Math.abs(days)} gün gecikti`
    : days === 0
      ? "Ödeme süresi bugün doluyor"
      : `Ödemeye ${days} gün kaldı`;
  return {
    tone: "warning",
    title: `${timing}${dueLabel ? ` (son tarih ${dueLabel})` : ""}.`,
    shortTitle: `${shortTiming}${shortDue}`,
    canSupport: options.canSupport,
  };
}

// Şerit (içerikte) ile üst bar göstergesi (kabukta) kardeştir: durum, kabuk
// düzenini değiştirmeden küçük bir modül deposuyla paylaşılır.
let currentNotice: BillingNotice | null = null;
const listeners = new Set<() => void>();

function publishBillingNotice(next: BillingNotice | null) {
  if (JSON.stringify(next) === JSON.stringify(currentNotice)) return;
  currentNotice = next;
  listeners.forEach((listener) => listener());
}

function subscribeBillingNotice(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Panelde gösterilecek ödeme uyarısı (yoksa null). Üst bar bunu okur. */
export function useBillingNotice() {
  return useSyncExternalStore(subscribeBillingNotice, () => currentNotice, () => null);
}

/**
 * Ödeme durumu bandı. Durum sayfa açılırken sunucuda hesaplanır
 * (`initialStatus`); önceden ayrı bir istekle sonradan geliyor ve tüm sayfayı
 * aşağı itiyordu. `initialStatus` verilmezse eski yoldan yüklenir.
 * - Kısıtlama başladıysa (kayıt yapılamıyor) herkes görür, kapatılamaz: ana
 *   sayfa ve Ayarlar'da açıklamasıyla, diğer sayfalarda TEK satır (her
 *   sayfada kaydetmeyi etkilediği için gizlenmez).
 * - Yaklaşan/geçen ödeme yalnız ödemeyle ilgilenebilecek rollere (yönetici,
 *   muhasebe); tam şerit yalnız ana sayfa ve Ayarlar'da. Diğer sayfalarda
 *   üst barda küçük gösterge; tıklayınca aynı bilgi ve "Destek'e yaz".
 *   Telefonda şerit tek satırdır, "Destek'e yaz" satır içindedir.
 */
export function BillingStatusBanner({ initialStatus }: { initialStatus?: BillingStatus | null }) {
  const { can } = usePermissions();
  const pathname = usePathname();
  // Yalnız yönetici ve muhasebe: banko da `finance:center` sahibi ama ödemeyle
  // ilgili bir şey yapamaz; bant telefonda her sayfada ~130 px yer kaplıyordu.
  const canActOnBilling = can("settings:write") || can("finance:read");
  const canSupport = can("support:write");
  const [fetched, setFetched] = useState<BillingStatus | null>(null);
  const status = initialStatus !== undefined ? initialStatus : fetched;

  useEffect(() => {
    if (initialStatus !== undefined) return;
    let cancelled = false;
    fetch("/api/billing-status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: BillingStatus | null) => { if (!cancelled) setFetched(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [initialStatus]);

  const notice = useMemo(
    () => (status ? buildBillingNotice(status, { canActOnBilling, canSupport }) : null),
    [status, canActOnBilling, canSupport],
  );

  useEffect(() => { publishBillingNotice(notice); }, [notice]);
  useEffect(() => () => publishBillingNotice(null), []);

  if (!notice) return null;
  const full = isFullBillingPath(pathname);
  // Diğer sayfalarda yaklaşan/geçen ödeme şeridi yok: üst bardaki gösterge yeter.
  if (!full && notice.tone === "warning") return null;

  const Icon = notice.tone === "critical" ? Lock : AlertTriangle;
  const action = notice.canSupport ? (
    <Link
      href={SUPPORT_HREF}
      className="ui-touch-target shrink-0 rounded-sm text-xs font-bold underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-sm"
    >
      Destek&apos;e yaz
    </Link>
  ) : undefined;
  // Ana sayfa / Ayarlar masaüstünde açıklama da yazar; diğer sayfalarda ve
  // telefonda tek satır. Ekran okuyucu her genişlikte tam metni duyar.
  const showDetail = full && Boolean(notice.detail);

  return (
    <Callout
      tone={notice.tone}
      icon={Icon}
      inline
      className="mt-3 max-sm:px-3 max-sm:py-2"
      action={action}
      title={(
        <>
          <span aria-hidden="true" className="block truncate text-xs sm:hidden">{notice.shortTitle}</span>
          <span className="max-sm:sr-only">
            {notice.title}
            {!showDetail && notice.detail ? <span className="font-normal opacity-90"> — {notice.detail}</span> : null}
          </span>
        </>
      )}
    >
      {showDetail ? <span className="max-sm:hidden">{notice.detail}</span> : null}
    </Callout>
  );
}

/** Ödeme uyarısının ayrıntısı: üst bar penceresinde ve telefonda zil penceresinde aynı içerik. */
export function BillingNoticeDetails({ notice, onNavigate }: { notice: BillingNotice; onNavigate?: () => void }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${notice.tone === "critical" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
        <CreditCard className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{notice.title}</p>
        {notice.detail && <p className="mt-0.5 text-xs leading-5 text-slate-500">{notice.detail}</p>}
        {notice.canSupport && (
          <Button size="sm" variant="secondary" href={SUPPORT_HREF} onClick={onNavigate} className="mt-2">
            Destek&apos;e yaz
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Üst bardaki küçük ödeme göstergesi (masaüstü; telefonda zil penceresinde).
 * Yalnız yaklaşan/geçen ödeme uyarısı içindir ve şeridin görünmediği
 * sayfalarda çizilir — aynı uyarı bir ekranda iki kez görünmez.
 */
export function BillingNoticeButton({ className = "" }: { className?: string }) {
  const notice = useBillingNotice();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!notice || notice.tone !== "warning" || isFullBillingPath(pathname)) return null;

  return (
    <div className={className}>
      <IconButton
        ref={buttonRef}
        icon={CreditCard}
        tone="ghost"
        tooltipSide="bottom"
        title={`Ödeme uyarısı: ${notice.shortTitle}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="!text-amber-600 hover:!text-amber-700"
      >
        <span aria-hidden="true" className="pointer-events-none absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white" />
      </IconButton>
      <ShellPopover open={open} onClose={() => setOpen(false)} anchorRef={buttonRef} title="Ödeme durumu" width={320}>
        <BillingNoticeDetails notice={notice} onNavigate={() => setOpen(false)} />
      </ShellPopover>
    </div>
  );
}
