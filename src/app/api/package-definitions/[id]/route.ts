import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;
  const { id } = await params;

  const existing = await prisma.packageDefinition.findFirst({ where: { id, institutionId: auth.user.institutionId ?? undefined } });
  if (!existing) return NextResponse.json({ message: "Paket şablonu bulunamadı" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const treatmentType = body.treatmentType ? String(body.treatmentType).trim() : null;
  const sessionCount = Number(body.sessionCount);
  const price = Number(body.price);
  const validityDays = Number(body.validityDays);
  const isActive = Boolean(body.isActive);

  if (!name) return NextResponse.json({ message: "Paket adı zorunlu" }, { status: 400 });
  if (!Number.isInteger(sessionCount) || sessionCount < 1) {
    return NextResponse.json({ message: "Seans sayısı en az 1 olmalıdır" }, { status: 400 });
  }
  if (!Number.isFinite(price) || price <= 0) {
    return NextResponse.json({ message: "Fiyat pozitif bir sayı olmalıdır" }, { status: 400 });
  }
  if (!Number.isInteger(validityDays) || validityDays < 1) {
    return NextResponse.json({ message: "Geçerlilik süresi en az 1 gün olmalıdır" }, { status: 400 });
  }

  const updated = await prisma.packageDefinition.update({
    where: { id },
    data: { name, treatmentType, sessionCount, price, validityDays, isActive },
  });

  await writeAudit(auth.user.id, "PACKAGE_DEFINITION_UPDATE", `Paket şablonu güncellendi: ${name}`);
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;
  const { id } = await params;

  const existing = await prisma.packageDefinition.findFirst({ where: { id, institutionId: auth.user.institutionId ?? undefined } });
  if (!existing) return NextResponse.json({ message: "Paket şablonu bulunamadı" }, { status: 404 });

  // Zaten satılmış paketler bu şablona referans verebilir (definitionId) —
  // geçmiş satışların koşulları bozulmasın diye kalıcı silme yerine
  // pasifleştiriliyor (satış formunda artık seçilemez).
  await prisma.packageDefinition.update({ where: { id }, data: { isActive: false } });
  await writeAudit(auth.user.id, "PACKAGE_DEFINITION_DEACTIVATE", `Paket şablonu pasifleştirildi: ${existing.name}`);
  return NextResponse.json({ ok: true });
}
