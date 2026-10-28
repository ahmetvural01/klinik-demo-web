/** Firma entegrasyonunun ve demo veri betiklerinin iç eşleştirme etiketlerini (kullanıcıya gösterilmemesi gereken) temizler. */
export function stripSystemTags(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\s*\[SISTEM:[A-Z_]+:[^\]]+\]/g, "")
    .replace(/\[DEMO_[A-Z0-9_]+\](-[A-Z0-9]+)*\s*/g, "")
    .replace(/^-[A-Z]+(-[A-Z0-9]+)*\s+/, "")
    // Eski lab ücreti kayıtlarındaki iç kimlikler ("Lab Sipariş: cmv…") kullanıcıya gösterilmez.
    .replace(/\s*\|?\s*Lab (Sipariş|Fatura Kaydı): [A-Za-z0-9_-]+/g, "")
    .replace(/^\s*\|\s*/, "")
    .replace(/\s*\|\s*$/, "")
    .trim();
}
