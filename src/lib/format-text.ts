/** Firma entegrasyonunun ve demo veri betiklerinin iç eşleştirme etiketlerini (kullanıcıya gösterilmemesi gereken) temizler. */
export function stripSystemTags(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\s*\[SISTEM:[A-Z_]+:[^\]]+\]/g, "")
    .replace(/\[DEMO_[A-Z0-9_]+\](-[A-Z0-9]+)*\s*/g, "")
    .replace(/^-[A-Z]+(-[A-Z0-9]+)*\s+/, "")
    .trim();
}
