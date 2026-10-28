import type { AppointmentStatus, Prisma } from "@prisma/client";

// Randevu günü geçmiş ama kimse "Tamamlandı / Gelmedi / İptal" işaretlememiş
// kayıtlar. Ham ONAYLANDI eski istemcilerden kalan değerdir ve ekranda
// "Planlandı" görünür; ham GELDI ekranda "Bekliyor"dur (hasta gelmiş, randevu
// kapatılmamış). Durum otomatik değiştirilmez — yalnız personelin önüne konur.
// Randevular sayfasının sayacı (?lite=1), ana sayfanın "Bekleyen işler" satırı
// (?ozet=1) ve "Açık kalan randevular" penceresi aynı tanımı kullanır.
export const OPEN_PAST_STATUSES: AppointmentStatus[] = ["BEKLIYOR", "ONAYLANDI", "GELDI"];
export const OPEN_PAST_LOOKBACK_DAYS = 60;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function openPastWhere(scope: { institutionId: string; branchId: string }, todayStart: Date): Prisma.AppointmentWhereInput {
  return {
    ...scope,
    status: { in: OPEN_PAST_STATUSES },
    startAt: { gte: new Date(todayStart.getTime() - OPEN_PAST_LOOKBACK_DAYS * DAY_MS), lt: todayStart },
  };
}
