import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const search    = searchParams.get("search") || "";
  const userId    = searchParams.get("userId") || "";
  const startDate = searchParams.get("startDate") || "";
  const endDate   = searchParams.get("endDate") || "";
  const page      = Math.max(1, Number(searchParams.get("page") || "1"));
  const limit     = 50;
  const skip      = (page - 1) * limit;

  // Bu ekran superadmin'in kendi hesap verimliliği/uyum denetimi içindir — kurum
  // bazlı /api/logs'un aksine, superadmin/ghost işlemlerini DIŞLAMAZ; tam tersine
  // asıl amacı bunları görünür kılmaktır (bkz. src/lib/api.ts writeAudit).
  const where: Record<string, unknown> = {
    user: { role: { not: "SUPERADMIN" } },
  };
  if (userId) where.userId = userId;
  if (search) {
    where.OR = [
      { action: { contains: search, mode: "insensitive" } },
      { detail: { contains: search, mode: "insensitive" } },
    ];
  }
  if (startDate || endDate) {
    where.createdAt = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate   ? { lte: new Date(endDate + "T23:59:59.999Z") } : {}),
    };
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        action: true,
        detail: true,
        createdAt: true,
        actorId: true,
        actorRole: true,
        isGhost: true,
        ip: true,
        user: { select: { fullName: true, role: true, institutionId: true } },
      },
    }),
  ]);

  return NextResponse.json({ logs, total, page, totalPages: Math.ceil(total / limit) });
}
