import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiTiming } from "@/lib/api";
import { firmaIslemCreateSchema, formatZodError } from "@/lib/validators";
import {
  applyFirmaIslemIntegration,
  buildFirmaIntegrationMessage,
  writeFirmaIntegrationAudit,
} from "@/lib/firma-integration";

// GET: Firma ekstre (tum islemler + cari bakiye)
export const GET = withApiTiming("firma-islemler", async function GET(req: NextRequest, { params }: { params: { id: string } }) {
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

    const [islemler, sumsRaw] = await Promise.all([
      (prisma as any).firmaIslem.findMany({
        where: { firmaId: params.id, status: "AKTIF" },
        orderBy: { tarih: "asc" },
        take: 20000, // güvenlik sınırı: tek bir cari hesap tüm sorguyu tıkamasın
      }),
      // topBorc/topOdeme/netBakiye artık yukarıdaki listeden bağımsız, DB'de
      // tüm geçmiş üzerinden doğru hesaplanıyor (liste sınırlansa da bakiye doğru kalır).
      (prisma as any).firmaIslem.groupBy({
        by: ["islemTipi"],
        where: { firmaId: params.id, status: "AKTIF" },
        _sum: { tutar: true },
      }),
    ]);

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

    let topBorc = 0;
    let topOdeme = 0;
    for (const row of sumsRaw) {
      const amount = Number(row._sum.tutar ?? 0);
      if (row.islemTipi === "ODEME") topOdeme += amount;
      else topBorc += amount;
    }

    return NextResponse.json({ islemler: withBakiye, topBorc, topOdeme, netBakiye: topBorc - topOdeme });
  } catch (e) {
    console.error("[firma islemler GET]", e);
    return NextResponse.json({ message: "Firma ekstresi yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
});

// POST: Yeni islem ekle
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;

    const parsed = firmaIslemCreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Cari işlem bilgileri geçersiz", errors: formatZodError(parsed.error) }, { status: 400 });
    }
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
    } = parsed.data;

    const firma = await (prisma as any).firma.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      select: { id: true, name: true, institutionId: true, paymentTerms: true, customPaymentDays: true },
    });

    if (!firma) {
      return NextResponse.json({ error: "Firma bulunamadı" }, { status: 404 });
    }

    const { islem, summary } = await (prisma as any).$transaction(async (tx: any) => {
      const transactionDate = new Date(tarih);
      const created = await tx.firmaIslem.create({
        data: {
          firmaId: params.id,
          tarih: transactionDate,
          islemTipi,
          urunHizmet: urunHizmet || null,
          aciklama: aciklama || null,
          tutar,
          faturaNo: faturaNo || null,
          yontem: yontem || null,
          dueDate: null,
          kdvOrani,
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
        stockQuantity,
      });

      return { islem: created, summary: integrationSummary };
    });

    await writeFirmaIntegrationAudit(auth.user.id, "FIRMA_ISLEM_CREATE", firma.name, islemTipi, tutar, summary);

    return NextResponse.json({ islem, message: buildFirmaIntegrationMessage(summary), integration: summary }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Islem eklenemedi" }, { status: 503 });
  }
}
