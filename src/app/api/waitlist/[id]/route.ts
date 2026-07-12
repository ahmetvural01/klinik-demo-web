import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const existing = await prisma.waitlist.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
    });
    if (!existing) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });

    const appointmentId = body.appointmentId ? String(body.appointmentId) : null;
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

    const entry = await prisma.waitlist.update({
      where: { id: params.id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        // "YERLESTIRILDI" işaretlenirken hangi randevunun oluşturulduğu
        // kalıcı olarak bağlanır (bkz. denetim raporu Tema 4).
        ...(appointmentId ? { appointmentId } : {}),
      },
      include: {
        patient: { select: { id: true, fullName: true, phone: true } },
        doctor: { select: { id: true, fullName: true } },
      },
    });

    await writeAudit(auth.user.id, "WAITLIST_UPDATE", `Bekleme listesi güncellendi: ${entry.patient.fullName} → ${entry.status}`);
    return NextResponse.json(entry);
  } catch (error) {
    console.error("[waitlist PATCH]", error);
    return NextResponse.json({ error: "Güncellenemedi" }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  try {
    const existing = await prisma.waitlist.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
    });
    if (!existing) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });

    await prisma.waitlist.delete({ where: { id: params.id } });
    await writeAudit(auth.user.id, "WAITLIST_DELETE", params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[waitlist DELETE]", error);
    return NextResponse.json({ error: "Silinemedi" }, { status: 503 });
  }
}
