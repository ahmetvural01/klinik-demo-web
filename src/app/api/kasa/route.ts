import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth("payments:read");
    if (auth.error) return auth.error;

    // Not: doctorId eşleşmesi kasıtlı olarak filtreye DAHİL EDİLMEDİ — Payment.doctorId
    // sadece kurumun doktora yaptığı hakediş ödemesini (bir çıkış/gider) işaretler,
    // gelir değildir. Önceden buraya dahil edildiği için doktor hakediş ödemesi
    // yapıldığında "Bugün Gelir" rakamı yanlışlıkla şişiyordu.
    const institutionFilter = auth.user.institutionId
      ? {
          institutionId: auth.user.institutionId,
          patientId: { not: null },
        }
      : {};

    const { searchParams } = new URL(req.url);
    const dateRaw = searchParams.get("date"); // YYYY-MM-DD

    const date  = dateRaw ? new Date(dateRaw) : new Date();
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const payments = await prisma.payment.findMany({
      where: {
        status: "ACTIVE",
        createdAt: { gte: start, lte: end },
        ...institutionFilter,
      },
      include: { patient: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
    });

    const total = payments.reduce((s, p) => s + Number(p.amount), 0);
    const byMethod: Record<string, number> = { NAKIT: 0, KREDI_KARTI: 0, HAVALE_EFT: 0 };
    for (const p of payments) {
      byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount);
    }

    return NextResponse.json({ date: start.toISOString(), total, byMethod, payments });
  } catch (error) {
    console.error("[kasa GET]", error);
    return NextResponse.json({ message: "Kasa verileri yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
}
