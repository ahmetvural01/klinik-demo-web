import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import {
  applyFirmaIslemIntegration,
  buildFirmaIntegrationMessage,
  writeFirmaIntegrationAudit,
} from "@/lib/firma-integration";

// GET: Firma ekstre (tum islemler + cari bakiye)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;

    const firma = await (prisma as any).firma.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      select: { id: true },
    });
    if (!firma) return NextResponse.json({ error: "Firma bulunamadı" }, { status: 404 });

    const islemler = await (prisma as any).firmaIslem.findMany({
      where: { firmaId: params.id, status: "AKTIF" },
      orderBy: { tarih: "asc" }
    });

    let bakiye = 0;
    const withBakiye = islemler.map((i: {
      islemTipi: string; tutar: unknown;
      [key: string]: unknown;
    }) => {
      const tutar = Number(i.tutar);
      if (i.islemTipi === "ALIM" || i.islemTipi === "HIZMET") bakiye += tutar;
      else if (i.islemTipi === "ODEME") bakiye -= tutar;
      return { ...i, cumBakiye: bakiye };
    });

    const topBorc = islemler
      .filter((i: { islemTipi: string }) => i.islemTipi !== "ODEME")
      .reduce((s: number, i: { tutar: unknown }) => s + Number(i.tutar), 0);
    const topOdeme = islemler
      .filter((i: { islemTipi: string }) => i.islemTipi === "ODEME")
      .reduce((s: number, i: { tutar: unknown }) => s + Number(i.tutar), 0);

    return NextResponse.json({ islemler: withBakiye, topBorc, topOdeme, netBakiye: topBorc - topOdeme });
  } catch (e) {
    return NextResponse.json({ islemler: [], topBorc: 0, topOdeme: 0, netBakiye: 0 }, { status: 200 });
  }
}

// POST: Yeni islem ekle
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;

    const body = await req.json();
    const {
      tarih,
      islemTipi,
      urunHizmet,
      aciklama,
      tutar,
      faturaNo,
      yontem,
      kdvOrani = 0,
      stockItemId,
      stockQuantity,
    } = body;

    if (!tarih || !islemTipi || !tutar) {
      return NextResponse.json({ error: "Tarih, islem tipi ve tutar zorunlu" }, { status: 400 });
    }

    if (islemTipi === "ODEME" && !yontem) {
      return NextResponse.json({ error: "Ödeme işlemlerinde yöntem zorunlu" }, { status: 400 });
    }

    const firma = await (prisma as any).firma.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      select: { id: true, name: true, institutionId: true },
    });

    if (!firma) {
      return NextResponse.json({ error: "Firma bulunamadı" }, { status: 404 });
    }

    const { islem, summary } = await (prisma as any).$transaction(async (tx: any) => {
      const created = await tx.firmaIslem.create({
        data: {
          firmaId: params.id,
          tarih: new Date(tarih),
          islemTipi,
          urunHizmet: urunHizmet || null,
          aciklama: aciklama || null,
          tutar: Number(tutar),
          faturaNo: faturaNo || null,
          yontem: yontem || null,
          kdvOrani: Number(kdvOrani),
          status: "AKTIF"
        }
      });

      const integrationSummary = await applyFirmaIslemIntegration({
        tx,
        userId: auth.user.id,
        firma,
        islem: {
          ...created,
          tutar: Number(created.tutar),
          kdvOrani: Number(created.kdvOrani),
        },
        stockItemId: stockItemId || null,
        stockQuantity: stockQuantity ? Number(stockQuantity) : null,
      });

      return { islem: created, summary: integrationSummary };
    });

    await writeFirmaIntegrationAudit(auth.user.id, "FIRMA_ISLEM_CREATE", firma.name, islemTipi, Number(tutar), summary);

    return NextResponse.json({ islem, message: buildFirmaIntegrationMessage(summary), integration: summary }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Islem eklenemedi" }, { status: 503 });
  }
}
