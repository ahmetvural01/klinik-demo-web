import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decodeTokenUser } from "@/lib/auth";

export async function GET() {
  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return NextResponse.json(announcements);
}

export async function POST(req: Request) {
  const user = decodeTokenUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  if (user.role !== "YONETICI") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "Duyuru boş olamaz" }, { status: 400 });

  const ann = await prisma.announcement.create({ data: { text: text.trim() } });
  return NextResponse.json(ann);
}

export async function DELETE(req: Request) {
  const user = decodeTokenUser();
  if (!user || user.role !== "YONETICI") return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const { id } = await req.json();
  await prisma.announcement.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
