"use client";

import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useOutsideClick } from "@/lib/use-outside-click";

type Props = {
  onExcel: () => void | Promise<void>;
  onPdf?: () => void | Promise<void>;
  disabled?: boolean;
};

/** Tek "Dışa aktar" düğmesi; Excel (CSV, Türkçe Excel'de doğru açılır) ve isteğe bağlı PDF. */
export function ExportMenu({ onExcel, onPdf, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false), open);

  const run = async (action: () => void | Promise<void>) => {
    setOpen(false);
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  };

  return (
    <div ref={ref} className="relative">
      <Button
        variant="secondary"
        size="sm"
        icon={Download}
        loading={busy}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Dışa aktar
      </Button>
      {open && (
        <div role="menu" className="ui-popover absolute right-0 top-full z-40 mt-1 min-w-[160px] py-1">
          <button type="button" role="menuitem" onClick={() => void run(onExcel)} className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
            Excel (CSV)
          </button>
          {onPdf && (
            <button type="button" role="menuitem" onClick={() => void run(onPdf)} className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
              PDF
            </button>
          )}
        </div>
      )}
    </div>
  );
}
