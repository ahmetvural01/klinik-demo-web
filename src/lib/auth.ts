import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const TOKEN_NAME = "klinik_token";

export type AuthPayload = {
  userId: string;
  role: string;
  institutionId: string | null;
  fullName?: string;
  superadminModules?: string[];
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
    throw new Error("JWT_SECRET tanimli degil");
  }

  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export function verifyToken(token: string) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET tanimli degil");
  }

  return jwt.verify(token, secret) as AuthPayload;
}

export async function getCurrentUser() {
  const token = cookies().get(TOKEN_NAME)?.value;

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
export function decodeTokenUser(): { id: string; role: string; institutionId: string | null; fullName: string; superadminModules?: string[] } | null {
  const token = cookies().get(TOKEN_NAME)?.value;
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    return {
      id: payload.userId,
      role: payload.role,
      institutionId: payload.institutionId,
      fullName: payload.fullName || "",
      superadminModules: payload.superadminModules,
    };
  } catch {
    return null;
  }
}

/** JWT'den DB sorgusu yapmadan kullanıcı bilgilerini al (layout için hızlı) */
export function getCurrentUserFast(): { id: string; role: string; institution: string; fullName: string } | null {
  const token = cookies().get(TOKEN_NAME)?.value;
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    return {
      id: payload.userId,
      role: getVisibleRole(payload.role),
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
