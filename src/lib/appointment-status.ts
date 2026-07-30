// Randevu durumu DB'de her zaman BEKLIYOR/GELDI/TAMAMLANDI/GELMEDI/IPTAL olarak
// saklanır (çakışma kontrolü, hatırlatma senkronu, paket kullanım kontrolü vb.
// bu ham değerlere göre çalışır — bkz. src/app/api/appointments,
// src/app/api/patient-packages/[id]/use). Bu modül DB durumunu hiç
// değiştirmeden yalnızca EKRANDA gösterilecek/ekrandan seçilecek durumu türetir:
//
// - Ham "BEKLIYOR" (varsayılan, randevu oluşturulduğunda) → EKRANDA "Planlandı"
//   gösterilir. Randevu oluşturur oluşturmaz "Bekliyor" yazması, hasta henüz
//   gelmemişken kafa karıştırıyordu (bkz. kullanıcı geri bildirimi).
// - Ham "GELDI" → EKRANDA "Bekliyor" gösterilir: personel hasta GELDİĞİNDE bu
//   durumu seçer ve bu artık "hasta geldi, bekleme salonunda" anlamına gelir —
//   doktor/asistan/diğer personel bu etiketi görünce hastanın klinikte
//   olduğunu anlar (bkz. kullanıcı geri bildirimi).
// - Ham "TAMAMLANDI" → aynı gün tedavi yapılıp ödeme alındığında otomatik
//   (bkz. /api/payments POST) veya personel tarafından manuel işaretlenir.
// - Ham "GELMEDI"/"IPTAL" → değişmeden "Gelmedi"/"İptal" gösterilir.
export type RawAppointmentStatus = "BEKLIYOR" | "GELDI" | "TAMAMLANDI" | "GELMEDI" | "IPTAL" | string;
export type DisplayAppointmentStatus = "PLANLANDI" | "BEKLIYOR" | "TAMAMLANDI" | "GELMEDI" | "IPTAL";

export const APPOINTMENT_DISPLAY_STATUS_LABELS: Record<DisplayAppointmentStatus, string> = {
  PLANLANDI: "Planlandı",
  BEKLIYOR: "Bekliyor",
  TAMAMLANDI: "Tamamlandı",
  GELMEDI: "Gelmedi",
  IPTAL: "İptal",
};

const RAW_TO_DISPLAY: Record<string, DisplayAppointmentStatus> = {
  BEKLIYOR: "PLANLANDI",
  GELDI: "BEKLIYOR",
  TAMAMLANDI: "TAMAMLANDI",
  GELMEDI: "GELMEDI",
  IPTAL: "IPTAL",
};

/** Randevu saati henüz gelmediyse (bugün daha ileri bir saat veya ileri bir tarih). */
export function isAppointmentUpcoming(startAt: string | Date, now: Date = new Date()): boolean {
  return new Date(startAt).getTime() > now.getTime();
}

/** Randevu günü bugünden önce miydi (saat değil, takvim günü karşılaştırması). */
export function isAppointmentPastDay(startAt: string | Date, now: Date = new Date()): boolean {
  const start = new Date(startAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.getTime() < startOfToday.getTime();
}

/**
 * Ekranda gösterilecek/ekrandan seçilecek durum — DB'deki gerçek `status`
 * alanını asla değiştirmez. `startAt`/`now` parametreleri geriye dönük
 * çağrı uyumluluğu için tutulur (artık kullanılmaz — eşleme zamana bağlı
 * değildir, yalnızca ham durum değerine göre sabittir).
 */
export function getDisplayAppointmentStatus(status: RawAppointmentStatus, _startAt?: string | Date, _now?: Date): DisplayAppointmentStatus {
  return RAW_TO_DISPLAY[status] ?? "PLANLANDI";
}

/**
 * Randevu günü tamamen geçmiş ama kimse Bekliyor/Gelmedi/İptal/Tamamlandı
 * işaretlememiş (hâlâ ham BEKLIYOR = ekranda "Planlandı") — otomatik olarak
 * değiştirilmez (bu bir varsayım olurdu, personel onaylamalı), yalnızca
 * dikkat çekmesi için işaretlenir.
 */
export function isStaleWaitingAppointment(status: RawAppointmentStatus, startAt: string | Date, now: Date = new Date()): boolean {
  return status === "BEKLIYOR" && isAppointmentPastDay(startAt, now);
}

/**
 * "Gelmedi" yalnızca randevu saati geldikten/geçtikten sonra anlamlıdır —
 * henüz olmamış bir randevu için "gelmedi" denemez.
 *
 * Hasta geldiğinde işaretlenen "Bekliyor" (ham GELDI) bunun tam tersi: hasta
 * randevu saatinden ÖNCE gelmiş olabilir (erken gelen hasta çok yaygın bir
 * senaryo) — bu yüzden randevu saatinden bağımsız her zaman işaretlenebilir
 * olmalı (bkz. kullanıcı geri bildirimi). Yalnızca Gelmedi zamana bağlı
 * kısıtlanır. "Tamamlandı" da manuel olarak her zaman işaretlenebilir
 * (aynı gün tedavi/ödeme otomatik tetikler, ama personel de dilediği an
 * elle işaretleyebilmeli — bkz. kullanıcı geri bildirimi).
 */
export function canMarkNoShow(startAt: string | Date, now: Date = new Date()): boolean {
  return !isAppointmentUpcoming(startAt, now);
}
