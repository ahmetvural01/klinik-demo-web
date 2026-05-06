import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appointmentSchema } from "@/lib/validators";
import { requireAuth, writeAudit } from "@/lib/api";

type Params = { params: { id: string } };

async function isEligibleAppointmentDoctor(doctorId: string) {
  const doctor = await prisma.user.findUnique({
    where: { id: doctorId },
    select: { isActive: true, role: true, profile: { select: { hideAsDoctor: true } } },
  });

  if (!doctor || !doctor.isActive) return false;
  if (["DOKTOR", "SUPERADMIN", "ADMIN"].includes(doctor.role)) return true;
  if (doctor.role === "YONETICI") return !Boolean(doctor.profile?.hideAsDoctor);
  return false;
}

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  BEKLIYOR: "Bekliyor",
  ONAYLANDI: "Onaylandı",
  GELDI: "Geldi",
  GELMEDI: "Gelmedi",
  IPTAL: "İptal",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

function fmtStatus(v: string): string {
  return APPOINTMENT_STATUS_LABELS[v] || v;
}

export async function GET(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;

  const appointment = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: { patient: true, doctor: true }
  });

  if (!appointment) {
    return NextResponse.json({ message: "Randevu bulunamadı" }, { status: 404 });
  }

  return NextResponse.json(appointment);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  const body = await request.json();

  const existing = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: { patient: true, doctor: true }
  });

  if (!existing) {
    return NextResponse.json({ message: "Randevu bulunamadı" }, { status: 404 });
  }

  const keys = Object.keys(body);

  // Sadece status / note güncellemesi için partial update destekle
  if (keys.length > 0 && keys.every((key) => ["status", "note"].includes(key))) {
    const appointment = await prisma.appointment.update({
      where: { id: params.id },
      data: {
        ...(typeof body.status === "string" ? { status: body.status } : {}),
        ...(typeof body.note === "string" ? { note: body.note } : {}),
      },
      include: { patient: true, doctor: true }
    });

    const beforeParts: string[] = [];
    const afterParts: string[] = [];
    if (typeof body.status === "string" && existing.status !== body.status) {
      beforeParts.push(`Durum: ${fmtStatus(existing.status)}`);
      afterParts.push(`Durum: ${fmtStatus(body.status)}`);
    }
    if (typeof body.note === "string" && fmt(existing.note) !== fmt(body.note)) {
      beforeParts.push(`Not: ${fmt(existing.note)}`);
      afterParts.push(`Not: ${fmt(body.note)}`);
    }

    const action = typeof body.status === "string" && keys.length === 1 ? "APPOINTMENT_STATUS" : "APPOINTMENT_UPDATE";
    const detail = [
      `${auth.user.fullName || "Personel"} tarafından ${appointment.patient.fullName} randevusu güncellendi.`,
      `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
      `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
    ].join("\n");

    await writeAudit(auth.user.id, action, detail);
    return NextResponse.json(appointment);
  }

  const parsed = appointmentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz randevu verisi" }, { status: 400 });
  }

  const eligibleDoctor = await isEligibleAppointmentDoctor(parsed.data.doctorId);
  if (!eligibleDoctor) {
    return NextResponse.json({ message: "Secilen personel randevu doktoru olarak kullanilamaz." }, { status: 400 });
  }

  const newStart = new Date(parsed.data.startAt);
  const newEnd   = new Date(parsed.data.endAt);

  if (newStart >= newEnd) {
    return NextResponse.json({ message: "Başlangıç saati bitiş saatinden önce olmalıdır" }, { status: 400 });
  }

  // Çakışma kontrolü — saat/doktor değişiyorsa yeniden kontrol
  const timeChanged   = parsed.data.startAt !== existing.startAt.toISOString() || parsed.data.endAt !== existing.endAt.toISOString();
  const doctorChanged = parsed.data.doctorId !== existing.doctorId;
  if (timeChanged || doctorChanged) {
    const conflict = await prisma.appointment.findFirst({
      where: {
        id: { not: params.id },
        doctorId: parsed.data.doctorId,
        status: { notIn: ["IPTAL", "GELMEDI"] },
        AND: [{ startAt: { lt: newEnd } }, { endAt: { gt: newStart } }],
      },
      select: { id: true, startAt: true, endAt: true, patient: { select: { fullName: true } } },
    });
    if (conflict) {
      const cs = conflict.startAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      const ce = conflict.endAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      return NextResponse.json({
        message: `Bu doktorun ${cs}–${ce} arası randevusu mevcut (${conflict.patient?.fullName ?? "—"})`,
        conflictId: conflict.id,
      }, { status: 409 });
    }
  }

  const appointment = await prisma.appointment.update({
    where: { id: params.id },
    data: {
      ...parsed.data,
      startAt: newStart,
      endAt:   newEnd,
    },
    include: { patient: true, doctor: true },
  });

  const beforeParts: string[] = [];
  const afterParts: string[] = [];
  const pushDiff = (label: string, before: unknown, after: unknown) => {
    const b = fmt(before);
    const a = fmt(after);
    if (b !== a) {
      beforeParts.push(`${label}: ${b}`);
      afterParts.push(`${label}: ${a}`);
    }
  };

  pushDiff("Başlangıç", existing.startAt.toISOString(), parsed.data.startAt);
  pushDiff("Bitiş", existing.endAt.toISOString(), parsed.data.endAt);
  pushDiff("Durum", fmtStatus(existing.status), fmtStatus(parsed.data.status));
  pushDiff("Tür", existing.type, parsed.data.type);
  pushDiff("Not", existing.note, parsed.data.note);
  pushDiff("Doktor", existing.doctorId, parsed.data.doctorId);

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından ${appointment.patient.fullName} randevusu güncellendi.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
  ].join("\n");

  await writeAudit(auth.user.id, "APPOINTMENT_UPDATE", detail);
  return NextResponse.json(appointment);
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  const existing = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: { patient: { select: { fullName: true } } },
  });
  if (!existing)
    return NextResponse.json({ message: "Randevu bulunamadı" }, { status: 404 });

  // Soft delete — durumu IPTAL yap (veri kaybını önler)
  await prisma.appointment.update({
    where: { id: params.id },
    data: { status: "IPTAL" },
  });

  await writeAudit(auth.user.id, "APPOINTMENT_CANCEL", `${existing.patient?.fullName ?? "—"} randevusu iptal edildi`);
  return NextResponse.json({ ok: true });
}
