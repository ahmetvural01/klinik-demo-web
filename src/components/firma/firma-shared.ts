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
