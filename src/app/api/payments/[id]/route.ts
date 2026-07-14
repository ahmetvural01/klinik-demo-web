import { NextRequest, NextResponse } from "next/server";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { deleteIntegratedPayment, updateIntegratedPayment } from "@/lib/payment-ledger";
import { effectiveDoctorWhere } from "@/lib/hakedis";

type Params = { params: { id: string } };

const METHOD_LABELS: Record<string, string> = {
  NAKIT: "Nakit",
  KREDI_KARTI: "Kredi Kartı",
  HAVALE_EFT: "Havale/EFT",
  MAIL_ORDER: "Mail Order",
  DIGER: "Diğer",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

async function findAccessiblePayment(id: string, auth: { user: { role: string; institutionId: string | null } }) {
  const include = {
    patient: { select: { id: true, fullName: true } },
    doctor: { select: { id: true, fullName: true } },
  } as const;
  if (auth.user.role === "SUPERADMIN") {
    return prisma.payment.findUnique({ where: { id }, include });
  }
  if (!auth.user.institutionId) return null;

  const institutionUsers = await prisma.user.findMany({
    where: { institutionId: auth.user.institutionId, isActive: true },
    select: { id: true },
  });
  const userIds = institutionUsers.map((user) => user.id);

  return prisma.payment.findFirst({
    where: {
      id,
      OR: [
        { patient: { institutionId: auth.user.institutionId } },
        { doctorId: { in: userIds } },
      ],
    },
    include,
  });
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;

  const existing = await findAccessiblePayment(params.id, auth);
  if (!existing) return NextResponse.json({ message: "Ödeme bulunamadı" }, { status: 404 });

  try {
    const { taksitReverseInfo } = await prisma.$transaction(
      (tx) => deleteIntegratedPayment(tx, params.id),
      { isolationLevel: "Serializable" }
    );
    const detail = [
      `${auth.user.fullName || "Personel"} tarafından tahsilat silindi.`,
      `Hasta: ${existing.patient?.fullName || "Genel tahsilat"}`,
      `Doktor: ${existing.doctor?.fullName || "-"}`,
      `Tutar: ${Number(existing.amount)} TL`,
      `Yöntem: ${METHOD_LABELS[existing.method] || existing.method}`,
      existing.description ? `Açıklama: ${existing.description}` : "",
      taksitReverseInfo.updatedCount ? `Taksit entegrasyonu: ${taksitReverseInfo.updatedCount} taksit geri güncellendi` : "Taksit entegrasyonu: değişiklik yok",
    ].filter(Boolean).join("\n");
    await writeAudit(auth.user.id, "PAYMENT_DELETE", detail);

    return NextResponse.json({ ok: true, taksitReverseInfo });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2034") {
      return NextResponse.json(
        { message: "Bu ödeme aynı anda başka bir işlemle güncellendi. Lütfen tekrar deneyin." },
        { status: 409 }
      );
    }
    throw e;
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const existing = await findAccessiblePayment(params.id, auth);
  if (!existing) {
    return NextResponse.json({ message: "Ödeme bulunamadı" }, { status: 404 });
  }

  const nextAmount = body.amount !== undefined ? Number(body.amount) : undefined;
  if (nextAmount !== undefined && (!Number.isFinite(nextAmount) || nextAmount <= 0)) {
    return NextResponse.json({ message: "Geçerli ödeme tutarı girin" }, { status: 400 });
  }

  const validMethods = new Set(["NAKIT", "KREDI_KARTI", "HAVALE_EFT", "MAIL_ORDER", "DIGER"]);
  const posRequiredMethods = new Set(["KREDI_KARTI", "MAIL_ORDER"]);
  const nextMethod = body.method !== undefined ? String(body.method) : undefined;
  if (nextMethod !== undefined && !validMethods.has(nextMethod)) {
    return NextResponse.json({ message: "Geçersiz ödeme yöntemi" }, { status: 400 });
  }
  const nextCreatedAt = body.createdAt !== undefined ? String(body.createdAt) : undefined;
  if (nextCreatedAt !== undefined && Number.isNaN(new Date(nextCreatedAt).getTime())) {
    return NextResponse.json({ message: "Geçerli ödeme tarihi girin" }, { status: 400 });
  }

  const nextDoctorId = body.doctorId !== undefined ? (body.doctorId || null) : undefined;
  if (nextDoctorId && auth.user.institutionId) {
    const doctor = await prisma.user.findFirst({
      where: { id: nextDoctorId, ...effectiveDoctorWhere(auth.user.institutionId) },
      select: { id: true, fullName: true },
    });
    if (!doctor) {
      return NextResponse.json({ message: "Bu doktor kurum kapsamı dışında" }, { status: 403 });
    }
  }

  const finalMethod = nextMethod || existing.method;
  const finalPosId = body.posId !== undefined ? (body.posId || null) : existing.posId;
  const finalDoctorId = nextDoctorId !== undefined ? nextDoctorId : existing.doctorId;
  if (existing.patientId && !finalDoctorId) {
    return NextResponse.json({ message: "Hasta tahsilatı için doktor seçimi zorunlu" }, { status: 400 });
  }
  if (posRequiredMethods.has(finalMethod) && !finalPosId) {
    return NextResponse.json({ message: "Kart / mail order tahsilatı için POS seçimi zorunlu" }, { status: 400 });
  }

  let paymentResult;
  try {
    paymentResult = await prisma.$transaction(
      (tx) =>
        updateIntegratedPayment({
          tx,
          paymentId: params.id,
          amount: nextAmount,
          method: nextMethod as PaymentMethod | undefined,
          description: body.description !== undefined ? body.description || null : undefined,
          posId: body.posId !== undefined ? body.posId || null : undefined,
          createdAt: nextCreatedAt,
          doctorId: nextDoctorId,
        }),
      { isolationLevel: "Serializable" }
    );
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2034") {
      return NextResponse.json(
        { message: "Bu ödeme aynı anda başka bir işlemle güncellendi. Lütfen tekrar deneyin." },
        { status: 409 }
      );
    }
    throw e;
  }
  const { payment, taksitReverseInfo, taksitInfo } = paymentResult;
  const nextDoctorInfo = payment.doctorId
    ? await prisma.user.findUnique({ where: { id: payment.doctorId }, select: { fullName: true } })
    : null;

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

  pushDiff("Tutar", Number(existing.amount), Number(payment.amount));
  pushDiff("Yöntem", METHOD_LABELS[existing.method] || existing.method, METHOD_LABELS[payment.method] || payment.method);
  pushDiff("Açıklama", existing.description, payment.description);
  pushDiff("Tarih", existing.createdAt, payment.createdAt);
  pushDiff("Doktor", existing.doctor?.fullName || existing.doctorId, nextDoctorInfo?.fullName || payment.doctorId);

  const integrationText =
    taksitReverseInfo.updatedCount || taksitInfo?.updatedCount
      ? `Taksit entegrasyonu: ${taksitReverseInfo.updatedCount} geri alındı, ${taksitInfo?.updatedCount || 0} yeniden uygulandı.`
      : "Taksit entegrasyonu: değişiklik yok.";

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından ödeme kaydı güncellendi.`,
    `Hasta: ${existing.patient?.fullName || "Genel tahsilat"}`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
    integrationText,
  ].join("\n");

  await writeAudit(auth.user.id, "PAYMENT_UPDATE", detail);
  return NextResponse.json({ ...payment, taksitReverseInfo, taksitInfo });
}
