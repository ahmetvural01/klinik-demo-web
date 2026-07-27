import { NextRequest, NextResponse } from "next/server";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { can } from "@/lib/rbac";
import { deleteIntegratedPayment, toPublicPayment, updateIntegratedPayment } from "@/lib/payment-ledger";
import { effectiveDoctorWhere, isDoctorPeriodSettled } from "@/lib/hakedis";

type Params = { params: Promise<{ id: string }> };

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
        { patientId: null, doctorId: { in: userIds } },
      ],
    },
    include,
  });
}

export async function DELETE(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;

  // "payments:refund" ayrı, yüksek riskli bir izin olarak UI'da gösteriliyor
  // ama daha önce hiçbir yerde kontrol edilmiyordu — bu yetkiyi kapatan bir
  // yönetici, silme/iade işleminin hâlâ payments:write ile mümkün kaldığını
  // fark etmezdi (bkz. denetim raporu).
  if (!auth.user.ghost && auth.user.role !== "SUPERADMIN" && !(await can(auth.user.role as import("@prisma/client").Role, "payments:refund"))) {
    return NextResponse.json({ message: "Bu işlem için yetkiniz yok (iade/silme yetkisi gerekli)." }, { status: 403 });
  }

  const existing = await findAccessiblePayment(params.id, auth);
  if (!existing) return NextResponse.json({ message: "Ödeme bulunamadı" }, { status: 404 });

  let periodLockOverridden = false;
  if (existing.doctorId) {
    const d = new Date(existing.createdAt);
    const settled = await isDoctorPeriodSettled(existing.doctorId, auth.user.institutionId, d.getUTCFullYear(), d.getUTCMonth() + 1);
    if (settled) {
      if (auth.user.role !== "SUPERADMIN") {
        return NextResponse.json(
          { message: "Bu ödemenin ait olduğu dönem için doktora zaten hakediş ödemesi yapılmış — bu kayıt silinemez." },
          { status: 400 },
        );
      }
      // SUPERADMIN dönem kilidini atlayabiliyor (destek/düzeltme amaçlı) ama
      // bu artık sessizce geçmiyor — denetim kaydına açıkça işaretleniyor
      // (bkz. denetim raporu).
      periodLockOverridden = true;
    }
  }

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
      periodLockOverridden ? "UYARI: Dönem kilidi SUPERADMIN tarafından atlandı." : "",
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

export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
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

  // Bu ödeme bir doktorun cirosuna/ödemesine sayılıyorsa ve o dönem için
  // zaten hakediş ödemesi yapılmışsa, tutar/tarih/doktor değişikliği o
  // dönemin hakedişini geriye dönük tutarsız hale getirir.
  let periodLockOverridden = false;
  if (existing.doctorId) {
    const touchesSettledFields = body.amount !== undefined || body.createdAt !== undefined || body.doctorId !== undefined;
    if (touchesSettledFields) {
      const d = new Date(existing.createdAt);
      const settled = await isDoctorPeriodSettled(existing.doctorId, auth.user.institutionId, d.getUTCFullYear(), d.getUTCMonth() + 1);
      if (settled) {
        if (auth.user.role !== "SUPERADMIN") {
          return NextResponse.json(
            { message: "Bu ödemenin ait olduğu dönem için doktora zaten hakediş ödemesi yapılmış — tutar, tarih veya doktor değiştirilemez." },
            { status: 400 },
          );
        }
        // bkz. yukarıdaki DELETE — SUPERADMIN geçebilir ama artık denetime yazılır.
        periodLockOverridden = true;
      }
    }
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

  // Önceki kontrol yalnızca ESKİ doktorun dönemine bakıyordu — ödeme başka
  // (zaten hakedişi ödenip kilitlenmiş) bir doktora aktarılırsa o doktorun
  // kilidi hiç kontrol edilmiyordu. Böylece kapanmış bir dönem, doktor
  // değişikliğiyle fark edilmeden yeniden açılıp bozulabiliyordu (bkz.
  // denetim raporu).
  if (finalDoctorId && finalDoctorId !== existing.doctorId && !body.force) {
    const effectiveDate = nextCreatedAt ? new Date(nextCreatedAt) : new Date(existing.createdAt);
    const newDoctorSettled = await isDoctorPeriodSettled(finalDoctorId, auth.user.institutionId, effectiveDate.getUTCFullYear(), effectiveDate.getUTCMonth() + 1);
    if (newDoctorSettled) {
      return NextResponse.json(
        { message: "Bu ödeme aktarılmak istenen doktorun ilgili dönemi için zaten hakediş ödemesi yapılmış — ödeme bu doktora taşınamaz." },
        { status: 400 },
      );
    }
  }
  if (posRequiredMethods.has(finalMethod) && !finalPosId) {
    return NextResponse.json({ message: "Kart / mail order tahsilatı için POS seçimi zorunlu" }, { status: 400 });
  }
  if (!posRequiredMethods.has(finalMethod) && finalPosId) {
    return NextResponse.json({ message: "POS yalnızca kredi kartı veya mail order tahsilatında seçilebilir" }, { status: 400 });
  }
  if (finalPosId) {
    const pos = await prisma.posDevice.findFirst({
      where: {
        id: finalPosId,
        isActive: true,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      select: { id: true },
    });
    if (!pos) {
      return NextResponse.json({ message: "Seçilen POS bu kuruma ait değil veya kullanım dışı" }, { status: 403 });
    }
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
    periodLockOverridden ? "UYARI: Dönem kilidi SUPERADMIN tarafından atlandı." : "",
  ].filter(Boolean).join("\n");

  await writeAudit(auth.user.id, "PAYMENT_UPDATE", detail);
  return NextResponse.json({ ...toPublicPayment(payment), taksitReverseInfo, taksitInfo });
}
