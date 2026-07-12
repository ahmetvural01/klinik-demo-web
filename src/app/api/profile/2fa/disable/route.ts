import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const password = String(body?.password || "");
  if (!password) return NextResponse.json({ error: "Şifre zorunlu" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { passwordHash: true } });
  if (!user) return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) return NextResponse.json({ error: "Şifre hatalı" }, { status: 401 });

  await prisma.user.update({
    where: { id: auth.user.id },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: null },
  });

  await writeAudit(auth.user.id, "TWO_FACTOR_DISABLE", "İki faktörlü doğrulama devre dışı bırakıldı");
  return NextResponse.json({ ok: true });
}
