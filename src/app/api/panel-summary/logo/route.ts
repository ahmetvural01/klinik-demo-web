import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export const dynamic = "force-dynamic";

// Ayarlar ekranının kaydettiği biçimler (bkz. /api/settings validateLogoUrl):
// png/jpeg/webp/gif data URL ya da https adresi. SVG kabul edilmez.
const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=\s]+)$/i;

/**
 * Sol menüdeki klinik logosu. Önceden menü logoyu /api/settings'ten okuyordu:
 * o uç `settings:read` istediği için doktor, asistan, banko ve muhasebe logoyu
 * hiç görmüyor, her sayfa açılışında 403 alıyordu; yöneticide ise tüm ayarlar
 * ve 500 KB'a varan logo her açılışta yeniden iniyordu. Bu uç yalnız oturum
 * ister (kendi kurumunun logosu) ve sürüm parametreli adres önbelleklenir.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const institutionId = auth.user.institutionId;
  if (!institutionId) return new NextResponse(null, { status: 404 });

  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { logo: true },
  });
  const logo = institution?.logo?.trim() || "";
  if (/^https:\/\//i.test(logo)) return NextResponse.redirect(logo, 302);

  const match = DATA_URL.exec(logo);
  if (!match) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });

  const body = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  return new NextResponse(body, {
    headers: {
      "Content-Type": match[1].toLowerCase(),
      // Adres ?v=<kurum güncelleme zamanı> taşır; logo değişince adres de değişir.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
