"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";

type BulkActionBarProps = {
  /** Seçili kayıt sayısı; 0 iken şerit görünmez (yer de kaplamaz). */
  count: number;
  /**
   * Seçili kayıtlarla yapılacak eylemler — küçük ikincil düğmeler
   * (`<Button size="sm" variant="secondary">`). Tehlikeli eylem sonda, danger.
   */
  actions?: ReactNode;
  /** "Seçimi kaldır": seçimi boşaltır. */
  onClear: () => void;
  /** Sayının adı: "hasta" → "3 hasta seçildi". Verilmezse "3 seçildi". */
  itemLabel?: string;
};

/**
 * Çoklu seçimli listenin üstündeki TEK toplu işlem şeridi:
 * "N seçildi · [eylemler] · Seçimi kaldır". ListTable'ın `header`
 * yuvasına koşulsuz konur; seçim yokken hiçbir şey çizmez.
 * Önceden toplu eylemler başlık kutusuna elle ve farklı biçimde
 * ("Yapıldı olarak işaretle (3)") yazılıyordu.
 *
 *   <ListTable selection={{ selectedIds, onChange: setSelectedIds }}
 *     header={<BulkActionBar count={selectedIds.length} itemLabel="hasta"
 *       onClear={() => setSelectedIds([])}
 *       actions={<Button size="sm" variant="secondary" icon={Send}>Mesaj gönder</Button>} />}
 *     … />
 */
export function BulkActionBar({ count, actions, onClear, itemLabel }: BulkActionBarProps) {
  const selected = count > 0;
  const text = `${count.toLocaleString("tr-TR")}${itemLabel ? ` ${itemLabel}` : ""} seçildi`;
  return (
    <>
      {/* Canlı bölge şerit kapanınca da DOM'da kalır; seçim değişince ekran okuyucu sayıyı duyar. */}
      <p className="sr-only" aria-live="polite">{selected ? text : ""}</p>
      {selected && (
        <div
          role="group"
          aria-label="Seçili kayıtlar için işlemler"
          className="ui-bulk-action-bar flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/15 bg-primary/[0.06] px-4 py-2"
        >
          <span className="order-1 text-sm font-bold tabular-nums text-primary" aria-hidden="true">{text}</span>
          {actions && (
            <div className="order-3 flex basis-full flex-wrap items-center gap-2 sm:order-2 sm:basis-auto">{actions}</div>
          )}
          <Button variant="ghost" size="sm" icon={X} onClick={onClear} className="order-2 ml-auto sm:order-3">
            Seçimi kaldır
          </Button>
        </div>
      )}
    </>
  );
}
