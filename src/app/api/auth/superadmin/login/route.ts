import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setAuthCookie, signPendingTwoFactorToken, signToken, verifyPassword } from "@/lib/auth";
import { writeAudit } from "@/lib/api";
import { DEFAULT_SUPERADMIN_MODULES } from "@/lib/superadmin-modules";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { clearFailures, isFailureBlocked, recordFailure } from "@/lib/security-store";

const MAX_ATTEMPT = 5;
const BLOCK_MINUTES = 15;

function getClientIp(request: NextRequest) {
  return getClientIpFromHeaders(request.headers);
}

function getAttemptKey(request: NextRequest, identityNo: string) {
  return `${getClientIp(request)}:${identityNo}`;
}

export async function POST(request: NextRequest) {
  // Superadmin login öncesinde global IP bazlı sınır yoktu — sadece IP+identityNo
  // bazlı 5 denemelik kilit vardı, bu da spoofable X-Forwarded-For ile aşılabilirdi
  // (bkz. denetim raporu). login/route.ts'deki aynı desen burada da uygulanıyor.
  const preLimit = await checkRateLimit(`auth:${getClientIp(request)}`, 30, 60_000);
  if (!preLimit.ok) {
    return NextResponse.json({ message: "Çok fazla giriş denemesi yapıldı. Lütfen biraz sonra tekrar deneyin." }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as { identityNo?: string; password?: string } | null;
  if (!body) {
    return NextResponse.json({ message: "Geçersiz giriş verisi" }, { status: 400 });
  }
  const identityNo = body.identityNo?.trim() || "";
  const password = body.password || "";

  if (!identityNo || !password) {
    return NextResponse.json({ message: "TC kimlik ve sifre zorunlu" }, { status: 400 });
  }

  const attemptKey = getAttemptKey(request, identityNo);
  if (await isFailureBlocked(attemptKey, MAX_ATTEMPT)) {
    return NextResponse.json({ message: "Çok fazla hatalı deneme yapıldı. Lütfen daha sonra tekrar deneyin." }, { status: 429 });
  }

  const user = await prisma.user.findFirst({
    where: {
      identityNo,
      role: "SUPERADMIN",
      isActive: true,
    },
  });

  if (!user) {
    await recordFailure(attemptKey, BLOCK_MINUTES * 60_000);
    return NextResponse.json({ message: "Kullanıcı adı veya şifre hatalı" }, { status: 401 });
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    await recordFailure(attemptKey, BLOCK_MINUTES * 60_000);
    return NextResponse.json({ message: "Kullanıcı adı veya şifre hatalı" }, { status: 401 });
  }

  await clearFailures(attemptKey);

  const modules = DEFAULT_SUPERADMIN_MODULES;

  // 2FA isteğe bağlıdır (Profil ekranından kendi tercihiyle açabilir). Zaten
  // açıksa şifre doğrulaması yeterli değildir, kod da istenir.
  if (user.twoFactorEnabled) {
    const pendingToken = await signPendingTwoFactorToken(user.id);
    return NextResponse.json({ requiresTwoFactor: true, pendingToken });
  }

  const token = signToken({
    userId: user.id,
    role: user.role,
    institutionId: null,
    fullName: user.fullName,
    superadminModules: modules,
    tokenVersion: user.tokenVersion,
  });
  await setAuthCookie(token);
  await writeAudit(user.id, "LOGIN", "Superadmin sisteme giris yapti");

  return NextResponse.json({
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    institutionId: null,
    modules,
  });
}
