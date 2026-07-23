import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildAuditWhere } from "@/lib/audit-query";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page  = Math.max(1, Number(searchParams.get("page") || "1"));
  const limit = 50;
  const skip  = (page - 1) * limit;
  const where = buildAuditWhere(searchParams);

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
        user: { select: { fullName: true, role: true, institution: { select: { name: true } } } },
      },
    }),
  ]);

  return NextResponse.json({ logs, total, page, totalPages: Math.ceil(total / limit) });
}
