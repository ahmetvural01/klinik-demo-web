import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decodeTokenUser, setAuthCookie, signToken, verifyPassword } from "@/lib/auth";
import { writeAudit } from "@/lib/api";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";

/**
 * Superadmin → Klinik paneline gizli giriş (ghost mode)
 * POST { institutionId, password }
 * - Superadmin kendi şifresiyle doğrulanır
 * - O kliniğin YONETICI rolüyle ghost token üretilir
 * - Zaten bir ghost oturumdan (başka bir klinikten) çağrılırsa da çalışır —
 *   ghost token'daki impersonatorId gerçek süperadmin kimliğini taşır, şifre
 *   doğrulaması ona karşı yapılır (bare superadmin oturumundan hiç farkı yok,
 *   tekrar çıkış yapmaya gerek kalmadan klinikten kliniğe geçilebilir).
 * - Oturumun başlangıcı ve oturum sırasında yapılan tüm işlemler audit log'a
 *   actorId/isGhost alanlarıyla işaretlenerek kaydedilir (bkz. src/lib/api.ts writeAudit)
 */
export async function POST(request: NextRequest) {
  const currentUser = decodeTokenUser();
  const isBareSuperadmin = currentUser?.role === "SUPERADMIN";
  const isGhostSwitch = Boolean(currentUser?.ghost && currentUser?.impersonatorId);

  if (!currentUser || (!isBareSuperadmin && !isGhostSwitch)) {
    return NextResponse.json({ message: "Oturum gerekli" }, { status: 401 });
  }

  // Şifrenin kime karşı doğrulanacağı: bare superadmin oturumunda kendisi,
  // ghost oturumdan geçişte ise ghost token'ın taşıdığı gerçek süperadmin id'si.
  const superadminId = isBareSuperadmin ? currentUser.id : currentUser.impersonatorId!;

  const body = (await request.json()) as { institutionId?: string; password?: string };
  const { institutionId, password } = body;

  if (!institutionId || !password) {
    return NextResponse.json({ message: "institutionId ve password zorunlu" }, { status: 400 });
  }

  // Şifre doğrulama burada rate-limitsizdi — çalınmış bir superadmin oturum
  // çerezi (şifre olmadan) sınırsız deneme ile gerçek şifreyi kaba kuvvetle
  // bulmaya çalışabilirdi. Diğer şifre doğrulama uçlarıyla (login, 2FA) aynı
  // desen uygulanıyor.
  const rate = checkRateLimit(`impersonate:${getClientIpFromHeaders(request.headers)}:${superadminId}`, 5, 15 * 60_000);
  if (!rate.ok) {
    return NextResponse.json({ message: "Çok fazla hatalı deneme yapıldı. Lütfen daha sonra tekrar deneyin." }, { status: 429 });
  }

  // Superadmin şifresini doğrula
  const superadminUser = await prisma.user.findUnique({
    where: { id: superadminId },
    select: { id: true, fullName: true, passwordHash: true, role: true },
  });

  if (!superadminUser || superadminUser.role !== "SUPERADMIN") {
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

  // Ghost token: kliniğin YONETICI'si gibi davran, ghost=true. impersonatorId
  // gerçek süperadmin kimliğini taşır ki bu oturumdan başka bir kliniğe
  // geçilirken (şifre onayı hâlâ zorunlu) tekrar bare superadmin oturumuna
  // dönmeye gerek kalmasın.
  const token = signToken({
    userId: targetUser.id,
    role: "YONETICI",
    institutionId,
    fullName: `${targetUser.fullName} [SA]`,
    ghost: true,
    impersonatorId: superadminUser.id,
  });

  setAuthCookie(token);

  await writeAudit(
    targetUser.id,
    "IMPERSONATE_START",
    `${institution.name} kliniğine "${superadminUser.fullName}" (superadmin) tarafından ${targetUser.fullName} kimliğiyle gizli giriş yapıldı`
  );

  return NextResponse.json({
    ok: true,
    institutionName: institution.name,
    fullName: targetUser.fullName,
  });
}
