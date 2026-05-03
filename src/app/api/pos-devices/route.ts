import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET() {
  const auth = await requireAuth("settings:read");
  if (auth.error) return auth.error;

  const devices = await (prisma as any).posDevice.findMany({
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(devices);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ message: "Cihaz adı boş olamaz" }, { status: 400 });

  const device = await (prisma as any).posDevice.create({
    data: { name, isActive: true },
  });

  await writeAudit(auth.user.id, "POS_CREATE", `POS cihazı eklendi: ${name}`);
  return NextResponse.json(device, { status: 201 });
}
