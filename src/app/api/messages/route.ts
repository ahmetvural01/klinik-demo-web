import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decodeTokenUser } from "@/lib/auth";

export async function GET() {
  const user = decodeTokenUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const messages = await prisma.message.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { fullName: true, role: true } } },
  });

  return NextResponse.json(messages.reverse());
}

export async function POST(req: Request) {
  const user = decodeTokenUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "Mesaj boş olamaz" }, { status: 400 });

  const message = await prisma.message.create({
    data: { userId: user.id, text: text.trim() },
    include: { user: { select: { fullName: true, role: true } } },
  });

  return NextResponse.json(message);
}
