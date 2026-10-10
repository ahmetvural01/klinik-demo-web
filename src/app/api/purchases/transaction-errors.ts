import { Prisma } from "@prisma/client";
import { BusinessRuleError } from "@/lib/public-error";

/**
 * Satın alma işlemleri (kayıt, düzeltme, teslim, iptal) çok kalemli ve uzun
 * sürebilen etkileşimli işlemlerdir. Prisma varsayılanı 2 sn bağlantı
 * bekleme / 5 sn işlem süresiydi; yük altında "Teslim al" HTTP 500 veriyordu
 * (canlı test: 2/2 deneme). Veritabanı sorgu üst sınırı 15 sn olduğundan
 * işlem süresi bunun biraz üstünde tutulur.
 */
export const PURCHASE_TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

/** Bağlantı havuzu dolu (P2024), işlem süresi doldu (P2028), yazma çakışması/kilitlenme (P2034). */
const TRANSIENT_CODES = new Set(["P2024", "P2028", "P2034"]);

export function isTransientDbError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && TRANSIENT_CODES.has(error.code);
}

/**
 * Geçici veritabanı hatasında kullanıcıya söylenecek metin: işlem geri
 * alındığı için aynı formla (aynı istek anahtarıyla) yeniden denemek güvenlidir.
 */
export const BUSY_MESSAGE = "Sunucu şu an yoğun; işlem kaydedilmedi. Birkaç saniye sonra yeniden “Kaydet”e basın.";

/**
 * Stok geri alma kuralı ihlal edilirse (ör. partiden çıkış yapılmış) hata
 * mesajının başına ürün adı eklenir: kullanıcı hangi satırın engel olduğunu görür.
 */
export async function withProductName<T>(productName: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof BusinessRuleError) throw new BusinessRuleError(`${productName}: ${error.message}`, error.status);
    throw error;
  }
}
