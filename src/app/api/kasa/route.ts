import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { createIntegratedPayment } from "@/lib/payment-ledger";
import { effectiveDoctorWhere } from "@/lib/hakedis";

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
          patientId: { not: null },
          patient: { institutionId: auth.user.institutionId },
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

export async function POST(req: NextRequest) {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;

  const institutionDoctors = auth.user.institutionId
    ? await prisma.user.findMany({
        where: effectiveDoctorWhere(auth.user.institutionId),
        select: { id: true },
      })
    : [];
  const doctorIds = institutionDoctors.map((doctor) => doctor.id);

  const body = await req.json();
  const { patientId, doctorId, method, amount, description, posId } = body;
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !method) {
    return NextResponse.json({ error: "amount ve method zorunlu" }, { status: 400 });
  }

  if (patientId && !doctorId) {
    return NextResponse.json({ error: "Hasta tahsilatı için doktor seçimi zorunlu" }, { status: 400 });
  }

  if (!patientId && !doctorId) {
    return NextResponse.json({ error: "Tahsilat hasta veya doktor ile ilişkilendirilmelidir" }, { status: 400 });
  }

  if ((method === "KREDI_KARTI" || method === "MAIL_ORDER") && !posId) {
    return NextResponse.json({ error: "Kart / mail order tahsilatı için POS seçimi zorunlu" }, { status: 400 });
  }

  if (auth.user.institutionId && doctorId && !doctorIds.includes(doctorId)) {
    return NextResponse.json({ error: "Bu doktor kurum kapsamı disinda" }, { status: 403 });
  }

  if (auth.user.institutionId && patientId) {
    const relatedPatient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        institutionId: auth.user.institutionId,
      },
      select: { id: true },
    });

    if (!relatedPatient) {
      return NextResponse.json({ error: "Hasta kurum kapsamı disinda" }, { status: 403 });
    }
  }

  try {
    const { payment, taksitInfo } = await prisma.$transaction(
      (tx) =>
        createIntegratedPayment({
          tx,
          patientId,
          doctorId,
          method,
          amount: numericAmount,
          description,
          posId,
        }),
      { isolationLevel: "Serializable" }
    );

    await writeAudit(auth.user.id, "KASA_PAYMENT_CREATE", `${numericAmount} TL kasa tahsilatı eklendi`);
    return NextResponse.json({ ...payment, taksitInfo }, { status: 201 });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2034") {
      return NextResponse.json(
        { error: "Bu hasta için aynı anda başka bir ödeme işlendi. Lütfen tekrar deneyin." },
        { status: 409 }
      );
    }
    console.error("[kasa POST]", e);
    return NextResponse.json({ error: "Ödeme kaydedilemedi" }, { status: 503 });
  }
}
