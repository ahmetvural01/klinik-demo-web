import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("audit:read");
    if (auth.error) return auth.error;

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from") || sp.get("start");
    const to = sp.get("to") || sp.get("end");
    const page = Math.max(1, parseInt(sp.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(sp.get("limit") || "15")));
    const q = sp.get("q") || "";

    const where: Record<string, unknown> = {};
    where.user = {
      role: { not: "SUPERADMIN" },
      ...(auth.user.role !== "SUPERADMIN" ? { institutionId: auth.user.institutionId } : {}),
    };
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to + "T23:59:59.999Z") } : {})
      };
    }
    if (q) {
      where.OR = [
        { action: { contains: q, mode: "insensitive" } },
        { detail: { contains: q, mode: "insensitive" } },
        { user: { fullName: { contains: q, mode: "insensitive" } } }
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          detail: true,
          createdAt: true,
          isGhost: true,
          user: { select: { id: true, fullName: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    return NextResponse.json({ logs, total });
  } catch (error) {
    console.error("[logs GET] fallback:", error);
    return NextResponse.json({ message: "İşlem kayıtları yüklenemedi." }, { status: 503 });
  }
}
