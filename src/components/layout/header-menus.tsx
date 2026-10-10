"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, HelpCircle, LogOut, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useOutsideClick } from "@/lib/use-outside-click";
import { useEscapeClose } from "@/lib/use-modal-dismiss";

/**
 * Kullanıcı adı, rolü, profil, destek ve çıkış TEK yerde: sağ üstteki avatar.
 * Menü adları sayfa adlarıyla aynıdır ("Profilim", "Destek"); önceden menüde
 * "Profilim ve şifre" / "Destek talebi", sayfada "Profil" / "Destek" yazıyordu.
 * Ok tuşlarıyla gezilir, Esc ve dışarı tıklama kapatır.
 */
export function UserMenu({
  name,
  roleLabel,
  photoUrl,
  showSupport,
  showProfile = true,
  onLogout,
  loggingOut,
}: {
  name: string;
  roleLabel: string;
  photoUrl?: string | null;
  showSupport: boolean;
  /** Süperadmin kliniğe girdiğinde profil, kliniğin yöneticisinin hesabıdır; gösterilmez. */
  showProfile?: boolean;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useOutsideClick(rootRef, () => setOpen(false), open);
  useEscapeClose(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, open);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") || []);
    if (items.length === 0) return;
    const index = items.findIndex((item) => item === document.activeElement);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
        : event.key === "ArrowDown" ? (index + 1) % items.length
          : (index - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const itemClass = "flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${name}, ${roleLabel} — hesap menüsü`}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-lg p-1 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 xl:pr-1.5"
      >
        <Avatar name={name} src={photoUrl} size="sm" />
        <span className="hidden min-w-0 text-left xl:block">
          <span className="block max-w-[150px] truncate text-sm font-semibold leading-tight text-slate-800">{name}</span>
          <span className="block max-w-[150px] truncate text-xs leading-tight text-slate-500">{roleLabel}</span>
        </span>
        <ChevronDown className={`hidden h-3.5 w-3.5 text-slate-400 transition-transform xl:block ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div ref={menuRef} role="menu" aria-label="Hesap" onKeyDown={onMenuKeyDown} className="ui-popover absolute right-0 top-full z-[230] mt-2 w-60 max-w-[calc(100vw-1rem)] overflow-hidden py-1">
          <div className="border-b border-slate-100 px-3 py-2.5 xl:hidden">
            <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
            <p className="truncate text-xs text-slate-500">{roleLabel}</p>
          </div>
          {showProfile && (
            <Link href="/profil" role="menuitem" tabIndex={-1} onClick={() => setOpen(false)} className={itemClass}>
              <UserRound className="h-4 w-4 text-slate-400" aria-hidden="true" />
              Profilim
            </Link>
          )}
          {showSupport && (
            // Talep formu doğrudan açılır (kapatınca önceki talepler listesi görünür).
            <Link href="/destek?yeni=1" role="menuitem" tabIndex={-1} onClick={() => setOpen(false)} className={itemClass}>
              <HelpCircle className="h-4 w-4 text-slate-400" aria-hidden="true" />
              Destek
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={loggingOut}
            onClick={onLogout}
            className="flex w-full items-center gap-2.5 border-t border-slate-100 px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {loggingOut ? "Çıkış yapılıyor…" : "Oturumu kapat"}
          </button>
        </div>
      )}
    </div>
  );
}
