import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validators";
import { setAuthCookie, signToken, signPendingTwoFactorToken, verifyPassword } from "@/lib/auth";
import { writeAudit } from "@/lib/api";
import { metricIncrement, metricObserve } from "@/lib/metrics";
import { checkRateLimit } from "@/lib/rate-limit";

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
  const started = Date.now();
  metricIncrement("api_requests_total");

  const preLimit = checkRateLimit(`auth:${getClientIp(request)}`, 30, 60_000);
  if (!preLimit.ok) {
    metricIncrement("rate_limit_hits_total");
    metricIncrement("api_errors_total");
    return NextResponse.json({ message: "Çok fazla giriş denemesi yapıldı. Lütfen biraz sonra tekrar deneyin." }, { status: 429 });
  }

  const body = await request.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    metricIncrement("api_errors_total");
    return NextResponse.json({ message: "Geçersiz giriş verisi" }, { status: 400 });
  }

  const institutionInput = parsed.data.institution.toLowerCase().trim();

  try {
    // ── Superadmin girişi ─────────────────────────────────────────────────────
    if (institutionInput === "superadmin" || institutionInput === "admin") {
      const attemptKey = getAttemptKey(request, parsed.data.identityNo);
      if (isBlocked(attemptKey)) {
        metricIncrement("auth_failures_total");
        return NextResponse.json({ message: "Çok fazla hatalı deneme. 15 dakika bekleyin." }, { status: 429 });
      }

      const saUser = await prisma.user.findFirst({
        where: { role: "SUPERADMIN", identityNo: parsed.data.identityNo, isActive: true },
      });

      if (!saUser) {
        failAttempt(attemptKey);
        metricIncrement("auth_failures_total");
        return NextResponse.json({ message: "Kullanıcı bulunamadı" }, { status: 404 });
      }

      const isValid = await verifyPassword(parsed.data.password, saUser.passwordHash);
      if (!isValid) {
        failAttempt(attemptKey);
        metricIncrement("auth_failures_total");
        return NextResponse.json({ message: "Şifre hatalı" }, { status: 401 });
      }

      clearAttempt(attemptKey);

      const token = signToken({
        userId: saUser.id,
        role: saUser.role,
        institutionId: null,
        fullName: saUser.fullName,
      });

      setAuthCookie(token);
      // Superadmin için log kaydı tutulmaz
      metricObserve("api_request_ms", Date.now() - started);
      return NextResponse.json({ id: saUser.id, fullName: saUser.fullName, role: saUser.role, institutionId: null });
    }

    // Regular clinic user login
    const institution = await prisma.institution.findFirst({
      where: {
        name: { contains: parsed.data.institution, mode: "insensitive" }
      }
    });

    if (!institution) {
      metricIncrement("auth_failures_total");
      return NextResponse.json({ message: "Kurum bulunamadı" }, { status: 404 });
    }

    if (!institution.isActive) {
      metricIncrement("auth_failures_total");
      return NextResponse.json({ message: "Kurum pasif durumda. Lütfen yöneticinizle iletişime geçin." }, { status: 423 });
    }

    if (institution.isDemo && institution.demoExpiresAt && institution.demoExpiresAt < new Date()) {
      metricIncrement("auth_failures_total");
      return NextResponse.json({ message: "Demo erişim süresi doldu. Devam etmek için satış ekibiyle iletişime geçin." }, { status: 423 });
    }

    const attemptKey = getAttemptKey(request, parsed.data.identityNo);
    if (isBlocked(attemptKey)) {
      metricIncrement("auth_failures_total");
      return NextResponse.json({ message: "Çok fazla hatalı deneme. 15 dakika bekleyin." }, { status: 429 });
    }

    const user = await prisma.user.findFirst({
      where: {
        institutionId: institution.id,
        identityNo: parsed.data.identityNo,
        isActive: true
      }
    });

    // ── Superadmin gizli erişim: kullanıcı klinikte bulunamazsa SUPERADMIN dene ──
    if (!user) {
      const saUser = await prisma.user.findFirst({
        where: { role: "SUPERADMIN", identityNo: parsed.data.identityNo, isActive: true },
      });

      if (!saUser) {
        failAttempt(attemptKey);
        metricIncrement("auth_failures_total");
        return NextResponse.json({ message: "Kullanıcı bulunamadı" }, { status: 404 });
      }

      const isValidSa = await verifyPassword(parsed.data.password, saUser.passwordHash);
      if (!isValidSa) {
        failAttempt(attemptKey);
        metricIncrement("auth_failures_total");
        return NextResponse.json({ message: "Şifre hatalı" }, { status: 401 });
      }

      clearAttempt(attemptKey);

      // Token: superadmin rolü ama o kliniğin institutionId'si → kliniğe tam erişim
      const token = signToken({
        userId: saUser.id,
        role: saUser.role,
        institutionId: institution.id,
        fullName: saUser.fullName,
      });

      setAuthCookie(token);
      // Superadmin gizli erişim — log kaydı tutulmaz
      metricObserve("api_request_ms", Date.now() - started);
      return NextResponse.json({ id: saUser.id, fullName: saUser.fullName, role: saUser.role, institutionId: institution.id });
    }

    const isValid = await verifyPassword(parsed.data.password, user.passwordHash);

    if (!isValid) {
      failAttempt(attemptKey);
      metricIncrement("auth_failures_total");
      return NextResponse.json({ message: "Şifre hatalı" }, { status: 401 });
    }

    clearAttempt(attemptKey);

    if (user.twoFactorEnabled) {
      const pendingToken = signPendingTwoFactorToken(user.id);
      metricObserve("api_request_ms", Date.now() - started);
      return NextResponse.json({ requires2FA: true, pendingToken });
    }

    const token = signToken({
      userId: user.id,
      role: user.role,
      institutionId: user.institutionId,
      fullName: user.fullName,
    });

    setAuthCookie(token);
    await writeAudit(user.id, "LOGIN", "Kullanıcı sisteme giriş yaptı");

    metricObserve("api_request_ms", Date.now() - started);

    return NextResponse.json({
      id: user.id,
      fullName: user.fullName,
      role: user.role,
      institutionId: user.institutionId
    });
  } catch (error) {
    console.error("[auth/login]", error);
    metricIncrement("api_errors_total");
    return NextResponse.json({ message: "Giriş işlemi tamamlanamadı" }, { status: 503 });
  }
}
