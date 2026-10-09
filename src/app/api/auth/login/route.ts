import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validators";
import { setAuthCookie, signToken, signPendingTwoFactorToken, verifyPassword } from "@/lib/auth";
import { writeAudit } from "@/lib/api";
import { metricIncrement, metricObserve } from "@/lib/metrics";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { clearFailures, isFailureBlocked, recordFailure } from "@/lib/security-store";
import { POST as superadminLogin } from "../superadmin/login/route";

const MAX_ATTEMPT = 5;
const BLOCK_MINUTES = 15;

function getClientIp(request: NextRequest) {
  return getClientIpFromHeaders(request.headers);
}

function getAttemptKey(request: NextRequest, institution: string, identityNo: string) {
  return `clinic-login:${getClientIp(request)}:${institution}:${identityNo}`;
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  metricIncrement("api_requests_total");

  const preLimit = await checkRateLimit(`auth:${getClientIp(request)}`, 30, 60_000);
  if (!preLimit.ok) {
    metricIncrement("rate_limit_hits_total");
    metricIncrement("api_errors_total");
    return NextResponse.json({ message: "Çok fazla giriş denemesi yapıldı. Lütfen biraz sonra tekrar deneyin." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    metricIncrement("api_errors_total");
    return NextResponse.json({ message: "Geçersiz giriş verisi" }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    metricIncrement("api_errors_total");
    return NextResponse.json({ message: "Geçersiz giriş verisi" }, { status: 400 });
  }

  const institutionInput = parsed.data.institution.toLowerCase().trim();
  const rememberMe = parsed.data.rememberMe ?? false;
  const attemptKey = getAttemptKey(request, institutionInput, parsed.data.identityNo);

  try {
    // Platform kimliği kurum içindeki aynı kimlikli kayda düşmemeli.
    // Şifre, 2FA, kilit ve modül kapsamı yalnız mevcut süperadmin akışında doğrulanır.
    const platformAccount = await prisma.user.findFirst({
      where: { identityNo: parsed.data.identityNo, role: "SUPERADMIN" },
      select: { id: true },
    });
    if (platformAccount) {
      return await superadminLogin(new NextRequest(new URL("/api/auth/superadmin/login", request.url), {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify({ identityNo: parsed.data.identityNo, password: parsed.data.password }),
      }));
    }

    // Platform hesabı bulunmayan kimlikler yalnız gerçek kurum adıyla giriş yapar.
    if (institutionInput === "superadmin" || institutionInput === "admin") {
      return NextResponse.json({ message: "Bu hesapla klinik giriş ekranı kullanılamaz." }, { status: 400 });
    }

    if (await isFailureBlocked(attemptKey, MAX_ATTEMPT)) {
      metricIncrement("auth_failures_total");
      return NextResponse.json({ message: "Çok fazla hatalı deneme. 15 dakika bekleyin." }, { status: 429 });
    }

    // Regular clinic user login
    const institution = await prisma.institution.findFirst({
      where: {
        name: { equals: institutionInput, mode: "insensitive" }
      }
    });

    if (!institution) {
      await recordFailure(attemptKey, BLOCK_MINUTES * 60_000);
      metricIncrement("auth_failures_total");
      return NextResponse.json({ message: "Kullanıcı adı veya şifre hatalı" }, { status: 401 });
    }

    if (!institution.isActive) {
      metricIncrement("auth_failures_total");
      return NextResponse.json({ message: "Kurum pasif durumda. Lütfen yöneticinizle iletişime geçin." }, { status: 423 });
    }

    if (institution.isDemo && institution.demoExpiresAt && institution.demoExpiresAt < new Date()) {
      metricIncrement("auth_failures_total");
      return NextResponse.json({ message: "Demo erişim süresi doldu. Devam etmek için satış ekibiyle iletişime geçin." }, { status: 423 });
    }

    const user = await prisma.user.findFirst({
      where: {
        institutionId: institution.id,
        identityNo: parsed.data.identityNo,
        isActive: true
      },
      include: {
        branchMemberships: {
          where: { isActive: true, branch: { isActive: true } },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!user) {
      await recordFailure(attemptKey, BLOCK_MINUTES * 60_000);
      metricIncrement("auth_failures_total");
      return NextResponse.json({ message: "Kullanıcı adı veya şifre hatalı" }, { status: 401 });
    }

    const isValid = await verifyPassword(parsed.data.password, user.passwordHash);

    if (!isValid) {
      await recordFailure(attemptKey, BLOCK_MINUTES * 60_000);
      metricIncrement("auth_failures_total");
      return NextResponse.json({ message: "Kullanıcı adı veya şifre hatalı" }, { status: 401 });
    }

    if (user.branchMemberships.length === 0) {
      metricIncrement("auth_failures_total");
      return NextResponse.json(
        { message: "Hesabınıza aktif bir şube atanmamış. Klinik yöneticinizle iletişime geçin." },
        { status: 403 },
      );
    }

    await clearFailures(attemptKey);

    if (user.twoFactorEnabled) {
      const pendingToken = await signPendingTwoFactorToken(user.id, rememberMe);
      metricObserve("api_request_ms", Date.now() - started);
      return NextResponse.json({ requires2FA: true, pendingToken });
    }

    const token = signToken({
      userId: user.id,
      role: user.role,
      institutionId: user.institutionId,
      fullName: user.fullName,
      tokenVersion: user.tokenVersion,
    }, rememberMe);

    await setAuthCookie(token, rememberMe);
    await writeAudit(user.id, "LOGIN", "Kullanıcı sisteme giriş yaptı");

    metricObserve("api_request_ms", Date.now() - started);

    return NextResponse.json({
      id: user.id,
      fullName: user.fullName,
      role: user.role,
      institutionId: user.institutionId,
      mustChangePassword: user.mustChangePassword,
    });
  } catch (error) {
    console.error("[auth/login]", error);
    metricIncrement("api_errors_total");
    return NextResponse.json({ message: "Giriş işlemi tamamlanamadı" }, { status: 503 });
  }
}
