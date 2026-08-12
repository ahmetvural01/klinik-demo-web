import { NextRequest, NextResponse } from "next/server";
import { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { createIntegratedPayment } from "@/lib/payment-ledger";
import { BusinessRuleError } from "@/lib/public-error";

// PATCH: Taksit öde (kısmi veya tam)
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string; tid: string }> }) {
  const params = await props.params;
  const requestKey = req.headers.get("Idempotency-Key")?.trim() || null;
  let institutionId: string | null = null;
  let activeBranchId: string | null = null;
  try {
    const auth = await requireAuth("installments:write");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });
    const user = auth.user;
    if (!user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }
    institutionId = user.institutionId;
    activeBranchId = branch.branchId;

    if (requestKey && (requestKey.length < 8 || requestKey.length > 180)) {
      return NextResponse.json({ error: "İşlem anahtarı geçersiz" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
    }
    const { tutar, yontem = "NAKIT", posId, note } = body;

    const requestedAmount = Number(tutar);
    const validMethods = new Set(["NAKIT", "KREDI_KARTI", "HAVALE_EFT", "MAIL_ORDER", "DIGER"]);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || requestedAmount > 99_999_999.99) {
      return NextResponse.json({ error: "Geçersiz tutar" }, { status: 400 });
    }
    if (typeof yontem !== "string" || !validMethods.has(yontem)) {
      return NextResponse.json({ error: "Geçersiz ödeme yöntemi" }, { status: 400 });
    }
    if (posId !== undefined && posId !== null && typeof posId !== "string") {
      return NextResponse.json({ error: "Geçersiz POS cihazı" }, { status: 400 });
    }
    if (note !== undefined && note !== null && (typeof note !== "string" || note.length > 500)) {
      return NextResponse.json({ error: "Not geçersiz" }, { status: 400 });
    }
    const posRequired = yontem === "KREDI_KARTI" || yontem === "MAIL_ORDER";
    if (posRequired && !posId) {
      return NextResponse.json({ error: "Kart / mail order tahsilatı için POS seçimi zorunlu" }, { status: 400 });
    }
    if (!posRequired && posId) {
      return NextResponse.json({ error: "POS yalnızca kredi kartı veya mail order tahsilatında seçilebilir" }, { status: 400 });
    }

    if (posId) {
      const pos = await (prisma as any).posDevice.findFirst({
        where: { id: posId, institutionId: user.institutionId, branchId: branch.branchId, isActive: true },
        select: { id: true },
      });
      if (!pos) return NextResponse.json({ error: "POS cihazı bulunamadı" }, { status: 404 });
    }

    if (requestKey) {
      const duplicate = await prisma.payment.findFirst({
        where: { requestKey, institutionId: user.institutionId, branchId: branch.branchId },
        include: { taksitOdemeler: { where: { status: "ACTIVE" }, select: { taksitId: true } } },
      });
      if (duplicate) {
        if (!duplicate.taksitOdemeler.some((item) => item.taksitId === params.tid)) {
          return NextResponse.json({ error: "İşlem anahtarı başka bir tahsilatta kullanılmış" }, { status: 409 });
        }
        const current = await (prisma as any).taksit.findUnique({
          where: {
            id_institutionId_branchId: {
              id: params.tid,
              institutionId: user.institutionId,
              branchId: branch.branchId,
            },
          },
          include: { odemeler: { where: { status: "ACTIVE" }, orderBy: { tarih: "asc" } } },
        });
        return NextResponse.json(current);
      }
    }

    // Okuma + hesaplama + yazma tek bir serializable transaction icinde:
    // iki personel ayni taksiti ayni anda oderse, Postgres ikinci islemi
    // "write conflict" ile reddeder (asagida P2034 olarak yakalaniyor) —
    // boylece "kayip guncelleme" (lost update) ile taksit bakiyesinin
    // yanlis hesaplanmasi engellenir.
    // Taksit tutarları DB'de Decimal — burada da Number'a çevirip float
    // aritmetiğiyle işlemek yerine Decimal ile hesaplanır (bkz. denetim
    // raporu, CLAUDE.md Decimal kuralı).
    let odemeAmtDecimal = new Prisma.Decimal(0);
    const updated = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT id FROM "Taksit" WHERE id = ${params.tid} AND "institutionId" = ${user.institutionId} AND "branchId" = ${branch.branchId} FOR UPDATE`;
      const taksit = await tx.taksit.findUnique({
        where: {
          id_institutionId_branchId: {
            id: params.tid,
            institutionId: user.institutionId,
            branchId: branch.branchId,
          },
        },
          include: { plan: { include: { patient: { select: { institutionId: true } } } } }
      });
      if (!taksit) throw new BusinessRuleError("Taksit bulunamadı", 404);
      if (taksit.planId !== params.id) throw new BusinessRuleError("Taksit bulunamadı", 404);
      if (taksit.plan.branchId !== branch.branchId || taksit.plan.institutionId !== user.institutionId) {
        throw new BusinessRuleError("Taksit bulunamadı", 404);
      }
      if (taksit.plan.patient?.institutionId !== user.institutionId) {
        throw new BusinessRuleError("Taksit bulunamadı", 404);
      }
      if (taksit.plan.status === "IPTAL") {
        throw new BusinessRuleError("İptal edilmiş plana tahsilat yapılamaz", 409);
      }
      if (taksit.plan.status === "TAMAMLANDI") {
        throw new BusinessRuleError("Tamamlanmış plana yeni tahsilat yapılamaz", 409);
      }
      if (taksit.status === "ODENDI") {
        throw new BusinessRuleError("Bu taksit zaten ödenmiş", 400);
      }
      if (taksit.status === "IPTAL") {
        throw new BusinessRuleError("İptal edilmiş taksite tahsilat yapılamaz", 409);
      }
      if (posId) {
        const currentPos = await tx.posDevice.findFirst({
          where: { id: posId, institutionId: user.institutionId, branchId: branch.branchId, isActive: true },
          select: { id: true },
        });
        if (!currentPos) throw new BusinessRuleError("Seçilen POS artık kullanılamıyor", 409);
      }

      const kalan = taksit.kalan as Prisma.Decimal;
      const tutarD = taksit.tutar as Prisma.Decimal;
      const odenenD = taksit.odenen as Prisma.Decimal;
      odemeAmtDecimal = new Prisma.Decimal(requestedAmount);
      if (odemeAmtDecimal.gt(kalan)) {
        throw new BusinessRuleError(`Ödeme tutarı kalan bakiyeden (${kalan.toString()} TL) büyük olamaz`, 400);
      }
      const yeniOdenen = odenenD.plus(odemeAmtDecimal);
      const yeniKalan = Prisma.Decimal.max(new Prisma.Decimal(0), tutarD.minus(yeniOdenen));
      const yeniStatus = yeniKalan.isZero() ? "ODENDI" : "BEKLIYOR";

      // Bu uç "hızlı tahsilat" için Payment kaydı hiç oluşturmuyordu —
      // Muhasebe Defteri, /api/reports (kasa dağılımı) ve doktor hakediş
      // "tahsil edilen" hesabı SADECE Payment tablosunu okuduğu için, bu
      // yoldan alınan taksit tahsilatı gün sonu mutabakatta ve raporlarda
      // sessizce kayboluyordu (bkz. denetim raporu — kritik veri
      // tutarlılığı sorunu). /api/payments ile AYNI iz bırakması için
      // burada da bir Payment kaydı oluşturulup TaksitOdeme'ye bağlanıyor.
      const { payment: linkedPayment } = await createIntegratedPayment({
          tx,
          institutionId: taksit.plan.patient.institutionId || user.institutionId,
          branchId: branch.branchId,
          patientId: taksit.plan.patientId,
          doctorId: taksit.plan.doctorId,
          requestKey,
          method: yontem as PaymentMethod,
          amount: odemeAmtDecimal.toNumber(),
          description: note || `Taksit tahsilatı (${taksit.siraNo}. taksit)`,
          posId: posId || null,
          integrateInstallments: false,
      });

      await tx.taksitOdeme.create({
        data: {
          institutionId: taksit.plan.patient.institutionId || user.institutionId,
          branchId: branch.branchId,
          taksitId: params.tid,
          paymentId: linkedPayment.id,
          tarih: new Date(),
          tutar: odemeAmtDecimal,
          yontem,
          posId: posId || null,
        }
      });
      await tx.taksit.update({
        where: {
          id_institutionId_branchId: {
            id: params.tid,
            institutionId: user.institutionId,
            branchId: branch.branchId,
          },
        },
        data: { odenen: yeniOdenen, kalan: yeniKalan, status: yeniStatus }
      });

      // Plan durumunu güncelle
      const taksitler = await tx.taksit.findMany({
        where: {
          planId: taksit.planId,
          institutionId: user.institutionId,
          branchId: branch.branchId,
        },
      });
      const tumOdendi = taksitler.every((t: { id: string; status: string }) =>
        t.id === params.tid ? yeniStatus === "ODENDI" : t.status === "ODENDI" || t.status === "IPTAL"
      );
      const birOdendi = taksitler.some((t: { id: string; status: string; odenen: Prisma.Decimal }) =>
        t.id === params.tid ? yeniOdenen.gt(0) : t.status === "ODENDI" || new Prisma.Decimal(t.odenen).gt(0)
      );
      const planStatus = tumOdendi ? "TAMAMLANDI" : birOdendi ? "DEVAM_EDIYOR" : "AKTIF";

      await tx.taksitPlan.update({
        where: {
          id_institutionId_branchId: {
            id: taksit.planId,
            institutionId: user.institutionId,
            branchId: branch.branchId,
          },
        },
        data: { status: planStatus }
      });

      return tx.taksit.findUnique({
        where: {
          id_institutionId_branchId: {
            id: params.tid,
            institutionId: user.institutionId,
            branchId: branch.branchId,
          },
        },
        include: { odemeler: { where: { status: "ACTIVE" }, orderBy: { tarih: "asc" } } }
      });
    }, { isolationLevel: "Serializable" });

    await writeAudit(auth.user.id, "TAKSIT_ODEME", `${odemeAmtDecimal.toString()} TL taksit ödemesi alındı (${params.tid})`);
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof BusinessRuleError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2034") {
      return NextResponse.json(
        { error: "Bu taksit aynı anda başka bir işlemle güncellendi. Lütfen tekrar deneyin." },
        { status: 409 }
      );
    }
    if (requestKey && institutionId && activeBranchId && e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      const duplicate = await prisma.payment.findFirst({
        where: { requestKey, institutionId, branchId: activeBranchId },
        include: { taksitOdemeler: { where: { status: "ACTIVE" }, select: { taksitId: true } } },
      });
      if (duplicate?.taksitOdemeler.some((item) => item.taksitId === params.tid)) {
        const current = await (prisma as any).taksit.findUnique({
          where: {
            id_institutionId_branchId: {
              id: params.tid,
              institutionId,
              branchId: activeBranchId,
            },
          },
          include: { odemeler: { where: { status: "ACTIVE" }, orderBy: { tarih: "asc" } } },
        });
        return NextResponse.json(current);
      }
      return NextResponse.json({ error: "İşlem anahtarı başka bir tahsilatta kullanılmış" }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
