import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Hasta araması (GET /api/patients `q`) için arama koşulları. Önceden düz
// `contains` kullanılıyordu: telefon Türkiye'de yazıldığı gibi
// ("0555 100 01 01", "05551000101") girilince ve Türkçe karakter farkında
// ("Ayse"/"Ayşe", "yilmaz"/"Yılmaz") hasta bulunamıyor, banko aynı hastaya
// ikinci kayıt açıyordu (bkz. denetim HL-01). Şema değiştirilmeden çözülür:
// telefon için rakamlar ayıklanır, ad için Türkçe harfler veritabanında
// `translate` ile katlanır. Kurum ve şube filtresi her sorguda korunur.

const FOLD_FROM = "ÇĞİIÖŞÜÂÎÛçğıöşüâîû";
const FOLD_TO = "cgiiosuaiucgiosuaiu";
const FOLD_MAP = new Map(Array.from(FOLD_FROM).map((ch, index) => [ch, FOLD_TO[index]]));
const MAX_FOLDED_MATCHES = 1000;

/** "Ayşe YILMAZ" → "ayse yilmaz" (Türkçe harfleri ASCII karşılığına indirger). */
export function foldTurkish(value: string): string {
  return Array.from(value, (ch) => FOLD_MAP.get(ch) ?? ch).join("").toLowerCase();
}

function escapeLike(value: string): string {
  return value.replace(/[!%_]/g, (ch) => `!${ch}`);
}

/** Telefon gibi yazılmış aramayı (boşluk, parantez, tire, +90, baştaki 0) yalın rakama indirger. */
export function phoneSearchCore(query: string): string | null {
  if (!/^[\d\s()+\-./]+$/.test(query)) return null;
  let digits = query.replace(/\D/g, "");
  if (digits.length < 3) return null;
  if (digits.length >= 12 && digits.startsWith("90")) digits = digits.slice(2);
  if (digits.length > 1 && digits.startsWith("0")) digits = digits.slice(1);
  return digits || null;
}

type TenantScope = { institutionId: string | null; branchId: string };

async function findFoldedMatches(folded: string, scope: TenantScope): Promise<string[]> {
  const pattern = `%${escapeLike(folded)}%`;
  const tenantSql = scope.institutionId
    ? Prisma.sql`"institutionId" = ${scope.institutionId} AND "homeBranchId" = ${scope.branchId}`
    : Prisma.sql`"homeBranchId" = ${scope.branchId}`;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "Patient"
    WHERE "archivedAt" IS NULL
      AND ${tenantSql}
      AND (
        lower(translate("fullName", ${FOLD_FROM}, ${FOLD_TO})) LIKE ${pattern} ESCAPE '!'
        OR lower(translate(coalesce("insurance", ''), ${FOLD_FROM}, ${FOLD_TO})) LIKE ${pattern} ESCAPE '!'
        OR lower(translate(coalesce("referrer", ''), ${FOLD_FROM}, ${FOLD_TO})) LIKE ${pattern} ESCAPE '!'
      )
    LIMIT ${Prisma.raw(String(MAX_FOLDED_MATCHES))}
  `);
  return rows.map((row) => row.id);
}

/**
 * Tek arama kutusu: ad, TC, telefon, meslek, kurum/sigorta ve referans kişi
 * (bkz. kullanıcı geri bildirimi — ayrı filtre kutusu gerekmeden "mehmet gül"
 * yazınca o kişinin yönlendirdiği hastalar da bulunur).
 */
export async function buildPatientSearchWhere(query: string, scope: TenantScope): Promise<Prisma.PatientWhereInput> {
  const q = query.trim();
  const or: Prisma.PatientWhereInput[] = [
    { fullName: { contains: q, mode: "insensitive" } },
    { tcNo: { contains: q, mode: "insensitive" } },
    { phone: { contains: q, mode: "insensitive" } },
    { profession: { contains: q, mode: "insensitive" } },
    { insurance: { contains: q, mode: "insensitive" } },
    { referrer: { contains: q, mode: "insensitive" } },
  ];

  const phoneCore = phoneSearchCore(q);
  if (phoneCore) {
    const digits = q.replace(/\D/g, "");
    or.push({ phone: { contains: phoneCore } });
    if (digits !== q) or.push({ tcNo: { contains: digits } });
  }

  const folded = foldTurkish(q);
  if (!phoneCore && /\p{L}/u.test(q) && folded.length >= 2) {
    try {
      const ids = await findFoldedMatches(folded, scope);
      if (ids.length > 0) or.push({ id: { in: ids } });
    } catch (error) {
      // Katlamalı arama yardımcıdır; başarısız olursa olağan arama sonuçları yine döner.
      console.error("[patient-search] Türkçe karakter katlamalı arama yapılamadı:", error);
    }
  }

  return { OR: or };
}
