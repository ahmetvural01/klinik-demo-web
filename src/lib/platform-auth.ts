import { NextRequest, NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { setAuthCookie, signPendingTwoFactorToken, signToken, verifyPassword } from "@/lib/auth";
import { writeAudit } from "@/lib/api";
import { DEFAULT_SUPERADMIN_MODULES } from "@/lib/superadmin-modules";
import { getClientIpFromHeaders } from "@/lib/rate-limit";
import { clearFailures, isFailureBlocked, recordFailure } from "@/lib/security-store";
import { findInstitutionByLoginName, isPlatformLoginName, startSuperadminClinicSession } from "@/lib/superadmin-clinic-session";

// Süperadmin (sistem sahibi) kimlik doğrulamasının TEK yeri. İki ekran
// kullanır:
//  - /superadmin giriş ekranı → Platform Yönetimi paneli açılır.
//  - Klinik giriş ekranı (kurum adı yazılarak) → yazılan kliniğe gizli ve tam
//    yetkili girilir; bu ekran Platform panelini ASLA açmaz.
// Şifre, hatalı deneme kilidi ve 2FA aynı kurallarla işler.

const MAX_ATTEMPT = 5;
const BLOCK_MINUTES = 15;

export type PlatformUser = Pick<User, "id" | "role" | "fullName" | "tokenVersion" | "twoFactorEnabled">;

type Verified = { ok: true; user: User } | { ok: false; response: NextResponse };

export async function verifyPlatformCredentials(request: NextRequest, identityNo: string, password: string): Promise<Verified> {
  const attemptKey = `${getClientIpFromHeaders(request.headers)}:${identityNo}`;
  if (await isFailureBlocked(attemptKey, MAX_ATTEMPT)) {
    return { ok: false, response: NextResponse.json({ message: "Çok fazla hatalı deneme yapıldı. Lütfen daha sonra tekrar deneyin." }, { status: 429 }) };
  }

  const user = await prisma.user.findFirst({ where: { identityNo, role: "SUPERADMIN", isActive: true } });
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    await recordFailure(attemptKey, BLOCK_MINUTES * 60_000);
    return { ok: false, response: NextResponse.json({ message: "Kullanıcı adı veya şifre hatalı" }, { status: 401 }) };
  }

  await clearFailures(attemptKey);
  return { ok: true, user };
}

/** Platform oturumu (klinik_token çerezi): Platform Yönetimi ve kliniğe gizli girişten "panele dön" için. */
export async function startPlatformSession(user: PlatformUser, how: string) {
  const modules = DEFAULT_SUPERADMIN_MODULES;
  const token = signToken({
    userId: user.id,
    role: user.role,
    institutionId: null,
    fullName: user.fullName,
    superadminModules: modules,
    tokenVersion: user.tokenVersion,
  });
  await setAuthCookie(token);
  await writeAudit(user.id, "LOGIN", how, { id: user.id, role: "SUPERADMIN" });
  return modules;
}

export async function startPendingTwoFactor(user: PlatformUser) {
  const pendingToken = await signPendingTwoFactorToken(user.id);
  return NextResponse.json({ requiresTwoFactor: true, pendingToken });
}

function clinicNotFound(typed: string) {
  if (isPlatformLoginName(typed)) {
    return NextResponse.json(
      { message: "Bu ekrandan bir kliniğe girilir: kurum adı alanına kliniğin adını yazın. Platform yönetimi için /superadmin adresini kullanın." },
      { status: 400 },
    );
  }
  return NextResponse.json({ message: `"${typed.trim()}" adında bir klinik bulunamadı.` }, { status: 404 });
}

/**
 * Yazılan kliniğe gizli, tam yetkili girer. Yanıt, normal bir klinik girişi
 * gibi görünür (role YONETICI): ekran buna bakıp doğrudan klinik anasayfasına
 * gider; süperadmin paneline yönlendiren hiçbir alan taşımaz.
 */
async function enterClinic(user: PlatformUser, clinic: { id: string; name: string }, how: string) {
  const entry = await startSuperadminClinicSession({
    superadmin: { id: user.id, fullName: user.fullName },
    institutionId: clinic.id,
    source: "login",
  });
  if (!entry.ok) return NextResponse.json({ message: entry.message }, { status: entry.status });
  // Platform oturumu da açılır ki klinikteki "Platform paneline dön" çalışsın.
  await startPlatformSession(user, how);
  return NextResponse.json({
    id: user.id,
    fullName: user.fullName,
    role: "YONETICI",
    institutionId: entry.institutionId,
    clinic: { id: entry.institutionId, name: entry.institutionName },
  });
}

/** Klinik giriş ekranı: süperadmin kimliği + kurum adı. Şifre doğrulandıktan sonra klinik kontrol edilir (kurum adı sızdırılmaz). */
export async function superadminClinicLogin(
  request: NextRequest,
  input: { institution: string; identityNo: string; password: string },
) {
  const verified = await verifyPlatformCredentials(request, input.identityNo, input.password);
  if (!verified.ok) return verified.response;

  const clinic = isPlatformLoginName(input.institution) ? null : await findInstitutionByLoginName(input.institution);
  if (!clinic) return clinicNotFound(input.institution);

  // 2FA açıksa kod sonrası (superadmin/verify-2fa) aynı kliniğe girilir.
  if (verified.user.twoFactorEnabled) return startPendingTwoFactor(verified.user);

  return enterClinic(verified.user, clinic, "Superadmin klinik giris ekranindan giris yapti");
}

/**
 * Kimlik (ve varsa 2FA kodu) doğrulandıktan sonra son adım. Kurum adı yoksa
 * /superadmin ekranıdır → panel oturumu; varsa klinik giriş ekranıdır → klinik.
 */
export async function completePlatformLogin(user: PlatformUser, institutionInput: string, how: string) {
  if (!institutionInput.trim()) {
    const modules = await startPlatformSession(user, how);
    return NextResponse.json({ id: user.id, fullName: user.fullName, role: user.role, institutionId: null, modules });
  }
  const clinic = isPlatformLoginName(institutionInput) ? null : await findInstitutionByLoginName(institutionInput);
  if (!clinic) return clinicNotFound(institutionInput);
  return enterClinic(user, clinic, how);
}
