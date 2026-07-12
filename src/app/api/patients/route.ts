import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatZodError, patientSchema } from "@/lib/validators";
import { requireAuth, writeAudit } from "@/lib/api";
import { shouldHidePatientPhone } from "@/lib/patient-visibility";

const SORT_FIELDS = new Set(["fullName", "tcNo", "phone", "gender", "birthDate", "insurance", "createdAt", "updatedAt"]);

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function buildMissingInfoWhere(): Prisma.PatientWhereInput {
  return {
    OR: [
      { tcNo: "" },
      { phone: "" },
      { gender: "" },
      { birthDate: null },
      { address: null },
      { address: "" },
    ],
  };
}

function buildMedicalRiskWhere(): Prisma.PatientWhereInput {
  return {
    OR: [
      { hasAllergy: true },
      { hasHepatitis: true },
      { hasKidney: true },
      { hasDiabetes: true },
      { hasHeart: true },
      { hasBloodIssue: true },
      { surgeries: { not: null } },
      { medications: { not: null } },
      { otherDiseases: { not: null } },
    ],
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("patients:read");
    if (auth.error) return auth.error;

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    const page = parsePositiveInt(request.nextUrl.searchParams.get("page"), 1, 100000);
    const take = parsePositiveInt(request.nextUrl.searchParams.get("take"), 25, 100);
    const skipParam = Number.parseInt(request.nextUrl.searchParams.get("skip") ?? "", 10);
    const skip = Number.isFinite(skipParam) && skipParam >= 0 ? skipParam : (page - 1) * take;
    const sortByParam = request.nextUrl.searchParams.get("sortBy") || "createdAt";
    const sortBy = SORT_FIELDS.has(sortByParam) ? sortByParam : "createdAt";
    const sortDir = request.nextUrl.searchParams.get("sortDir") === "asc" ? "asc" : "desc";
    const gender = (request.nextUrl.searchParams.get("gender") || "").trim();
    const risk = (request.nextUrl.searchParams.get("risk") || "").trim();
    const missing = (request.nextUrl.searchParams.get("missing") || "").trim();
    const insurance = (request.nextUrl.searchParams.get("insurance") || "").trim();

    const tenantWhere: Prisma.PatientWhereInput = auth.user.institutionId ? { institutionId: auth.user.institutionId } : {};
    const filters: Prisma.PatientWhereInput[] = [];

    if (q) {
      filters.push({
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { tcNo: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
        ],
      });
    }
    if (gender) filters.push({ gender });
    if (insurance) filters.push({ insurance: { contains: insurance, mode: "insensitive" } });
    if (risk === "medical") filters.push(buildMedicalRiskWhere());
    if (missing === "true") filters.push(buildMissingInfoWhere());

    const where: Prisma.PatientWhereInput = filters.length ? { AND: [tenantWhere, ...filters] } : tenantWhere;
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);

    const [patients, total, summaryTotal, summaryMedicalRisk, summaryMissingInfo, summaryNewThisMonth] = await Promise.all([
      prisma.patient.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          tcNo: true,
          phone: true,
          gender: true,
          birthDate: true,
          insurance: true,
          discountRate: true,
          address: true,
          bloodType: true,
          hasAllergy: true,
          hasHepatitis: true,
          hasKidney: true,
          hasDiabetes: true,
          hasHeart: true,
          hasBloodIssue: true,
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
      prisma.patient.count({ where: tenantWhere }),
      prisma.patient.count({ where: { AND: [tenantWhere, buildMedicalRiskWhere()] } }),
      prisma.patient.count({ where: { AND: [tenantWhere, buildMissingInfoWhere()] } }),
      prisma.patient.count({ where: { AND: [tenantWhere, { createdAt: { gte: currentMonthStart } }] } }),
    ]);

    const hidePhone = shouldHidePatientPhone(auth.user.role);
    const masked = hidePhone ? patients.map((p) => ({ ...p, phone: "***" })) : patients;

    return NextResponse.json({
      patients: masked,
      total,
      skip,
      take,
      page: Math.floor(skip / take) + 1,
      pageCount: Math.max(1, Math.ceil(total / take)),
      sortBy,
      sortDir,
      summary: {
        total: summaryTotal,
        medicalRisk: summaryMedicalRisk,
        missingInfo: summaryMissingInfo,
        newThisMonth: summaryNewThisMonth,
      },
    });
  } catch (error) {
    console.error("GET /api/patients failed:", error);
    return NextResponse.json({ message: "Hasta listesi yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("patients:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const parsed = patientSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Hasta bilgileri geçersiz", errors: formatZodError(parsed.error) }, { status: 400 });
  }

  try {
    const patient = await prisma.patient.create({
      data: {
        ...parsed.data,
        institutionId: auth.user.institutionId,
        birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
      },
    });

    await writeAudit(auth.user.id, "PATIENT_CREATE", `${patient.fullName} eklendi`);
    return NextResponse.json(patient, { status: 201 });
  } catch (error) {
    console.error("[patients POST] failed:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "Bu TC kimlik numarasıyla kayıtlı bir hasta zaten var." }, { status: 409 });
    }
    return NextResponse.json({ message: "Hasta oluşturulamadı" }, { status: 503 });
  }
}
