import { useEffect } from "react";
import type { MouseEvent } from "react";

/** Modal açıkken ESC tuşuna basılınca kapatır. */
export function useEscapeClose(onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, onClose]);
}

/** Modal arka planına (içeriğin dışına) tıklanınca kapatır. Backdrop div'ine spread edilir. */
export function backdropClose(onClose: () => void) {
  return {
    onClick: (e: MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
  };
}
