import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { startPendingTwoFactor, startPlatformSession, verifyPlatformCredentials } from "@/lib/platform-auth";

export async function POST(request: NextRequest) {
  // Superadmin login öncesinde global IP bazlı sınır yoktu — sadece IP+identityNo
  // bazlı 5 denemelik kilit vardı, bu da spoofable X-Forwarded-For ile aşılabilirdi
  // (bkz. denetim raporu). login/route.ts'deki aynı desen burada da uygulanıyor.
  const preLimit = await checkRateLimit(`auth:${getClientIpFromHeaders(request.headers)}`, 30, 60_000);
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

  // Şifre, deneme kilidi ve hata mesajları klinik giriş ekranındaki süperadmin
  // yolu ile aynı yerde (src/lib/platform-auth.ts).
  const verified = await verifyPlatformCredentials(request, identityNo, password);
  if (!verified.ok) return verified.response;
  const user = verified.user;

  // 2FA isteğe bağlıdır (Profil ekranından kendi tercihiyle açabilir). Zaten
  // açıksa şifre doğrulaması yeterli değildir, kod da istenir.
  if (user.twoFactorEnabled) return startPendingTwoFactor(user);

  const modules = await startPlatformSession(user, "Superadmin sisteme giris yapti");
  return NextResponse.json({
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    institutionId: null,
    modules,
  });
}
