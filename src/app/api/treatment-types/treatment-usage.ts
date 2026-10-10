import { prisma } from "@/lib/prisma";

// Randevu notunda tedavi türü "Tedavi: DEĞER" satırıyla tutulur (bkz.
// lib/appointment-follow-up buildAppointmentNote). Satırın sonu satır sonu
// ya da notun sonudur; böylece IMPLANT araması IMPLANT_2'yi saymaz.
export function treatmentNoteMatch(value: string) {
  return [
    { note: { contains: `Tedavi: ${value}\n` } },
    { note: { endsWith: `Tedavi: ${value}` } },
  ];
}

// Notun ilk "Tedavi: …" satırının değeri (parseAppointmentNote da ilk satırı
// okur). Desende gerçek satır sonu karakteri kullanılır: her düzenli ifade
// sözdiziminde aynı anlamdadır.
const TREATMENT_LINE_PATTERN = "(?:^|\n)Tedavi: ([^\n]*)";

/**
 * Türlerin kaç randevuda kullanıldığı TEK sorguda: önceden her tür için ayrı
 * `appointment.count` + `note LIKE` atılıyordu (26 türde 26 tam tarama, aynı
 * anda bağlantı havuzunu dolduruyordu). Sorgu başarısız olursa (ör. eski
 * veritabanı sürümü) eski tek tek sayıma düşülür; sonuç aynıdır.
 */
export async function countTreatmentUsage(institutionId: string, values: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>(values.map((value) => [value, 0]));
  if (values.length === 0) return counts;
  try {
    const rows = await prisma.$queryRaw<Array<{ value: string | null; count: bigint | number }>>`
      SELECT (regexp_match("note", ${TREATMENT_LINE_PATTERN}))[1] AS value, COUNT(*) AS count
      FROM "Appointment"
      WHERE "institutionId" = ${institutionId} AND "note" LIKE ${"%Tedavi: %"}
      GROUP BY 1`;
    for (const row of rows) {
      if (row.value !== null && counts.has(row.value)) counts.set(row.value, Number(row.count));
    }
    return counts;
  } catch (error) {
    console.error("[treatment-types usage] toplu sayım yapılamadı, tek tek sayılıyor:", error);
    const usage = await Promise.all(values.map((value) => prisma.appointment.count({
      where: { institutionId, OR: treatmentNoteMatch(value) },
    })));
    values.forEach((value, index) => counts.set(value, usage[index]));
    return counts;
  }
}

/**
 * Randevu türü adı karşılaştırması: büyük/küçük harf ve fazladan boşluk fark
 * etmez. Türkçe küçültmede "I" → "ı" olduğu için ı da i sayılır (onay
 * penceresiyle aynı kural): önceden "Implant" varken "implant" ayrı tür
 * (IMPLANT_2) olarak açılıyordu.
 */
export function treatmentLabelKey(label: string) {
  return label.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR").replace(/ı/g, "i");
}
