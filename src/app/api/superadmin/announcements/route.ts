import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page  = Math.max(1, Number(searchParams.get("page") || "1"));
  const limit = 20;
  const skip  = (page - 1) * limit;

  const [total, announcements] = await Promise.all([
    prisma.announcement.count(),
    prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return NextResponse.json({ announcements, total, page, totalPages: Math.ceil(total / limit) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json() as { text: string };
  if (!body.text?.trim()) return NextResponse.json({ message: "text zorunlu" }, { status: 400 });

  const ann = await prisma.announcement.create({ data: { text: body.text.trim() } });
  return NextResponse.json(ann, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ message: "id zorunlu" }, { status: 400 });

  await prisma.announcement.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
