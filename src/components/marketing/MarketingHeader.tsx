"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { BRAND_NAME } from "@/lib/brand";

const MARKETING_NAV = [
  { href: "#ozellikler", label: "Özellikler" },
  { href: "#fiyatlandirma", label: "Fiyatlandırma" },
  { href: "#sss", label: "Sık sorulanlar" },
] as const;

// Tanıtım önceden "sekmeli"ydi (?tab=…); dışarıda paylaşılmış eski bağlantılar
// tek sayfadaki ilgili bölüme kayar.
const LEGACY_TAB_ANCHORS: Record<string, string> = {
  moduller: "ozellikler",
  isleyis: "ozellikler",
  fiyatlandirma: "fiyatlandirma",
  sss: "sss",
  demo: "demo",
};

/**
 * Tanıtım üst çubuğu — sayfadaki tek istemci adası (mobil menü + eski ?tab=
 * bağlantıları). Menü öğeleri gerçek çapa bağlantılarıdır: yeni sekmede
 * açılabilir, paylaşılabilir. Telefonda "Giriş" tek dokunuşla görünür.
 */
export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    const anchor = tab ? LEGACY_TAB_ANCHORS[tab] : undefined;
    if (!anchor) return;
    window.history.replaceState(null, "", `/#${anchor}`);
    document.getElementById(anchor)?.scrollIntoView();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label={`${BRAND_NAME} ana sayfa`} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35">
          <BrandLockup showLabel={false} />
        </Link>
        <nav aria-label="Tanıtım menüsü" className="hidden items-center gap-6 lg:flex">
          {MARKETING_NAV.map((item) => (
            <a key={item.href} href={item.href} className="text-sm font-semibold text-slate-600 hover:text-slate-900">{item.label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" href="/klinik/giris">
            <span className="sm:hidden">Giriş</span>
            <span className="hidden sm:inline">Klinik girişi</span>
          </Button>
          <Button size="sm" href="#demo" className="hidden sm:inline-flex">Ücretsiz demo</Button>
          <button
            ref={toggleRef}
            type="button"
            aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
            aria-expanded={open}
            aria-controls="tanitim-mobil-menu"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 lg:hidden"
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="tanitim-mobil-menu" aria-label="Tanıtım menüsü" className="border-t border-slate-100 bg-white px-4 py-2 lg:hidden">
          {[...MARKETING_NAV, { href: "#demo", label: "Ücretsiz demo" }].map((item) => (
            <a key={item.href} href={item.href} onClick={() => setOpen(false)} className="block rounded-md px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {item.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
