import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setAuthCookie, signToken, verifyPendingTwoFactorToken } from "@/lib/auth";
import { writeAudit } from "@/lib/api";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { verifyTwoFactorToken, verifyBackupCode, removeUsedBackupCode, currentTotpStep } from "@/lib/two-factor";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const pendingToken = String(body?.pendingToken || "");
  const code = String(body?.code || "").trim();

  if (!pendingToken || !code) {
    return NextResponse.json({ message: "Kod zorunlu" }, { status: 400 });
  }

  const pending = verifyPendingTwoFactorToken(pendingToken);
  if (!pending) {
    return NextResponse.json({ message: "Oturum süresi doldu, tekrar giriş yapın" }, { status: 401 });
  }
  const { userId, rememberMe } = pending;

  const rate = checkRateLimit(`2fa:${getClientIpFromHeaders(req.headers)}:${userId}`, 8, 60_000);
  if (!rate.ok) {
    return NextResponse.json({ message: "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin." }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return NextResponse.json({ message: "Oturum geçersiz" }, { status: 401 });
  }

  let valid = verifyTwoFactorToken(code, user.twoFactorSecret);
  let usedBackupCode = false;
  const step = currentTotpStep();

  // Aynı TOTP kodu (ör. gözetlenmiş/ekran paylaşımıyla ele geçirilmiş) kısa
  // süre içinde tekrar gönderilirse reddedilir — yedek kodlar zaten tek
  // kullanımlık olduğundan (kullanıldıktan sonra silinir) bu kontrol yalnızca
  // asıl TOTP kodu için gerekir (bkz. denetim raporu).
  if (valid && user.twoFactorLastStep === step) {
    valid = false;
  }

  if (!valid && user.twoFactorBackupCodes) {
    const hashedCodes = JSON.parse(user.twoFactorBackupCodes) as string[];
    if (verifyBackupCode(code, hashedCodes)) {
      valid = true;
      usedBackupCode = true;
      const remaining = removeUsedBackupCode(code, hashedCodes);
      await prisma.user.update({ where: { id: user.id }, data: { twoFactorBackupCodes: JSON.stringify(remaining) } });
    }
  }

  if (!valid) {
    return NextResponse.json({ message: "Kod hatalı" }, { status: 401 });
  }

  if (!usedBackupCode) {
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorLastStep: step } });
  }

  const token = signToken({
    userId: user.id,
    role: user.role,
    institutionId: user.institutionId,
    fullName: user.fullName,
    tokenVersion: user.tokenVersion,
  }, rememberMe);

  await setAuthCookie(token, rememberMe);
  await writeAudit(user.id, "LOGIN", usedBackupCode ? "Kullanıcı yedek kod ile giriş yaptı" : "Kullanıcı 2FA ile giriş yaptı");

  return NextResponse.json({
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    institutionId: user.institutionId,
  });
}
