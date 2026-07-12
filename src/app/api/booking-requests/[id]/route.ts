import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import type { BookingRequestStatus } from "@prisma/client";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const status = String(body?.status || "");
    const appointmentId = body?.appointmentId ? String(body.appointmentId) : null;
    if (!["ONAYLANDI", "REDDEDILDI", "IPTAL"].includes(status)) {
      return NextResponse.json({ error: "Geçersiz durum" }, { status: 400 });
    }

    const existing = await prisma.bookingRequest.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
    });
    if (!existing) return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 });

    // ONAYLANDI + appointmentId ile geldiğinde, hangi randevunun bu talepten
    // doğduğunu kalıcı olarak kaydeder (bkz. denetim raporu Tema 4 —
    // createdAppointmentId alanı önceden hiç kullanılmıyordu).
    if (appointmentId) {
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
          ...(auth.user.institutionId ? { doctor: { institutionId: auth.user.institutionId } } : {}),
        },
        select: { id: true },
      });
      if (!appointment) return NextResponse.json({ error: "Randevu bulunamadı" }, { status: 404 });
    }

    const updated = await prisma.bookingRequest.update({
      where: { id: params.id },
      data: {
        status: status as BookingRequestStatus,
        ...(appointmentId ? { createdAppointmentId: appointmentId } : {}),
      },
      include: { doctor: { select: { id: true, fullName: true } } },
    });

    await writeAudit(auth.user.id, "BOOKING_REQUEST_UPDATE", `${existing.fullName} → ${status}`);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[booking-requests PATCH]", error);
    return NextResponse.json({ error: "Güncellenemedi" }, { status: 503 });
  }
}
