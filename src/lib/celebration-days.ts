import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const greeting = (title: string) =>
  `Sayın {{patientName}}, ${title} vesilesiyle sağlık, huzur ve mutluluk dileriz. {{institutionName}} ailesi.`;

export const DEFAULT_CELEBRATION_DAYS: Prisma.CelebrationDayCreateManyInput[] = [
  { code: "YILBASI", title: "Yılbaşı", category: "GENERAL", month: 1, day: 1, messageTemplate: greeting("yeni yılınızı kutlar") },
  { code: "23_NISAN", title: "23 Nisan Ulusal Egemenlik ve Çocuk Bayramı", category: "NATIONAL", month: 4, day: 23, messageTemplate: greeting("23 Nisan Ulusal Egemenlik ve Çocuk Bayramı'nı kutlar") },
  { code: "19_MAYIS", title: "19 Mayıs Atatürk'ü Anma, Gençlik ve Spor Bayramı", category: "NATIONAL", month: 5, day: 19, messageTemplate: greeting("19 Mayıs Atatürk'ü Anma, Gençlik ve Spor Bayramı'nı kutlar") },
  { code: "30_AGUSTOS", title: "30 Ağustos Zafer Bayramı", category: "NATIONAL", month: 8, day: 30, messageTemplate: greeting("30 Ağustos Zafer Bayramı'nı kutlar") },
  { code: "29_EKIM", title: "29 Ekim Cumhuriyet Bayramı", category: "NATIONAL", month: 10, day: 29, messageTemplate: greeting("29 Ekim Cumhuriyet Bayramı'nı kutlar") },
  {
    code: "RAMAZAN_BAYRAMI", title: "Ramazan Bayramı", category: "RELIGIOUS", month: 1, day: 1,
    recurrenceRule: "DATE_OVERRIDES", dateOverrides: ["2026-03-20", "2027-03-09", "2028-02-26", "2029-02-14", "2030-02-04"],
    messageTemplate: greeting("Ramazan Bayramınızı kutlar"),
  },
  {
    code: "KURBAN_BAYRAMI", title: "Kurban Bayramı", category: "RELIGIOUS", month: 1, day: 1,
    recurrenceRule: "DATE_OVERRIDES", dateOverrides: ["2026-05-27", "2027-05-16", "2028-05-05", "2029-04-24", "2030-04-13"],
    messageTemplate: greeting("Kurban Bayramınızı kutlar"),
  },
  { code: "ANNELER_GUNU", title: "Anneler Günü", category: "FAMILY", month: 5, day: 1, recurrenceRule: "NTH_WEEKDAY", weekOfMonth: 2, weekday: 0, messageTemplate: greeting("Anneler Günü'nü kutlar") },
  { code: "BABALAR_GUNU", title: "Babalar Günü", category: "FAMILY", month: 6, day: 1, recurrenceRule: "NTH_WEEKDAY", weekOfMonth: 3, weekday: 0, messageTemplate: greeting("Babalar Günü'nü kutlar") },
  { code: "TIP_BAYRAMI", title: "14 Mart Tıp Bayramı", category: "PROFESSION", month: 3, day: 14, targetProfessions: ["Doktor"], messageTemplate: greeting("Tıp Bayramınızı kutlar") },
  { code: "AVUKATLAR_GUNU", title: "Avukatlar Günü", category: "PROFESSION", month: 4, day: 5, targetProfessions: ["Avukat"], messageTemplate: greeting("Avukatlar Günü'nüzü kutlar") },
  { code: "HEMSIRELER_GUNU", title: "Hemşireler Günü", category: "PROFESSION", month: 5, day: 12, targetProfessions: ["Hemşire"], messageTemplate: greeting("Hemşireler Günü'nüzü kutlar") },
  { code: "ECZACILAR_GUNU", title: "Eczacılık Günü", category: "PROFESSION", month: 5, day: 14, targetProfessions: ["Eczacı"], messageTemplate: greeting("Eczacılık Günü'nüzü kutlar") },
  { code: "GAZETECILER_GUNU", title: "Çalışan Gazeteciler Günü", category: "PROFESSION", month: 1, day: 10, targetProfessions: ["Gazeteci"], messageTemplate: greeting("Çalışan Gazeteciler Günü'nüzü kutlar") },
  { code: "DIS_HEKIMLERI_GUNU", title: "Diş Hekimleri Günü", category: "PROFESSION", month: 11, day: 22, targetProfessions: ["Diş Hekimi"], messageTemplate: greeting("Diş Hekimleri Günü'nüzü kutlar") },
  { code: "OGRETMENLER_GUNU", title: "Öğretmenler Günü", category: "PROFESSION", month: 11, day: 24, targetProfessions: ["Öğretmen"], messageTemplate: greeting("Öğretmenler Günü'nüzü kutlar") },
];

export async function ensureDefaultCelebrationDays() {
  await prisma.celebrationDay.createMany({ data: DEFAULT_CELEBRATION_DAYS, skipDuplicates: true });
  await Promise.all(DEFAULT_CELEBRATION_DAYS.map((day) => prisma.celebrationDay.updateMany({
    where: { code: day.code, whatsappMessageTemplate: null },
    data: { whatsappMessageTemplate: day.messageTemplate },
  })));
}

export function isoLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isCelebrationDate(day: {
  month: number;
  day: number;
  recurrenceRule: string;
  weekOfMonth: number | null;
  weekday: number | null;
  dateOverrides: string[];
}, date: Date) {
  if (day.recurrenceRule === "DATE_OVERRIDES") return day.dateOverrides.includes(isoLocalDate(date));
  if (day.recurrenceRule === "NTH_WEEKDAY") {
    return date.getMonth() + 1 === day.month
      && date.getDay() === day.weekday
      && Math.ceil(date.getDate() / 7) === day.weekOfMonth;
  }
  return date.getMonth() + 1 === day.month && date.getDate() === day.day;
}
