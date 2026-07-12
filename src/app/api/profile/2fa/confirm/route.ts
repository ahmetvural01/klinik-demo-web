import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { generateBackupCodes, verifyTwoFactorToken } from "@/lib/two-factor";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const code = String(body?.code || "").trim();
  if (!code) return NextResponse.json({ error: "Kod zorunlu" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { twoFactorSecret: true } });
  if (!user?.twoFactorSecret) {
    return NextResponse.json({ error: "Önce kurulum başlatılmalı" }, { status: 400 });
  }

  const isValid = verifyTwoFactorToken(code, user.twoFactorSecret);
  if (!isValid) {
    return NextResponse.json({ error: "Kod hatalı veya süresi dolmuş" }, { status: 401 });
  }

  const { plain, hashed } = generateBackupCodes();
  await prisma.user.update({
    where: { id: auth.user.id },
    data: { twoFactorEnabled: true, twoFactorBackupCodes: JSON.stringify(hashed) },
  });

  await writeAudit(auth.user.id, "TWO_FACTOR_ENABLE", "İki faktörlü doğrulama etkinleştirildi");
  return NextResponse.json({ ok: true, backupCodes: plain });
}
