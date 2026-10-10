"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormErrorBanner } from "@/components/ui/FormField";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { timeLabel, type DoctorBlock } from "@/components/randevu/appointment-utils";

type BlockActionModalProps = {
  block: DoctorBlock;
  doctorName: string;
  /** Takvimde tıklanan satırın başlangıcı (dakika). */
  slotMinutes: number;
  slotInterval: number;
  onClose: () => void;
  onChanged: () => void;
};

/**
 * Takvimde kapalı bir saate tıklanınca (yalnız zaman kapatma yetkisi olana
 * açılır): yalnız o saati aç ya da kapalı zamanın tamamını kaldır. Eylemler
 * pencerenin altında; "tamamını kaldır" onay ister (aynı işlem zaman kapatma
 * penceresinde de onaylı). Kayıt zaten silinmişse pencere kapanır, takvim
 * yenilenir (önceden "kayıt bulunamadı" hatasıyla açık kalıyordu).
 */
export function BlockActionModal({ block, doctorName, slotMinutes, slotInterval, onClose, onChanged }: BlockActionModalProps) {
  const [busy, setBusy] = useState<"slot" | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const slotStart = timeLabel(slotMinutes);
  const slotEnd = timeLabel(slotMinutes + slotInterval);
  const singleSlot = block.startTime === slotStart && block.endTime === slotEnd;

  const run = async (kind: "slot" | "all") => {
    if (kind === "all") {
      const confirmed = await confirmDialog({
        title: "Kapalı zaman kaldırılsın mı?",
        message: `${doctorName} · ${block.startTime}–${block.endTime}${block.reason ? ` (${block.reason})` : ""} tekrar randevuya açılır.`,
        confirmText: "Tamamını kaldır",
        cancelText: "Vazgeç",
        danger: true,
      });
      if (!confirmed) return;
    }
    setBusy(kind);
    setError(null);
    try {
      const query = kind === "slot" ? `&slotStart=${slotStart}&slotEnd=${slotEnd}` : "";
      const response = await fetch(`/api/doctor-blocks?id=${encodeURIComponent(block.id)}${query}`, { method: "DELETE" });
      if (response.status === 404) {
        showToastSafe({ message: "Bu kapalı zaman zaten kaldırılmış; takvim yenilendi.", type: "info" });
        onChanged();
        onClose();
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error((data && typeof data.message === "string" && data.message) || "Kapalı zaman güncellenemedi.");
      }
      showToastSafe({ message: kind === "slot" ? `${slotStart}–${slotEnd} randevuya açıldı.` : `${block.startTime}–${block.endTime} kapalı zamanı kaldırıldı.`, type: "success" });
      onChanged();
      onClose();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Bağlantı kurulamadı. Tekrar deneyin.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open
      size="sm"
      module="calendar"
      onClose={onClose}
      title="Kapalı zaman"
      description={`${doctorName} · ${block.startTime}–${block.endTime}${block.reason ? ` · ${block.reason}` : ""}`}
      footer={(
        <>
          <Button variant="danger-ghost" className="mr-auto" loading={busy === "all"} disabled={Boolean(busy)} onClick={() => void run("all")}>
            Tamamını kaldır
          </Button>
          {!singleSlot && (
            <Button variant="secondary" loading={busy === "slot"} disabled={Boolean(busy)} onClick={() => void run("slot")}>
              Yalnız {slotStart}–{slotEnd}&apos;i aç
            </Button>
          )}
        </>
      )}
    >
      <div className="space-y-3">
        <FormErrorBanner message={error} />
        <p className="text-sm text-slate-600">Bu aralıkta doktora randevu verilemez. Yalnız tıkladığınız saati ya da kapalı zamanın tamamını açabilirsiniz.</p>
      </div>
    </Modal>
  );
}
