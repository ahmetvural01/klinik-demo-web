import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { canEditMessage, rejectGhostAuthoring } from "./message-rules";

export async function GET() {
  const auth = await requireAuth("messages:read");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) {
    return NextResponse.json({ error: branch.message }, { status: 409 });
  }

  try {
    const [messages, canWrite] = await Promise.all([
      prisma.message.findMany({
        where: { institutionId: auth.user.institutionId, branchId: branch.branchId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { fullName: true, role: true } } },
      }),
      hasEffectivePermission(auth.user, "messages:write"),
    ]);

    // canEdit: düzenle/sil düğmeleri yalnız işe yarayacağı mesajda görünsün (kural PATCH/DELETE ile aynı).
    return NextResponse.json(messages.reverse().map((message) => ({
      ...message,
      canEdit: canEditMessage(auth.user, message, canWrite),
    })));
  } catch (error) {
    console.error("[messages GET] fallback:", error);
    return NextResponse.json({ message: "Mesajlar yüklenemedi." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth("messages:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }
  const ghostRejected = rejectGhostAuthoring(auth.user, "mesaj");
  if (ghostRejected) return ghostRejected;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) {
    return NextResponse.json({ error: branch.message }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  const { text } = body as { text?: unknown };
  const normalizedText = String(text || "").trim();
  if (!normalizedText) return NextResponse.json({ error: "Mesaj boş olamaz" }, { status: 400 });
  if (normalizedText.length > 1000) {
    return NextResponse.json({ error: "Mesaj en fazla 1000 karakter olabilir" }, { status: 400 });
  }

  try {
    const message = await prisma.message.create({
      data: {
        userId: auth.user.id,
        institutionId: auth.user.institutionId,
        branchId: branch.branchId,
        text: normalizedText,
      },
      include: { user: { select: { fullName: true, role: true } } },
    });

    await writeAudit(auth.user.id, "MESSAGE_CREATE", normalizedText.slice(0, 120));
    return NextResponse.json({ ...message, canEdit: true });
  } catch (error) {
    console.error("[messages POST] fallback:", error);
    return NextResponse.json({ error: "Mesaj gönderilemedi" }, { status: 503 });
  }
}
