/**
 * Ödeme yöntemi sözlüğü — uygulama genelinde TEK kaynak (etiket, POS kuralı,
 * hakediş yöntemleri).
 *
 * Neden: aynı yöntem en az sekiz yerde ayrı yazılmıştı ve ekrandan ekrana
 * farklı görünüyordu ("Kredi Kartı" / "Kredi kartı", "Havale/EFT" /
 * "Havale / EFT", "Mail Order" / "Mail order"). Sunucu tarafındaki geçerli
 * değerler (Prisma `PaymentMethod` enum'u ve api/payments, api/gider,
 * api/taksit-plani, api/firma doğrulamaları) bu listeyle aynıdır.
 */

export const PAYMENT_METHOD_VALUES = ["NAKIT", "KREDI_KARTI", "HAVALE_EFT", "MAIL_ORDER", "DIGER"] as const;

export type PaymentMethod = (typeof PAYMENT_METHOD_VALUES)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  NAKIT: "Nakit",
  KREDI_KARTI: "Kredi kartı",
  HAVALE_EFT: "Havale/EFT",
  MAIL_ORDER: "Mail order",
  DIGER: "Diğer",
};

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHOD_VALUES as readonly string[]).includes(value);
}

/** Ekranda gösterilecek ad; bilinmeyen değer olduğu gibi, boş değer "" döner. */
export function paymentMethodLabel(method?: string | null): string {
  if (!method) return "";
  return isPaymentMethod(method) ? PAYMENT_METHOD_LABELS[method] : method;
}

/**
 * Hastadan alınan TAHSİLATTA kart / mail order için POS cihazı zorunludur,
 * diğer yöntemlerde POS seçilemez (api/payments, api/taksit-plani ve taksit
 * tahsilatı aynı kuralı uygular). Gider ve tedarikçi ödemelerinde POS yoktur.
 */
const POS_REQUIRED_METHODS: ReadonlySet<string> = new Set<PaymentMethod>(["KREDI_KARTI", "MAIL_ORDER"]);
export function requiresPos(method: string | null | undefined): boolean {
  return Boolean(method) && POS_REQUIRED_METHODS.has(String(method));
}

/** Doktor hakedişi ödemeleri yalnız nakit veya havale/EFT ile yapılır (api/gider aynı kuralı uygular). */
export const DOCTOR_PAYOUT_METHODS: readonly PaymentMethod[] = ["NAKIT", "HAVALE_EFT"];

/** Tedarikçi (firma) ödemelerinde en sık kullanılan yöntem önde; varsayılan Havale/EFT. */
export const VENDOR_PAYMENT_METHODS: readonly PaymentMethod[] = ["HAVALE_EFT", "NAKIT", "KREDI_KARTI", "MAIL_ORDER", "DIGER"];

export type PaymentMethodOption = { value: PaymentMethod; label: string };

/** Seçici seçenekleri (verilen sırayla). */
export function paymentMethodOptions(methods: readonly PaymentMethod[] = PAYMENT_METHOD_VALUES): PaymentMethodOption[] {
  return methods.map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] }));
}
