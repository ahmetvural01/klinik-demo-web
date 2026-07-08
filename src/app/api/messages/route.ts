import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

let lastCleanupAt = 0;

export async function GET() {
  const auth = await requireAuth("messages:read");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  const institutionScope = auth.user.role === "SUPERADMIN"
    ? {}
    : { user: { institutionId: auth.user.institutionId } };

  try {
    // Retention cleanup hourly to avoid heavy delete on every request.
    const nowMs = Date.now();
    if (nowMs - lastCleanupAt > 60 * 60 * 1000) {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      await prisma.message.deleteMany({
        where: {
          createdAt: { lt: startOfToday },
          ...institutionScope,
        },
      });
      lastCleanupAt = nowMs;
    }

    const messages = await prisma.message.findMany({
      where: institutionScope,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { fullName: true, role: true } } },
    });

    return NextResponse.json(messages.reverse());
  } catch (error) {
    console.error("[messages GET] fallback:", error);
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth("messages:write");
  if (auth.error) return auth.error;

  const { text } = await req.json();
  const normalizedText = String(text || "").trim();
  if (!normalizedText) return NextResponse.json({ error: "Mesaj boş olamaz" }, { status: 400 });
  if (normalizedText.length > 1000) {
    return NextResponse.json({ error: "Mesaj en fazla 1000 karakter olabilir" }, { status: 400 });
  }

  try {
    const message = await prisma.message.create({
      data: { userId: auth.user.id, text: normalizedText },
      include: { user: { select: { fullName: true, role: true } } },
    });

    return NextResponse.json(message);
  } catch (error) {
    console.error("[messages POST] fallback:", error);
    return NextResponse.json({ error: "Mesaj gönderilemedi" }, { status: 503 });
  }
}
