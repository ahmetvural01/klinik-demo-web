import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";

const VALID_WAITLIST_STATUSES = new Set(["BEKLIYOR", "ARANDI", "YERLESTIRILDI", "IPTAL"]);
const WAITLIST_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  BEKLIYOR: new Set(["BEKLIYOR", "ARANDI", "YERLESTIRILDI", "IPTAL"]),
  ARANDI: new Set(["ARANDI", "YERLESTIRILDI", "IPTAL"]),
  YERLESTIRILDI: new Set(["YERLESTIRILDI"]),
  IPTAL: new Set(["IPTAL"]),
};

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

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
        branchId: branch.branchId,
      },
    });
    if (!existing) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    const nextStatus = body.status ?? existing.status;
    if (!WAITLIST_TRANSITIONS[existing.status]?.has(nextStatus)) {
      return NextResponse.json({ error: "Bu bekleme listesi durum geçişine izin verilmiyor" }, { status: 409 });
    }

    if (body.note !== undefined && body.note !== null && (typeof body.note !== "string" || body.note.length > 1000)) {
      return NextResponse.json({ error: "Not geçersiz" }, { status: 400 });
    }

    const appointmentId = body.appointmentId ? String(body.appointmentId) : null;
    if (appointmentId && body.status !== "YERLESTIRILDI") {
      return NextResponse.json({ error: "Randevu bağlantısı yalnızca yerleştirildi durumunda kaydedilebilir" }, { status: 400 });
    }
    if (appointmentId) {
      // Hasta eşleşmesi zorunlu; doktor tercihi ise istektir — personel başka
      // doktora randevu verdiyse kayıt yine kapanır (önceden bağlanamıyor,
      // hasta listede "bekliyor" kalıyordu).
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
          patientId: existing.patientId,
          institutionId: existing.institutionId,
          branchId: branch.branchId,
        },
        select: { id: true, status: true },
      });
      if (!appointment) return NextResponse.json({ error: "Randevu bulunamadı" }, { status: 404 });
      if (["IPTAL", "GELMEDI"].includes(appointment.status)) {
        return NextResponse.json({ error: "İptal edilmiş veya gelinmemiş randevuya yerleştirme yapılamaz" }, { status: 409 });
      }
      const linkedElsewhere = await prisma.waitlist.findFirst({
        where: { appointmentId, id: { not: existing.id }, institutionId: existing.institutionId, branchId: branch.branchId },
        select: { id: true },
      });
      if (linkedElsewhere) return NextResponse.json({ error: "Bu randevu başka bir bekleme kaydına bağlı" }, { status: 409 });
    }

    if (body.status === "YERLESTIRILDI" && !appointmentId && !existing.appointmentId) {
      return NextResponse.json({ error: "Yerleştirildi durumu için randevu bağlantısı zorunludur" }, { status: 400 });
    }

    const changed = await prisma.waitlist.updateMany({
      where: { id: existing.id, institutionId: existing.institutionId, branchId: existing.branchId, status: existing.status },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        // "YERLESTIRILDI" işaretlenirken hangi randevunun oluşturulduğu
        // kalıcı olarak bağlanır (bkz. denetim raporu Tema 4).
        ...(appointmentId ? { appointmentId } : {}),
      },
    });
    if (changed.count !== 1) {
      return NextResponse.json({ error: "Kayıt başka bir işlem tarafından değiştirildi; listeyi yenileyin" }, { status: 409 });
    }
    const entry = await prisma.waitlist.findUniqueOrThrow({
      where: { id_institutionId_branchId: { id: existing.id, institutionId: existing.institutionId, branchId: existing.branchId } },
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
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

  try {
    const existing = await prisma.waitlist.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        branchId: branch.branchId,
      },
    });
    if (!existing) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });

    if (existing.status === "YERLESTIRILDI") {
      return NextResponse.json({ error: "Randevuya yerleştirilmiş kayıt silinemez" }, { status: 409 });
    }
    if (existing.status === "IPTAL") return NextResponse.json({ ok: true, alreadyCancelled: true });

    const changed = await prisma.waitlist.updateMany({
      where: { id: existing.id, institutionId: existing.institutionId, branchId: existing.branchId, status: existing.status },
      data: { status: "IPTAL" },
    });
    if (changed.count !== 1) {
      return NextResponse.json({ error: "Kayıt başka bir işlem tarafından değiştirildi; listeyi yenileyin" }, { status: 409 });
    }
    await writeAudit(auth.user.id, "WAITLIST_CANCEL", params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[waitlist DELETE]", error);
    return NextResponse.json({ error: "Silinemedi" }, { status: 503 });
  }
}
