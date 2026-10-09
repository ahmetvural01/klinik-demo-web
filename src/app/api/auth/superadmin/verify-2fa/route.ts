import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumePendingTwoFactorChallenge, verifyPendingTwoFactorToken } from "@/lib/auth";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { verifyTwoFactorToken, verifyBackupCode, removeUsedBackupCode, currentTotpStep } from "@/lib/two-factor";
import { completePlatformLogin } from "@/lib/platform-auth";

// Genel /api/auth/login/verify-2fa uç noktasından AYRI: süperadmin token'ı
// superadminModules claim'ini taşımalı (bkz. superadmin-modules.ts), genel
// uç bunu bilmiyor. İki yerde neredeyse aynı mantığı tutmak yerine, bu uç
// sadece süperadmin'e özgü token imzalama kısmını ekliyor.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const pendingToken = String(body?.pendingToken || "");
  const code = String(body?.code || "").trim();

  if (!pendingToken || !code) {
    return NextResponse.json({ message: "Kod zorunlu" }, { status: 400 });
  }

  const pending = await verifyPendingTwoFactorToken(pendingToken);
  if (!pending) {
    return NextResponse.json({ message: "Oturum süresi doldu, tekrar giriş yapın" }, { status: 401 });
  }
  const { userId } = pending;

  const rate = await checkRateLimit(`sa-2fa:${getClientIpFromHeaders(req.headers)}:${userId}`, 8, 60_000);
  if (!rate.ok) {
    return NextResponse.json({ message: "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin." }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || user.role !== "SUPERADMIN" || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return NextResponse.json({ message: "Oturum geçersiz" }, { status: 401 });
  }

  let valid = verifyTwoFactorToken(code, user.twoFactorSecret);
  let usedBackupCode = false;
  const step = currentTotpStep();

  // bkz. src/app/api/auth/login/verify-2fa/route.ts — aynı tekrar kullanım
  // (replay) koruması, süperadmin girişi için de uygulanıyor.
  if (valid && user.twoFactorLastStep === step) {
    valid = false;
  }

  if (!valid && user.twoFactorBackupCodes) {
    const hashedCodes = (() => {
      try {
        const parsed = JSON.parse(user.twoFactorBackupCodes || "[]");
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
      } catch {
        return [];
      }
    })();
    if (verifyBackupCode(code, hashedCodes)) {
      const remaining = removeUsedBackupCode(code, hashedCodes);
      const claimed = await prisma.user.updateMany({
        where: { id: user.id, twoFactorBackupCodes: user.twoFactorBackupCodes },
        data: { twoFactorBackupCodes: JSON.stringify(remaining) },
      });
      valid = claimed.count === 1;
      usedBackupCode = valid;
    }
  }

  if (!valid) {
    return NextResponse.json({ message: "Kod hatalı" }, { status: 401 });
  }

  if (!usedBackupCode) {
    const claimed = await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { not: step } }],
      },
      data: { twoFactorLastStep: step },
    });
    if (claimed.count !== 1) {
      return NextResponse.json({ message: "Bu doğrulama kodu daha önce kullanılmış." }, { status: 401 });
    }
  }

  if (!await consumePendingTwoFactorChallenge(pending.challengeId, user.id)) {
    return NextResponse.json({ message: "Bu doğrulama isteği daha önce kullanılmış." }, { status: 401 });
  }

  // Kurum adı yoksa /superadmin ekranıdır (panel oturumu); varsa klinik giriş
  // ekranıdır ve yazılan kliniğe gizli, tam yetkili girilir (panel açılmaz).
  // bkz. src/lib/platform-auth.ts
  const institutionInput = typeof body?.institution === "string" ? body.institution : "";
  return completePlatformLogin(
    user,
    institutionInput,
    usedBackupCode ? "Superadmin yedek kod ile giris yapti" : "Superadmin 2FA ile giris yapti",
  );
}
