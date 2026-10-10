import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { canManageAllMessages } from "../message-rules";

type RouteContext = { params: Promise<{ id: string }> };

// Mesaj kendi kurumundan aranır (kurum filtresi doğrudan mesajın kendi
// alanından; önceden yazarın kurumuna bakılıyordu). Silinmiş mesaj
// düzenlenemez/yeniden silinemez.
function findMessage(id: string, user: { role: string; institutionId: string | null }) {
  return prisma.message.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(user.role !== "SUPERADMIN" ? { institutionId: user.institutionId as string } : {}),
    },
  });
}

export async function PATCH(req: Request, props: RouteContext) {
  const params = await props.params;
  const auth = await requireAuth("messages:write");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  const id = params.id;
  if (!id) return NextResponse.json({ error: "Mesaj bulunamadı" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const nextText = String(body?.text || "").trim();
  if (!nextText) return NextResponse.json({ error: "Mesaj boş olamaz" }, { status: 400 });
  if (nextText.length > 1000) {
    return NextResponse.json({ error: "Mesaj en fazla 1000 karakter olabilir" }, { status: 400 });
  }

  const message = await findMessage(id, auth.user);
  if (!message) return NextResponse.json({ error: "Mesaj bulunamadı" }, { status: 404 });

  const canEdit = message.userId === auth.user.id || canManageAllMessages(auth.user.role);
  if (!canEdit) return NextResponse.json({ error: "Bu mesajı düzenleme yetkiniz yok" }, { status: 403 });

  const updated = await prisma.message.update({
    where: { id },
    data: { text: nextText },
    include: { user: { select: { fullName: true, role: true } } },
  });

  await writeAudit(auth.user.id, "MESSAGE_UPDATE", id);
  return NextResponse.json({ ...updated, canEdit: true });
}

export async function DELETE(_: Request, props: RouteContext) {
  const params = await props.params;
  const auth = await requireAuth("messages:write");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  const id = params.id;
  if (!id) return NextResponse.json({ error: "Mesaj bulunamadı" }, { status: 404 });

  const message = await findMessage(id, auth.user);
  if (!message) return NextResponse.json({ error: "Mesaj bulunamadı" }, { status: 404 });

  const canDelete = message.userId === auth.user.id || canManageAllMessages(auth.user.role);
  if (!canDelete) return NextResponse.json({ error: "Bu mesajı silme yetkiniz yok" }, { status: 403 });

  // Kalıcı silme bilinçli: ekip mesajına yanlışlıkla yazılan hasta bilgisi
  // (KVKK) veritabanında gizli olarak kalmasın. Denetim kaydı yalnız kimliği tutar.
  await prisma.message.delete({ where: { id } });
  await writeAudit(auth.user.id, "MESSAGE_DELETE", id);
  return NextResponse.json({ ok: true });
}
