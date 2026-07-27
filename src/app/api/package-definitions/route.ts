import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET() {
  const auth = await requireAuth("payments:read");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) return NextResponse.json([]);

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

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const treatmentType = body.treatmentType ? String(body.treatmentType).trim() : null;
  const sessionCount = Number(body.sessionCount);
  const price = Number(body.price);
  const validityDays = body.validityDays != null ? Number(body.validityDays) : 365;

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

  const created = await prisma.packageDefinition.create({
    data: { institutionId: auth.user.institutionId, name, treatmentType, sessionCount, price, validityDays },
  });

  await writeAudit(auth.user.id, "PACKAGE_DEFINITION_CREATE", `Paket şablonu eklendi: ${name} (${sessionCount} seans, ${price} TL)`);
  return NextResponse.json(created, { status: 201 });
}
