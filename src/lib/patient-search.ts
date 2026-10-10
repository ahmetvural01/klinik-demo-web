import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { foldTurkish, TURKISH_FOLD_FROM, TURKISH_FOLD_TO } from "@/lib/patient-display";

// Hasta araması (GET /api/patients `q`) için arama koşulları. Önceden düz
// `contains` kullanılıyordu: telefon Türkiye'de yazıldığı gibi
// ("0555 100 01 01", "05551000101") girilince ve Türkçe karakter farkında
// ("Ayse"/"Ayşe", "yilmaz"/"Yılmaz") hasta bulunamıyor, banko aynı hastaya
// ikinci kayıt açıyordu (bkz. denetim HL-01). Şema değiştirilmeden çözülür:
// telefon için rakamlar ayıklanır, ad için Türkçe harfler veritabanında
// `translate` ile katlanır. Kurum ve şube filtresi her sorguda korunur.

// Katlama tablosu istemcide de kullanılır (hasta seçici sıralaması); tek kaynak
// src/lib/patient-display.ts. `foldTurkish` buradan da dışa açık kalır.
const FOLD_FROM = TURKISH_FOLD_FROM;
const FOLD_TO = TURKISH_FOLD_TO;
const MAX_FOLDED_MATCHES = 1000;

export { foldTurkish };

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

export type TenantScope = { institutionId: string | null; branchId: string };

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
 * Yeni hasta formundaki mükerrer kayıt uyarısı için ADIN TAMAMEN aynı olduğu
 * aktif hastalar ("ayse  YILMAZ" = "Ayşe Yılmaz"). Genel aramadaki "içerir"
 * eşleşmesi burada kullanılmaz: adın birkaç harfi tutunca uyarı çıkıyor,
 * resepsiyon uyarıyı görmezden gelmeye alışıyordu. Ad ve soyad (en az iki
 * sözcük) yazılmadan sorgu yapılmaz.
 */
export async function findExactNameMatchIds(fullName: string, scope: TenantScope, limit = 5): Promise<string[]> {
  const folded = foldTurkish(fullName).replace(/\s+/g, " ").trim();
  if (folded.length < 5 || !folded.includes(" ")) return [];
  const tenantSql = scope.institutionId
    ? Prisma.sql`"institutionId" = ${scope.institutionId} AND "homeBranchId" = ${scope.branchId}`
    : Prisma.sql`"homeBranchId" = ${scope.branchId}`;
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Patient"
      WHERE "archivedAt" IS NULL
        AND ${tenantSql}
        AND btrim(regexp_replace(lower(translate("fullName", ${FOLD_FROM}, ${FOLD_TO})), ${"\\s+"}, ' ', 'g')) = ${folded}
      LIMIT ${Prisma.raw(String(Math.max(1, Math.min(limit, 20))))}
    `);
    return rows.map((row) => row.id);
  } catch (error) {
    // Uyarı yardımcıdır; sorgu başarısız olursa kayıt akışı etkilenmez.
    console.error("[patient-search] ad eşleşmesi aranamadı:", error);
    return [];
  }
}

/**
 * Tek arama kutusu: ad, TC, telefon, meslek, kurum/sigorta ve referans kişi
 * (bkz. kullanıcı geri bildirimi — ayrı filtre kutusu gerekmeden "mehmet gül"
 * yazınca o kişinin yönlendirdiği hastalar da bulunur).
 *
 * `includeContact: false`: telefonu/TC'yi göremeyen kişide (patients:phone
 * yok) telefon ve TC eşleşmesi aranmaz; elindeki numaranın kime ait olduğunu
 * aramayla doğrulayamasın. Varsayılan true (eski davranış).
 */
export async function buildPatientSearchWhere(
  query: string,
  scope: TenantScope,
  options: { includeContact?: boolean } = {},
): Promise<Prisma.PatientWhereInput> {
  const q = query.trim();
  const includeContact = options.includeContact !== false;
  const or: Prisma.PatientWhereInput[] = [
    { fullName: { contains: q, mode: "insensitive" } },
    ...(includeContact
      ? [
          { tcNo: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q, mode: "insensitive" as const } },
        ]
      : []),
    { profession: { contains: q, mode: "insensitive" } },
    { insurance: { contains: q, mode: "insensitive" } },
    { referrer: { contains: q, mode: "insensitive" } },
  ];

  const phoneCore = includeContact ? phoneSearchCore(q) : null;
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
