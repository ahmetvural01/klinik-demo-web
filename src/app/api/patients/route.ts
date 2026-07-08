import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { patientSchema } from "@/lib/validators";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("patients:read");
    if (auth.error) return auth.error;

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    const skip = parseInt(request.nextUrl.searchParams.get("skip") ?? "0", 10);
    const take = Math.min(parseInt(request.nextUrl.searchParams.get("take") ?? "100", 10), 500);

    const tenantWhere = auth.user.institutionId ? { institutionId: auth.user.institutionId } : {};
    const searchWhere = q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" as const } },
            { tcNo: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q, mode: "insensitive" as const } }
          ]
        }
      : {};
    const where = { ...tenantWhere, ...searchWhere };

    const [patients, total] = await Promise.all([
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
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.patient.count({ where }),
    ]);

    // DOKTOR ve ASISTAN telefon numaralarını göremez
    const hidePhone = auth.user.role === "DOKTOR" || auth.user.role === "ASISTAN";
    const masked = hidePhone
      ? patients.map(p => ({ ...p, phone: "***" }))
      : patients;

    return NextResponse.json({ patients: masked, total, skip, take });
  } catch (error) {
    console.error("GET /api/patients failed:", error);
    return NextResponse.json({ patients: [], total: 0, skip: 0, take: 0 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("patients:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const parsed = patientSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz hasta verisi" }, { status: 400 });
  }

  let patient;
  try {
    patient = await prisma.patient.create({
      data: {
        ...parsed.data,
        institutionId: auth.user.institutionId,
        birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null
      }
    });
  } catch (error) {
    console.error("[patients POST] fallback:", error);
    return NextResponse.json({ message: "Hasta oluşturulamadı" }, { status: 503 });
  }

  await writeAudit(auth.user.id, "PATIENT_CREATE", `${patient.fullName} eklendi`);
  return NextResponse.json(patient, { status: 201 });
}
