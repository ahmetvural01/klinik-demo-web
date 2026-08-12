import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumePendingTwoFactorChallenge, setAuthCookie, signToken, verifyPendingTwoFactorToken } from "@/lib/auth";
import { writeAudit } from "@/lib/api";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { verifyTwoFactorToken, verifyBackupCode, removeUsedBackupCode, currentTotpStep } from "@/lib/two-factor";
import { DEFAULT_SUPERADMIN_MODULES } from "@/lib/superadmin-modules";

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
  const { userId, rememberMe } = pending;

  const rate = await checkRateLimit(`2fa:${getClientIpFromHeaders(req.headers)}:${userId}`, 8, 60_000);
  if (!rate.ok) {
    return NextResponse.json({ message: "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin." }, { status: 429 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      institution: { select: { isActive: true } },
      branchMemberships: {
        where: { isActive: true, branch: { isActive: true } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!user || !user.isActive || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return NextResponse.json({ message: "Oturum geçersiz" }, { status: 401 });
  }
  if (user.role !== "SUPERADMIN" && (!user.institutionId || !user.institution?.isActive || user.branchMemberships.length === 0)) {
    return NextResponse.json({ message: "Hesabın aktif kurum veya şube erişimi bulunmuyor." }, { status: 403 });
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

  const superadminModules = user.role === "SUPERADMIN" ? DEFAULT_SUPERADMIN_MODULES : undefined;

  const token = signToken({
    userId: user.id,
    role: user.role,
    institutionId: user.institutionId,
    fullName: user.fullName,
    superadminModules,
    tokenVersion: user.tokenVersion,
  }, rememberMe);

  await setAuthCookie(token, rememberMe);
  await writeAudit(user.id, "LOGIN", usedBackupCode ? "Kullanıcı yedek kod ile giriş yaptı" : "Kullanıcı 2FA ile giriş yaptı");

  return NextResponse.json({
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    institutionId: user.institutionId,
    ...(superadminModules ? { modules: superadminModules } : {}),
  });
}
