import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;
  const { id } = await params;

  const pkg = await prisma.patientPackage.findFirst({ where: { id, institutionId: auth.user.institutionId ?? undefined } });
  if (!pkg) return NextResponse.json({ message: "Paket bulunamadı" }, { status: 404 });
  if (pkg.status !== "AKTIF") {
    return NextResponse.json({ message: "Bu paket artık aktif değil" }, { status: 400 });
  }
  if (pkg.expiresAt && pkg.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ message: "Bu paketin geçerlilik süresi dolmuş" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const appointmentId = body.appointmentId ? String(body.appointmentId) : null;
  const note = body.note ? String(body.note).trim() : null;

  if (appointmentId) {
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, patientId: pkg.patientId },
      select: { id: true },
    });
    if (!appointment) return NextResponse.json({ message: "Randevu bulunamadı" }, { status: 404 });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Bakiye kontrolü ile düşme aynı atomik güncellemede yapılır — iki
      // eşzamanlı "seans kullan" isteği kalan seansı negatife düşürmesin
      // diye (bkz. sms-sales route'undaki aynı desen).
      const result = await tx.patientPackage.updateMany({
        where: { id, sessionsUsed: { lt: pkg.sessionsTotal } },
        data: { sessionsUsed: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new Error("NO_SESSIONS_LEFT");
      }
      await tx.patientPackageUsage.create({
        data: { patientPackageId: id, appointmentId, note, createdById: auth.user.id },
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
    if (error instanceof Error && error.message === "NO_SESSIONS_LEFT") {
      return NextResponse.json({ message: "Bu paketin kullanılabilir seansı kalmadı" }, { status: 400 });
    }
    throw error;
  }
}
