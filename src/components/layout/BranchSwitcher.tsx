"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { clearBranchSensitiveClientCaches } from "@/lib/client-cache";
import { showToastSafe } from "@/lib/toast-client";
import { ShellPopover } from "@/components/layout/shell-popover";

export type BranchOption = {
  id: string;
  name: string;
  code: string | null;
  colorCode: string;
  isHeadquarters: boolean;
};

export type BranchSwitcherData = {
  activeBranchId: string | null;
  branches: BranchOption[];
};

/**
 * Aktif şube seçimi. Şube listesi sayfa açılırken sunucuda zaten hesaplanıyor
 * (layout → `data`); önceden her tam açılışta ayrıca /api/branches isteniyordu
 * ve seçici geç gelip arama kutusunu itiyordu. `data` verilmezse eski yoldan
 * yüklenir. Tek şubeli klinikte gösterilmez (üst barın en değerli alanı arama).
 *
 * - variant "bar": üst bar (≥640px) — kısa düğme + açılır liste.
 * - variant "drawer": telefon/tablet menü çekmecesinin üstü — önceden telefonda
 *   şube hiç görünmüyor ve değiştirilemiyordu.
 */
export function BranchSwitcher({ data, variant = "bar" }: { data?: BranchSwitcherData | null; variant?: "bar" | "drawer" }) {
  const [fetched, setFetched] = useState<BranchSwitcherData | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const context = data ?? fetched;

  useEffect(() => {
    if (data !== undefined) return;
    let cancelled = false;
    void fetch("/api/branches", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { activeBranchId?: string | null; branches?: BranchOption[] } | null) => {
        if (cancelled || !body || !Array.isArray(body.branches)) return;
        setFetched({ activeBranchId: body.activeBranchId ?? null, branches: body.branches });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [data]);

  if (!context || context.branches.length < 2) return null;

  const active = context.branches.find((branch) => branch.id === context.activeBranchId) || null;
  const choose = async (branchId: string) => {
    if (switching) return;
    if (branchId === context.activeBranchId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      const response = await fetch("/api/branches/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Şube değiştirilemedi.");
      clearBranchSensitiveClientCaches();
      window.location.reload();
    } catch (error) {
      setSwitching(false);
      showToastSafe({ title: "Şube değiştirilemedi", message: error instanceof Error ? error.message : "Lütfen tekrar deneyin.", type: "error" });
    }
  };

  const options = (
    <ul role="listbox" aria-label="Aktif şube" className="p-1.5">
      {context.branches.map((branch) => {
        const selected = branch.id === context.activeBranchId;
        return (
          <li key={branch.id}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              disabled={switching}
              onClick={() => void choose(branch.id)}
              className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none disabled:opacity-60 ${selected ? "bg-primary/[0.06]" : ""}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: branch.colorCode }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">{branch.name}</span>
                {(branch.isHeadquarters || branch.code) && <span className="block text-xs text-slate-500">{branch.isHeadquarters ? "Merkez şube" : branch.code}</span>}
              </span>
              {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (variant === "drawer") {
    return (
      <div className="border-b border-slate-100 px-2 pb-2 pt-1">
        <p className="px-3 pb-1 pt-1 text-xs font-semibold text-slate-500">Şube</p>
        {options}
      </div>
    );
  }

  return (
    <div className="hidden shrink-0 sm:block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Aktif şube: ${active?.name || "seçilmedi"}`}
        className="flex h-10 max-w-[180px] items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-left shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
      >
        <MapPin className="h-4 w-4 shrink-0" style={{ color: active?.colorCode || undefined }} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{active?.name || "Şube seçin"}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <ShellPopover open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} title="Aktif şube" width={300} align="start">
        <p className="px-4 pt-3 text-xs text-slate-500">Ekranlar ve yeni kayıtlar seçili şubeye göre çalışır.</p>
        {options}
      </ShellPopover>
    </div>
  );
}
