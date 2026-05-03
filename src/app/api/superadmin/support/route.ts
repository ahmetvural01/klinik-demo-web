import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || ""; // "open" | "answered" | ""
  const page   = Math.max(1, Number(searchParams.get("page") || "1"));
  const limit  = 30;
  const skip   = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (status === "open")     where.answer = null;
  if (status === "answered") where.answer = { not: null };

  const [total, tickets] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { user: { select: { fullName: true, role: true, email: true } } },
    }),
  ]);

  return NextResponse.json({ tickets, total, page, totalPages: Math.ceil(total / limit) });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json() as { id: string; answer: string };
  const { id, answer } = body;
  if (!id || !answer?.trim()) return NextResponse.json({ message: "id ve answer zorunlu" }, { status: 400 });

  const ticket = await prisma.supportTicket.update({
    where: { id },
    data: { answer: answer.trim() },
  });

  return NextResponse.json(ticket);
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ message: "id zorunlu" }, { status: 400 });

  await prisma.supportTicket.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
