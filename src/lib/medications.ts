export type MedicationTemplate = {
  id: string;
  name: string;
  dose: string;
  usage: string;
  duration: string;
};

export const MEDICATION_TEMPLATES: MedicationTemplate[] = [
  { id: "amoksiklav_1000", name: "Augmentin", dose: "1000 mg", usage: "12 saatte 1", duration: "7 gün" },
  { id: "arveles_25", name: "Arveles", dose: "25 mg", usage: "8 saatte 1 (tok)", duration: "3 gün" },
  { id: "majezik_100", name: "Majezik", dose: "100 mg", usage: "12 saatte 1 (tok)", duration: "5 gün" },
  { id: "parol_500", name: "Parol", dose: "500 mg", usage: "Gerektikçe 8 saatte 1", duration: "3 gün" },
  { id: "kloroben", name: "Kloroben Gargara", dose: "15 ml", usage: "Günde 3 kez gargara", duration: "7 gün" },
  { id: "corsodyl", name: "Corsodyl Gargara", dose: "15 ml", usage: "Günde 2 kez gargara", duration: "7 gün" },
  { id: "nurofen_400", name: "Nurofen", dose: "400 mg", usage: "8 saatte 1", duration: "3 gün" },
  { id: "flagyl_500", name: "Flagyl", dose: "500 mg", usage: "12 saatte 1", duration: "5 gün" },
  { id: "dikloron_75", name: "Dikloron", dose: "75 mg", usage: "12 saatte 1", duration: "3 gün" },
  { id: "mineadent_jel", name: "Mineadent Jel", dose: "İnce tabaka", usage: "Günde 2 kez lokal", duration: "7 gün" }
];
