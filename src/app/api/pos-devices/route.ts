import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyAuth, requireAuth, writeAudit } from "@/lib/api";

export async function GET() {
  try {
    const auth = await requireAnyAuth(["settings:read", "payments:read"]);
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
  if (!auth.user.institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 120) return NextResponse.json({ message: "Cihaz adı 1-120 karakter olmalı" }, { status: 400 });

  let device;
  try {
    device = await (prisma as any).posDevice.create({
      data: { name, institutionId: auth.user.institutionId, isActive: true },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ message: "Bu isimde bir POS cihazı zaten var" }, { status: 409 });
    }
    throw error;
  }

  await writeAudit(auth.user.id, "POS_CREATE", `POS cihazı eklendi: ${name}`);
  return NextResponse.json(device, { status: 201 });
}
