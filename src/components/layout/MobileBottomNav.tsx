"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, Home, Menu, Plus, Users } from "lucide-react";
import type { ActionMenuItem } from "@/components/ui/ActionMenu";

type Props = {
  canAppointments: boolean;
  canPatients: boolean;
  createItems: ActionMenuItem[];
};

const ITEM_CLASS = "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-semibold leading-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary";

/**
 * Telefonda alt menü çubuğu (768 px altı): en sık üç sayfa, "Yeni" ve menü
 * başparmak hizasında. Üst çubuktaki "+" ve menü düğmesi telefonda bunun
 * yerine gizlenir (aynı iş iki yerde durmaz).
 */
export function MobileBottomNav({ canAppointments, canPatients, createItems }: Props) {
  const pathname = usePathname() || "";
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => { setNewOpen(false); }, [pathname]);
  useEffect(() => {
    if (!newOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setNewOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newOpen]);

  const links = [
    { href: "/anasayfa", label: "Ana sayfa", icon: Home, show: true },
    { href: "/randevu", label: "Randevular", icon: CalendarDays, show: canAppointments },
    { href: "/hasta", label: "Hastalar", icon: Users, show: canPatients },
  ].filter((link) => link.show);

  const linkClass = (active: boolean) => `${ITEM_CLASS} ${active ? "text-primary" : "text-slate-500 hover:text-slate-800"}`;

  return (
    <>
      {newOpen && (
        <div className="fixed inset-0 z-[205] bg-slate-900/30 md:hidden" onClick={() => setNewOpen(false)} aria-hidden="true" />
      )}
      {newOpen && (
        <div role="menu" aria-label="Yeni kayıt" className="ui-popover fixed inset-x-2 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[210] max-h-[60vh] overflow-y-auto py-1 md:hidden">
          {createItems.map((item) => {
            const Icon = item.icon;
            const content = (
              <>
                {Icon && <Icon className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800">{item.label}</span>
                  {item.description && <span className="block truncate text-xs text-slate-500">{item.description}</span>}
                </span>
              </>
            );
            const className = "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50";
            return item.href ? (
              <Link key={item.key} role="menuitem" href={item.href} className={className} onClick={() => setNewOpen(false)}>{content}</Link>
            ) : (
              <button key={item.key} role="menuitem" type="button" className={className} onClick={() => { setNewOpen(false); item.onSelect?.(); }}>{content}</button>
            );
          })}
        </div>
      )}
      <nav
        aria-label="Alt menü"
        className="fixed inset-x-0 bottom-0 z-[200] flex h-16 border-t border-slate-200 bg-[rgb(var(--app-surface))] pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_rgba(15,23,42,0.06)] md:hidden"
      >
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`) || (link.href === "/hasta" && pathname === "/hasta-detay");
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="truncate">{link.label}</span>
            </Link>
          );
        })}
        {createItems.length > 0 && (
          <button type="button" aria-haspopup="menu" aria-expanded={newOpen} onClick={() => setNewOpen((open) => !open)} className={linkClass(newOpen)}>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white"><Plus className="h-4 w-4" aria-hidden="true" /></span>
            <span>Yeni</span>
          </button>
        )}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-controls="panel-mobil-menu"
          onClick={() => window.dispatchEvent(new Event("toggle-mobile-sidebar"))}
          className={linkClass(false)}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span>Menü</span>
        </button>
      </nav>
    </>
  );
}
