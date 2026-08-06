"use client";

import { Menu } from "lucide-react";

/**
 * Aynı `toggle-mobile-sidebar` olayını klinik panelindeki (components/layout/
 * topbar.tsx) hamburger butonuyla paylaşır — bkz. sidebar.tsx'teki dinleyici.
 */
export default function MobileSidebarToggle() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("toggle-mobile-sidebar"))}
      aria-label="Menüyü aç"
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-[var(--shadow-rest)] transition hover:border-slate-300 hover:bg-slate-50 md:hidden"
    >
      <Menu className="h-4 w-4" />
    </button>
  );
}
