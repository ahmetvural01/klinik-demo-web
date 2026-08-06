import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }
  const institutionId = auth.user.institutionId;
  const { id } = await params;
  const requestKey = request.headers.get("Idempotency-Key")?.trim() || null;
  if (requestKey && (requestKey.length < 8 || requestKey.length > 180)) {
    return NextResponse.json({ message: "İşlem anahtarı geçersiz" }, { status: 400 });
  }
  if (requestKey) {
    const existingUsage = await prisma.patientPackageUsage.findUnique({
      where: { requestKey },
      include: { patientPackage: true },
    });
    if (existingUsage) {
      if (existingUsage.patientPackageId !== id || existingUsage.patientPackage.institutionId !== institutionId) {
        return NextResponse.json({ message: "İşlem anahtarı başka bir seans kullanımına ait" }, { status: 409 });
      }
      return NextResponse.json(existingUsage.patientPackage);
    }
  }

  const pkg = await prisma.patientPackage.findFirst({ where: { id, institutionId } });
  if (!pkg) return NextResponse.json({ message: "Paket bulunamadı" }, { status: 404 });
  if (pkg.status !== "AKTIF") {
    return NextResponse.json({ message: "Bu paket artık aktif değil" }, { status: 400 });
  }
  if (pkg.expiresAt && pkg.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ message: "Bu paketin geçerlilik süresi dolmuş" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  const appointmentId = body.appointmentId ? String(body.appointmentId) : null;
  const note = body.note ? String(body.note).trim() : null;
  if (note && note.length > 1000) {
    return NextResponse.json({ message: "Seans notu çok uzun" }, { status: 400 });
  }

  if (appointmentId) {
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, patientId: pkg.patientId },
      select: { id: true, status: true },
    });
    if (!appointment) return NextResponse.json({ message: "Randevu bulunamadı" }, { status: 404 });
    if (!["GELDI", "TAMAMLANDI"].includes(appointment.status)) {
      return NextResponse.json({ message: "Paket seansı yalnızca hasta geldi veya randevu tamamlandı olarak işaretlendiğinde kullanılabilir." }, { status: 400 });
    }
    const existingUsage = await prisma.patientPackageUsage.findFirst({ where: { patientPackageId: id, appointmentId }, select: { id: true } });
    if (existingUsage) {
      return NextResponse.json({ message: "Bu randevu için bu paketten zaten seans kullanılmış." }, { status: 409 });
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (appointmentId) {
        const currentAppointment = await tx.appointment.findFirst({
          where: { id: appointmentId, patientId: pkg.patientId },
          select: { id: true, status: true },
        });
        if (!currentAppointment || !["GELDI", "TAMAMLANDI"].includes(currentAppointment.status)) {
          throw new Error("APPOINTMENT_NOT_ELIGIBLE");
        }
      }
      // Bakiye kontrolü ile düşme aynı atomik güncellemede yapılır — iki
      // eşzamanlı "seans kullan" isteği kalan seansı negatife düşürmesin
      // diye (bkz. sms-sales route'undaki aynı desen).
      const result = await tx.patientPackage.updateMany({
        where: {
          id,
          institutionId,
          status: "AKTIF",
          sessionsUsed: { lt: pkg.sessionsTotal },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        data: { sessionsUsed: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new Error("NO_SESSIONS_LEFT");
      }
      await tx.patientPackageUsage.create({
        data: { requestKey, patientPackageId: id, appointmentId, note, createdById: auth.user.id },
      });
      const fresh = await tx.patientPackage.findUniqueOrThrow({ where: { id } });
      if (fresh.sessionsUsed >= fresh.sessionsTotal) {
        return tx.patientPackage.update({ where: { id }, data: { status: "TAMAMLANDI" } });
      }
      return fresh;
    });

    await writeAudit(auth.user.id, "PATIENT_PACKAGE_USE", `${pkg.name} paketinden 1 seans kullanıldı (${updated.sessionsUsed}/${updated.sessionsTotal})`);
    return NextResponse.json(updated);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "P2002") {
      if (requestKey) {
        const existingUsage = await prisma.patientPackageUsage.findUnique({
          where: { requestKey },
          include: { patientPackage: true },
        });
        if (existingUsage?.patientPackageId === id && existingUsage.patientPackage.institutionId === institutionId) {
          return NextResponse.json(existingUsage.patientPackage);
        }
      }
      return NextResponse.json({ message: "Bu randevu için bu paketten zaten seans kullanılmış." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "NO_SESSIONS_LEFT") {
      return NextResponse.json({ message: "Bu paketin kullanılabilir seansı kalmadı" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "APPOINTMENT_NOT_ELIGIBLE") {
      return NextResponse.json({ message: "Paket seansı için randevu artık uygun durumda değil" }, { status: 400 });
    }
    throw error;
  }
}
