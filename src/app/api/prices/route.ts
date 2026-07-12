import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import {
  detectLatestPublishedTdbTariffYear,
  TDB_2026_CORE_PRICE_CATALOG,
  TDB_ACTIVE_CATALOG_YEAR,
  tdbOfficialTariffPdfUrl,
} from "@/lib/dental-treatment-catalog";

function priceKey(code: string, treatment: string) {
  return `${code.trim()}::${treatment.trim().toLocaleLowerCase("tr-TR")}`;
}

function catalogAsPriceItems(institutionId: string | null, isCustom = false) {
  return TDB_2026_CORE_PRICE_CATALOG.map((item) => ({
    id: isCustom ? `custom-template-${item.id}` : item.id,
    institutionId,
    code: item.code,
    treatment: item.treatment,
    amount: item.amount,
    isFavorite: false,
    isCustom,
    isTemplate: isCustom,
    catalogYear: TDB_ACTIVE_CATALOG_YEAR,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }));
}

function filterAndSort(items: any[], q: string) {
  const qNorm = q.trim().toLocaleLowerCase("tr-TR");
  return items
    .filter((item) => !qNorm || item.treatment.toLocaleLowerCase("tr-TR").includes(qNorm) || item.code.toLocaleLowerCase("tr-TR").includes(qNorm))
    .sort((a, b) => a.code.localeCompare(b.code, "tr", { numeric: true }) || a.treatment.localeCompare(b.treatment, "tr"));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("prices:read");
    if (auth.error) return auth.error;

    const q = request.nextUrl.searchParams.get("q") ?? "";
    const type = request.nextUrl.searchParams.get("type"); // "standard" | "custom" | null
    const meta = request.nextUrl.searchParams.get("meta");

    if (meta === "1") {
      const latestPublishedYear = await detectLatestPublishedTdbTariffYear();
      return NextResponse.json({
        activeCatalogYear: TDB_ACTIVE_CATALOG_YEAR,
        latestPublishedYear,
        updateAvailable: latestPublishedYear > TDB_ACTIVE_CATALOG_YEAR,
        officialPdfUrl: tdbOfficialTariffPdfUrl(latestPublishedYear),
      });
    }

    const isCustomFilter =
      type === "standard" ? false :
      type === "custom" ? true :
      undefined;

    const prices = await prisma.priceItem.findMany({
      where: {
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        ...(isCustomFilter !== undefined ? { isCustom: isCustomFilter } : {}),
        ...(q ? {
          OR: [
            { treatment: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } }
          ]
        } : {})
      },
      orderBy: [{ code: "asc" }, { treatment: "asc" }]
    });

    if (type === "standard") {
      const merged = new Map<string, any>();
      for (const item of catalogAsPriceItems(auth.user.institutionId || null)) {
        merged.set(priceKey(item.code, item.treatment), item);
      }
      for (const item of prices) {
        merged.set(priceKey(item.code, item.treatment), item);
      }
      return NextResponse.json(filterAndSort(Array.from(merged.values()), q));
    }

    if (type === "custom") {
      const merged = new Map<string, any>();
      for (const item of catalogAsPriceItems(auth.user.institutionId || null, true)) {
        merged.set(priceKey(item.code, item.treatment), item);
      }
      for (const item of prices) {
        merged.set(priceKey(item.code, item.treatment), { ...item, isTemplate: false, catalogYear: TDB_ACTIVE_CATALOG_YEAR });
      }
      return NextResponse.json(filterAndSort(Array.from(merged.values()), q));
    }

    return NextResponse.json(prices);
  } catch (error) {
    console.error("[prices GET] fallback:", error);
    return NextResponse.json({ message: "Fiyat listesi yüklenemedi." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth("prices:write");
    if (auth.error) return auth.error;

    const body = await request.json();
    const institutionId = auth.user.institutionId || null;
    const code = String(body.code || "").trim();
    const treatment = String(body.treatment || "").trim();
    const amount = Number(body.amount);
    if (!code || !treatment || !Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ message: "Geçerli kod, tedavi ve tutar zorunlu" }, { status: 400 });
    }

    const existing = await prisma.priceItem.findFirst({
      where: { institutionId, code, treatment },
    });

    const price = existing
      ? await prisma.priceItem.update({
          where: { id: existing.id },
          data: {
            amount,
            isFavorite: body.isFavorite !== undefined ? Boolean(body.isFavorite) : existing.isFavorite,
            isCustom: body.isCustom !== undefined ? Boolean(body.isCustom) : existing.isCustom,
          },
        })
      : await prisma.priceItem.create({
          data: {
            institutionId,
            code,
            treatment,
            amount,
            isFavorite: Boolean(body.isFavorite),
            isCustom: body.isCustom !== undefined ? Boolean(body.isCustom) : true
          }
        });

    await writeAudit(auth.user.id, "PRICE_CREATE", `${price.treatment} eklendi`);
    return NextResponse.json(price, { status: 201 });
  } catch {
    return NextResponse.json({ message: "Fiyat kaydı oluşturulamadı" }, { status: 503 });
  }
}
