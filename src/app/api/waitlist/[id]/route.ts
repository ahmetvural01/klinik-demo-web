import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

const VALID_WAITLIST_STATUSES = new Set(["BEKLIYOR", "ARANDI", "YERLESTIRILDI", "IPTAL"]);

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
    }
    // Önceden body.status doğrudan Prisma'ya veriliyordu — geçersiz bir
    // değer ham DB hatasına yol açıyordu (bkz. denetim raporu).
    if (body.status !== undefined && !VALID_WAITLIST_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Geçersiz bekleme listesi durumu" }, { status: 400 });
    }
    const existing = await prisma.waitlist.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
    });
    if (!existing) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    if (["YERLESTIRILDI", "IPTAL"].includes(existing.status) && body.status !== undefined && body.status !== existing.status) {
      return NextResponse.json({ error: "Sonuçlanmış bekleme listesi kaydının durumu değiştirilemez" }, { status: 409 });
    }

    if (body.note !== undefined && body.note !== null && (typeof body.note !== "string" || body.note.length > 1000)) {
      return NextResponse.json({ error: "Not geçersiz" }, { status: 400 });
    }

    const appointmentId = body.appointmentId ? String(body.appointmentId) : null;
    if (appointmentId && body.status !== "YERLESTIRILDI") {
      return NextResponse.json({ error: "Randevu bağlantısı yalnızca yerleştirildi durumunda kaydedilebilir" }, { status: 400 });
    }
    if (appointmentId) {
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
          patientId: existing.patientId,
          ...(existing.doctorId ? { doctorId: existing.doctorId } : {}),
          ...(auth.user.institutionId ? { doctor: { institutionId: auth.user.institutionId } } : {}),
        },
        select: { id: true, status: true },
      });
      if (!appointment) return NextResponse.json({ error: "Randevu bulunamadı" }, { status: 404 });
      if (["IPTAL", "GELMEDI"].includes(appointment.status)) {
        return NextResponse.json({ error: "İptal edilmiş veya gelinmemiş randevuya yerleştirme yapılamaz" }, { status: 409 });
      }
      const linkedElsewhere = await prisma.waitlist.findFirst({
        where: { appointmentId, id: { not: existing.id } },
        select: { id: true },
      });
      if (linkedElsewhere) return NextResponse.json({ error: "Bu randevu başka bir bekleme kaydına bağlı" }, { status: 409 });
    }

    if (body.status === "YERLESTIRILDI" && !appointmentId && !existing.appointmentId) {
      return NextResponse.json({ error: "Yerleştirildi durumu için randevu bağlantısı zorunludur" }, { status: 400 });
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

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

    if (existing.status === "YERLESTIRILDI") {
      return NextResponse.json({ error: "Randevuya yerleştirilmiş kayıt silinemez" }, { status: 409 });
    }
    if (existing.status === "IPTAL") return NextResponse.json({ ok: true, alreadyCancelled: true });

    await prisma.waitlist.update({ where: { id: params.id }, data: { status: "IPTAL" } });
    await writeAudit(auth.user.id, "WAITLIST_CANCEL", params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[waitlist DELETE]", error);
    return NextResponse.json({ error: "Silinemedi" }, { status: 503 });
  }
}
