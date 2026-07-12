import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { patientFollowUpCreateSchema } from "@/lib/validators";
import { effectiveDoctorWhere } from "@/lib/hakedis";
import { shouldHidePatientPhone } from "@/lib/patient-visibility";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("appointments:read");
    if (auth.error) return auth.error;

    const institutionDoctors = auth.user.institutionId
      ? await prisma.user.findMany({
          where: effectiveDoctorWhere(auth.user.institutionId),
          select: { id: true },
        })
      : [];
    const doctorIds = institutionDoctors.map((doctor) => doctor.id);

    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const doctorId = request.nextUrl.searchParams.get("doctorId");
    const patientId = request.nextUrl.searchParams.get("patientId");
    const status = request.nextUrl.searchParams.get("status");
    const q = (request.nextUrl.searchParams.get("q") || "").trim();

    const whereClauses: any[] = [];
    if (from || to) {
      whereClauses.push({
        createdAt: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      });
    }
    if (doctorId) whereClauses.push({ doctorId });
    if (patientId) whereClauses.push({ patientId });
    if (status) whereClauses.push({ status });
    if (auth.user.institutionId) {
      whereClauses.push({
        OR: [
          { patient: { institutionId: auth.user.institutionId } },
          { doctorId: { in: doctorIds } },
          { appointment: { doctorId: { in: doctorIds } } },
          { createdBy: { institutionId: auth.user.institutionId } },
        ],
      });
    }
    if (q) {
      whereClauses.push({
        OR: [
          { patient: { fullName: { contains: q, mode: "insensitive" } } },
          { patient: { phone: { contains: q, mode: "insensitive" } } },
          { note: { contains: q, mode: "insensitive" } },
          { resolutionNote: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    const items = await prisma.patientFollowUp.findMany({
      where: whereClauses.length > 0 ? { AND: whereClauses } : undefined,
      include: {
        patient: { select: { id: true, fullName: true, phone: true } },
        appointment: {
          select: {
            id: true,
            startAt: true,
            endAt: true,
            status: true,
            doctor: { select: { id: true, fullName: true } },
          },
        },
        assignedDoctor: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
        labOrder: { select: { id: true, labName: true, labType: true } },
      },
      orderBy: [{ status: "asc" }, { nextActionAt: "asc" }, { createdAt: "desc" }],
      take: 500,
    });

    const hidePhone = shouldHidePatientPhone(auth.user.role);
    const result = hidePhone
      ? items.map((item) => ({
          ...item,
          patient: item.patient ? { ...item.patient, phone: null } : item.patient,
        }))
      : items;

    return NextResponse.json(result);
  } catch (error) {
    console.error("[patient-follow-ups GET] fallback:", error);
    return NextResponse.json({ message: "Hasta takip verileri yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  const institutionDoctors = auth.user.institutionId
    ? await prisma.user.findMany({
        where: effectiveDoctorWhere(auth.user.institutionId),
        select: { id: true },
      })
    : [];
  const doctorIds = institutionDoctors.map((doctor) => doctor.id);

  const body = await request.json();
  const parsed = patientFollowUpCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz takip verisi" }, { status: 400 });
  }

  if (auth.user.institutionId && parsed.data.doctorId && !doctorIds.includes(parsed.data.doctorId)) {
    return NextResponse.json({ message: "Doktor kurum kapsamı disinda" }, { status: 403 });
  }

  let patient;
  try {
    patient = await prisma.patient.findFirst({
      where: {
        id: parsed.data.patientId,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      select: { id: true, fullName: true },
    });
    if (!patient) {
      return NextResponse.json({ message: "Hasta bulunamadi" }, { status: 404 });
    }

  } catch (error) {
    console.error("[patient-follow-ups POST patient lookup] fallback:", error);
    return NextResponse.json({ message: "Takip kaydı oluşturulamadı" }, { status: 503 });
  }

  if (parsed.data.appointmentId) {
    try {
      const appointment = await prisma.appointment.findUnique({
        where: { id: parsed.data.appointmentId },
        select: { id: true, doctorId: true, patient: { select: { institutionId: true } } },
      });
      if (!appointment) {
        return NextResponse.json({ message: "Bagli randevu bulunamadi" }, { status: 404 });
      }
      if (auth.user.institutionId && appointment.patient.institutionId !== auth.user.institutionId) {
        return NextResponse.json({ message: "Randevu kurum kapsamı disinda" }, { status: 403 });
      }
    } catch (error) {
      console.error("[patient-follow-ups POST appointment lookup] fallback:", error);
      return NextResponse.json({ message: "Takip kaydı oluşturulamadı" }, { status: 503 });
    }
  }

  let followUp;
  try {
    followUp = await prisma.patientFollowUp.create({
      data: {
        patientId: parsed.data.patientId,
        appointmentId: parsed.data.appointmentId || null,
        doctorId: parsed.data.doctorId || null,
        createdById: auth.user.id,
        type: parsed.data.type,
        priority: parsed.data.priority,
        note: parsed.data.note?.trim() || null,
        nextActionAt: parsed.data.nextActionAt ? new Date(parsed.data.nextActionAt) : null,
        status: "ACIK",
      },
      include: {
        patient: { select: { id: true, fullName: true, phone: true } },
        appointment: {
          select: {
            id: true,
            startAt: true,
            endAt: true,
            status: true,
            doctor: { select: { id: true, fullName: true } },
          },
        },
        assignedDoctor: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  } catch (error) {
    console.error("[patient-follow-ups POST create] fallback:", error);
    return NextResponse.json({ message: "Takip kaydı oluşturulamadı" }, { status: 503 });
  }

  await writeAudit(auth.user.id, "PATIENT_FOLLOW_UP_CREATE", `${patient.fullName} için manuel takip oluşturuldu`);
  return NextResponse.json(followUp, { status: 201 });
}
