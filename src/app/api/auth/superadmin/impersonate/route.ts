import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decodeTokenUser, verifyPassword } from "@/lib/auth";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { startSuperadminClinicSession } from "@/lib/superadmin-clinic-session";

/**
 * Superadmin → Klinik paneline giriş (ghost mode)
 * POST { institutionId, password }
 * - Superadmin kendi şifresiyle doğrulanır
 * - Klinikte tam yetkili oturum açılır (bkz. src/lib/superadmin-clinic-session.ts)
 */
export async function POST(request: NextRequest) {
  // Mevcut oturum superadmin mi?
  const currentUser = await decodeTokenUser();
  if (!currentUser || currentUser.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Oturum gerekli" }, { status: 401 });
  }

  const body = (await request.json()) as { institutionId?: string; password?: string };
  const { institutionId, password } = body;

  if (!institutionId || !password) {
    return NextResponse.json({ message: "institutionId ve password zorunlu" }, { status: 400 });
  }

  // Şifre doğrulama burada rate-limitsizdi — çalınmış bir superadmin oturum
  // çerezi (şifre olmadan) sınırsız deneme ile gerçek şifreyi kaba kuvvetle
  // bulmaya çalışabilirdi. Diğer şifre doğrulama uçlarıyla (login, 2FA) aynı
  // desen uygulanıyor.
  const rate = await checkRateLimit(`impersonate:${getClientIpFromHeaders(request.headers)}:${currentUser.id}`, 5, 15 * 60_000);
  if (!rate.ok) {
    return NextResponse.json({ message: "Çok fazla hatalı deneme yapıldı. Lütfen daha sonra tekrar deneyin." }, { status: 429 });
  }

  // Superadmin şifresini doğrula
  const superadminUser = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: { passwordHash: true },
  });

  if (!superadminUser) {
    return NextResponse.json({ message: "Kullanıcı bulunamadı" }, { status: 404 });
  }

  const isValid = await verifyPassword(password, superadminUser.passwordHash);
  if (!isValid) {
    return NextResponse.json({ message: "Şifre hatalı" }, { status: 401 });
  }

  const entry = await startSuperadminClinicSession({
    superadmin: { id: currentUser.id, fullName: currentUser.fullName },
    institutionId,
    source: "panel",
  });
  if (!entry.ok) {
    return NextResponse.json({ message: entry.message }, { status: entry.status });
  }

  return NextResponse.json({
    ok: true,
    institutionName: entry.institutionName,
    fullName: entry.fullName,
  });
}
