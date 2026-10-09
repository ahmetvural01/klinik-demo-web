/**
 * Kullanıcıya gösterilebilecek (Türkçe, teknik ayrıntı içermeyen) WhatsApp
 * QR bağlantısı hatası. `status` API yanıtının HTTP koduna çevrilir.
 */
export class WhatsappWebError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = "WhatsappWebError";
    this.status = options.status ?? 400;
    this.code = options.code ?? "WHATSAPP_WEB_ERROR";
  }
}

export const WHATSAPP_WEB_UNAVAILABLE_MESSAGE =
  "WhatsApp bağlantı bileşeni bu sunucuda çalıştırılamadı. Mesajlar SMS ile gitmeye devam eder; sistem yöneticisine bildirin.";
