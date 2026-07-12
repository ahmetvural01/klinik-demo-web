const CATEGORY_ALIASES: Record<string, string[]> = {
  "Anestezi": ["Anestezi", "ANESTEZI"],
  "İmplant": ["İmplant", "Implant", "İMPLANT", "IMPLANT"],
  "Protez": ["Protez", "PROTEZ"],
  "Dolgu": ["Dolgu", "DOLGU"],
  "Ortodonti": ["Ortodonti", "ORTODONTI"],
  "Cerrahi": ["Cerrahi", "CERRAHI"],
  "Sarf": ["Sarf", "SARF"],
  "Diğer": ["Diğer", "Diger", "DİĞER", "DIGER"],
};

export function normalizeCategory(value?: string | null) {
  if (!value) return "Sarf";
  const normalized = value.trim();
  for (const [label, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((alias) => alias.toLocaleLowerCase("tr-TR") === normalized.toLocaleLowerCase("tr-TR"))) {
      return label;
    }
  }
  return normalized;
}
