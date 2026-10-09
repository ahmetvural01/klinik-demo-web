import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatZodError, patientSchema } from "@/lib/validators";
import { hasEffectivePermission, requireAuth, withApiTiming, writeAudit } from "@/lib/api";
import { shouldHidePatientPhoneForRole } from "@/lib/patient-visibility-server";
import { sendSmsConsentRequest } from "@/lib/sms-consent";
import { listPatientIdsForDerivedBucket } from "@/lib/sms-consent-stats";
import { requireActiveBranch } from "@/lib/branch-context";
import { buildPatientSearchWhere } from "@/lib/patient-search";
import { loadPatientListExtras } from "@/lib/patient-list-extras";

const SMS_CONSENT_FILTERS = new Set(["ENABLED", "DISABLED", "PENDING", "EXPIRED", "SEND_FAILED"]);

const SORT_FIELDS = new Set(["fullName", "tcNo", "phone", "gender", "birthDate", "insurance", "profession", "createdAt", "updatedAt"]);

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export const GET = withApiTiming("patients", async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("patients:read");
    if (auth.error) return auth.error;
    const activeBranch = requireActiveBranch(auth.user.branchContext);
    if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 403 });

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    const patientId = (request.nextUrl.searchParams.get("id") ?? "").trim();
    const page = parsePositiveInt(request.nextUrl.searchParams.get("page"), 1, 100000);
    const take = parsePositiveInt(request.nextUrl.searchParams.get("take"), 25, 100);
    const skipParam = Number.parseInt(request.nextUrl.searchParams.get("skip") ?? "", 10);
    const skip = Number.isFinite(skipParam) && skipParam >= 0 ? skipParam : (page - 1) * take;
    const sortByParam = request.nextUrl.searchParams.get("sortBy") || "createdAt";
    const sortBy = SORT_FIELDS.has(sortByParam) ? sortByParam : "createdAt";
    const sortDir = request.nextUrl.searchParams.get("sortDir") === "asc" ? "asc" : "desc";
    const doctorId = (request.nextUrl.searchParams.get("doctorId") || "").trim();
    const smsConsentParam = (request.nextUrl.searchParams.get("smsConsent") || "").trim().toUpperCase();
    const smsConsentFilter = SMS_CONSENT_FILTERS.has(smsConsentParam) ? smsConsentParam : "";
    const includeSummary = request.nextUrl.searchParams.get("summary") !== "false";
    // Hasta listesi ekranı (extras=1) satırda son ziyaret, sonraki randevu ve
    // kalan bakiyeyi gösterir; hasta seçiciler gibi diğer çağıranlar bunu
    // istemez, gereksiz sorgu çalışmaz.
    const includeExtras = request.nextUrl.searchParams.get("extras") === "1";

    const tenantWhere: Prisma.PatientWhereInput = {
      archivedAt: null,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      homeBranchId: activeBranch.branchId,
    };
    const filters: Prisma.PatientWhereInput[] = [];

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
      filters.push(await buildPatientSearchWhere(q, {
        institutionId: auth.user.institutionId ?? null,
        branchId: activeBranch.branchId,
      }));
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
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);

    const [patients, total, summaryTotal, summaryNewThisMonth] = await Promise.all([
      prisma.patient.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          tcNo: true,
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
          contagiousDiseaseNote: true,
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
      includeSummary ? prisma.patient.count({ where: tenantWhere }) : Promise.resolve(0),
      includeSummary
        ? prisma.patient.count({ where: { AND: [tenantWhere, { createdAt: { gte: currentMonthStart } }] } })
        : Promise.resolve(0),
    ]);

    // patients:phone izni telefonu koruduğu gibi TC kimlik numarasını da
    // korur — TC no doğrudan kimliklendirici bir alan olduğu için telefondan
    // daha az hassas sayılıp maskesiz bırakılması tasarımın kendi iç
    // tutarlılığına aykırıydı (bkz. denetim raporu): DOKTOR/ASISTAN rolleri
    // telefonu göremezken TC no'yu görebiliyordu.
    const hidePhone = await shouldHidePatientPhoneForRole(auth.user.role);
    // Liste ekranı, uzun anamnez metinlerini taşımaz. Satırda gerekli olan tek
    // bilgi medikal uyarının varlığıdır; detay metinleri hasta kartından açılır.
    const listed = patients.map(({ surgeries, medications, otherDiseases, ...patient }) => ({
      ...patient,
      hasMedicalRisk: Boolean(
        patient.hasAllergy || patient.hasHepatitis || patient.hasKidney || patient.hasDiabetes ||
        patient.hasHeart || patient.hasBloodIssue || surgeries || medications || otherDiseases,
      ),
    }));
    const masked = hidePhone ? listed.map((p) => ({ ...p, phone: "***", tcNo: p.tcNo ? "***" : p.tcNo })) : listed;

    // Son ziyaret / sonraki randevu yalnız randevu okuma, bakiye yalnız tahsilat
    // ve tedavi okuma yetkisi olan rollere gönderilir — liste, hasta
    // dosyasında görmeyeceği bir bilgiyi kimseye açmaz.
    let withExtras: Array<(typeof masked)[number] & {
      lastVisitAt?: string | null;
      nextAppointment?: { startAt: string; doctorName: string | null } | null;
      balance?: number | null;
    }> = masked;
    if (includeExtras && masked.length > 0) {
      const [canReadAppointments, canReadPayments, canReadExaminations] = await Promise.all([
        hasEffectivePermission(auth.user, "appointments:read"),
        hasEffectivePermission(auth.user, "payments:read"),
        hasEffectivePermission(auth.user, "examinations:read"),
      ]);
      const extras = await loadPatientListExtras({
        institutionId: auth.user.institutionId ?? null,
        branchId: activeBranch.branchId,
        patients: patients.map((patient) => ({ id: patient.id, discountRate: patient.discountRate })),
        includeVisits: canReadAppointments,
        includeBalance: canReadPayments && canReadExaminations,
      });
      withExtras = masked.map((patient) => {
        const extra = extras.get(patient.id);
        return {
          ...patient,
          lastVisitAt: canReadAppointments ? extra?.lastVisitAt ?? null : undefined,
          nextAppointment: canReadAppointments ? extra?.nextAppointment ?? null : undefined,
          balance: canReadPayments && canReadExaminations ? extra?.balance ?? 0 : undefined,
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
      ...(includeSummary ? { summary: { total: summaryTotal, newThisMonth: summaryNewThisMonth } } : {}),
    });
  } catch (error) {
    console.error("GET /api/patients failed:", error);
    return NextResponse.json({ message: "Hasta listesi yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
});

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

  const body = await request.json();
  const parsed = patientSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Hasta bilgileri geçersiz", errors: formatZodError(parsed.error) }, { status: 400 });
  }
  try {
    const { whatsappConsent, ...patientData } = parsed.data;
    const patient = await prisma.patient.create({
      data: {
        ...patientData,
        institutionId: auth.user.institutionId,
        homeBranchId: activeBranch.branchId,
        birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
        whatsappOptInAt: whatsappConsent ? new Date() : null,
        // Kayıtta açıkça kapatılmışsa hasta WhatsApp mesajı istemiyor demektir.
        whatsappOptOutAt: whatsappConsent ? null : new Date(),
        communicationConsentSource: whatsappConsent
          ? parsed.data.communicationConsentSource || "Hasta kayıt formu"
          : null,
      },
    });

    await writeAudit(auth.user.id, "PATIENT_CREATE", `${patient.fullName} eklendi`);

    if (patient.institutionId) {
      // Hasta oluşturulduğu anda SMS izin süreci otomatik başlar (bkz.
      // docs/ILETISIM-MIMARISI-RAPORU.md §1.1) — best-effort: gönderim
      // başarısız olsa bile hasta kaydı geri alınmaz.
      try {
        await sendSmsConsentRequest({
          institutionId: patient.institutionId,
          patientId: patient.id,
          actorId: auth.user.id,
        });
      } catch (consentError) {
        console.error("[patients POST] SMS izin isteği gönderilemedi:", consentError);
      }
    }

    return NextResponse.json(patient, { status: 201 });
  } catch (error) {
    console.error("[patients POST] failed:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "Bu TC kimlik numarasıyla kayıtlı bir hasta zaten var." }, { status: 409 });
    }
    return NextResponse.json({ message: "Hasta oluşturulamadı" }, { status: 503 });
  }
}
