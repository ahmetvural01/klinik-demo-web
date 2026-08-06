import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { getDailySchedules, checkLocalWorkingHoursInterval } from "@/lib/working-hours";
import { checkDoctorWorkingHoursInterval } from "@/lib/working-hours-core";
import { turkeyDateKey, turkeyLocalDateTimeToUtc } from "@/lib/tz";

// GET /api/doctor-blocks?doctorId=xxx&date=2026-05-06
// GET /api/doctor-blocks?from=2026-05-01&to=2026-05-31  (tüm doktorlar için)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("appointments:read");
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const doctorId = searchParams.get("doctorId");
    const date     = searchParams.get("date");
    const from     = searchParams.get("from");
    const to       = searchParams.get("to");

    const where: Record<string, unknown> = {};

    if (doctorId) where.doctorId = doctorId;
    if (date)     where.date = date;
    if (from && to) {
      where.date = { gte: from, lte: to };
    }
    if (auth.user.role !== "SUPERADMIN") {
      where.doctor = { institutionId: auth.user.institutionId };
    }

    const blocks = await prisma.doctorBlock.findMany({
      where,
      include: { doctor: { select: { id: true, fullName: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    return NextResponse.json(blocks);
  } catch (error) {
    console.error("[doctor-blocks GET] fallback:", error);
    return NextResponse.json({ message: "Doktorun kapalı zamanları yüklenemedi. Lütfen sayfayı yenileyin." }, { status: 503 });
  }
}

// POST /api/doctor-blocks
// { doctorId, date, startTime, endTime, reason? }
export async function POST(request: NextRequest) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  const allowedRoles = ["SUPERADMIN", "YONETICI", "ADMIN"];
  if (!allowedRoles.includes(auth.user!.role)) {
    return NextResponse.json({ message: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const body = await request.json();
  const { doctorId, date, startTime, endTime, reason } = body;

  if (!doctorId || !date || !startTime || !endTime) {
    return NextResponse.json({ message: "Doktor, tarih, başlangıç ve bitiş saati zorunludur." }, { status: 400 });
  }

  const doctor = await prisma.user.findFirst({
    where: {
      id: doctorId,
      isActive: true,
      ...(auth.user!.role !== "SUPERADMIN" ? { institutionId: auth.user!.institutionId } : {}),
    },
    select: {
      id: true,
      role: true,
      institutionId: true,
      fullName: true,
      profile: { select: { hideAsDoctor: true, workStart: true, workEnd: true } },
    },
  });
  const isEligibleDoctor = Boolean(
    doctor &&
    (["DOKTOR", "SUPERADMIN", "ADMIN"].includes(doctor.role) ||
      (doctor.role === "YONETICI" && !doctor.profile?.hideAsDoctor))
  );
  if (!doctor || !isEligibleDoctor || !doctor.institutionId) {
    return NextResponse.json({ message: "Seçilen personel aktif bir randevu doktoru değil." }, { status: 404 });
  }

  const dailySchedules = await getDailySchedules(doctor.institutionId);
  const workingHoursError = checkLocalWorkingHoursInterval({
    date,
    startTime,
    endTime,
    dailySchedules,
    actionLabel: "Zaman kapatma kaydı",
  });
  if (workingHoursError) {
    return NextResponse.json({ message: workingHoursError }, { status: 400 });
  }
  const doctorHoursError = checkDoctorWorkingHoursInterval(
    turkeyLocalDateTimeToUtc(date, startTime),
    turkeyLocalDateTimeToUtc(date, endTime),
    doctor.profile?.workStart,
    doctor.profile?.workEnd,
    doctor.fullName
  );
  if (doctorHoursError) {
    return NextResponse.json({ message: doctorHoursError }, { status: 400 });
  }

  if (date < turkeyDateKey() || turkeyLocalDateTimeToUtc(date, endTime).getTime() <= Date.now()) {
    return NextResponse.json({ message: "Geçmiş bir tarih veya saate zaman kapatma kaydı eklenemez." }, { status: 400 });
  }

  try {
    const block = await prisma.$transaction(async (tx) => {
      // Randevu oluşturma ve taşıma da aynı doktor satırını kilitler. Saat
      // kapatma ile randevu kaydı eşzamanlı gelirse işlemler sıraya girer.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${doctorId} FOR UPDATE`;
      const [overlappingBlock, overlappingAppointment] = await Promise.all([
      tx.doctorBlock.findFirst({
        where: {
          doctorId,
          date,
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
        select: { id: true, startTime: true, endTime: true },
      }),
      tx.appointment.findFirst({
        where: {
          doctorId,
          status: { notIn: ["IPTAL", "GELMEDI"] },
          startAt: { lt: turkeyLocalDateTimeToUtc(date, endTime) },
          endAt: { gt: turkeyLocalDateTimeToUtc(date, startTime) },
        },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          patient: { select: { fullName: true } },
        },
      }),
      ]);

      if (overlappingBlock) throw new Error(`BLOCK_CONFLICT|${overlappingBlock.startTime}|${overlappingBlock.endTime}`);
      if (overlappingAppointment) throw new Error(`APPOINTMENT_CONFLICT:${overlappingAppointment.patient?.fullName || "Hasta"}`);

      return tx.doctorBlock.create({
      data: { doctorId, date, startTime, endTime, reason: typeof reason === "string" ? reason.trim().slice(0, 500) || null : null },
      include: { doctor: { select: { id: true, fullName: true } } },
      });
    }, { isolationLevel: "Serializable" });

    await writeAudit(auth.user.id, "DOCTOR_BLOCK_CREATE", `${date} ${startTime}-${endTime}`);
    return NextResponse.json(block, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("BLOCK_CONFLICT|")) {
      const [, conflictStart, conflictEnd] = message.split("|");
      return NextResponse.json({ message: `Bu saat aralığı ${conflictStart}–${conflictEnd} zaman kapatma kaydıyla çakışıyor.` }, { status: 409 });
    }
    if (message.startsWith("APPOINTMENT_CONFLICT:")) {
      return NextResponse.json({ message: `${message.slice("APPOINTMENT_CONFLICT:".length)} için bu saat aralığında randevu var. Önce randevuyu taşıyın veya iptal edin.` }, { status: 409 });
    }
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2034") {
      return NextResponse.json({ message: "Takvim aynı anda başka bir işlemle değişti. Tekrar deneyin." }, { status: 409 });
    }
    console.error("[doctor-blocks POST] fallback:", error);
    return NextResponse.json({ message: "Zaman kapatma kaydı oluşturulamadı." }, { status: 503 });
  }
}

// DELETE /api/doctor-blocks?id=xxx                      → tüm kaydı sil
// DELETE /api/doctor-blocks?id=xxx&slotStart=&slotEnd=  → sadece o aralığı aç, kalanı ayrı kayıt(lar) olarak böl
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  const allowedRoles = ["SUPERADMIN", "YONETICI", "ADMIN"];
  if (!allowedRoles.includes(auth.user!.role)) {
    return NextResponse.json({ message: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const slotStart = searchParams.get("slotStart");
  const slotEnd = searchParams.get("slotEnd");

  if (!id) return NextResponse.json({ message: "Silinecek zaman kaydı belirtilmedi." }, { status: 400 });

  try {
    const existing = await prisma.doctorBlock.findFirst({
      where: {
        id,
        ...(auth.user!.role !== "SUPERADMIN" ? { doctor: { institutionId: auth.user!.institutionId } } : {}),
      },
      select: { id: true, doctorId: true, date: true, startTime: true, endTime: true, reason: true },
    });
    if (!existing) {
      return NextResponse.json({ message: "Zaman kapatma kaydı bulunamadı." }, { status: 404 });
    }

    if (!slotStart || !slotEnd) {
      await prisma.doctorBlock.delete({ where: { id } });
      await writeAudit(auth.user.id, "DOCTOR_BLOCK_DELETE", id);
      return NextResponse.json({ ok: true });
    }

    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(slotStart) || !timePattern.test(slotEnd) || slotStart >= slotEnd) {
      return NextResponse.json({ message: "Geçersiz saat aralığı." }, { status: 400 });
    }

    // Kısmi açma: istenen aralığın kayıtla kesişimini al — kayıt dışına taşan
    // uçları yok sayarız ki eski/hatalı bir slot değeri komşu bir kaydı bozmasın.
    const effectiveStart = slotStart > existing.startTime ? slotStart : existing.startTime;
    const effectiveEnd = slotEnd < existing.endTime ? slotEnd : existing.endTime;
    if (effectiveStart >= effectiveEnd) {
      return NextResponse.json({ message: "Seçilen saat aralığı bu kapalı kayıtla örtüşmüyor." }, { status: 400 });
    }

    const before = effectiveStart > existing.startTime ? { startTime: existing.startTime, endTime: effectiveStart } : null;
    const after = effectiveEnd < existing.endTime ? { startTime: effectiveEnd, endTime: existing.endTime } : null;

    await prisma.$transaction(async (tx) => {
      await tx.doctorBlock.delete({ where: { id } });
      if (before) {
        await tx.doctorBlock.create({ data: { doctorId: existing.doctorId, date: existing.date, startTime: before.startTime, endTime: before.endTime, reason: existing.reason } });
      }
      if (after) {
        await tx.doctorBlock.create({ data: { doctorId: existing.doctorId, date: existing.date, startTime: after.startTime, endTime: after.endTime, reason: existing.reason } });
      }
    });
    await writeAudit(auth.user.id, "DOCTOR_BLOCK_DELETE", `${id} (${slotStart}-${slotEnd})`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[doctor-blocks DELETE] fallback:", error);
    return NextResponse.json({ message: "Zaman kapatma kaydı silinemedi." }, { status: 503 });
  }
}
