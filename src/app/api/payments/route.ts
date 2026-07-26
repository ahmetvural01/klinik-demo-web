import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiTiming, writeAudit } from "@/lib/api";
import { createIntegratedPayment, toPublicPayment } from "@/lib/payment-ledger";
import { formatZodError, paymentSchema } from "@/lib/validators";
import { effectiveDoctorWhere } from "@/lib/hakedis";

const METHOD_LABELS: Record<string, string> = {
  NAKIT: "Nakit",
  KREDI_KARTI: "Kredi Kartı",
  HAVALE_EFT: "Havale/EFT",
  MAIL_ORDER: "Mail Order",
  DIGER: "Diğer",
};

export async function POST(request: NextRequest) {
  const requestKey = request.headers.get("idempotency-key")?.trim() || null;
  let institutionId: string | null | undefined;
  try {
    const auth = await requireAuth("payments:write");
    if (auth.error) return auth.error;
    institutionId = auth.user.institutionId;

    const parsed = paymentSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ message: "Ödeme bilgileri geçersiz", errors: formatZodError(parsed.error) }, { status: 400 });
    }

    const { patientId, method, amount, description, doctorId, posId, createdAt } = parsed.data;
    const posRequiredMethods = new Set(["KREDI_KARTI", "MAIL_ORDER"]);

    if (!patientId) {
      return NextResponse.json({ message: "Tahsilat için hasta seçimi zorunlu" }, { status: 400 });
    }

    if (!doctorId) {
      return NextResponse.json({ message: "Hasta tahsilatı için doktor seçimi zorunlu" }, { status: 400 });
    }

    if (requestKey && (requestKey.length < 8 || requestKey.length > 100)) {
      return NextResponse.json({ message: "İşlem anahtarı geçersiz" }, { status: 400 });
    }

    if (posRequiredMethods.has(method) && !posId) {
      return NextResponse.json({ message: "Kart / mail order tahsilatı için POS seçimi zorunlu" }, { status: 400 });
    }
    if (!posRequiredMethods.has(method) && posId) {
      return NextResponse.json({ message: "POS yalnızca kredi kartı veya mail order tahsilatında seçilebilir" }, { status: 400 });
    }

    const institutionDoctors = auth.user.institutionId
      ? await prisma.user.findMany({
          where: effectiveDoctorWhere(auth.user.institutionId),
          select: { id: true },
        })
      : [];
    const doctorIds = institutionDoctors.map((user) => user.id);

    if (auth.user.institutionId && doctorId && !doctorIds.includes(doctorId)) {
      return NextResponse.json({ message: "Seçilen doktor bu kuruma bağlı değil." }, { status: 403 });
    }

    let relatedPatient: { id: string; fullName: string } | null = null;
    if (auth.user.institutionId && patientId) {
      relatedPatient = await prisma.patient.findFirst({
        where: {
          id: patientId,
          institutionId: auth.user.institutionId,
        },
        select: { id: true, fullName: true },
      });

      if (!relatedPatient) {
        return NextResponse.json({ message: "Seçilen hasta bu kuruma bağlı değil." }, { status: 403 });
      }
    }

    const [doctorInfo, posInfo] = await Promise.all([
      doctorId ? prisma.user.findUnique({ where: { id: doctorId }, select: { fullName: true } }) : Promise.resolve(null),
      posId
        ? prisma.posDevice.findFirst({
            where: {
              id: posId,
              isActive: true,
              ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
            },
            select: { name: true },
          })
        : Promise.resolve(null),
    ]);
    if (posId && !posInfo) {
      return NextResponse.json({ message: "Seçilen POS bu kuruma ait değil veya kullanım dışı" }, { status: 403 });
    }

    if (requestKey) {
      const existingPayment = await prisma.payment.findUnique({
        where: { requestKey },
        include: { patient: { select: { institutionId: true } } },
      });
      if (existingPayment) {
        if (auth.user.institutionId && existingPayment.patient?.institutionId !== auth.user.institutionId) {
          return NextResponse.json({ message: "İşlem anahtarı başka bir kayıtta kullanılmış" }, { status: 409 });
        }
        return NextResponse.json({ ...toPublicPayment(existingPayment), duplicatePrevented: true }, { status: 200 });
      }
    }

    const { payment, taksitInfo } = await prisma.$transaction(
      (tx) =>
        createIntegratedPayment({
          tx,
          requestKey,
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

    const auditNote = [
      `${auth.user.fullName || "Personel"} tarafından tahsilat kaydedildi.`,
      `Hasta: ${relatedPatient?.fullName || payment.patient?.fullName || "Genel tahsilat"}`,
      `Doktor: ${doctorInfo?.fullName || "-"}`,
      `Tutar: ${amount} TL`,
      `Yöntem: ${METHOD_LABELS[method] || method}`,
      `POS: ${posInfo?.name || "-"}`,
      description ? `Açıklama: ${description}` : "",
      taksitInfo?.updatedCount ? `Taksit entegrasyonu: ${taksitInfo.updatedCount} taksit otomatik güncellendi` : "Taksit entegrasyonu: değişiklik yok",
    ].filter(Boolean).join("\n");
    await writeAudit(auth.user.id, "PAYMENT_CREATE", auditNote);
    return NextResponse.json({ ...toPublicPayment(payment), taksitInfo }, { status: 201 });
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      if (requestKey) {
        const existingPayment = await prisma.payment.findUnique({
          where: { requestKey },
          include: {
            patient: { select: { institutionId: true } },
          },
        });
        if (
          existingPayment &&
          (!institutionId || existingPayment.patient?.institutionId === institutionId)
        ) {
          return NextResponse.json({ ...toPublicPayment(existingPayment), duplicatePrevented: true }, { status: 200 });
        }
      }
      return NextResponse.json(
        { message: "Bu tahsilat zaten kaydedildi. Liste güncelleniyor.", duplicatePrevented: true },
        { status: 409 }
      );
    }
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2034") {
      return NextResponse.json(
        { message: "Bu hasta için aynı anda başka bir ödeme işlendi. Lütfen tekrar deneyin." },
        { status: 409 }
      );
    }
    return NextResponse.json({ message: "Ödeme kaydedilemedi" }, { status: 503 });
  }
}

export const GET = withApiTiming("payments", async function GET(request: NextRequest) {
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
            { patient: { institutionId: auth.user.institutionId } },
            // Eski doktor hakedişi kayıtlarında hasta bulunmaz. Hasta bağlı bir
            // tahsilat yalnızca hastanın kurumu üzerinden görünür olmalıdır.
            { patientId: null, doctorId: { in: userIds } },
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

    return NextResponse.json(payments.map(toPublicPayment));
  } catch (error) {
    console.error("[payments GET]", error);
    return NextResponse.json({ message: "Ödeme kayıtları yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
});
