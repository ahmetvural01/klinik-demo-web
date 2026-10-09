import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { packageConflictMessage, parsePackageInput } from "./package-input";

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const packages = await prisma.smsPackage.findMany({
    orderBy: { smsCount: "asc" },
  });

  // Prisma Decimal JSON'da metin olarak gider; ekran sayı bekler.
  return NextResponse.json(packages.map((item) => ({ ...item, price: Number(item.price) })));
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const parsed = parsePackageInput(await request.json().catch(() => null), false);
  if (parsed.error) return NextResponse.json({ message: parsed.error }, { status: 400 });

  let pkg;
  try {
    pkg = await prisma.smsPackage.create({
      data: {
        name: parsed.data.name as string,
        smsCount: parsed.data.smsCount as number,
        price: parsed.data.price as number,
        description: parsed.data.description ?? null,
      },
    });
  } catch (error) {
    const conflict = packageConflictMessage(error);
    if (conflict) return NextResponse.json({ message: conflict }, { status: 409 });
    throw error;
  }

  await writeAudit(auth.user.id, "SUPERADMIN_SMS_PACKAGE_CREATE", `${pkg.name}: ${pkg.smsCount} SMS / ₺${Number(pkg.price).toLocaleString("tr-TR")}`);
  return NextResponse.json({ ...pkg, price: Number(pkg.price) });
}
