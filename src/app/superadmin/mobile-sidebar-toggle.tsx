"use client";

import { Menu } from "lucide-react";
import { IconButton } from "@/components/ui/Button";

/**
 * Aynı `toggle-mobile-sidebar` olayını klinik panelindeki (components/layout/
 * topbar.tsx) hamburger butonuyla paylaşır — bkz. sidebar.tsx'teki dinleyici.
 * Menü 1024px altında çekmecedir; düğme yalnız orada görünür.
 */
export default function MobileSidebarToggle() {
  return (
    <span className="lg:hidden">
      <IconButton icon={Menu} title="Menüyü aç" tone="neutral" onClick={() => window.dispatchEvent(new Event("toggle-mobile-sidebar"))} />
    </span>
  );
}
