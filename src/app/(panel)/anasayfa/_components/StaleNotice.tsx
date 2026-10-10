"use client";

import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Callout } from "@/components/ui/Callout";
import { Button } from "@/components/ui/Button";

/**
 * Kartın altındaki "yenilenemedi" şeridi: eldeki liste ekranda kalır, yanında
 * kısa uyarı ve "Yeniden dene". Ortak Callout ile (önceden üç kartta elle
 * `border-amber-200 bg-amber-50` kutusu + ham <button> vardı); kart kenarına
 * yapışık durur (köşe ve yan kenarlık yok).
 */
export function StaleNotice({ children, onRetry, busy = false }: { children: ReactNode; onRetry?: () => void; busy?: boolean }) {
  return (
    <Callout
      tone="warning"
      compact
      className="!rounded-none !border-x-0 !border-b-0"
      action={onRetry ? (
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={onRetry} disabled={busy}>
          Yeniden dene
        </Button>
      ) : undefined}
    >
      {children}
    </Callout>
  );
}
