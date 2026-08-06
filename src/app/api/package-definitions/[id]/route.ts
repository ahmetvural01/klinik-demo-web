import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı" }, { status: 403 });
  const { id } = await params;

  const existing = await prisma.packageDefinition.findFirst({ where: { id, institutionId: auth.user.institutionId } });
  if (!existing) return NextResponse.json({ message: "Paket şablonu bulunamadı" }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  const name = String(body.name || "").trim();
  const treatmentType = body.treatmentType ? String(body.treatmentType).trim() : null;
  const sessionCount = Number(body.sessionCount);
  const price = Number(body.price);
  const validityDays = Number(body.validityDays);
  const isActive = body.isActive === undefined ? existing.isActive : body.isActive === true;

  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    return NextResponse.json({ message: "Aktiflik değeri geçersiz" }, { status: 400 });
  }

  if (!name || name.length > 180) return NextResponse.json({ message: "Paket adı zorunlu ve en fazla 180 karakter olmalı" }, { status: 400 });
  if (treatmentType && treatmentType.length > 180) return NextResponse.json({ message: "Tedavi türü en fazla 180 karakter olabilir" }, { status: 400 });
  if (!Number.isInteger(sessionCount) || sessionCount < 1 || sessionCount > 10_000) {
    return NextResponse.json({ message: "Seans sayısı 1-10000 arasında olmalıdır" }, { status: 400 });
  }
  if (!Number.isFinite(price) || price <= 0 || price > 99_999_999.99) {
    return NextResponse.json({ message: "Fiyat geçerli aralıkta olmalıdır" }, { status: 400 });
  }
  if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 3650) {
    return NextResponse.json({ message: "Geçerlilik süresi 1-3650 gün arasında olmalıdır" }, { status: 400 });
  }

  const duplicate = await prisma.packageDefinition.findFirst({
    where: {
      institutionId: auth.user.institutionId,
      id: { not: id },
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ message: "Bu paket şablonu zaten mevcut" }, { status: 409 });

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
  if (!auth.user.institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı" }, { status: 403 });
  const { id } = await params;

  const existing = await prisma.packageDefinition.findFirst({ where: { id, institutionId: auth.user.institutionId } });
  if (!existing) return NextResponse.json({ message: "Paket şablonu bulunamadı" }, { status: 404 });

  // Zaten satılmış paketler bu şablona referans verebilir (definitionId) —
  // geçmiş satışların koşulları bozulmasın diye kalıcı silme yerine
  // pasifleştiriliyor (satış formunda artık seçilemez).
  await prisma.packageDefinition.update({ where: { id }, data: { isActive: false } });
  await writeAudit(auth.user.id, "PACKAGE_DEFINITION_DEACTIVATE", `Paket şablonu pasifleştirildi: ${existing.name}`);
  return NextResponse.json({ ok: true });
}
