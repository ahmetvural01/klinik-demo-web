import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import type { BookingRequestStatus } from "@prisma/client";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("appointments:approve");
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const status = String(body?.status || "");
    const appointmentId = body?.appointmentId ? String(body.appointmentId) : null;
    if (!["ONAYLANDI", "REDDEDILDI", "IPTAL"].includes(status)) {
      return NextResponse.json({ error: "Geçersiz durum" }, { status: 400 });
    }
    if (status === "ONAYLANDI" && !appointmentId) {
      return NextResponse.json({ error: "Talebi onaylamak için oluşturulan randevu zorunlu" }, { status: 400 });
    }
    if (status !== "ONAYLANDI" && appointmentId) {
      return NextResponse.json({ error: "Randevu yalnızca onaylanan talebe bağlanabilir" }, { status: 400 });
    }

    const existing = await prisma.bookingRequest.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
    });
    if (!existing) return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 });
    if (existing.status !== "BEKLIYOR") {
      if (existing.status === status && existing.createdAppointmentId === appointmentId) {
        return NextResponse.json(existing);
      }
      return NextResponse.json({ error: "Bu talep daha önce sonuçlandırılmış" }, { status: 409 });
    }

    // ONAYLANDI + appointmentId ile geldiğinde, hangi randevunun bu talepten
    // doğduğunu kalıcı olarak kaydeder (bkz. denetim raporu Tema 4 —
    // createdAppointmentId alanı önceden hiç kullanılmıyordu).
    if (appointmentId) {
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
          ...(auth.user.institutionId ? { doctor: { institutionId: auth.user.institutionId } } : {}),
        },
        select: { id: true, status: true },
      });
      if (!appointment) return NextResponse.json({ error: "Randevu bulunamadı" }, { status: 404 });
      if (["IPTAL", "GELMEDI"].includes(appointment.status)) {
        return NextResponse.json({ error: "İptal veya gelmedi durumundaki randevu talebe bağlanamaz" }, { status: 400 });
      }
      const alreadyLinked = await prisma.bookingRequest.findFirst({
        where: { createdAppointmentId: appointmentId, id: { not: params.id } },
        select: { id: true },
      });
      if (alreadyLinked) {
        return NextResponse.json({ error: "Bu randevu başka bir online talebe bağlı" }, { status: 409 });
      }
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
