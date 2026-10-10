import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyAuth, requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAnyAuth(["settings:read", "payments:read"]);
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

    const where = {
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      branchId: branch.branchId,
    };
    // Ayarlar listesi (?usage=1) cihazın kaç tahsilatta kullanıldığını da
    // ister: "Sil" yalnız hiç kullanılmamış cihazda görünür (kullanılmış cihaz
    // silinmez, pasife alınır — iki düğme aynı işi yapıyordu). Tahsilat
    // formundaki seçici bu sayımı istemez.
    if (request.nextUrl.searchParams.get("usage") === "1") {
      const devices = await prisma.posDevice.findMany({
        where,
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { payments: true, taksitOdemeler: true } } },
      });
      return NextResponse.json(devices.map(({ _count, ...device }) => ({
        ...device,
        paymentCount: _count.payments,
        inUse: _count.payments > 0 || _count.taksitOdemeler > 0,
      })));
    }

    const devices = await prisma.posDevice.findMany({ where, orderBy: { createdAt: "asc" } });
    return NextResponse.json(devices);
  } catch (error) {
    console.error("[pos-devices GET] fallback:", error);
    return NextResponse.json({ message: "POS cihazları yüklenemedi." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
  if (!auth.user.institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 120) return NextResponse.json({ message: "Cihaz adı 1-120 karakter olmalı" }, { status: 400 });

  let device;
  try {
    device = await prisma.posDevice.create({
      data: { name, institutionId: auth.user.institutionId, branchId: branch.branchId, isActive: true },
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
