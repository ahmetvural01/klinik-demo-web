// Personel sayfası, personel penceresi ve şube erişimi sekmesinin ortak
// sabitleri. Hakediş oranlarının adları önceden üç ekranda elle eşleniyordu
// ("Hekim payı" / "Doktor payı"); tek kaynak burası.

export type RateKey = "kkYuzde" | "genelYuzde" | "maasYuzde";

/** Hakediş hesabının oran girilmemiş doktorda kullandığı değerler (bkz. /api/hakedis). */
export const DEFAULT_RATES: Record<RateKey, string> = { kkYuzde: "3", genelYuzde: "15", maasYuzde: "40" };

export const RATE_LABELS: ReadonlyArray<readonly [RateKey, string]> = [
  ["kkYuzde", "Kart komisyonu"],
  ["genelYuzde", "Genel gider payı"],
  ["maasYuzde", "Doktor payı"],
] as const;

export const RATE_HINTS: Record<RateKey, string> = {
  kkYuzde: "Kartla alınan tahsilattan düşülen banka komisyonu",
  genelYuzde: "Doktorun cirosundan düşülen genel gider payı",
  maasYuzde: "Giderler düşüldükten sonra doktora ödenen pay",
};

export function formatRate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? `%${number.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}` : "—";
}

/** Rol seçimi ve liste süzgeci aynı sırayla (önceden iki ekranda farklıydı). */
export const STAFF_ROLE_ORDER = ["DOKTOR", "ASISTAN", "BANKO", "MUHASEBE", "YONETICI"] as const;

/** Rol seçilirken altında görünen tek satır. Kesin yetkiler rol tablosundan gelir. */
export const ROLE_SUMMARIES: Record<string, string> = {
  DOKTOR: "Randevu alır; muayene, tedavi ve reçete kaydı girer.",
  ASISTAN: "Doktora yardım eder; hasta, randevu ve tedavi işleri.",
  BANKO: "Hasta kaydı, randevu ve tahsilat.",
  MUHASEBE: "Tahsilat, gider, alacaklar ve raporlar.",
  YONETICI: "Tüm ekranlar, personel ve ayarlar.",
};
