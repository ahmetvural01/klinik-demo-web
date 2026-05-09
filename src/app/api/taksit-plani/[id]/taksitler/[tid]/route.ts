import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

// PATCH: Taksit öde (kısmi veya tam)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; tid: string } }
) {
  try {
    const auth = await requireAuth("payments:write");
    if (auth.error) return auth.error;

    const body = await req.json();
    const { tutar, yontem = "NAKIT", posId, note } = body;

    if (!tutar || Number(tutar) <= 0) {
      return NextResponse.json({ error: "Geçersiz tutar" }, { status: 400 });
    }

    const taksit = await (prisma as any).taksit.findUnique({
      where: { id: params.tid },
      include: { plan: true }
    });
    if (!taksit) return NextResponse.json({ error: "Taksit bulunamadı" }, { status: 404 });
    if (taksit.status === "ODENDI") {
      return NextResponse.json({ error: "Bu taksit zaten ödenmiş" }, { status: 400 });
    }

    const odemeAmt = Math.min(Number(tutar), Number(taksit.kalan));
    const yeniOdenen = Number(taksit.odenen) + odemeAmt;
    const yeniKalan = Number(taksit.tutar) - yeniOdenen;
    const yeniStatus = yeniKalan <= 0.001 ? "ODENDI" : "BEKLIYOR";

    // Ödeme kaydı ekle + taksit güncelle
    await (prisma as any).$transaction([
      (prisma as any).taksitOdeme.create({
        data: {
          taksitId: params.tid,
          tarih: new Date(),
          tutar: odemeAmt,
          yontem,
          posId: posId || null,
        }
      }),
      (prisma as any).taksit.update({
        where: { id: params.tid },
        data: { odenen: yeniOdenen, kalan: Math.max(0, yeniKalan), status: yeniStatus }
      })
    ]);

    // Plan durumunu güncelle
    const taksitler = await (prisma as any).taksit.findMany({
      where: { planId: taksit.planId }
    });
    const tumOdendi = taksitler.every((t: { id: string; status: string }) =>
      t.id === params.tid ? yeniStatus === "ODENDI" : t.status === "ODENDI" || t.status === "IPTAL"
    );
    const birOdendi = taksitler.some((t: { id: string; status: string }) =>
      t.id === params.tid ? yeniStatus === "ODENDI" : t.status === "ODENDI"
    );
    const planStatus = tumOdendi ? "TAMAMLANDI" : birOdendi ? "DEVAM_EDIYOR" : "AKTIF";

    await (prisma as any).taksitPlan.update({
      where: { id: taksit.planId },
      data: { status: planStatus }
    });

    const updated = await (prisma as any).taksit.findUnique({
      where: { id: params.tid },
      include: { odemeler: { orderBy: { tarih: "asc" } } }
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
