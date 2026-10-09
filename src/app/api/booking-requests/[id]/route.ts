import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import type { BookingRequestStatus } from "@prisma/client";

function comparablePhone(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}
import { requireActiveBranch } from "@/lib/branch-context";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("appointments:approve");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

  try {
    const body = await req.json();
    const status = String(body?.status || "");
    const appointmentId = body?.appointmentId ? String(body.appointmentId) : null;
    // Red/kapama nedeni yalnız işlem kaydına yazılır (hastaya mesaj gitmez).
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    if (!["ONAYLANDI", "REDDEDILDI", "IPTAL"].includes(status)) {
      return NextResponse.json({ error: "Geçersiz durum" }, { status: 400 });
    }
    if (status === "ONAYLANDI" && !appointmentId) {
      return NextResponse.json({ error: "Talebi onaylamak için oluşturulan randevu zorunlu" }, { status: 400 });
    }
    if (status !== "ONAYLANDI" && appointmentId) {
      return NextResponse.json({ error: "Randevu yalnızca onaylanan talebe bağlanabilir" }, { status: 400 });
    }
    let doctorChangeNote = "";

    const existing = await prisma.bookingRequest.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        branchId: branch.branchId,
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
      // Hastanın doktor tercihi bir istektir, zorunluluk değil: personel
      // başka doktora randevu verdiyse de talep onaylanmış sayılır (kimlik
      // eşleşmesi aşağıda aynen zorunlu). Önceden doktor farklıysa bağlama
      // reddediliyor, talep açık kalıyor ve ikinci kez "onayla" ikinci bir
      // randevu üretiyordu.
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
          institutionId: existing.institutionId,
          branchId: branch.branchId,
        },
        select: {
          id: true,
          status: true,
          doctorId: true,
          doctor: { select: { fullName: true } },
          patient: { select: { phone: true, tcNo: true } },
        },
      });
      if (!appointment) return NextResponse.json({ error: "Randevu bulunamadı" }, { status: 404 });
      if (["IPTAL", "GELMEDI"].includes(appointment.status)) {
        return NextResponse.json({ error: "İptal veya gelmedi durumundaki randevu talebe bağlanamaz" }, { status: 400 });
      }
      const sameIdentity = Boolean(existing.tcNo && appointment.patient.tcNo && existing.tcNo === appointment.patient.tcNo);
      const samePhone = comparablePhone(existing.phone).length === 10
        && comparablePhone(existing.phone) === comparablePhone(appointment.patient.phone);
      if (!sameIdentity && !samePhone) {
        return NextResponse.json({ error: "Oluşturulan randevunun hastası bu taleple eşleşmiyor" }, { status: 409 });
      }
      const alreadyLinked = await prisma.bookingRequest.findFirst({
        where: { createdAppointmentId: appointmentId, id: { not: params.id }, institutionId: existing.institutionId, branchId: branch.branchId },
        select: { id: true },
      });
      if (alreadyLinked) {
        return NextResponse.json({ error: "Bu randevu başka bir online talebe bağlı" }, { status: 409 });
      }
      if (existing.doctorId && appointment.doctorId !== existing.doctorId) {
        doctorChangeNote = ` · doktor tercihi değiştirildi (${appointment.doctor?.fullName || "başka doktor"})`;
      }
    }

    const updated = await prisma.bookingRequest.update({
      where: {
        id_institutionId_branchId: {
          id: existing.id,
          institutionId: existing.institutionId,
          branchId: existing.branchId,
        },
      },
      data: {
        status: status as BookingRequestStatus,
        ...(appointmentId ? { createdAppointmentId: appointmentId } : {}),
      },
      include: { doctor: { select: { id: true, fullName: true } } },
    });

    await writeAudit(auth.user.id, "BOOKING_REQUEST_UPDATE", `${existing.fullName} → ${status}${doctorChangeNote}${reason ? ` · Neden: ${reason}` : ""}`);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[booking-requests PATCH]", error);
    return NextResponse.json({ error: "Güncellenemedi" }, { status: 503 });
  }
}
