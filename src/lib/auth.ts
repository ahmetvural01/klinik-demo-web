import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const TOKEN_NAME = "klinik_token";

function readAuthToken() {
  try {
    return cookies().get(TOKEN_NAME)?.value || null;
  } catch {
    return null;
  }
}

export type AuthPayload = {
  userId: string;
  role: string;
  institutionId: string | null;
  fullName?: string;
  superadminModules?: string[];
  /** Superadmin gizli giriş — log kaydı atılmaz */
  ghost?: boolean;
  /**
   * Süperadmin için 2FA henüz kurulmamış — bu oturum SADECE 2FA kurulum
   * uçlarına erişebilir (bkz. middleware.ts). Süperadmin hesapları en
   * yetkili hesaplar olduğu için 2FA zorunludur; kurulum tamamlanınca
   * (profile/2fa/confirm) bu claim olmadan tam yetkili bir token yeniden
   * imzalanır.
   */
  mustSetup2fa?: boolean;
};

export function getVisibleRole(role: string) {
  return role === "SUPERADMIN" ? "YONETICI" : role;
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: AuthPayload) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET tanımlı değil");
  }

  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

type PendingTwoFactorPayload = { userId: string; purpose: "2fa-pending" };

/** Şifre doğrulandı ama 2FA kodu henüz girilmedi — kısa ömürlü, oturum açmaya yetmez. */
export function signPendingTwoFactorToken(userId: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET tanımlı değil");
  return jwt.sign({ userId, purpose: "2fa-pending" } satisfies PendingTwoFactorPayload, secret, { expiresIn: "5m" });
}

export function verifyPendingTwoFactorToken(token: string): string | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET tanımlı değil");
  try {
    const payload = jwt.verify(token, secret) as PendingTwoFactorPayload;
    if (payload.purpose !== "2fa-pending") return null;
    return payload.userId;
  } catch {
    return null;
  }
}

export function verifyToken(token: string) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET tanımlı değil");
  }

  return jwt.verify(token, secret) as AuthPayload;
}

export async function getCurrentUser() {
  const token = readAuthToken();

  if (!token) {
    return null;
  }

  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { profile: true }
    });

    if (!user || !user.isActive) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

/**
 * JWT token'dan DB sorgusu yapmadan kullanıcı bilgilerini çöz.
 * requireAuth için yeterli: id, role, institutionId.
 */
export function decodeTokenUser(): { id: string; role: string; institutionId: string | null; fullName: string; superadminModules?: string[]; ghost?: boolean; mustSetup2fa?: boolean } | null {
  const token = readAuthToken();
  if (!token) return null;
  try {
    return decodeTokenUserFromToken(token);
  } catch {
    return null;
  }
}

export function decodeTokenUserFromToken(token: string): { id: string; role: string; institutionId: string | null; fullName: string; superadminModules?: string[]; ghost?: boolean; mustSetup2fa?: boolean } | null {
  try {
    const payload = verifyToken(token);
    return {
      id: payload.userId,
      role: payload.role,
      institutionId: payload.institutionId,
      fullName: payload.fullName || "",
      superadminModules: payload.superadminModules,
      ghost: payload.ghost ?? false,
      mustSetup2fa: payload.mustSetup2fa ?? false,
    };
  } catch {
    return null;
  }
}

/** JWT'den DB sorgusu yapmadan kullanıcı bilgilerini al (layout için hızlı) */
export function getCurrentUserFast(): { id: string; role: string; rawRole: string; institution: string; fullName: string } | null {
  const token = readAuthToken();
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    return {
      id: payload.userId,
      role: getVisibleRole(payload.role),
      rawRole: payload.role,
      institution: payload.institutionId ?? "",
      fullName: payload.fullName || "",
    };
  } catch {
    return null;
  }
}

export function setAuthCookie(token: string) {
  cookies().set(TOKEN_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export function clearAuthCookie() {
  cookies().set(TOKEN_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}
