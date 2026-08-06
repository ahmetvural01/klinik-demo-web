import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET() {
  const auth = await requireAuth("prices:read");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });
  }

  const setting = await prisma.setting.findUnique({
    where: { institutionId: auth.user.institutionId },
    select: { activePriceList: true },
  });
  return NextResponse.json({ activePriceList: setting?.activePriceList || "standard" });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth("prices:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const activePriceList = body?.activePriceList;
  if (activePriceList !== "standard" && activePriceList !== "custom") {
    return NextResponse.json({ message: "Geçersiz fiyat listesi seçimi." }, { status: 400 });
  }

  const setting = await prisma.setting.upsert({
    where: { institutionId: auth.user.institutionId },
    update: { activePriceList },
    create: { institutionId: auth.user.institutionId, activePriceList },
    select: { activePriceList: true },
  });
  await writeAudit(auth.user.id, "PRICE_SOURCE_UPDATE", `Aktif fiyat kaynağı: ${activePriceList}`);
  return NextResponse.json(setting);
}
