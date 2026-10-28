import { NextRequest, NextResponse } from "next/server";
import { Prisma, type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatZodError, patientSchema } from "@/lib/validators";
import { hasEffectivePermission, requireAnyAuth, requireAuth, withApiTiming, writeAudit } from "@/lib/api";
import { getPermissionMap } from "@/lib/role-permission-store";
import { sendSmsConsentRequest } from "@/lib/sms-consent";
import { listPatientIdsForDerivedBucket } from "@/lib/sms-consent-stats";
import { hasBranchPermission, requireActiveBranch, type BranchContext } from "@/lib/branch-context";
import { buildPatientSearchWhere, findExactNameMatchIds } from "@/lib/patient-search";
import { loadPatientListExtras } from "@/lib/patient-list-extras";
import { getLocalPhoneError, normalizeLocalPhone } from "@/lib/phone-number";
import { turkeyMonthRangeUtc, turkeyYearMonth } from "@/lib/tz";

const SMS_CONSENT_FILTERS = new Set(["ENABLED", "DISABLED", "PENDING", "EXPIRED", "SEND_FAILED"]);

const SORT_FIELDS = new Set(["fullName", "tcNo", "phone", "gender", "birthDate", "insurance", "profession", "createdAt", "updatedAt"]);

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

/**
 * Rol→izin haritası istek başına BİR kez okunur; ek izinler bellekte
 * hesaplanır. Önceden liste isteği `hasEffectivePermission` (×3) ve
 * `shouldHidePatientPhoneForRole` ile haritayı dört kez daha veritabanından
 * okuyordu (bkz. performans denetimi HL3). Kurallar aynıdır:
 * - etkin izin: gizli oturum ya da SUPERADMIN her şeyi görür; diğerlerinde
 *   rol izni + aktif şube izni (src/lib/api.ts hasEffectivePermission);
 * - telefon/TC gizleme de ETKİN izne bakar: Personel › Şube erişimi'nden
 *   "Telefon ve TC görme" kapatılan kişi ekranda *** görüyor ama API'de
 *   telefon ve TC açık geliyordu (KVKK).
 */
function permissionResolver(
  permissionMap: Record<string, string[]>,
  user: { role: string; ghost?: boolean; branchContext: BranchContext },
) {
  const rolePermissions = permissionMap[user.role as Role] ?? [];
  const roleHas = (permission: string) => rolePermissions.includes("*") || rolePermissions.includes(permission);
  const effective = (permission: string) => Boolean(
    user.ghost || user.role === "SUPERADMIN" || (roleHas(permission) && hasBranchPermission(user.branchContext, permission)),
  );
  return {
    effective,
    hidePhone: !user.role || !effective("patients:phone"),
  };
}

/** "*******4530": hasta seçicide yalnız son 4 hane görünür (maskTcNo). */
function lastFourOnly(tcNo: string | null): string | null {
  const value = (tcNo || "").trim();
  return value ? `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}` : null;
}

/**
 * Finans formlarının hasta seçicisi (`?mode=finans`): tahsilat ve taksit
 * formunda hasta seçebilmek için sağlık verisi döndürmeyen en az alanlı arama.
 * Muhasebe rolü hasta listesini (patients:read) göremediği için "Tahsilat al"
 * ve "Yeni taksit planı"nda hasta seçemiyordu. Yalnız kimlik, ad, telefon
 * (patients:phone yoksa ***) ve TC'nin son 4 hanesi döner; anamnez, not ve
 * liste ekleri dönmez. Kurum ve şube süzgeci aynıdır.
 */
async function financePatientSearch(request: NextRequest) {
  const auth = await requireAnyAuth(["payments:write", "installments:write", "finance:read"]);
  if (auth.error) return auth.error;
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 403 });
  const searchParams = request.nextUrl.searchParams;
  const q = (searchParams.get("q") ?? "").trim().slice(0, 120);
  const take = parsePositiveInt(searchParams.get("take"), 10, 20);
  if (q.length < 2) return NextResponse.json({ patients: [], total: 0 });

  const hidePhone = !(await hasEffectivePermission(auth.user, "patients:phone"));
  const scope = { institutionId: auth.user.institutionId ?? null, branchId: activeBranch.branchId };
  const where: Prisma.PatientWhereInput = {
    AND: [
      { archivedAt: null, ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}), homeBranchId: activeBranch.branchId },
      // Telefonu/TC'yi göremeyen kişi numarayla arayıp kime ait olduğunu doğrulayamasın.
      await buildPatientSearchWhere(q, scope, { includeContact: !hidePhone }),
    ],
  };
  const rows = await prisma.patient.findMany({
    where,
    select: { id: true, fullName: true, tcNo: true, isForeigner: true, phone: true, phoneCountryCode: true },
    orderBy: { createdAt: "desc" },
    take,
  });
  const patients = rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    isForeigner: row.isForeigner,
    phoneCountryCode: row.phoneCountryCode,
    phone: hidePhone ? "***" : row.phone,
    tcNo: hidePhone ? (row.tcNo ? "***" : null) : lastFourOnly(row.tcNo),
  }));
  return NextResponse.json({ patients, total: patients.length });
}

export const GET = withApiTiming("patients", async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    if (searchParams.get("mode") === "finans") return await financePatientSearch(request);
    // Mükerrer kayıt denetimi yalnız hasta formunda (yazma yetkisiyle) kullanılır;
    // arşivdeki aynı TC'yi de bildirdiği için okuma yetkisi yetmez.
    const duplicateMode = searchParams.get("duplicate") === "1";
    const auth = await requireAuth(duplicateMode ? "patients:write" : "patients:read");
    if (auth.error) return auth.error;
    const activeBranch = requireActiveBranch(auth.user.branchContext);
    if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 403 });

    if (duplicateMode) {
      return NextResponse.json(await findDuplicateCandidates(searchParams, {
        institutionId: auth.user.institutionId ?? null,
        branchId: activeBranch.branchId,
      }));
    }

    const q = (searchParams.get("q") ?? "").trim();
    const patientId = (searchParams.get("id") ?? "").trim();
    const page = parsePositiveInt(searchParams.get("page"), 1, 100000);
    const take = parsePositiveInt(searchParams.get("take"), 25, 100);
    const skipParam = Number.parseInt(searchParams.get("skip") ?? "", 10);
    const skip = Number.isFinite(skipParam) && skipParam >= 0 ? skipParam : (page - 1) * take;
    const sortByParam = searchParams.get("sortBy") || "createdAt";
    const sortBy = SORT_FIELDS.has(sortByParam) ? sortByParam : "createdAt";
    const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
    const doctorId = (searchParams.get("doctorId") || "").trim();
    const smsConsentParam = (searchParams.get("smsConsent") || "").trim().toUpperCase();
    const smsConsentFilter = SMS_CONSENT_FILTERS.has(smsConsentParam) ? smsConsentParam : "";
    const includeSummary = searchParams.get("summary") !== "false";
    // Hasta listesi ekranı (extras=1) satırda son ziyaret, sonraki randevu ve
    // kalan bakiyeyi gösterir; hasta seçiciler gibi diğer çağıranlar bunu
    // istemez, gereksiz sorgu çalışmaz.
    const includeExtras = searchParams.get("extras") === "1";

    // Arşivlenen hastalar (Hastalar > "Arşivlenenler"): yalnız arşivleyip geri
    // alabilen kişi (patients:delete) görür; önceden arşiv hiçbir ekranda yoktu.
    const archivedOnly = searchParams.get("arsiv") === "1" && await hasEffectivePermission(auth.user, "patients:delete");
    const tenantWhere: Prisma.PatientWhereInput = {
      archivedAt: archivedOnly ? { not: null } : null,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      homeBranchId: activeBranch.branchId,
    };
    const filters: Prisma.PatientWhereInput[] = [];
    // İzin haritası istek başında okunmaya başlar: arama telefonu/TC'yi
    // göremeyen kişide numarayla eşleşme yapmaz (aşağıda).
    const permissionMapPromise = getPermissionMap();
    // Erken dönüşte (geçersiz istek) bekleyen okuma işlenmemiş hata bırakmasın.
    permissionMapPromise.catch(() => undefined);

    if (patientId) {
      if (patientId.length > 100) return NextResponse.json({ message: "Geçersiz hasta seçimi." }, { status: 400 });
      filters.push({ id: patientId });
    }

    if (q) {
      // Tek bir arama kutusu hem hasta bilgilerini hem de "kurum/sigorta" ve
      // "referans eden kişi" alanlarını kapsar — ayrı filtre kutularına gerek
      // kalmadan "mehmet gül" yazınca hem o isimli hastalar hem de Mehmet
      // Gül'ün yönlendirdiği hastalar bulunur (bkz. kullanıcı geri bildirimi).
      // Telefon "0555 100 01 01" gibi yazıldığında ve Türkçe harf farkında
      // ("Ayse"/"Ayşe") da hasta bulunur (bkz. src/lib/patient-search.ts).
      // Telefonu/TC'yi göremeyen kişi (patients:phone yok) tam numarayla arayıp
      // numaranın kime ait olduğunu doğrulayamasın: yalnız ad ve diğer alanlar.
      const { hidePhone } = permissionResolver(await permissionMapPromise, auth.user);
      filters.push(await buildPatientSearchWhere(q, {
        institutionId: auth.user.institutionId ?? null,
        branchId: activeBranch.branchId,
      }, { includeContact: !hidePhone }));
    }
    if (doctorId) {
      filters.push({
        OR: [
          { examinations: { some: { doctorId } } },
          { appointments: { some: { doctorId } } },
        ],
      });
    }
    if (smsConsentFilter === "ENABLED" || smsConsentFilter === "DISABLED") {
      filters.push({ smsPreference: { status: smsConsentFilter } });
    } else if (smsConsentFilter && auth.user.institutionId) {
      // PENDING/EXPIRED/SEND_FAILED türetilmiş durumlardır (bkz.
      // src/lib/sms-consent-stats.ts) — doğrudan bir DB alanı değildir, bu
      // yüzden önce eşleşen hasta kimlikleri hesaplanır.
      const matchedIds = await listPatientIdsForDerivedBucket(
        auth.user.institutionId,
        smsConsentFilter as "PENDING" | "EXPIRED" | "SEND_FAILED",
      );
      filters.push({ id: { in: matchedIds.length > 0 ? matchedIds : ["__none__"] } });
    }

    const where: Prisma.PatientWhereInput = filters.length ? { AND: [tenantWhere, ...filters] } : tenantWhere;
    // "Bu ay" Türkiye takvimine göre: sunucu UTC'de çalıştığı için ayın ilk
    // günü 00:00–03:00 arasında açılan kayıtlar önceki aya sayılıyordu.
    const { year, month } = turkeyYearMonth();
    const currentMonthStart = turkeyMonthRangeUtc(year, month).start;

    const [permissionMap, patients, total, summaryTotal, summaryNewThisMonth] = await Promise.all([
      permissionMapPromise,
      prisma.patient.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          tcNo: true,
          isForeigner: true,
          phone: true,
          phoneCountryCode: true,
          whatsappOptInAt: true,
          whatsappOptOutAt: true,
          profession: true,
          gender: true,
          birthDate: true,
          insurance: true,
          discountRate: true,
          hasAllergy: true,
          hasHepatitis: true,
          hasKidney: true,
          hasDiabetes: true,
          hasHeart: true,
          hasBloodIssue: true,
          hasContagiousDisease: true,
          surgeries: true,
          medications: true,
          otherDiseases: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { [sortBy]: sortDir },
        skip,
        take,
      }),
      prisma.patient.count({ where }),
      // Filtresiz istekte toplam zaten `total`; aynı sayım ikinci kez yapılmaz.
      includeSummary && filters.length > 0 ? prisma.patient.count({ where: tenantWhere }) : Promise.resolve(null),
      includeSummary
        ? prisma.patient.count({ where: { AND: [tenantWhere, { createdAt: { gte: currentMonthStart } }] } })
        : Promise.resolve(0),
    ]);

    // patients:phone izni telefonu koruduğu gibi TC kimlik numarasını da
    // korur — TC no doğrudan kimliklendirici bir alan olduğu için telefondan
    // daha az hassas sayılıp maskesiz bırakılması tasarımın kendi iç
    // tutarlılığına aykırıydı (bkz. denetim raporu): DOKTOR/ASISTAN rolleri
    // telefonu göremezken TC no'yu görebiliyordu.
    const permissions = permissionResolver(permissionMap, auth.user);
    // Liste ekranı, uzun anamnez metinlerini taşımaz. Satırda gerekli olan tek
    // bilgi medikal uyarının varlığıdır; detay metinleri hasta kartından açılır.
    // Bulaşıcı hastalık NOTU (özel nitelikli sağlık verisi) listeye hiç
    // gönderilmez; işaretin kendisi enfeksiyon kontrolü için kalır.
    const listed = patients.map(({ surgeries, medications, otherDiseases, ...patient }) => ({
      ...patient,
      hasMedicalRisk: Boolean(
        patient.hasAllergy || patient.hasHepatitis || patient.hasKidney || patient.hasDiabetes ||
        patient.hasHeart || patient.hasBloodIssue || surgeries?.trim() || medications?.trim() || otherDiseases?.trim(),
      ),
    }));
    const masked = permissions.hidePhone ? listed.map((p) => ({ ...p, phone: "***", tcNo: p.tcNo ? "***" : p.tcNo })) : listed;

    // Son ziyaret / sonraki randevu yalnız randevu okuma, bakiye tahsilat ya da
    // finans okuma yetkisi olan rollere gönderilir (/api/patients/[id]/balance
    // ile aynı kural): banko tahsilat için borcu listede görür; bakiye yalnız
    // toplamdır, tedavi ayrıntısı dönmez.
    let withExtras: Array<(typeof masked)[number] & {
      lastVisitAt?: string | null;
      nextAppointment?: { startAt: string; doctorName: string | null } | null;
      balance?: number | null;
    }> = masked;
    if (includeExtras && masked.length > 0) {
      const canReadAppointments = permissions.effective("appointments:read");
      const canReadBalance = permissions.effective("payments:read") || permissions.effective("finance:read");
      const extras = await loadPatientListExtras({
        institutionId: auth.user.institutionId ?? null,
        branchId: activeBranch.branchId,
        patients: patients.map((patient) => ({ id: patient.id, discountRate: patient.discountRate })),
        includeVisits: canReadAppointments,
        includeBalance: canReadBalance,
      });
      withExtras = masked.map((patient) => {
        const extra = extras.get(patient.id);
        return {
          ...patient,
          lastVisitAt: canReadAppointments ? extra?.lastVisitAt ?? null : undefined,
          nextAppointment: canReadAppointments ? extra?.nextAppointment ?? null : undefined,
          balance: canReadBalance ? extra?.balance ?? 0 : undefined,
        };
      });
    }

    return NextResponse.json({
      patients: withExtras,
      total,
      skip,
      take,
      page: Math.floor(skip / take) + 1,
      pageCount: Math.max(1, Math.ceil(total / take)),
      sortBy,
      sortDir,
      // Özet yalnız istendiğinde gönderilir: önceden summary=false isteğinde
      // de {total:0,newThisMonth:0} dönüyor, ekrandaki sayılar filtre ya da
      // sayfa değişince 0'a düşüyordu (bkz. denetim HL-10).
      ...(includeSummary ? { summary: { total: summaryTotal ?? total, newThisMonth: summaryNewThisMonth } } : {}),
    });
  } catch (error) {
    console.error("GET /api/patients failed:", error);
    return NextResponse.json({ message: "Hasta listesi yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
});

type DuplicateMatch = {
  id: string;
  fullName: string;
  birthDate: Date | null;
  gender: string;
  archivedAt: Date | null;
  matchedBy: Array<"tc" | "phone" | "name">;
};

/**
 * Yeni hasta formundaki mükerrer kayıt uyarısı için KESİN eşleşme: aynı TC
 * (arşivdekiler dahil — aynı TC yeni kaydı zaten engeller), aynı telefon ya da
 * Türkçe harf farkı gözetmeksizin aynı ad soyad. Önceden genel arama
 * kullanılıyordu: adın 3 harfi, TC'nin 5 hanesi ya da kurum/yönlendiren
 * alanı eşleşince bile uyarı çıkıyordu (bkz. denetim C6). Yanıtta TC ve
 * telefon dönmez; yalnız kimin eşleştiği ve neden.
 */
async function findDuplicateCandidates(
  searchParams: URLSearchParams,
  scope: { institutionId: string | null; branchId: string },
): Promise<{ matches: DuplicateMatch[] }> {
  const tcNo = (searchParams.get("tcNo") || "").replace(/\D/g, "");
  const countryCode = (searchParams.get("phoneCountryCode") || "+90").trim().slice(0, 5) || "+90";
  const phone = normalizeLocalPhone(searchParams.get("phone") || "", countryCode);
  const fullName = (searchParams.get("fullName") || "").trim().slice(0, 120);
  const excludeId = (searchParams.get("excludeId") || "").trim().slice(0, 100);

  const tenant: Prisma.PatientWhereInput = {
    ...(scope.institutionId ? { institutionId: scope.institutionId } : {}),
    homeBranchId: scope.branchId,
  };
  const checkTc = /^\d{11}$/.test(tcNo);
  const checkPhone = Boolean(phone) && !getLocalPhoneError(phone, countryCode);
  // Eski kayıtlarda Türkiye numarası başında 0 ile (11 hane) durabilir.
  const phoneVariants = countryCode === "+90" ? [phone, `0${phone}`] : [phone];
  const nameIds = new Set(fullName ? await findExactNameMatchIds(fullName, scope) : []);

  const or: Prisma.PatientWhereInput[] = [];
  if (checkTc) or.push({ tcNo });
  if (checkPhone) or.push({ archivedAt: null, phoneCountryCode: countryCode, phone: { in: phoneVariants } });
  if (nameIds.size > 0) or.push({ id: { in: [...nameIds] } });
  if (or.length === 0) return { matches: [] };

  const rows = await prisma.patient.findMany({
    where: { AND: [tenant, { OR: or }, ...(excludeId ? [{ id: { not: excludeId } }] : [])] },
    select: { id: true, fullName: true, tcNo: true, phone: true, phoneCountryCode: true, birthDate: true, gender: true, archivedAt: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return {
    matches: rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      birthDate: row.birthDate,
      gender: row.gender,
      archivedAt: row.archivedAt,
      matchedBy: [
        ...(checkTc && row.tcNo === tcNo ? ["tc" as const] : []),
        ...(checkPhone && !row.archivedAt && row.phoneCountryCode === countryCode && phoneVariants.includes(row.phone) ? ["phone" as const] : []),
        ...(nameIds.has(row.id) ? ["name" as const] : []),
      ],
    })).filter((match) => match.matchedBy.length > 0),
  };
}

const STAMP_DATE = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Istanbul" });
const STAMP_TIME = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

/**
 * Hasta notu dosyada "[tarih saat - kişi] metin" satırlarından oluşan bir
 * günlüktür (hasta dosyası > Notlar). Kayıt formunda yazılan ilk not da aynı
 * biçimde damgalanır; önceden damgasız kaldığı için kimin ne zaman yazdığı
 * görünmüyordu.
 */
function stampFirstNote(text: string | null | undefined, author: string | null | undefined): string | null {
  const value = (text || "").trim();
  if (!value) return null;
  if (/^\[[^\]]+? - [^\]]+\]/.test(value)) return value;
  const now = new Date();
  return `[${STAMP_DATE.format(now)} ${STAMP_TIME.format(now)} - ${(author || "").trim() || "Personel"}] ${value}`;
}

/** Zod'un İngilizce iletileri yerine alanın Türkçe karşılığı (özel kurallar zaten Türkçe). */
const FIELD_ERROR_HINTS: Record<string, string> = {
  fullName: "Ad soyad en az 3 harf olmalı.",
  gender: "Cinsiyet seçin.",
  birthDate: "Geçerli bir doğum tarihi girin.",
  discountRate: "İndirim oranı 0 ile 100 arasında tam sayı olmalı.",
  contagiousDiseaseNote: "En fazla 200 karakter yazılabilir.",
  profession: "Meslek en fazla 120 karakter olabilir.",
  phoneCountryCode: "Geçerli bir ülke kodu seçin.",
};

/** Boş metin veritabanına "" yerine boş (null) yazılsın; ekranlar "—" gösterir. */
function textOrNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("patients:write");
  if (auth.error) return auth.error;
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 409 });
  if (!auth.user.institutionId) {
    // institutionId nullable olduğu için bu kontrol olmadan SUPERADMIN'in
    // ghost olmayan (kurum bağlamsız) oturumu, hiçbir klinikten görünmeyen
    // "hayalet" hasta kaydı oluşturabilirdi (bkz. denetim raporu).
    return NextResponse.json({ message: "Hasta kaydı için kurum bağlamı zorunlu" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Hasta bilgileri okunamadı." }, { status: 400 });
  }
  const parsed = patientSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({
      message: "Hasta bilgileri geçersiz",
      errors: formatZodError(parsed.error),
      // Alan adına göre Türkçe ileti: form hatayı ilgili alanın altında gösterir.
      fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => {
        const field = String(issue.path[0] ?? "veri");
        return [field, issue.code === "custom" ? issue.message : FIELD_ERROR_HINTS[field] || issue.message];
      })),
    }, { status: 400 });
  }
  const fullName = parsed.data.fullName.trim();
  if (fullName.length < 3) {
    return NextResponse.json({
      message: "Hasta bilgileri geçersiz",
      errors: ["fullName: Ad soyad en az 3 harf olmalı."],
      fieldErrors: { fullName: "Ad soyad en az 3 harf olmalı." },
    }, { status: 400 });
  }
  // İndirim oranı finans kararıdır: hasta kaydı yetkisiyle değil, finans
  // yazma yetkisiyle verilir (hakediş indirimsiz tutardan hesaplanır; hasta
  // düzenleyen herkes borcu sessizce düşürebiliyordu).
  if (parsed.data.discountRate > 0 && !(await hasEffectivePermission(auth.user, "finance:write"))) {
    return NextResponse.json({
      message: "İndirim oranını değiştirme yetkiniz yok.",
      fieldErrors: { discountRate: "İndirim oranını finans ya da yönetici değiştirir." },
    }, { status: 403 });
  }
  // Pasaport no'su girilmeyen yabancı hastada TC boş (null) kaydedilir: ""
  // benzersiz indekste değer sayılıyor, aynı şubedeki ikinci TC'siz yabancı
  // hasta "Bu TC ile kayıtlı hasta var" hatası alıyordu (bkz. denetim C4).
  const tcNo = textOrNull(parsed.data.tcNo);
  try {
    const { whatsappConsent, ...patientData } = parsed.data;
    // WhatsApp izni yalnız sorulup işaretlendiyse yazılır: kutu görünmüyorken
    // (klinikte WhatsApp kapalı) her yeni hastaya "izin verdi" ve "Hasta kayıt
    // formu" kaynağı yazılıyordu. Gönderilmeyen değer kayıtta boş kalır.
    const whatsappAnswered = typeof whatsappConsent === "boolean"
      && Boolean((await prisma.institution.findUnique({
        where: { id: auth.user.institutionId },
        select: { whatsappEnabled: true },
      }))?.whatsappEnabled);
    const whatsappGranted = whatsappAnswered && whatsappConsent === true;
    const patient = await prisma.patient.create({
      data: {
        ...patientData,
        fullName,
        tcNo,
        profession: textOrNull(patientData.profession),
        address: textOrNull(patientData.address),
        insurance: textOrNull(patientData.insurance),
        referrer: textOrNull(patientData.referrer),
        surgeries: textOrNull(patientData.surgeries),
        medications: textOrNull(patientData.medications),
        otherDiseases: textOrNull(patientData.otherDiseases),
        contagiousDiseaseNote: textOrNull(patientData.contagiousDiseaseNote),
        bloodType: textOrNull(patientData.bloodType),
        notes: stampFirstNote(patientData.notes, auth.user.fullName),
        institutionId: auth.user.institutionId,
        homeBranchId: activeBranch.branchId,
        birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
        whatsappOptInAt: whatsappGranted ? new Date() : null,
        // Kutu sorulup işaretlenmediyse hasta WhatsApp mesajı istemiyor demektir.
        whatsappOptOutAt: whatsappAnswered && !whatsappGranted ? new Date() : null,
        communicationConsentSource: whatsappGranted
          ? parsed.data.communicationConsentSource || "Hasta kayıt formu"
          : null,
      },
    });

    await writeAudit(auth.user.id, "PATIENT_CREATE", `${patient.fullName} eklendi`);

    // Hasta oluşturulduğu anda SMS izin süreci otomatik başlar (bkz.
    // docs/ILETISIM-MIMARISI-RAPORU.md §1.1) — best-effort: gönderim
    // başarısız olsa bile hasta kaydı geri alınmaz. Sonuç yanıta eklenir ki
    // kaydı yapan personel hastaya "gelen SMS'i onaylayın" diyebilsin ya da
    // gitmediğini görsün.
    let smsConsent: { sent: boolean; error?: string } | null = null;
    if (patient.institutionId) {
      try {
        const result = await sendSmsConsentRequest({
          institutionId: patient.institutionId,
          patientId: patient.id,
          actorId: auth.user.id,
        });
        smsConsent = result.success ? { sent: true } : { sent: false, error: result.error || "İzin SMS'i gönderilemedi." };
      } catch (consentError) {
        console.error("[patients POST] SMS izin isteği gönderilemedi:", consentError);
        smsConsent = { sent: false, error: "İzin SMS'i gönderilemedi." };
      }
    }

    return NextResponse.json({ ...patient, smsConsent }, { status: 201 });
  } catch (error) {
    console.error("[patients POST] failed:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Çakışan kayıt adıyla bildirilir; arşivdeyse ekran "Arşivden geri al"
      // seçeneğini sunar (önceden arşivlenen hastanın TC'si yeni kaydı
      // engelliyor, arşiv hiçbir yerde görünmüyordu — denetim A3).
      const conflict = tcNo
        ? await prisma.patient.findFirst({
            where: { institutionId: auth.user.institutionId, homeBranchId: activeBranch.branchId, tcNo },
            select: { id: true, fullName: true, archivedAt: true },
          }).catch(() => null)
        : null;
      if (conflict?.archivedAt) {
        return NextResponse.json({
          message: `Bu TC kimlik numarası arşivdeki ${conflict.fullName} kaydına ait.`,
          conflict: { id: conflict.id, fullName: conflict.fullName, archived: true, archivedAt: conflict.archivedAt },
        }, { status: 409 });
      }
      return NextResponse.json({
        message: conflict
          ? `Bu TC kimlik numarasıyla kayıtlı hasta var: ${conflict.fullName}.`
          : "Bu TC kimlik numarasıyla kayıtlı bir hasta zaten var.",
        ...(conflict ? { conflict: { id: conflict.id, fullName: conflict.fullName, archived: false, archivedAt: null } } : {}),
      }, { status: 409 });
    }
    return NextResponse.json({ message: "Hasta oluşturulamadı" }, { status: 503 });
  }
}
