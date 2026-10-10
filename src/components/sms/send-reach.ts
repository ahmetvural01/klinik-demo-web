// Mesaj gönder özeti: kaç hastaya GERÇEKTEN gideceği, hangi kanaldan ve en
// fazla kaç kredi harcanacağı. Kural merkezi gönderim kapısıyla aynıdır
// (src/lib/notification-dispatch.ts): WhatsApp yolunda izni olan (WhatsApp'ı
// kapatmamış) hastaya WhatsApp'tan, olmayana SMS yedeği açıksa SMS ile gider;
// SMS yolunda yalnız SMS izni olanlara gider; SMS kapalıysa SMS ile hiçbir şey
// gitmez. Önceden ekran kurumun kanal ayarını ve SMS yedeğini hesaba katmıyor,
// "Yalnız WhatsApp" seçiliyken "0 kredi" deyip SMS'e düşebiliyordu.

export type SendRoute = {
  /** Mesaj WhatsApp yolundan mı gidiyor (bağlı numara + seçim). */
  viaWhatsapp: boolean;
  /** WhatsApp'tan gidemeyen mesaj SMS ile denenir mi (kurum ayarı). */
  smsFallback: boolean;
  /** Kurumda SMS gönderimi açık mı. */
  smsOn: boolean;
};

/** api/sms/bulk/preview yanıtının gereken alanları. */
export type BulkPreviewCounts = {
  total: number;
  noPhone: number;
  smsConsent: number;
  whatsappConsent: number;
  eitherConsent: number;
  professionExcluded: number;
  smsBalance: number;
};

export type BulkReach = {
  total: number;
  deliverable: number;
  whatsapp: number;
  sms: number;
  noPhone: number;
  /** Telefonu olan ama izni (kanala göre) olmayanlar. */
  noPermission: number;
  /** SMS ile gidecekken SMS kapalı olduğu için gitmeyecekler. */
  smsBlocked: number;
  professionExcluded: number;
  /** Üst sınır: WhatsApp'tan gidemeyen mesaj da yedekle SMS'e düşebilir. */
  maxCredits: number;
  balance: number;
};

export function computeBulkReach(preview: BulkPreviewCounts, route: SendRoute): BulkReach {
  const withPhone = preview.total - preview.noPhone;
  const whatsapp = route.viaWhatsapp ? preview.whatsappConsent : 0;
  const smsCandidates = route.viaWhatsapp
    ? (route.smsFallback ? preview.eitherConsent - preview.whatsappConsent : 0)
    : preview.smsConsent;
  const sms = route.smsOn ? smsCandidates : 0;
  const smsBlocked = route.smsOn ? 0 : smsCandidates;
  const deliverable = whatsapp + sms;
  const maxCredits = !route.smsOn ? 0 : route.viaWhatsapp ? (route.smsFallback ? preview.smsConsent : 0) : preview.smsConsent;
  return {
    total: preview.total,
    deliverable,
    whatsapp,
    sms,
    noPhone: preview.noPhone,
    noPermission: Math.max(0, withPhone - deliverable - smsBlocked),
    smsBlocked,
    professionExcluded: preview.professionExcluded,
    maxCredits,
    balance: preview.smsBalance,
  };
}

/** api/sms/send GET (gönderim öncesi kontrol) yanıtı. */
export type SingleCheckCounts = { hasPhone: boolean; smsConsent: string; whatsappConsent: boolean; smsBalance: number };

export type SingleReach =
  | { ok: true; channel: "WHATSAPP" | "SMS"; /** WhatsApp gidemezse SMS'e düşer ve 1 kredi harcar. */ backupCredit: boolean }
  | { ok: false; problem: "phone" | "whatsapp" | "consent" | "sms-off" | "credit" };

export function computeSingleReach(check: SingleCheckCounts, route: SendRoute): SingleReach {
  if (!check.hasPhone) return { ok: false, problem: "phone" };
  const smsOk = check.smsConsent === "ENABLED";
  if (route.viaWhatsapp && check.whatsappConsent) {
    return { ok: true, channel: "WHATSAPP", backupCredit: route.smsFallback && smsOk && route.smsOn };
  }
  if (route.viaWhatsapp && !route.smsFallback) return { ok: false, problem: "whatsapp" };
  if (!smsOk) return { ok: false, problem: "consent" };
  if (!route.smsOn) return { ok: false, problem: "sms-off" };
  if (check.smsBalance < 1) return { ok: false, problem: "credit" };
  return { ok: true, channel: "SMS", backupCredit: false };
}
