import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiTiming } from "@/lib/api";
import { firmaIslemCreateSchema, formatZodError } from "@/lib/validators";
import {
  applyFirmaIslemIntegration,
  buildFirmaIntegrationMessage,
  writeFirmaIntegrationAudit,
} from "@/lib/firma-integration";
import { rebuildFirmaPaymentAllocations } from "@/lib/firma-payment-allocation";

// GET: Firma ekstre (tum islemler + cari bakiye)
export const GET = withApiTiming("firma-islemler", async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
      const { requestKey: _requestKey, ...publicMovement } = i;
      return { ...publicMovement, cumBakiye: bakiye };
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
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let requestKey: string | null = null;
  let institutionId: string | null = null;
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    institutionId = auth.user.institutionId;
    requestKey = req.headers.get("Idempotency-Key")?.trim() || null;
    if (requestKey && (requestKey.length < 8 || requestKey.length > 180)) {
      return NextResponse.json({ error: "İşlem anahtarı geçersiz" }, { status: 400 });
    }

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

    if (islemTipi !== "ODEME") {
      return NextResponse.json(
        {
          error: islemTipi === "ALIM"
            ? "Malzeme alımları Satın Alma formundan kaydedilmelidir."
            : "Firma hizmet borçları ilgili işlem ekranından otomatik oluşturulur.",
        },
        { status: 400 },
      );
    }

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

    if (requestKey) {
      const existing = await (prisma as any).firmaIslem.findFirst({
        where: { firmaId: firma.id, requestKey },
      });
      if (existing) {
        const { requestKey: _requestKey, ...publicMovement } = existing;
        return NextResponse.json(
          { islem: publicMovement, message: "Bu ödeme daha önce kaydedilmişti.", duplicateRequest: true },
          { status: 200 },
        );
      }
    }

    const { islem, summary } = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT "id" FROM "Firma" WHERE "id" = ${firma.id} FOR UPDATE`;

      const balanceRows = await tx.firmaIslem.groupBy({
        by: ["islemTipi"],
        where: { firmaId: firma.id, status: "AKTIF" },
        _sum: { tutar: true },
      });
      const balance = Math.round(balanceRows.reduce((sum: number, row: any) => {
        const amount = Number(row._sum.tutar || 0);
        return sum + (row.islemTipi === "ODEME" ? -amount : amount);
      }, 0) * 100) / 100;
      if (tutar > balance) {
        throw new Error(
          `Ödeme tutarı firma bakiyesini aşamaz. Güncel kalan: ${balance.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL`,
        );
      }

      const transactionDate = new Date(tarih);
      const created = await tx.firmaIslem.create({
        data: {
          firmaId: params.id,
          requestKey,
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
      const allocation = await rebuildFirmaPaymentAllocations(tx, firma.id);
      if (allocation.allocatedTotal > 0) {
        integrationSummary.notes.push("ödeme açık firma borçlarına otomatik mahsup edildi");
      }

      return { islem: created, summary: integrationSummary };
    });

    await writeFirmaIntegrationAudit(auth.user.id, "FIRMA_ISLEM_CREATE", firma.name, islemTipi, tutar, summary);

    const { requestKey: _requestKey, ...publicMovement } = islem;
    return NextResponse.json({ islem: publicMovement, message: buildFirmaIntegrationMessage(summary), integration: summary }, { status: 201 });
  } catch (e) {
    if (
      requestKey
      && e
      && typeof e === "object"
      && "code" in e
      && (e as { code?: string }).code === "P2002"
    ) {
      const existing = await (prisma as any).firmaIslem.findFirst({
        where: {
          requestKey,
          firma: {
            ...(institutionId ? { institutionId } : {}),
          },
        },
      });
      if (existing) {
        const { requestKey: _requestKey, ...publicMovement } = existing;
        return NextResponse.json(
          { islem: publicMovement, message: "Bu ödeme daha önce kaydedilmişti.", duplicateRequest: true },
          { status: 200 },
        );
      }
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Firma ödemesi kaydedilemedi" },
      { status: 400 },
    );
  }
}
