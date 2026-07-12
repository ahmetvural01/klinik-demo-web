import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET() {
  try {
    const auth = await requireAuth("settings:read");
    if (auth.error) return auth.error;

    const devices = await (prisma as any).posDevice.findMany({
      where: {
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(devices);
  } catch (error) {
    console.error("[pos-devices GET] fallback:", error);
    return NextResponse.json({ message: "POS cihazları yüklenemedi." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ message: "Cihaz adı boş olamaz" }, { status: 400 });

  const device = await (prisma as any).posDevice.create({
    data: { name, institutionId: auth.user.institutionId, isActive: true },
  });

  await writeAudit(auth.user.id, "POS_CREATE", `POS cihazı eklendi: ${name}`);
  return NextResponse.json(device, { status: 201 });
}
