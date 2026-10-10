import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Hasta belgelerinin (tedavi raporu, tahsilat dökümü, ödeme planı, onam,
 * dışa aktarılan dosya) antedindeki klinik künyesi. Önceden bu bilgi yalnız
 * `/api/settings`'ten okunuyordu; o uç ayar yetkisi (settings:read) istediği
 * için hekim, asistan ve banko çıktılarında klinik adı yerine "Klinik"
 * yazıyordu (ve logo dahil bütün ayarlar her seferinde iniyordu). Burada
 * yalnız antette görünen herkese açık künye döner; logo ve ayarlar dönmez.
 */
export async function GET() {
  const auth = await requireAuth("patients:read");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });
  }

  const [settings, institution] = await Promise.all([
    prisma.setting.findUnique({
      where: { institutionId: auth.user.institutionId },
      select: { institutionName: true, institutionPhone: true, institutionAddress: true, institutionWebsite: true },
    }),
    prisma.institution.findUnique({
      where: { id: auth.user.institutionId },
      select: { name: true, email: true, phone: true, address: true, taxNo: true, registryNo: true, website: true },
    }),
  ]);

  // /api/settings ile aynı öncelik: önce Ayarlar'da yazılan, yoksa kurum kaydı.
  return NextResponse.json({
    institutionName: settings?.institutionName || institution?.name || "",
    institutionPhone: settings?.institutionPhone || institution?.phone || "",
    institutionEmail: institution?.email || "",
    institutionAddress: settings?.institutionAddress ?? institution?.address ?? "",
    institutionWebsite: settings?.institutionWebsite ?? institution?.website ?? "",
    institutionTaxNo: institution?.taxNo || "",
    institutionRegistryNo: institution?.registryNo || "",
  });
}
