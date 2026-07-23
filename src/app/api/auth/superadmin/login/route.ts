import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setAuthCookie, signPendingTwoFactorToken, signToken, verifyPassword } from "@/lib/auth";
import { writeAudit } from "@/lib/api";
import { DEFAULT_SUPERADMIN_MODULES, normalizeModules } from "@/lib/superadmin-modules";

type AttemptState = { count: number; blockedUntil?: number };

const attemptStore = new Map<string, AttemptState>();
const MAX_ATTEMPT = 5;
const BLOCK_MINUTES = 15;

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function getAttemptKey(request: NextRequest, identityNo: string) {
  return `${getClientIp(request)}:${identityNo}`;
}

function isBlocked(key: string) {
  const state = attemptStore.get(key);
  if (!state?.blockedUntil) return false;
  if (state.blockedUntil < Date.now()) {
    attemptStore.delete(key);
    return false;
  }
  return true;
}

function failAttempt(key: string) {
  const current = attemptStore.get(key) || { count: 0 };
  const nextCount = current.count + 1;
  if (nextCount >= MAX_ATTEMPT) {
    attemptStore.set(key, {
      count: nextCount,
      blockedUntil: Date.now() + BLOCK_MINUTES * 60 * 1000,
    });
    return;
  }
  attemptStore.set(key, { count: nextCount });
}

function clearAttempt(key: string) {
  attemptStore.delete(key);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { identityNo?: string; password?: string };
  const identityNo = body.identityNo?.trim() || "";
  const password = body.password || "";

  if (!identityNo || !password) {
    return NextResponse.json({ message: "TC kimlik ve sifre zorunlu" }, { status: 400 });
  }

  const attemptKey = getAttemptKey(request, identityNo);
  if (isBlocked(attemptKey)) {
    return NextResponse.json({ message: "Çok fazla hatalı deneme yapıldı. Lütfen daha sonra tekrar deneyin." }, { status: 429 });
  }

  const user = await prisma.user.findFirst({
    where: {
      identityNo,
      role: "SUPERADMIN",
      isActive: true,
    },
    include: {
      superadminPermission: true,
    },
  });

  if (!user) {
    failAttempt(attemptKey);
    return NextResponse.json({ message: "Superadmin kullanici bulunamadi" }, { status: 404 });
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    failAttempt(attemptKey);
    return NextResponse.json({ message: "Sifre hatali" }, { status: 401 });
  }

  clearAttempt(attemptKey);

  const modules = user.superadminPermission
    ? normalizeModules(user.superadminPermission.modules)
    : DEFAULT_SUPERADMIN_MODULES;

  // 2FA isteğe bağlıdır (Profil ekranından kendi tercihiyle açabilir). Zaten
  // açıksa şifre doğrulaması yeterli değildir, kod da istenir.
  if (user.twoFactorEnabled) {
    const pendingToken = signPendingTwoFactorToken(user.id);
    return NextResponse.json({ requiresTwoFactor: true, pendingToken });
  }

  const token = signToken({
    userId: user.id,
    role: user.role,
    institutionId: null,
    fullName: user.fullName,
    superadminModules: modules,
  });
  setAuthCookie(token);
  await writeAudit(user.id, "LOGIN", "Superadmin sisteme giris yapti");

  return NextResponse.json({
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    institutionId: null,
    modules,
  });
}
