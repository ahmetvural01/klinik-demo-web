import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET() {
  const auth = await requireAuth("payments:read");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı" }, { status: 403 });

  const definitions = await prisma.packageDefinition.findMany({
    where: { institutionId: auth.user.institutionId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(definitions);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Kurum bilgisi bulunamadı" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  const name = String(body.name || "").trim();
  const treatmentType = body.treatmentType ? String(body.treatmentType).trim() : null;
  const sessionCount = Number(body.sessionCount);
  const price = Number(body.price);
  const validityDays = body.validityDays != null ? Number(body.validityDays) : 365;

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
    where: { institutionId: auth.user.institutionId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ message: "Bu paket şablonu zaten mevcut" }, { status: 409 });

  let created;
  try {
    created = await prisma.packageDefinition.create({
      data: { institutionId: auth.user.institutionId, name, treatmentType, sessionCount, price, validityDays },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ message: "Bu paket şablonu zaten mevcut" }, { status: 409 });
    }
    throw error;
  }

  await writeAudit(auth.user.id, "PACKAGE_DEFINITION_CREATE", `Paket şablonu eklendi: ${name} (${sessionCount} seans, ${price} TL)`);
  return NextResponse.json(created, { status: 201 });
}
