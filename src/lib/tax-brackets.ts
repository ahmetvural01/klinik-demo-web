// Gelir vergisi tarifesinin TEK kaynağı: Raporlar > Vergi (tahmini) hem sunucu
// hesabı (api/reports) hem de ekrandaki "Vergi dilimleri" listesi buradan
// okur. Önceden iki yerde ayrı ayrı yazılıydı; biri değişince öteki eski
// kalıyordu.
//
// Değerler ürün sahibinin kararı (Karar 3) gelene kadar bugünkü haliyle
// kalır: serbest meslek / ticari kazanç dilimleri mali müşavirle doğrulanınca
// yalnız bu dosya güncellenir.
// Saf modül: sunucuda ve tarayıcıda kullanılır (veritabanı ya da Prisma yok).

/** Tarifenin yılı (ekranda "2026 tarifesi"). */
export const INCOME_TAX_TARIFF_YEAR = 2026;

export type IncomeTaxBracket = {
  /** Dilimin üst sınırı (TL, dahil); son dilimde sınır yok. */
  upTo: number;
  /** Oran (yüzde). */
  ratePercent: number;
};

export const INCOME_TAX_BRACKETS: readonly IncomeTaxBracket[] = [
  { upTo: 190_000, ratePercent: 15 },
  { upTo: 400_000, ratePercent: 20 },
  { upTo: 1_500_000, ratePercent: 27 },
  { upTo: 5_300_000, ratePercent: 35 },
  { upTo: Number.POSITIVE_INFINITY, ratePercent: 40 },
];

/**
 * Yıllık matrahın tahmini gelir vergisi (artan oranlı, dilim dilim). Sonuç
 * kuruşa yuvarlanmaz; çağıran yuvarlar.
 */
export function calculateIncomeTax(matrah: number): number {
  if (!Number.isFinite(matrah) || matrah <= 0) return 0;
  let tax = 0;
  let previous = 0;
  for (const bracket of INCOME_TAX_BRACKETS) {
    const rate = bracket.ratePercent / 100;
    if (matrah <= bracket.upTo) {
      tax += (matrah - previous) * rate;
      break;
    }
    tax += (bracket.upTo - previous) * rate;
    previous = bracket.upTo;
  }
  return tax;
}

const tl = (value: number) => value.toLocaleString("tr-TR");

/** Ekrandaki dilim satırları: ["190.001 – 400.000 TL", "%20"]. */
export function incomeTaxBracketRows(): Array<[string, string]> {
  let previous = 0;
  return INCOME_TAX_BRACKETS.map((bracket) => {
    const label = Number.isFinite(bracket.upTo)
      ? `${previous === 0 ? "0" : tl(previous + 1)} – ${tl(bracket.upTo)} TL`
      : `${tl(previous + 1)} TL üzeri`;
    if (Number.isFinite(bracket.upTo)) previous = bracket.upTo;
    return [label, `%${bracket.ratePercent}`];
  });
}
