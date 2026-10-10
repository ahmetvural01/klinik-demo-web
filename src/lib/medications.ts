export type MedicationTemplate = {
  id: string;
  name: string;
  dose: string;
  usage: string;
  duration: string;
  /**
   * Etken madde (isteğe bağlı): reçetede hekim ilacı etken maddesiyle de
   * arar ("Amok" → Augmentin). Yoksa yalnız ada göre aranır.
   */
  ingredient?: string;
  /** Etken maddenin diğer yazımları (aramada eşleşir, ekranda görünmez). */
  keywords?: string[];
};

export const MEDICATION_TEMPLATES: MedicationTemplate[] = [
  { id: "amoksiklav_1000", name: "Augmentin", dose: "1000 mg", usage: "12 saatte 1", duration: "7 gün", ingredient: "Amoksisilin + klavulanik asit", keywords: ["amoksiklav", "amoxicillin", "klavulanat"] },
  { id: "arveles_25", name: "Arveles", dose: "25 mg", usage: "8 saatte 1 (tok)", duration: "3 gün", ingredient: "Deksketoprofen", keywords: ["dexketoprofen"] },
  { id: "majezik_100", name: "Majezik", dose: "100 mg", usage: "12 saatte 1 (tok)", duration: "5 gün", ingredient: "Flurbiprofen" },
  { id: "parol_500", name: "Parol", dose: "500 mg", usage: "Gerektikçe 8 saatte 1", duration: "3 gün", ingredient: "Parasetamol", keywords: ["paracetamol", "asetaminofen"] },
  { id: "kloroben", name: "Kloroben Gargara", dose: "15 ml", usage: "Günde 3 kez gargara", duration: "7 gün", ingredient: "Klorheksidin + benzidamin", keywords: ["chlorhexidine"] },
  { id: "corsodyl", name: "Corsodyl Gargara", dose: "15 ml", usage: "Günde 2 kez gargara", duration: "7 gün", ingredient: "Klorheksidin", keywords: ["chlorhexidine"] },
  { id: "nurofen_400", name: "Nurofen", dose: "400 mg", usage: "8 saatte 1", duration: "3 gün", ingredient: "İbuprofen" },
  { id: "flagyl_500", name: "Flagyl", dose: "500 mg", usage: "12 saatte 1", duration: "5 gün", ingredient: "Metronidazol", keywords: ["metronidazole"] },
  { id: "dikloron_75", name: "Dikloron", dose: "75 mg", usage: "12 saatte 1", duration: "3 gün", ingredient: "Diklofenak", keywords: ["diclofenac"] },
  { id: "mineadent_jel", name: "Mineadent Jel", dose: "İnce tabaka", usage: "Günde 2 kez lokal", duration: "7 gün" }
];

/** Hazır ilacın ad, etken madde ya da diğer yazımlardan biri aramayla eşleşiyor mu (Türkçe küçük harf). */
export function medicationMatches(template: MedicationTemplate, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase("tr-TR");
  if (!normalized) return true;
  return [template.name, template.ingredient || "", ...(template.keywords || [])]
    .some((text) => text.toLocaleLowerCase("tr-TR").includes(normalized));
}
