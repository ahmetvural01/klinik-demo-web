import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// PATCH: Taksit öde (kısmi veya tam)
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string; tid: string }> }) {
  const params = await props.params;
  const requestKey = req.headers.get("Idempotency-Key")?.trim() || null;
  try {
    const auth = await requireAuth("installments:write");
    if (auth.error) return auth.error;
    const user = auth.user;
    if (!user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }

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
        where: { id: posId, institutionId: user.institutionId, isActive: true },
        select: { id: true },
      });
      if (!pos) return NextResponse.json({ error: "POS cihazı bulunamadı" }, { status: 404 });
    }

    if (requestKey) {
      const duplicate = await prisma.payment.findUnique({
        where: { requestKey },
        include: { taksitOdemeler: { select: { taksitId: true } } },
      });
      if (duplicate) {
        if (!duplicate.taksitOdemeler.some((item) => item.taksitId === params.tid)) {
          return NextResponse.json({ error: "İşlem anahtarı başka bir tahsilatta kullanılmış" }, { status: 409 });
        }
        const current = await (prisma as any).taksit.findUnique({
          where: { id: params.tid },
          include: { odemeler: { orderBy: { tarih: "asc" } } },
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
      await tx.$queryRaw`SELECT id FROM "Taksit" WHERE id = ${params.tid} FOR UPDATE`;
      const taksit = await tx.taksit.findUnique({
        where: { id: params.tid },
        include: { plan: { include: { patient: { select: { institutionId: true } } } } }
      });
      if (!taksit) throw new HttpError(404, "Taksit bulunamadı");
      if (taksit.planId !== params.id) throw new HttpError(404, "Taksit bulunamadı");
      if (taksit.plan.patient?.institutionId !== user.institutionId) {
        throw new HttpError(404, "Taksit bulunamadı");
      }
      if (taksit.plan.status === "IPTAL") {
        throw new HttpError(409, "İptal edilmiş plana tahsilat yapılamaz");
      }
      if (taksit.plan.status === "TAMAMLANDI") {
        throw new HttpError(409, "Tamamlanmış plana yeni tahsilat yapılamaz");
      }
      if (taksit.status === "ODENDI") {
        throw new HttpError(400, "Bu taksit zaten ödenmiş");
      }
      if (taksit.status === "IPTAL") {
        throw new HttpError(409, "İptal edilmiş taksite tahsilat yapılamaz");
      }
      if (posId) {
        const currentPos = await tx.posDevice.findFirst({
          where: { id: posId, institutionId: user.institutionId, isActive: true },
          select: { id: true },
        });
        if (!currentPos) throw new HttpError(409, "Seçilen POS artık kullanılamıyor");
      }

      const kalan = taksit.kalan as Prisma.Decimal;
      const tutarD = taksit.tutar as Prisma.Decimal;
      const odenenD = taksit.odenen as Prisma.Decimal;
      odemeAmtDecimal = new Prisma.Decimal(requestedAmount);
      if (odemeAmtDecimal.gt(kalan)) {
        throw new HttpError(400, `Ödeme tutarı kalan bakiyeden (${kalan.toString()} TL) büyük olamaz`);
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
      const linkedPayment = await tx.payment.create({
        data: {
          institutionId: taksit.plan.patient.institutionId || user.institutionId,
          patientId: taksit.plan.patientId,
          doctorId: taksit.plan.doctorId,
          requestKey,
          method: yontem,
          amount: odemeAmtDecimal,
          description: note || `Taksit tahsilatı (${taksit.siraNo}. taksit)`,
          posId: posId || null,
          status: "ACTIVE",
        },
      });

      await tx.taksitOdeme.create({
        data: {
          taksitId: params.tid,
          paymentId: linkedPayment.id,
          tarih: new Date(),
          tutar: odemeAmtDecimal,
          yontem,
          posId: posId || null,
        }
      });
      await tx.taksit.update({
        where: { id: params.tid },
        data: { odenen: yeniOdenen, kalan: yeniKalan, status: yeniStatus }
      });

      // Plan durumunu güncelle
      const taksitler = await tx.taksit.findMany({ where: { planId: taksit.planId } });
      const tumOdendi = taksitler.every((t: { id: string; status: string }) =>
        t.id === params.tid ? yeniStatus === "ODENDI" : t.status === "ODENDI" || t.status === "IPTAL"
      );
      const birOdendi = taksitler.some((t: { id: string; status: string; odenen: Prisma.Decimal }) =>
        t.id === params.tid ? yeniOdenen.gt(0) : t.status === "ODENDI" || new Prisma.Decimal(t.odenen).gt(0)
      );
      const planStatus = tumOdendi ? "TAMAMLANDI" : birOdendi ? "DEVAM_EDIYOR" : "AKTIF";

      await tx.taksitPlan.update({
        where: { id: taksit.planId },
        data: { status: planStatus }
      });

      return tx.taksit.findUnique({
        where: { id: params.tid },
        include: { odemeler: { orderBy: { tarih: "asc" } } }
      });
    }, { isolationLevel: "Serializable" });

    await writeAudit(auth.user.id, "TAKSIT_ODEME", `${odemeAmtDecimal.toString()} TL taksit ödemesi alındı (${params.tid})`);
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2034") {
      return NextResponse.json(
        { error: "Bu taksit aynı anda başka bir işlemle güncellendi. Lütfen tekrar deneyin." },
        { status: 409 }
      );
    }
    if (requestKey && e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      const duplicate = await prisma.payment.findUnique({
        where: { requestKey },
        include: { taksitOdemeler: { select: { taksitId: true } } },
      });
      if (duplicate?.taksitOdemeler.some((item) => item.taksitId === params.tid)) {
        const current = await (prisma as any).taksit.findUnique({
          where: { id: params.tid },
          include: { odemeler: { orderBy: { tarih: "asc" } } },
        });
        return NextResponse.json(current);
      }
      return NextResponse.json({ error: "İşlem anahtarı başka bir tahsilatta kullanılmış" }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
