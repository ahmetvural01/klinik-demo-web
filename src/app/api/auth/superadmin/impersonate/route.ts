import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decodeTokenUser, setAuthCookie, signToken, verifyPassword } from "@/lib/auth";

/**
 * Superadmin → Klinik paneline gizli giriş (ghost mode)
 * POST { institutionId, password }
 * - Superadmin kendi şifresiyle doğrulanır
 * - O kliniğin YONETICI rolüyle ghost token üretilir
 * - Hiçbir log kaydı tutulmaz
 */
export async function POST(request: NextRequest) {
  // Mevcut oturum superadmin mi?
  const currentUser = decodeTokenUser();
  if (!currentUser || currentUser.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Oturum gerekli" }, { status: 401 });
  }

  const body = (await request.json()) as { institutionId?: string; password?: string };
  const { institutionId, password } = body;

  if (!institutionId || !password) {
    return NextResponse.json({ message: "institutionId ve password zorunlu" }, { status: 400 });
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

  // Hedef kurumu bul
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { id: true, name: true, isActive: true },
  });

  if (!institution) {
    return NextResponse.json({ message: "Kurum bulunamadı" }, { status: 404 });
  }

  // O kliniğin bir YONETICI kullanıcısını bul (token için kimlik gerekiyor)
  const yonetici = await prisma.user.findFirst({
    where: { institutionId, role: "YONETICI", isActive: true },
    select: { id: true, fullName: true, role: true },
  });

  // YONETICI yoksa DOKTOR al
  const targetUser = yonetici ?? await prisma.user.findFirst({
    where: { institutionId, isActive: true },
    select: { id: true, fullName: true, role: true },
  });

  if (!targetUser) {
    return NextResponse.json({ message: "Bu klinikte aktif kullanıcı yok" }, { status: 404 });
  }

  // Ghost token: kliniğin YONETICI'si gibi davran, ghost=true
  const token = signToken({
    userId: targetUser.id,
    role: "YONETICI",
    institutionId,
    fullName: `${targetUser.fullName} [SA]`,
    ghost: true,
  });

  setAuthCookie(token);

  return NextResponse.json({
    ok: true,
    institutionName: institution.name,
    fullName: targetUser.fullName,
  });
}
