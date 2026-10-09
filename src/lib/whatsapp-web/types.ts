/**
 * WhatsApp QR bağlantısının (bağlı cihaz) sunucu ve tarayıcı arasında ortak
 * kullanılan tipleri. Bu dosya yan etkisizdir; istemci bileşenleri de
 * güvenle içe aktarabilir (Baileys veya Prisma yüklemez).
 */

/** WhatsappProviderConfig.code / providerType değeri (QR ile bağlı kendi numara). */
export const WHATSAPP_WEB_PROVIDER_CODE = "WHATSAPP_WEB";
export const WHATSAPP_WEB_PROVIDER_TYPE = "WHATSAPP_WEB";

/**
 * Gönderim sonucu `providerRaw` öneki: "WA_WEB_<KOD>". Günlük sınır dolduğunda
 * dispatch kutlama mesajlarını SMS'e aktarmamak için bu işareti arar.
 */
export const WHATSAPP_WEB_RAW_PREFIX = "WA_WEB_";
export const WHATSAPP_WEB_DAILY_LIMIT_MARKER = "WA_WEB_DAILY_LIMIT";

export type WhatsappWebState = "NOT_CONNECTED" | "QR" | "CONNECTING" | "CONNECTED" | "ERROR";

export type WhatsappWebPairingMethod = "qr" | "code";

export type WhatsappWebStatus = {
  state: WhatsappWebState;
  /** Bekleyen ya da son eşleştirme denemesinin yöntemi. */
  method: WhatsappWebPairingMethod | null;
  /** Yalnız `state === "QR"` ve yöntem QR iken dolu (data:image/png;base64,...). */
  qrDataUrl: string | null;
  /** Yalnız `state === "QR"` ve yöntem telefon numarası iken dolu (8 karakter). */
  pairingCode: string | null;
  /** Son eşleştirme denemesinin süresi doldu mu (kullanıcıya "Yeniden dene" gösterilir). */
  pairingExpired: boolean;
  /** Bağlı numara, "+90 5xx xxx xx xx" biçiminde (klinik kendi numarasını görür). */
  phone: string | null;
  name: string | null;
  /** Kullanıcıya gösterilecek hata açıklaması (Türkçe). */
  error: string | null;
  /** Hata olmayan ama bilinmesi gereken durum (ör. bağlantı telefondan kaldırıldı). */
  notice: string | null;
  connectedAt: string | null;
  /** WhatsApp gönderimi geçici olarak kısıtladıysa bitiş zamanı; bu sürede mesajlar SMS'e düşer. */
  restrictedUntil: string | null;
  dailySentCount: number;
  dailyLimit: number;
};

/** Gönderim sonucu kodları. SEND_UNCERTAIN dışındakiler mesajın kesin gitmediğini söyler. */
export type WhatsappWebSendCode =
  | "NOT_CONNECTED"
  | "NOT_ON_WHATSAPP"
  | "DAILY_LIMIT"
  | "QUEUE_TIMEOUT"
  | "QUEUE_FULL"
  | "RESTRICTED"
  | "CHECK_FAILED"
  | "INVALID_PHONE"
  | "SEND_FAILED"
  | "SEND_UNCERTAIN"
  | "UNAVAILABLE";

export type WhatsappWebSendResult =
  | { ok: true; messageId: string }
  | { ok: false; code: WhatsappWebSendCode; error: string };

export type WhatsappWebSendMeta = {
  patientId?: string | null;
  appointmentId?: string | null;
  purpose?: string | null;
};

/** /api/whatsapp/web GET yanıtı. */
export type WhatsappWebStatusResponse = WhatsappWebStatus & {
  /** QR/kod görme, bağlama, test ve bağlantıyı kesme yetkisi (klinik yöneticisi). */
  canManage: boolean;
};
