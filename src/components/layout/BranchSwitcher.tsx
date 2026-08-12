"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, MapPin } from "lucide-react";
import { clearBranchSensitiveClientCaches } from "@/lib/client-cache";
import { showToastSafe } from "@/lib/toast-client";

type Branch = {
  id: string;
  name: string;
  code: string | null;
  colorCode: string;
  isHeadquarters: boolean;
};

type BranchContextResponse = {
  activeBranchId: string | null;
  activeBranch: Branch | null;
  branches: Branch[];
};

export function BranchSwitcher() {
  const [context, setContext] = useState<BranchContextResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    void fetch("/api/branches", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || "Şubeler yüklenemedi.");
        return data;
      })
      .then((data) => { if (!cancelled) setContext(data); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (loadError) {
    return (
      <button
        type="button"
        onClick={() => setReloadKey((value) => value + 1)}
        title="Şube listesini yeniden yükle"
        className="hidden h-10 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 text-xs font-bold text-amber-800 sm:flex"
      >
        <AlertTriangle className="h-4 w-4" />
        Şube yüklenemedi
      </button>
    );
  }
  if (!context || context.branches.length === 0) return null;

  const currentLabel = context.activeBranch?.name || "Şube seçin";
  const choose = async (branchId: string) => {
    if (switching || branchId === context.activeBranchId) {
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
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Şube değiştirilemedi.");
      clearBranchSensitiveClientCaches();
      window.location.reload();
    } catch (error) {
      setSwitching(false);
      showToastSafe({ title: "Şube değiştirilemedi", message: error instanceof Error ? error.message : "Lütfen tekrar deneyin.", type: "error" });
    }
  };

  return (
    <div ref={rootRef} className="relative hidden shrink-0 sm:block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="group flex h-10 max-w-[190px] items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-left shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition hover:border-primary/30 hover:bg-primary/[0.025]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-white">
          <MapPin className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-bold uppercase text-slate-400">Aktif şube</span>
          <span className="block truncate text-xs font-extrabold text-slate-800">{currentLabel}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="ui-popover absolute left-0 top-full z-[240] mt-2 w-72 overflow-hidden p-1.5" role="listbox" aria-label="Aktif şube">
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="text-xs font-extrabold text-slate-900">Çalışma konumu</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Ekranlar ve yeni kayıtlar seçili şubeye göre çalışır.</p>
          </div>
          {context.branches.map((branch) => {
            const selected = branch.id === context.activeBranchId;
            return (
              <button key={branch.id} type="button" role="option" aria-selected={selected} onClick={() => void choose(branch.id)} className="flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left hover:bg-slate-50">
                <span className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${branch.colorCode}18`, color: branch.colorCode }}><MapPin className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{branch.name}</span><span className="block text-[10px] text-slate-500">{branch.isHeadquarters ? "Merkez şube" : branch.code || "Şube"}</span></span>
                {selected && <Check className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
