"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormErrorBanner } from "@/components/ui/FormField";
import { clientMutation } from "@/lib/client-mutation";
import { showToastSafe } from "@/lib/toast-client";
import { timeLabel, type DoctorBlock } from "@/components/randevu/appointment-utils";

type BlockActionModalProps = {
  block: DoctorBlock;
  doctorName: string;
  /** Takvimde tıklanan satırın başlangıcı (dakika). */
  slotMinutes: number;
  slotInterval: number;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
};

/**
 * Takvimde kapalı bir saate tıklanınca: yalnız o saati aç ya da kapalı
 * zamanın tamamını kaldır. Önceden yanlış girilmiş 13:00–17:00'ı kaldırmak
 * için her 15 dakikalık hücrede ayrı ayrı ✕'e basıp onay vermek gerekiyordu.
 */
export function BlockActionModal({ block, doctorName, slotMinutes, slotInterval, canManage, onClose, onChanged }: BlockActionModalProps) {
  const [busy, setBusy] = useState<"slot" | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const slotStart = timeLabel(slotMinutes);
  const slotEnd = timeLabel(slotMinutes + slotInterval);

  const run = async (kind: "slot" | "all") => {
    setBusy(kind);
    setError(null);
    try {
      const query = kind === "slot" ? `&slotStart=${slotStart}&slotEnd=${slotEnd}` : "";
      await clientMutation(`/api/doctor-blocks?id=${encodeURIComponent(block.id)}${query}`, { method: "DELETE" }, "Kapalı zaman güncellenemedi.");
      showToastSafe({ message: kind === "slot" ? `${slotStart}–${slotEnd} randevuya açıldı.` : `${block.startTime}–${block.endTime} kapalı zamanı kaldırıldı.`, type: "success" });
      onChanged();
      onClose();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Kapalı zaman güncellenemedi.");
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
      footer={<Button variant="secondary" onClick={onClose}>Vazgeç</Button>}
    >
      <div className="space-y-3">
        <FormErrorBanner message={error} />
        {canManage ? (
          <div className="flex flex-col gap-2">
            <Button variant="secondary" loading={busy === "slot"} disabled={Boolean(busy)} onClick={() => void run("slot")}>
              Yalnız {slotStart}–{slotEnd} saatini aç
            </Button>
            <Button variant="danger" loading={busy === "all"} disabled={Boolean(busy)} onClick={() => void run("all")}>
              Kapalı zamanın tamamını kaldır
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-600">Bu aralıkta doktora randevu verilemez. Kapalı zamanı yalnız klinik yöneticisi değiştirebilir.</p>
        )}
      </div>
    </Modal>
  );
}
