import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setAuthCookie, signToken, verifyPendingTwoFactorToken } from "@/lib/auth";
import { writeAudit } from "@/lib/api";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { verifyTwoFactorToken, verifyBackupCode, removeUsedBackupCode } from "@/lib/two-factor";
import { DEFAULT_SUPERADMIN_MODULES, normalizeModules } from "@/lib/superadmin-modules";

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

  const userId = verifyPendingTwoFactorToken(pendingToken);
  if (!userId) {
    return NextResponse.json({ message: "Oturum süresi doldu, tekrar giriş yapın" }, { status: 401 });
  }

  const rate = checkRateLimit(`sa-2fa:${getClientIpFromHeaders(req.headers)}:${userId}`, 8, 60_000);
  if (!rate.ok) {
    return NextResponse.json({ message: "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin." }, { status: 429 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { superadminPermission: true },
  });
  if (!user || user.role !== "SUPERADMIN" || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return NextResponse.json({ message: "Oturum geçersiz" }, { status: 401 });
  }

  let valid = verifyTwoFactorToken(code, user.twoFactorSecret);
  let usedBackupCode = false;

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

  const modules = user.superadminPermission
    ? normalizeModules(user.superadminPermission.modules)
    : DEFAULT_SUPERADMIN_MODULES;

  const token = signToken({
    userId: user.id,
    role: user.role,
    institutionId: null,
    fullName: user.fullName,
    superadminModules: modules,
  });

  setAuthCookie(token);
  await writeAudit(user.id, "LOGIN", usedBackupCode ? "Superadmin yedek kod ile giris yapti" : "Superadmin 2FA ile giris yapti");

  return NextResponse.json({
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    institutionId: null,
    modules,
  });
}
