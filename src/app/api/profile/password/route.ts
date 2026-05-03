import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const body = await request.json();
  const { oldPassword, newPassword } = body;

  if (!oldPassword || !newPassword) {
    return NextResponse.json({ message: "Eski ve yeni şifre gerekli" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user) return NextResponse.json({ message: "Kullanıcı bulunamadı" }, { status: 404 });

  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ message: "Mevcut şifre yanlış" }, { status: 401 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: auth.user.id }, data: { passwordHash } });
  await writeAudit(auth.user.id, "PASSWORD_CHANGE", "Şifre değiştirildi");

  return NextResponse.json({ ok: true });
}
