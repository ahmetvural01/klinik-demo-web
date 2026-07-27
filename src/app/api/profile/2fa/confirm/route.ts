import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { generateBackupCodes, verifyTwoFactorToken } from "@/lib/two-factor";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  // login/verify-2fa ve disable-2fa uç noktalarının aksine burada hiç oran
  // sınırı yoktu — TOTP secret'ının 6 haneli kodunu deneme yanılma ile
  // tahmin etmeye çalışan bir saldırıya karşı tutarlılık için eklendi
  // (bkz. denetim raporu).
  const rate = checkRateLimit(`2fa-confirm:${auth.user.id}`, 8, 60_000);
  if (!rate.ok) {
    return NextResponse.json({ error: "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin." }, { status: 429 });
  }

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
