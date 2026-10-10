/** Firma türleri: ekranda görünen ad (kod adları ekranda görünmez). */
export const FIRMA_KATEGORILERI: Record<string, string> = {
  TEDARICI: "Tedarikçi",
  HIZMET_SAGLAYICI: "Hizmet sağlayıcı",
  LAB: "Laboratuvar",
  KONTRAKTOR: "Yüklenici",
  BANK: "Banka",
  DIGER: "Diğer",
};

/** Telefonu arama bağlantısına çevirir (yalnız rakam ve +). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** Tedarikçi formunun düzenlediği alanlar (liste ve detay aynı formu kullanır). */
export type FirmaFormValues = {
  id?: string;
  name: string;
  kategori: string;
  phone?: string | null;
  iban?: string | null;
  ibanName?: string | null;
  notes?: string | null;
};

/** "TR12 0006 1005 ..." → "TR120006..." (boşluksuz, büyük harf). */
export function compactIban(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** Okunur yazım: dörderli gruplar ("TR12 0006 1005 1978 ..."). */
export function formatIban(value: string): string {
  return compactIban(value).replace(/(.{4})/g, "$1 ").trim();
}

/**
 * IBAN denetimi (boşsa geçerli). Türkiye IBAN'ı 26 karakterdir; diğer
 * ülkeler 15-34. ISO 13616 mod-97 kontrol basamağı da doğrulanır — tek
 * yanlış rakam ödemenin başka hesaba gitmesine yol açabilir.
 */
export function ibanError(value: string | null | undefined): string | null {
  const iban = compactIban(value || "");
  if (!iban) return null;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return "IBAN harf ve rakamdan oluşmalı (ör. TR12 0006 1005 …).";
  if (iban.startsWith("TR") && iban.length !== 26) return `Türkiye IBAN'ı 26 karakterdir (girilen ${iban.length}).`;
  if (iban.length < 15 || iban.length > 34) return "IBAN uzunluğu geçerli değil.";
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1 ? null : "IBAN geçerli değil; rakamları kontrol edin.";
}
