import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_CONTENT, normalizeSiteContent } from "@/lib/site-content";

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const row = await prisma.siteContent.findUnique({ where: { id: 1 } });
  if (!row) {
    return NextResponse.json(DEFAULT_SITE_CONTENT);
  }

  return NextResponse.json(
    normalizeSiteContent({
      heroBadge: row.heroBadge,
      heroTitle: row.heroTitle,
      heroDescription: row.heroDescription,
      primaryCtaLabel: row.primaryCtaLabel,
      primaryCtaUrl: row.primaryCtaUrl,
      secondaryCtaLabel: row.secondaryCtaLabel,
      secondaryCtaUrl: row.secondaryCtaUrl,
      promoTitle: row.promoTitle,
      promoDescription: row.promoDescription,
      promoVideoUrl: row.promoVideoUrl || "",
      heroImageUrl: row.heroImageUrl || "",
      showAnimations: row.showAnimations,
      featureCards: row.featureCards as unknown as never,
      pricingCards: row.pricingCards as unknown as never,
      statsCards: row.statsCards as unknown as never,
      moduleCards: row.moduleCards as unknown as never,
      galleryImages: row.galleryImages as unknown as never,
    })
  );
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = (await request.json()) as Record<string, unknown>;
  const data = normalizeSiteContent(body);

  const saved = await prisma.siteContent.upsert({
    where: { id: 1 },
    update: {
      heroBadge: data.heroBadge,
      heroTitle: data.heroTitle,
      heroDescription: data.heroDescription,
      primaryCtaLabel: data.primaryCtaLabel,
      primaryCtaUrl: data.primaryCtaUrl,
      secondaryCtaLabel: data.secondaryCtaLabel,
      secondaryCtaUrl: data.secondaryCtaUrl,
      promoTitle: data.promoTitle,
      promoDescription: data.promoDescription,
      promoVideoUrl: data.promoVideoUrl || null,
      heroImageUrl: data.heroImageUrl || null,
      showAnimations: data.showAnimations,
      featureCards: data.featureCards as unknown as never,
      pricingCards: data.pricingCards as unknown as never,
      statsCards: data.statsCards as unknown as never,
      moduleCards: data.moduleCards as unknown as never,
      galleryImages: data.galleryImages as unknown as never,
    },
    create: {
      id: 1,
      heroBadge: data.heroBadge,
      heroTitle: data.heroTitle,
      heroDescription: data.heroDescription,
      primaryCtaLabel: data.primaryCtaLabel,
      primaryCtaUrl: data.primaryCtaUrl,
      secondaryCtaLabel: data.secondaryCtaLabel,
      secondaryCtaUrl: data.secondaryCtaUrl,
      promoTitle: data.promoTitle,
      promoDescription: data.promoDescription,
      promoVideoUrl: data.promoVideoUrl || null,
      heroImageUrl: data.heroImageUrl || null,
      showAnimations: data.showAnimations,
      featureCards: data.featureCards as unknown as never,
      pricingCards: data.pricingCards as unknown as never,
      statsCards: data.statsCards as unknown as never,
      moduleCards: data.moduleCards as unknown as never,
      galleryImages: data.galleryImages as unknown as never,
    },
  });

  await writeAudit(auth.user.id, "SUPERADMIN_SITE_CONTENT_UPDATE", `Tanıtım içerikleri güncellendi: ${data.heroTitle}`);
  return NextResponse.json({ ok: true, updatedAt: saved.updatedAt.toISOString() });
}
