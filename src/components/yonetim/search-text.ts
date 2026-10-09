// Türkçe arama için metin sadeleştirme. Önceden listeler `toLowerCase()`
// kullanıyordu: "İnley" küçültülünce "i̇nley" (noktalı i + birleşik nokta)
// oluyor ve "inley" araması hiçbir şey bulamıyordu. Burada önce Türkçe
// kurallarla küçültülür, sonra aksanlar ve ı/ş/ğ/ü/ö/ç sadeleştirilir —
// böylece "dis" yazan "Diş"i, "olcu" yazan "Ölçü"yü de bulur.
const TURKISH_FOLD: Record<string, string> = { ı: "i", ş: "s", ğ: "g", ü: "u", ö: "o", ç: "c" };

export function normalizeSearchText(value: string | null | undefined): string {
  return (value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ışğüöç]/g, (char) => TURKISH_FOLD[char] || char)
    .replace(/\s+/g, " ")
    .trim();
}

/** Sorgudaki her sözcük alanlardan en az birinde geçiyorsa true. */
export function matchesSearch(fields: Array<string | null | undefined>, query: string): boolean {
  const words = normalizeSearchText(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.map(normalizeSearchText).join(" ");
  return words.every((word) => haystack.includes(word));
}
