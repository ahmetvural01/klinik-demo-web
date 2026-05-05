import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { patientFollowUpCreateSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const doctorId = request.nextUrl.searchParams.get("doctorId");
  const patientId = request.nextUrl.searchParams.get("patientId");
  const status = request.nextUrl.searchParams.get("status");
  const q = (request.nextUrl.searchParams.get("q") || "").trim();

  const items = await prisma.patientFollowUp.findMany({
    where: {
      createdAt: from || to ? {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      } : undefined,
      doctorId: doctorId || undefined,
      patientId: patientId || undefined,
      status: status || undefined,
      OR: q ? [
        { patient: { fullName: { contains: q, mode: "insensitive" } } },
        { patient: { phone: { contains: q, mode: "insensitive" } } },
        { note: { contains: q, mode: "insensitive" } },
        { resolutionNote: { contains: q, mode: "insensitive" } },
      ] : undefined,
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
    orderBy: [{ status: "asc" }, { nextActionAt: "asc" }, { createdAt: "desc" }],
    take: 500,
  });

  const hidePhone = auth.user.role === "DOKTOR" || auth.user.role === "ASISTAN";
  const result = hidePhone
    ? items.map((item) => ({
        ...item,
        patient: item.patient ? { ...item.patient, phone: null } : item.patient,
      }))
    : items;

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const parsed = patientFollowUpCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Gecersiz takip verisi" }, { status: 400 });
  }

  const patient = await prisma.patient.findUnique({
    where: { id: parsed.data.patientId },
    select: { id: true, fullName: true },
  });
  if (!patient) {
    return NextResponse.json({ message: "Hasta bulunamadi" }, { status: 404 });
  }

  if (parsed.data.appointmentId) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: parsed.data.appointmentId },
      select: { id: true },
    });
    if (!appointment) {
      return NextResponse.json({ message: "Bagli randevu bulunamadi" }, { status: 404 });
    }
  }

  const followUp = await prisma.patientFollowUp.create({
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

  await writeAudit(auth.user.id, "PATIENT_FOLLOW_UP_CREATE", `${patient.fullName} icin manuel takip olusturuldu`);
  return NextResponse.json(followUp, { status: 201 });
}
