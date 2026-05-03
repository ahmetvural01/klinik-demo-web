import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appointmentSchema } from "@/lib/validators";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const doctorId = request.nextUrl.searchParams.get("doctorId");
  const patientId = request.nextUrl.searchParams.get("patientId");
  const type = request.nextUrl.searchParams.get("type");

  const date = request.nextUrl.searchParams.get("date");
  const dateFrom = date ? new Date(date + "T00:00:00.000Z") : (from ? new Date(from) : undefined);
  const dateTo = date ? new Date(date + "T23:59:59.999Z") : (to ? new Date(to) : undefined);

  const appointments = await prisma.appointment.findMany({
    where: {
      startAt: (dateFrom || dateTo) ? { gte: dateFrom, lte: dateTo } : undefined,
      doctorId: doctorId || undefined,
      patientId: patientId || undefined,
      type: type ? { equals: type as "STANDART" | "KONTROL" | "ACIL" } : undefined,
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      type: true,
      colorCode: true,
      note: true,
      smsInfo: true,
      smsReminder: true,
      smsSurvey: true,
      doctorId: true,
      patientId: true,
      patient: { select: { id: true, fullName: true, phone: true, tcNo: true } },
      doctor: { select: { id: true, fullName: true, role: true } },
    },
    orderBy: { startAt: "asc" },
    take: 500, // Güvenlik limiti
  });

  return NextResponse.json(appointments);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const parsed = appointmentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz randevu verisi" }, { status: 400 });
  }

  const startAt = new Date(parsed.data.startAt);
  const endAt   = new Date(parsed.data.endAt);

  // Başlangıç / bitiş mantık kontrolü
  if (startAt >= endAt) {
    return NextResponse.json({ message: "Başlangıç saati bitiş saatinden önce olmalıdır" }, { status: 400 });
  }

  // ── Doktor çakışma kontrolü ─────────────────────────────────────────────
  const conflict = await prisma.appointment.findFirst({
    where: {
      doctorId: parsed.data.doctorId,
      status: { notIn: ["IPTAL", "GELMEDI"] },
      AND: [
        { startAt: { lt: endAt } },
        { endAt:   { gt: startAt } },
      ],
    },
    select: {
      id: true, startAt: true, endAt: true,
      patient: { select: { fullName: true } },
    },
  });

  if (conflict) {
    const cs = conflict.startAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    const ce = conflict.endAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    return NextResponse.json({
      message: `Bu doktorun ${cs}–${ce} saatleri arası randevusu mevcut (${conflict.patient?.fullName ?? "—"})`,
      conflictId: conflict.id,
    }, { status: 409 });
  }

  // ── Aynı hasta, aynı gün çakışma kontrolü ──────────────────────────────
  const patientConflict = await prisma.appointment.findFirst({
    where: {
      patientId: parsed.data.patientId,
      status: { notIn: ["IPTAL", "GELMEDI"] },
      AND: [
        { startAt: { lt: endAt } },
        { endAt:   { gt: startAt } },
      ],
    },
    select: { id: true, startAt: true, endAt: true },
  });

  if (patientConflict) {
    const cs = patientConflict.startAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    const ce = patientConflict.endAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    return NextResponse.json({
      message: `Bu hastanın ${cs}–${ce} saatleri arası başka bir randevusu mevcut`,
      conflictId: patientConflict.id,
    }, { status: 409 });
  }

  const appointment = await prisma.appointment.create({
    data: { ...parsed.data, startAt, endAt },
    include: { patient: true, doctor: true },
  });

  await writeAudit(auth.user.id, "APPOINTMENT_CREATE", `${appointment.patient.fullName} icin randevu`);
  return NextResponse.json(appointment, { status: 201 });
}
