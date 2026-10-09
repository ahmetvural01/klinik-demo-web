// Muayene/tedavi kaydının (Examination.status) TEK yorumu.
//
// Veritabanında durum serbest metindir ve iki kuşak değer bir arada bulunur:
//   • Hasta dosyasının iki aşamalı akışı: "Diagnoz (Ön Teşhis)" (muayene
//     listesi — henüz ücrete yansımaz) → "Tedavi (Ücretli)" / "TAMAMLANDI"
//     (yapıldı — hastanın borcuna ve hekim hakedişine yansır).
//   • Enum değerleri: PLANLANDI, DEVAM, TAMAMLANDI, IPTAL.
// Muhasebe > Alacaklar, hasta listesi bakiyesi ve hakediş sorguları "ön teşhis
// / diagnoz" içeren kayıtları ücret dışı sayar. Bu yüzden hasta dosyası yeni
// bekleyen kaydı "Diagnoz (Ön Teşhis)" olarak yazar: böylece bütün ekranlar
// bekleyen muayeneyi borç saymaz. Silinen kayıt IPTAL olur (geçmiş korunur)
// ve hiçbir toplamda sayılmamalıdır.

export const EXAM_STATUS_DIAGNOSIS = "Diagnoz (Ön Teşhis)";
export const EXAM_STATUS_LEGACY_DONE = "Tedavi (Ücretli)";
export const EXAM_STATUS_DONE = "TAMAMLANDI";
export const EXAM_STATUS_CANCELLED = "IPTAL";

/** API'nin kabul ettiği bütün durum değerleri (enum + hasta dosyasının eski değerleri). */
export const EXAM_STATUS_VALUES = [
  "PLANLANDI",
  "DEVAM",
  EXAM_STATUS_DONE,
  EXAM_STATUS_CANCELLED,
  EXAM_STATUS_DIAGNOSIS,
  EXAM_STATUS_LEGACY_DONE,
] as const;

export type ExamStatusKind = "pending" | "in_progress" | "done" | "cancelled";

function normalize(status: string | null | undefined) {
  return String(status || "").trim().toLocaleLowerCase("tr-TR");
}

export function isDiagnosisExamStatus(status: string | null | undefined) {
  const value = normalize(status);
  return value.includes("diagnoz") || value.includes("ön teşhis") || value.includes("on teshis");
}

/**
 * Kaydın ekranda hangi listede durduğu:
 * - pending: muayene listesi / planlanan (ücrete yansımaz)
 * - in_progress: tedavi başladı (ücrete yansır)
 * - done: yapıldı (ücrete yansır)
 * - cancelled: iptal edildi (hiçbir toplamda sayılmaz, listede gösterilmez)
 */
export function examStatusKind(status: string | null | undefined): ExamStatusKind {
  const raw = String(status || "").trim();
  if (raw === EXAM_STATUS_CANCELLED) return "cancelled";
  if (raw === "PLANLANDI" || isDiagnosisExamStatus(raw)) return "pending";
  if (raw === "DEVAM") return "in_progress";
  return "done";
}

/** Hastanın borcuna ve hekim hakedişine yansıyan kayıt mı? */
export function isChargeableExamStatus(status: string | null | undefined) {
  const kind = examStatusKind(status);
  return kind === "done" || kind === "in_progress";
}

export const EXAM_STATUS_KIND_LABELS: Record<ExamStatusKind, string> = {
  pending: "Bekliyor",
  in_progress: "Devam ediyor",
  done: "Yapıldı",
  cancelled: "İptal",
};

/**
 * Sunucu tarafı toplamlar için önerilen Prisma filtresi (ücrete yansıyan
 * kayıtlar). Bekleyen (ön teşhis/planlanan) ve iptal edilen kayıtlar hariç.
 */
export const CHARGEABLE_EXAMINATION_WHERE = {
  NOT: [
    { status: { contains: "diagnoz", mode: "insensitive" as const } },
    { status: { contains: "ön teşhis", mode: "insensitive" as const } },
    { status: { contains: "on teshis", mode: "insensitive" as const } },
    { status: { in: ["PLANLANDI", EXAM_STATUS_CANCELLED] } },
  ],
};
