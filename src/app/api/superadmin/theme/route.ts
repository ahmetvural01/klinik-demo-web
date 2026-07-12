import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { THEME_PACKAGES, DEFAULT_THEME_ID } from "@/lib/theme-packages";
import { PLATFORM_THEME_CACHE_TAG } from "@/lib/active-theme";

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  const row = await prisma.platformTheme.findUnique({ where: { id: 1 }, select: { activeTheme: true } });
  return NextResponse.json({ activeTheme: row?.activeTheme || DEFAULT_THEME_ID });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const themeId = String(body?.activeTheme || "");
  const pkg = THEME_PACKAGES.find((t) => t.id === themeId);
  if (!pkg) {
    return NextResponse.json({ message: "Geçersiz tema" }, { status: 400 });
  }

  const updated = await prisma.platformTheme.upsert({
    where: { id: 1 },
    update: { activeTheme: pkg.id },
    create: { id: 1, activeTheme: pkg.id },
  });

  revalidateTag(PLATFORM_THEME_CACHE_TAG);
  await writeAudit(auth.user.id, "PLATFORM_THEME_UPDATE", `Sistem geneli tema "${pkg.name}" olarak değiştirildi.`);

  return NextResponse.json({ activeTheme: updated.activeTheme });
}
