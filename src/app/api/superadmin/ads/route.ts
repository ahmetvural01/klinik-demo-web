import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { normalizeAdSlotId, normalizePublisherId } from "@/lib/panel-ads";
import { invalidateClinicAdCache, invalidatePlatformAdConfigCache } from "@/lib/panel-ads-server";

/**
 * Süperadmin › Reklamlar. Klinik panelindeki reklam alanlarını tek sağlayıcı
 * (Google AdSense) doldurur:
 * - GET: platform ayarı + kliniklerin "reklam gösterilsin" anahtarı (tek istek)
 * - PUT: platform ayarı (anahtar, yayıncı kimliği, reklam birimi kimliği)
 * - PATCH: tek kliniğin anahtarı ({ institutionId, adsEnabled })
 */

async function requirePlatformOwner() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return { error: auth.error };
  if (auth.user.role !== "SUPERADMIN") return { error: NextResponse.json({ message: "Yetki yok" }, { status: 403 }) };
  return { user: auth.user };
}

const configSelect = { enabled: true, publisherId: true, slotId: true, updatedAt: true } as const;

export async function GET() {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const [config, institutions] = await Promise.all([
    prisma.platformAdConfig.findUnique({ where: { id: 1 }, select: configSelect }),
    prisma.institution.findMany({
      select: { id: true, name: true, isActive: true, isDemo: true, adsEnabled: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({
    config: config ?? { enabled: false, publisherId: "", slotId: "", updatedAt: null },
    institutions,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.enabled !== "boolean") {
    return NextResponse.json({ message: "Geçersiz istek" }, { status: 400 });
  }
  const rawPublisherId = typeof body.publisherId === "string" ? body.publisherId : "";
  const rawSlotId = typeof body.slotId === "string" ? body.slotId : "";
  const publisherId = rawPublisherId.trim() ? normalizePublisherId(rawPublisherId) : "";
  if (publisherId === null) {
    return NextResponse.json({ message: "Yayıncı kimliği ca-pub- ve 16 rakamdan oluşur." }, { status: 400 });
  }
  const slotId = rawSlotId.trim() ? normalizeAdSlotId(rawSlotId) : "";
  if (slotId === null) {
    return NextResponse.json({ message: "Reklam birimi kimliği yalnız rakamdan oluşur (ör. 1234567890)." }, { status: 400 });
  }
  if (body.enabled && (!publisherId || !slotId)) {
    return NextResponse.json({ message: "Reklamları açmak için iki kimliği de girin." }, { status: 400 });
  }

  const existing = await prisma.platformAdConfig.findUnique({ where: { id: 1 }, select: configSelect });
  const data = { enabled: body.enabled as boolean, publisherId, slotId };
  const saved = await prisma.platformAdConfig.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
    select: configSelect,
  });
  invalidatePlatformAdConfigCache();

  const changes: string[] = [];
  if ((existing?.enabled ?? false) !== saved.enabled) changes.push(saved.enabled ? "reklamlar açıldı" : "reklamlar kapatıldı");
  if ((existing?.publisherId ?? "") !== saved.publisherId) changes.push(`yayıncı kimliği: ${saved.publisherId || "silindi"}`);
  if ((existing?.slotId ?? "") !== saved.slotId) changes.push(`reklam birimi: ${saved.slotId || "silindi"}`);
  if (changes.length > 0) {
    await writeAudit(auth.user.id, "SUPERADMIN_AD_CONFIG_UPDATE", `Google AdSense: ${changes.join(", ")}`);
  }

  return NextResponse.json({ config: saved });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const institutionId = body && typeof body.institutionId === "string" ? body.institutionId.trim() : "";
  if (!institutionId || typeof body?.adsEnabled !== "boolean") {
    return NextResponse.json({ message: "Geçersiz istek" }, { status: 400 });
  }

  const existing = await prisma.institution.findUnique({ where: { id: institutionId }, select: { name: true, adsEnabled: true } });
  if (!existing) return NextResponse.json({ message: "Klinik bulunamadı." }, { status: 404 });

  const updated = await prisma.institution.update({
    where: { id: institutionId },
    data: { adsEnabled: body.adsEnabled },
    select: { id: true, adsEnabled: true },
  });
  invalidateClinicAdCache(institutionId);

  if (existing.adsEnabled !== updated.adsEnabled) {
    await writeAudit(
      auth.user.id,
      "SUPERADMIN_INSTITUTION_ADS_UPDATE",
      `${existing.name}: klinik panelinde reklam ${updated.adsEnabled ? "açıldı" : "kapatıldı"}`,
    );
  }

  return NextResponse.json(updated);
}
