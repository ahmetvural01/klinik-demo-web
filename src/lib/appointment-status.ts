// Randevu durumu DB'de her zaman BEKLIYOR/GELDI/GELMEDI/IPTAL olarak saklanır
// (çakışma kontrolü, hatırlatma senkronu vb. bu değerlere göre çalışır — bkz.
// src/app/api/appointments). Ancak "Bekliyor" personel için yalnızca randevu
// saati geldiğinde anlamlı bir eylem durumudur ("hasta bekleniyor, geldi mi
// gelmedi mi işaretlenecek"); henüz başlamamış bir randevuyu aynı etiketle
// göstermek "randevu oluşturur oluşturmaz Bekliyor'a dönüyor" gibi mantıksız
// görünüyordu (bkz. kullanıcı geri bildirimi). Bu modül DB durumunu hiç
// değiştirmeden yalnızca EKRANDA gösterilecek durumu türetir.

export type RawAppointmentStatus = "BEKLIYOR" | "GELDI" | "GELMEDI" | "IPTAL" | string;
export type DisplayAppointmentStatus = "PLANLANDI" | "BEKLIYOR" | "GELDI" | "GELMEDI" | "IPTAL";

export const APPOINTMENT_DISPLAY_STATUS_LABELS: Record<DisplayAppointmentStatus, string> = {
  PLANLANDI: "Planlandı",
  BEKLIYOR: "Bekliyor",
  GELDI: "Geldi",
  GELMEDI: "Gelmedi",
  IPTAL: "İptal",
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
 * Ekranda gösterilecek durum — DB'deki gerçek `status` alanını asla değiştirmez.
 * BEKLIYOR + henüz başlamamış randevu → "Planlandı"; randevu saati geldiğinde
 * (veya geçtiğinde) gerçek "Bekliyor" (check-in bekleniyor) etiketi görünür.
 */
export function getDisplayAppointmentStatus(status: RawAppointmentStatus, startAt: string | Date, now: Date = new Date()): DisplayAppointmentStatus {
  if (status === "BEKLIYOR" && isAppointmentUpcoming(startAt, now)) return "PLANLANDI";
  return (status as DisplayAppointmentStatus) in APPOINTMENT_DISPLAY_STATUS_LABELS ? (status as DisplayAppointmentStatus) : "BEKLIYOR";
}

/**
 * Randevu günü tamamen geçmiş ama kimse Geldi/Gelmedi/İptal işaretlememiş —
 * otomatik olarak Gelmedi'ye çevrilmez (bu bir varsayım olurdu, personel
 * onaylamalı), yalnızca dikkat çekmesi için işaretlenir.
 */
export function isStaleWaitingAppointment(status: RawAppointmentStatus, startAt: string | Date, now: Date = new Date()): boolean {
  return status === "BEKLIYOR" && isAppointmentPastDay(startAt, now);
}

/**
 * "Gelmedi" yalnızca randevu saati geldikten/geçtikten sonra anlamlıdır —
 * henüz olmamış bir randevu için "gelmedi" denemez.
 *
 * "Geldi" bunun tam tersi: hasta randevu saatinden ÖNCE gelmiş olabilir
 * (erken gelen hasta çok yaygın bir senaryo) — bu yüzden Geldi randevu
 * saatinden bağımsız, her zaman işaretlenebilir olmalı (bkz. kullanıcı
 * geri bildirimi). Yalnızca Gelmedi zamana bağlı kısıtlanır.
 */
export function canMarkNoShow(startAt: string | Date, now: Date = new Date()): boolean {
  return !isAppointmentUpcoming(startAt, now);
}
