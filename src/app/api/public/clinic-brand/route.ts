import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";

/**
 * Giriş ekranında bu cihazda hatırlanan kliniğin adı ve logosu (oturumsuz).
 * Yalnız klinikte zaten herkese açık olan görünen ad ve logo döner.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIpFromHeaders(request.headers);
  const rate = await checkRateLimit(`clinic-brand:${ip}`, 30, 15 * 60_000);
  if (!rate.ok) return NextResponse.json({ message: "Çok fazla istek" }, { status: 429 });
  const kurum = (request.nextUrl.searchParams.get("kurum") || "").trim();
  if (kurum.length < 2 || kurum.length > 160) return NextResponse.json({ name: null, logoUrl: null });
  const institution = await prisma.institution.findFirst({
    where: { isActive: true, name: { equals: kurum, mode: "insensitive" } },
    select: { name: true, logo: true, settings: { select: { institutionName: true } } },
  });
  const logo = institution?.logo?.trim() || "";
  return NextResponse.json(
    {
      name: institution ? institution.settings?.institutionName || institution.name : null,
      logoUrl: /^(https:\/\/|data:image\/)/i.test(logo) ? logo : null,
    },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
