import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// GET /api/superadmin/users - Sistemdeki tüm kullanıcılar
export async function GET(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const role = searchParams.get("role") || "";
  const institutionId = searchParams.get("institutionId") || "";
  const isActive = searchParams.get("isActive");

  const users = await prisma.user.findMany({
    where: {
      role: { not: "SUPERADMIN" },
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { identityNo: { contains: search } },
        ],
      }),
      ...(role && { role: role as never }),
      ...(institutionId && { institutionId }),
      ...(isActive !== null && isActive !== "" && { isActive: isActive === "true" }),
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      identityNo: true,
      role: true,
      isActive: true,
      createdAt: true,
      institutionId: true,
      institution: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(users);
}
