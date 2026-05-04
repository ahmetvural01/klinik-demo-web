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

    const where = q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" as const } },
            { tcNo: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q, mode: "insensitive" as const } }
          ]
        }
      : {};

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

    return NextResponse.json({ patients, total, skip, take });
  } catch (error) {
    console.error("GET /api/patients failed:", error);
    return NextResponse.json({ message: "Hastalar alınırken sunucu hatası oluştu" }, { status: 500 });
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

  const patient = await prisma.patient.create({
    data: {
      ...parsed.data,
      birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null
    }
  });

  await writeAudit(auth.user.id, "PATIENT_CREATE", `${patient.fullName} eklendi`);
  return NextResponse.json(patient, { status: 201 });
}
