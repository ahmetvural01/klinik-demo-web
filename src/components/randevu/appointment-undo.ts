"use client";

import { patchAppointment } from "@/components/randevu/appointment-api";
import { statusChipLabel, type Appointment } from "@/components/randevu/appointment-utils";
import { showToastSafe } from "@/lib/toast-client";

/**
 * Durum değişikliğini geri alır (bildirimdeki "Geri al"): yanlış satıra
 * dokunularak verilen "Geldi / Gelmedi / Tamamla" tek dokunuşla eski hâline
 * döner. İptal onaylı yapıldığı (ve hastaya mesaj gidebildiği) için geri
 * alma iptalde kullanılmaz.
 */
export async function undoAppointmentStatus(appointment: Appointment, previous: string, onChanged: (appointment: Appointment) => void) {
  const result = await patchAppointment(appointment.id, { status: previous });
  if (!result.ok) {
    showToastSafe({ message: result.message || "Geri alınamadı; durumu randevudan değiştirin.", type: "error" });
    return;
  }
  onChanged({ ...appointment, status: previous });
  showToastSafe({ message: `${appointment.patient?.fullName || "Hasta"} · ${statusChipLabel(previous)} durumuna geri alındı`, type: "info" });
}
