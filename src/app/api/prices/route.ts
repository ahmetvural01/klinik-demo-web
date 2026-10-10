import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import {
  TDB_2026_CORE_PRICE_CATALOG,
  TDB_ACTIVE_CATALOG_YEAR,
  tdbOfficialTariffPdfUrl,
} from "@/lib/dental-treatment-catalog";
import { requirePriceRead } from "@/app/api/prices/price-access";

// TDB yeni yıl tarifesi kontrolü: tdb.org.tr olmayan dosya için de 200 + HTML
// döndürdüğü için önceden uyarı HER ZAMAN çıkıyor ve bağlantı var olmayan
// PDF'e gidiyordu; istek de her açılışta 3–11 sn bekletiyordu. Artık yalnız
// gerçekten PDF dönen yıl sayılır, sonuç 12 saat bellekte tutulur ve her
// istek en fazla 3 sn bekler.
const TDB_META_TTL_MS = 12 * 60 * 60 * 1000;
let tdbMetaCache: { year: number; at: number } | null = null;

async function isPublishedTariffPdf(year: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(tdbOfficialTariffPdfUrl(year), { method: "HEAD", cache: "no-store", redirect: "follow", signal: controller.signal });
    const type = response.headers.get("content-type") || "";
    return response.ok && type.toLowerCase().includes("application/pdf") && /\.pdf($|\?)/i.test(response.url || tdbOfficialTariffPdfUrl(year));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function latestPublishedTariffYear() {
  if (tdbMetaCache && Date.now() - tdbMetaCache.at < TDB_META_TTL_MS) return tdbMetaCache.year;
  const maxYear = Math.max(new Date().getFullYear() + 1, TDB_ACTIVE_CATALOG_YEAR);
  let year = TDB_ACTIVE_CATALOG_YEAR;
  for (let candidate = maxYear; candidate > TDB_ACTIVE_CATALOG_YEAR; candidate -= 1) {
    if (await isPublishedTariffPdf(candidate)) {
      year = candidate;
      break;
    }
  }
  tdbMetaCache = { year, at: Date.now() };
  return year;
}

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

type PriceListItem = { code: string; treatment: string } & Record<string, unknown>;

/** TDB tarifesi + kurumun "standart" kayıtları (kurum kaydı aynı kalemi ezer). */
function mergeStandardList(institutionId: string, prices: PriceListItem[], q: string) {
  const merged = new Map<string, PriceListItem>();
  for (const item of catalogAsPriceItems(institutionId)) merged.set(priceKey(item.code, item.treatment), item);
  for (const item of prices) merged.set(priceKey(item.code, item.treatment), item);
  return filterAndSort(Array.from(merged.values()), q);
}

/** Kliniğin kendi listesi: TDB şablon satırları + kurumun özel fiyatları. */
function mergeCustomList(institutionId: string, prices: PriceListItem[], q: string) {
  const merged = new Map<string, PriceListItem>();
  for (const item of catalogAsPriceItems(institutionId, true)) merged.set(priceKey(item.code, item.treatment), item);
  for (const item of prices) merged.set(priceKey(item.code, item.treatment), { ...item, isTemplate: false, catalogYear: TDB_ACTIVE_CATALOG_YEAR });
  return filterAndSort(Array.from(merged.values()), q);
}

function filterAndSort(items: any[], q: string) {
  const qNorm = q.trim().toLocaleLowerCase("tr-TR");
  return items
    .filter((item) => !qNorm || item.treatment.toLocaleLowerCase("tr-TR").includes(qNorm) || item.code.toLocaleLowerCase("tr-TR").includes(qNorm))
    .sort((a, b) => a.code.localeCompare(b.code, "tr", { numeric: true }) || a.treatment.localeCompare(b.treatment, "tr"));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePriceRead();
    if (auth.error) return auth.error;
    if (!auth.user.institutionId) {
      return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });
    }
    const institutionId = auth.user.institutionId;

    const q = request.nextUrl.searchParams.get("q") ?? "";
    const requestedType = request.nextUrl.searchParams.get("type"); // "standard" | "custom" | "active" | null
    const meta = request.nextUrl.searchParams.get("meta");

    // Fiyat listesi ekranı tek istekte iki listeyi ve kullanılan listeyi alır
    // (önceden type=standard, type=custom ve active-list ayrı ayrı isteniyordu).
    // Eski uçlar (type=..., /api/prices/active-list) aynen çalışır.
    if (request.nextUrl.searchParams.get("bundle") === "1") {
      const [allPrices, setting] = await Promise.all([
        prisma.priceItem.findMany({
          where: {
            institutionId,
            ...(q ? { OR: [{ treatment: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}),
          },
          orderBy: [{ code: "asc" }, { treatment: "asc" }],
        }),
        prisma.setting.findUnique({ where: { institutionId }, select: { activePriceList: true } }),
      ]);
      return NextResponse.json({
        standard: mergeStandardList(institutionId, allPrices.filter((item) => !item.isCustom), q),
        custom: mergeCustomList(institutionId, allPrices.filter((item) => item.isCustom), q),
        activePriceList: setting?.activePriceList || "standard",
      });
    }

    if (meta === "1") {
      const latestPublishedYear = await latestPublishedTariffYear();
      return NextResponse.json({
        activeCatalogYear: TDB_ACTIVE_CATALOG_YEAR,
        latestPublishedYear,
        updateAvailable: latestPublishedYear > TDB_ACTIVE_CATALOG_YEAR,
        officialPdfUrl: tdbOfficialTariffPdfUrl(latestPublishedYear),
      });
    }

    // "active": kurumun hasta dosyasında önerdiği liste (Fiyat listesi ekranındaki
    // ayar). Tedavi ekleyen ekranlar ayar ucuna (settings:read) ayrıca gitmeden
    // tek istekte doğru listeyi alır.
    const type = requestedType === "active"
      ? ((await prisma.setting.findUnique({ where: { institutionId }, select: { activePriceList: true } }))?.activePriceList === "custom" ? "custom" : "standard")
      : requestedType;

    const isCustomFilter =
      type === "standard" ? false :
      type === "custom" ? true :
      undefined;

    const prices = await prisma.priceItem.findMany({
      where: {
        institutionId,
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
      return NextResponse.json(mergeStandardList(institutionId, prices, q));
    }

    if (type === "custom") {
      return NextResponse.json(mergeCustomList(institutionId, prices, q));
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
    if (!auth.user.institutionId) {
      return NextResponse.json({ message: "Fiyat kaydı için kurum bağlamı zorunlu" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Geçersiz istek" }, { status: 400 });
    }
    const institutionId = auth.user.institutionId;
    const code = String(body.code || "").trim();
    const treatment = String(body.treatment || "").trim();
    const amount = Number(body.amount);
    if (!code || code.length > 50 || !treatment || treatment.length > 200 || !Number.isFinite(amount) || amount < 0 || amount > 99_999_999.99) {
      return NextResponse.json({ message: "Geçerli kod, tedavi ve tutar zorunlu" }, { status: 400 });
    }
    if (body.isFavorite !== undefined && typeof body.isFavorite !== "boolean") {
      return NextResponse.json({ message: "Favori bilgisi geçersiz" }, { status: 400 });
    }
    if (body.isCustom !== undefined && typeof body.isCustom !== "boolean") {
      return NextResponse.json({ message: "Fiyat türü bilgisi geçersiz" }, { status: 400 });
    }
    if (body.createOnly !== undefined && typeof body.createOnly !== "boolean") {
      return NextResponse.json({ message: "İstek bilgisi geçersiz" }, { status: 400 });
    }

    // "Yeni özel fiyat" (createOnly): aynı kod ya da aynı adlı tedavi varsa
    // mevcut ücretin üzerine sessizce yazılmaz ve ikinci bir aynı adlı kalem
    // açılmaz. Satır içi ücret düzeltmesi (createOnly olmadan) eskisi gibi
    // aynı kod + ad kaydını günceller.
    if (body.createOnly === true) {
      const normalize = (value: string) => value.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
      const codeKey = normalize(code);
      const nameKey = normalize(treatment);
      const sameRows = await prisma.priceItem.findMany({
        where: {
          institutionId,
          OR: [
            { code: { equals: code, mode: "insensitive" } },
            { treatment: { equals: treatment, mode: "insensitive" } },
          ],
        },
        select: { code: true, treatment: true },
        take: 5,
      });
      const catalogMatch = TDB_2026_CORE_PRICE_CATALOG.find((item) => normalize(item.code) === codeKey || normalize(item.treatment) === nameKey);
      const conflict = sameRows.find((row) => normalize(row.code) === codeKey || normalize(row.treatment) === nameKey) || catalogMatch;
      if (conflict) {
        const message = normalize(conflict.treatment) === nameKey
          ? `“${conflict.treatment}” listede zaten var (kod ${conflict.code}). Ücretini listedeki satırdan değiştirin.`
          : `${conflict.code} kodu “${conflict.treatment}” için kullanılıyor. Başka bir kod yazın ya da boş bırakın.`;
        return NextResponse.json({ message, conflict: { code: conflict.code, treatment: conflict.treatment } }, { status: 409 });
      }
    }

    const existing = await prisma.priceItem.findFirst({
      where: { institutionId, code, treatment },
    });

    const price = existing
      ? await prisma.priceItem.update({
          where: { id: existing.id },
          data: {
            amount,
            isFavorite: body.isFavorite ?? existing.isFavorite,
            isCustom: body.isCustom ?? existing.isCustom,
          },
        })
      : await prisma.priceItem.create({
          data: {
            institutionId,
            code,
            treatment,
            amount,
            isFavorite: body.isFavorite ?? false,
            isCustom: body.isCustom ?? true
          }
        });

    await writeAudit(auth.user.id, "PRICE_CREATE", `${price.treatment} eklendi`);
    return NextResponse.json(price, { status: 201 });
  } catch {
    return NextResponse.json({ message: "Fiyat kaydı oluşturulamadı" }, { status: 503 });
  }
}
