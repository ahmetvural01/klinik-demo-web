"use client";

import { Button } from "@/components/ui/Button";

type SaveBarProps = {
  /** Kaydedilmemiş değişiklik var mı? Yoksa çubuk görünmez. */
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  /** Değişiklikleri geri alır (son kaydedilmiş değerlere döner). */
  onDiscard: () => void;
  message?: string;
  saveLabel?: string;
};

/**
 * Uzun ayar formlarında "Kaydet" sayfanın en altında kayboluyordu. Değişiklik
 * yapıldığında ekranın altında yapışkan bir çubuk çıkar: kullanıcı nerede
 * olursa olsun kaydedebilir veya vazgeçebilir; değişiklik yoksa hiç görünmez.
 */
export function SaveBar({ dirty, saving = false, onSave, onDiscard, message = "Kaydedilmemiş değişiklik var", saveLabel = "Kaydet" }: SaveBarProps) {
  if (!dirty) return null;
  return (
    <div className="ui-save-bar sticky bottom-0 z-30 -mx-3 mt-4 border-t border-slate-200 bg-[rgb(var(--app-surface))]/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5" role="region" aria-label="Kaydedilmemiş değişiklikler">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-amber-700">{message}</p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onDiscard} disabled={saving}>Vazgeç</Button>
          <Button onClick={onSave} loading={saving}>{saveLabel}</Button>
        </div>
      </div>
    </div>
  );
}
