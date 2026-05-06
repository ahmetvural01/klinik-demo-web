import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decodeTokenUser } from "@/lib/auth";

let lastCleanupAt = 0;

export async function GET() {
  const user = decodeTokenUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  // Retention cleanup hourly to avoid heavy delete on every request.
  const nowMs = Date.now();
  if (nowMs - lastCleanupAt > 60 * 60 * 1000) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    await prisma.message.deleteMany({ where: { createdAt: { lt: startOfToday } } });
    lastCleanupAt = nowMs;
  }

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
  const normalizedText = String(text || "").trim();
  if (!normalizedText) return NextResponse.json({ error: "Mesaj boş olamaz" }, { status: 400 });
  if (normalizedText.length > 1000) {
    return NextResponse.json({ error: "Mesaj en fazla 1000 karakter olabilir" }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: { userId: user.id, text: normalizedText },
    include: { user: { select: { fullName: true, role: true } } },
  });

  return NextResponse.json(message);
}
