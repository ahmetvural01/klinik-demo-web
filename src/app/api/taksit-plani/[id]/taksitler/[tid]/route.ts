import { NextRequest, NextResponse } from "next/server";
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
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; tid: string } }
) {
  try {
    const auth = await requireAuth("payments:write");
    if (auth.error) return auth.error;
    const user = auth.user;
    if (user.role !== "SUPERADMIN" && !user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }

    const body = await req.json();
    const { tutar, yontem = "NAKIT", posId, note } = body;

    if (!tutar || Number(tutar) <= 0) {
      return NextResponse.json({ error: "Geçersiz tutar" }, { status: 400 });
    }

    if (posId && user.role !== "SUPERADMIN") {
      const pos = await (prisma as any).posDevice.findFirst({
        where: { id: posId, institutionId: user.institutionId },
        select: { id: true },
      });
      if (!pos) return NextResponse.json({ error: "POS cihazı bulunamadı" }, { status: 404 });
    }

    // Okuma + hesaplama + yazma tek bir serializable transaction icinde:
    // iki personel ayni taksiti ayni anda oderse, Postgres ikinci islemi
    // "write conflict" ile reddeder (asagida P2034 olarak yakalaniyor) —
    // boylece "kayip guncelleme" (lost update) ile taksit bakiyesinin
    // yanlis hesaplanmasi engellenir.
    let odemeAmt = 0;
    const updated = await (prisma as any).$transaction(async (tx: any) => {
      const taksit = await tx.taksit.findUnique({
        where: { id: params.tid },
        include: { plan: { include: { patient: { select: { institutionId: true } } } } }
      });
      if (!taksit) throw new HttpError(404, "Taksit bulunamadı");
      if (taksit.planId !== params.id) throw new HttpError(404, "Taksit bulunamadı");
      if (user.role !== "SUPERADMIN" && taksit.plan.patient?.institutionId !== user.institutionId) {
        throw new HttpError(404, "Taksit bulunamadı");
      }
      if (taksit.status === "ODENDI") {
        throw new HttpError(400, "Bu taksit zaten ödenmiş");
      }

      odemeAmt = Math.min(Number(tutar), Number(taksit.kalan));
      const yeniOdenen = Number(taksit.odenen) + odemeAmt;
      const yeniKalan = Number(taksit.tutar) - yeniOdenen;
      const yeniStatus = yeniKalan <= 0.001 ? "ODENDI" : "BEKLIYOR";

      await tx.taksitOdeme.create({
        data: {
          taksitId: params.tid,
          tarih: new Date(),
          tutar: odemeAmt,
          yontem,
          posId: posId || null,
        }
      });
      await tx.taksit.update({
        where: { id: params.tid },
        data: { odenen: yeniOdenen, kalan: Math.max(0, yeniKalan), status: yeniStatus }
      });

      // Plan durumunu güncelle
      const taksitler = await tx.taksit.findMany({ where: { planId: taksit.planId } });
      const tumOdendi = taksitler.every((t: { id: string; status: string }) =>
        t.id === params.tid ? yeniStatus === "ODENDI" : t.status === "ODENDI" || t.status === "IPTAL"
      );
      const birOdendi = taksitler.some((t: { id: string; status: string }) =>
        t.id === params.tid ? yeniStatus === "ODENDI" : t.status === "ODENDI"
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

    await writeAudit(auth.user.id, "TAKSIT_ODEME", `${odemeAmt} TL taksit ödemesi alındı (${params.tid})`);
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
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
