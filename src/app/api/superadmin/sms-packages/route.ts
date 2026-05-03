import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const packages = await prisma.smsPackage.findMany({
    orderBy: { smsCount: "asc" },
  });

  return NextResponse.json(packages);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const body = await request.json();

  const pkg = await prisma.smsPackage.create({
    data: {
      name: body.name,
      smsCount: body.smsCount,
      price: body.price,
      description: body.description,
    },
  });

  return NextResponse.json(pkg);
}
