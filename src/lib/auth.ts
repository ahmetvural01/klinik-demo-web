import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";

const TOKEN_NAME = "klinik_token";
const ROLE_PREVIEW_COOKIE = "klinik_preview_role";
// Ghost (süperadmin'in gizli klinik girişi) AYRI bir çerezde taşınır.
// Önceden impersonate, tek paylaşılan `klinik_token` çerezinin üzerine
// yazıyordu — süperadmin yeni bir sekmede "Kliniğe Gir"e bastığı an, aynı
// tarayıcıdaki KENDİ açık /superadmin sekmesi de anında ghost kimliğine
// dönüp oturumdan düşüyordu (çerezler sekmeye özel değil, origin'e özeldir).
// Çözüm: iki ayrı çerez + rota bazlı öncelik. /superadmin ve /api/superadmin
// (ve süperadmin auth uçları) HER ZAMAN klinik_token'ı (gerçek süperadmin
// kimliği) kullanır; bunun dışındaki (klinik paneli) rotalar ghost çerezi
// varsa onu önceliklendirir. Böylece süperadmin'in kendi sekmesi asla
// etkilenmez, ghost sekmesi de kendi kimliğini korur — bkz. middleware.ts
// (x-pathname header'ı) ve src/app/api/auth/superadmin/impersonate,
// src/app/api/auth/superadmin/exit-ghost.
const GHOST_TOKEN_NAME = "klinik_ghost_token";

function isSuperadminSurfacePath(pathname: string) {
  return (
    pathname.startsWith("/superadmin") ||
    pathname.startsWith("/api/superadmin") ||
    pathname.startsWith("/api/auth/superadmin")
  );
}

async function readAuthToken() {
  try {
    const store = await cookies();
    let pathname = "";
    try {
      pathname = (await headers()).get("x-pathname") || "";
    } catch {
      // İstek bağlamı dışında (ör. arka plan işleri) — sessizce klinik_token'a düş
    }
    if (!isSuperadminSurfacePath(pathname)) {
      const ghost = store.get(GHOST_TOKEN_NAME)?.value;
      if (ghost) return ghost;
    }
    return store.get(TOKEN_NAME)?.value || null;
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
  /** Sunucu taraflı oturum iptali için — bkz. requireAuth() ve User.tokenVersion */
  tokenVersion?: number;
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
  const token = await readAuthToken();

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
    if (payload.tokenVersion !== undefined && payload.tokenVersion !== user.tokenVersion) {
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
export async function decodeTokenUser(): Promise<{ id: string; role: string; institutionId: string | null; fullName: string; superadminModules?: string[]; ghost?: boolean; tokenVersion?: number } | null> {
  const token = await readAuthToken();
  if (!token) return null;
  try {
    return decodeTokenUserFromToken(token);
  } catch {
    return null;
  }
}

export function decodeTokenUserFromToken(token: string): { id: string; role: string; institutionId: string | null; fullName: string; superadminModules?: string[]; ghost?: boolean; tokenVersion?: number } | null {
  try {
    const payload = verifyToken(token);
    return {
      id: payload.userId,
      role: payload.role,
      institutionId: payload.institutionId,
      fullName: payload.fullName || "",
      superadminModules: payload.superadminModules,
      ghost: payload.ghost ?? false,
      tokenVersion: payload.tokenVersion,
    };
  } catch {
    return null;
  }
}

/** JWT'den DB sorgusu yapmadan kullanıcı bilgilerini al (layout için hızlı) */
export async function getCurrentUserFast(): Promise<{ id: string; role: string; rawRole: string; institution: string; fullName: string; ghost: boolean } | null> {
  const token = await readAuthToken();
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    return {
      id: payload.userId,
      role: getVisibleRole(payload.role),
      rawRole: payload.role,
      institution: payload.institutionId ?? "",
      fullName: payload.fullName || "",
      ghost: payload.ghost ?? false,
    };
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string) {
  (await cookies()).set(TOKEN_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.set(TOKEN_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
  cookieStore.set(ROLE_PREVIEW_COOKIE, "", {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  // Gerçek çıkışta bir ghost oturumu da varsa temizlenir — aksi halde
  // sonraki girişte artık geçersiz/beklenmeyen bir ghost çerezi kalabilirdi.
  cookieStore.set(GHOST_TOKEN_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** Ghost (süperadmin gizli klinik girişi) oturumu — bkz. GHOST_TOKEN_NAME notu. */
export async function setGhostAuthCookie(token: string) {
  (await cookies()).set(GHOST_TOKEN_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

/** Ghost modundan çık — yalnızca ghost çerezi silinir, süperadmin'in kendi klinik_token'ı dokunulmadan kalır. */
export async function clearGhostAuthCookie() {
  (await cookies()).set(GHOST_TOKEN_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
