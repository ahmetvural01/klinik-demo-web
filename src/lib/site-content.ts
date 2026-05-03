import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_CONTENT, type SiteCard, type SiteContentPayload } from "@/lib/site-content-default";

export { DEFAULT_SITE_CONTENT };
export type { SiteCard, SiteContentPayload };

function asCards(input: unknown, fallback: SiteCard[]) {
  if (!Array.isArray(input)) return fallback;
  return input as SiteCard[];
}

function asStrings(input: unknown, fallback: string[]) {
  if (!Array.isArray(input)) return fallback;
  return input.filter((item): item is string => typeof item === "string");
}

export function normalizeSiteContent(input: Partial<SiteContentPayload> | null | undefined): SiteContentPayload {
  return {
    ...DEFAULT_SITE_CONTENT,
    ...(input || {}),
    featureCards: asCards(input?.featureCards, DEFAULT_SITE_CONTENT.featureCards),
    pricingCards: asCards(input?.pricingCards, DEFAULT_SITE_CONTENT.pricingCards),
    statsCards: asCards(input?.statsCards, DEFAULT_SITE_CONTENT.statsCards),
    moduleCards: asCards(input?.moduleCards, DEFAULT_SITE_CONTENT.moduleCards),
    galleryImages: asStrings(input?.galleryImages, []),
    promoVideoUrl: input?.promoVideoUrl || "",
    heroImageUrl: input?.heroImageUrl || "",
  };
}

export async function getSiteContent() {
  const row = await prisma.siteContent.findUnique({ where: { id: 1 } });
  if (!row) return DEFAULT_SITE_CONTENT;

  return normalizeSiteContent({
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
    featureCards: row.featureCards as SiteCard[],
    pricingCards: row.pricingCards as SiteCard[],
    statsCards: row.statsCards as SiteCard[],
    moduleCards: row.moduleCards as SiteCard[],
    galleryImages: row.galleryImages as string[],
  });
}
