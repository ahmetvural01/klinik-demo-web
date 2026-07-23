import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { generateBackupCodes, verifyTwoFactorToken } from "@/lib/two-factor";
import { setAuthCookie, signToken } from "@/lib/auth";
import { DEFAULT_SUPERADMIN_MODULES, normalizeModules } from "@/lib/superadmin-modules";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

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

  // Süperadmin bu ekrana "mustSetup2fa" sınırlı oturumuyla ulaşmış olabilir
  // (bkz. /api/auth/superadmin/login) — kurulum bitince tekrar giriş yapmak
  // zorunda kalmadan hemen tam yetkili bir oturuma geçsin.
  if (auth.user.role === "SUPERADMIN" && auth.user.mustSetup2fa) {
    const permission = await prisma.superadminPermission.findUnique({ where: { userId: auth.user.id } });
    const modules = permission ? normalizeModules(permission.modules) : DEFAULT_SUPERADMIN_MODULES;
    const fullToken = signToken({
      userId: auth.user.id,
      role: "SUPERADMIN",
      institutionId: null,
      fullName: auth.user.fullName,
      superadminModules: modules,
    });
    setAuthCookie(fullToken);
  }

  return NextResponse.json({ ok: true, backupCodes: plain });
}
