import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { createIntegratedPayment } from "@/lib/payment-ledger";
import { formatZodError, paymentSchema } from "@/lib/validators";
import { effectiveDoctorWhere } from "@/lib/hakedis";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth("payments:write");
    if (auth.error) return auth.error;

    const parsed = paymentSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ message: "Ödeme bilgileri geçersiz", errors: formatZodError(parsed.error) }, { status: 400 });
    }

    const { patientId, method, amount, description, doctorId, posId, createdAt } = parsed.data;
    const posRequiredMethods = new Set(["KREDI_KARTI", "MAIL_ORDER"]);

    if (patientId && !doctorId) {
      return NextResponse.json({ message: "Hasta tahsilatı için doktor seçimi zorunlu" }, { status: 400 });
    }

    if (posRequiredMethods.has(method) && !posId) {
      return NextResponse.json({ message: "Kart / mail order tahsilatı için POS seçimi zorunlu" }, { status: 400 });
    }

    const institutionDoctors = auth.user.institutionId
      ? await prisma.user.findMany({
          where: effectiveDoctorWhere(auth.user.institutionId),
          select: { id: true },
        })
      : [];
    const doctorIds = institutionDoctors.map((user) => user.id);

    if (auth.user.institutionId && doctorId && !doctorIds.includes(doctorId)) {
      return NextResponse.json({ message: "Bu doktor kurum kapsamı disinda" }, { status: 403 });
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
        return NextResponse.json({ message: "Hasta kurum kapsamı disinda" }, { status: 403 });
      }
    }

    const { payment, taksitInfo } = await prisma.$transaction(
      (tx) =>
        createIntegratedPayment({
          tx,
          patientId,
          doctorId,
          method,
          amount,
          description,
          posId,
          createdAt,
        }),
      { isolationLevel: "Serializable" }
    );

    const auditNote = taksitInfo?.updatedCount
      ? `${amount} TL ödeme — ${taksitInfo.updatedCount} taksit otomatik güncellendi`
      : `${amount} TL ödeme eklendi`;
    await writeAudit(auth.user.id, "PAYMENT_CREATE", auditNote);
    return NextResponse.json({ ...payment, taksitInfo }, { status: 201 });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2034") {
      return NextResponse.json(
        { message: "Bu hasta için aynı anda başka bir ödeme işlendi. Lütfen tekrar deneyin." },
        { status: 409 }
      );
    }
    return NextResponse.json({ message: "Ödeme kaydedilemedi" }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("payments:read");
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get("patientId");
    const institutionUsers = auth.user.institutionId
      ? await prisma.user.findMany({
          where: { institutionId: auth.user.institutionId, isActive: true },
          select: { id: true },
        })
      : [];
    const userIds = institutionUsers.map((user) => user.id);
    const institutionFilter = auth.user.institutionId
      ? {
          OR: [
            { doctorId: { in: userIds } },
            { patient: { institutionId: auth.user.institutionId } },
          ],
        }
      : {};

    const payments = await prisma.payment.findMany({
      where: {
        ...(patientId ? { patientId } : {}),
        ...institutionFilter,
      },
      include: {
        patient: { select: { id: true, fullName: true } },
        doctor: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return NextResponse.json(payments);
  } catch (error) {
    console.error("[payments GET]", error);
    return NextResponse.json({ message: "Ödeme kayıtları yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
}
