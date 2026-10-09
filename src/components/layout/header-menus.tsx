"use client";

import Link from "next/link";
import { useRef, useState, type ComponentType } from "react";
import { CalendarPlus, ChevronDown, ClipboardPlus, FlaskConical, HelpCircle, LogOut, Plus, UserPlus, UserRound, Wallet } from "lucide-react";
import { useOutsideClick } from "@/lib/use-outside-click";
import { useEscapeClose } from "@/lib/use-modal-dismiss";

type CreateItem = { key: string; label: string; description: string; icon: ComponentType<{ className?: string }>; href?: string; onSelect?: () => void };

/**
 * Üst barda HER sayfada aynı yerde duran tek "Yeni" menüsü. Önceden üst bar
 * sayfaya göre farklı hızlı düğmeler gösteriyordu (bazen "Randevu Oluştur",
 * bazen "Görev Merkezi" bağlantısı) — kullanıcı aynı işi her ekranda farklı
 * yerde arıyordu. Öğeler kullanıcının yetkisine göre filtrelenir.
 */
export function CreateMenu({ items }: { items: CreateItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useOutsideClick(rootRef, () => setOpen(false), open);
  useEscapeClose(() => setOpen(false), open);
  if (items.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-bold text-white shadow-sm transition hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Yeni</span>
        <ChevronDown className={`hidden h-3.5 w-3.5 transition-transform sm:block ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label="Yeni kayıt" className="ui-popover absolute right-0 top-full z-[230] mt-2 w-72 overflow-hidden py-1">
          {items.map((item) => {
            const Icon = item.icon;
            const content = (
              <>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                  <span className="block truncate text-xs text-slate-500">{item.description}</span>
                </span>
              </>
            );
            const className = "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none";
            return item.href ? (
              <Link key={item.key} href={item.href} role="menuitem" className={className} onClick={() => setOpen(false)}>{content}</Link>
            ) : (
              <button key={item.key} type="button" role="menuitem" className={className} onClick={() => { setOpen(false); item.onSelect?.(); }}>{content}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const CREATE_ICONS = { CalendarPlus, UserPlus, Wallet, ClipboardPlus, FlaskConical };

/**
 * Kullanıcı adı, rolü, profil, destek ve çıkış TEK yerde: sağ üstteki avatar.
 * Önceden aynı kullanıcı kartı hem sol menünün tepesinde hem üst barda
 * görünüyor, çıkış ise menünün en altında ayrıca duruyordu.
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
  useOutsideClick(rootRef, () => setOpen(false), open);
  useEscapeClose(() => setOpen(false), open);
  const initials = name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toLocaleUpperCase("tr-TR");

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${name} — hesap menüsü`}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-lg p-1 pr-1.5 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
      >
        <span className="relative block h-8 w-8 shrink-0 overflow-hidden rounded-full">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-primary text-xs font-bold text-white">{initials}</span>
          )}
        </span>
        <span className="hidden min-w-0 text-left lg:block">
          <span className="block max-w-[160px] truncate text-sm font-semibold leading-tight text-slate-800">{name}</span>
          <span className="block text-xs leading-tight text-slate-500">{roleLabel}</span>
        </span>
        <ChevronDown className={`hidden h-3.5 w-3.5 text-slate-400 transition-transform lg:block ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label="Hesap" className="ui-popover absolute right-0 top-full z-[230] mt-2 w-60 overflow-hidden py-1">
          <div className="border-b border-slate-100 px-3 py-2.5 lg:hidden">
            <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
            <p className="text-xs text-slate-500">{roleLabel}</p>
          </div>
          {showProfile && (
            <Link href="/profil" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <UserRound className="h-4 w-4 text-slate-400" aria-hidden="true" />
              Profilim ve şifre
            </Link>
          )}
          {showSupport && (
            <Link href="/destek" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <HelpCircle className="h-4 w-4 text-slate-400" aria-hidden="true" />
              Destek talebi
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={loggingOut}
            onClick={onLogout}
            className="flex w-full items-center gap-2.5 border-t border-slate-100 px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {loggingOut ? "Çıkış yapılıyor…" : "Oturumu kapat"}
          </button>
        </div>
      )}
    </div>
  );
}
