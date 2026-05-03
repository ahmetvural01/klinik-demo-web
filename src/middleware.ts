import { NextRequest, NextResponse } from "next/server";
import { extractModuleFromPath, hasModuleAccess } from "@/lib/superadmin-modules";

const TOKEN_NAME = "klinik_token";

const PUBLIC_PREFIXES = [
  "/",
  "/giris",
  "/klinik/giris",
  "/superadmin",
  "/api/auth/login",
  "/api/auth/superadmin/login",
  "/api/auth/superadmin/impersonate",
  "/api/auth/logout",
];

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  if (pathname === "/superadmin") return true;
  return PUBLIC_PREFIXES.some((p) => p !== "/" && p !== "/superadmin" && pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(TOKEN_NAME)?.value;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ message: "Oturum gerekli" }, { status: 401 });
    }
    if (pathname.startsWith("/superadmin")) {
      return NextResponse.redirect(new URL("/superadmin", request.url));
    }
    return NextResponse.redirect(new URL("/klinik/giris", request.url));
  }

  // JWT yapısı: header.payload.signature — decode ederek exp kontrolü
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("invalid");

    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: number;
      role?: string;
      superadminModules?: string[];
    };

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      // Token süresi dolmuş
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ message: "Oturum süresi doldu" }, { status: 401 });
      }
      const response = NextResponse.redirect(new URL("/klinik/giris", request.url));
      response.cookies.delete(TOKEN_NAME);
      return response;
    }

    if (
      payload.role === "SUPERADMIN" &&
      pathname !== "/superadmin/yetki-yok" &&
      pathname !== "/api/auth/superadmin/permissions"
    ) {
      const requiredModule = extractModuleFromPath(pathname);
      if (requiredModule && !hasModuleAccess(payload.superadminModules, requiredModule)) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ message: "Bu modüle erişim yetkiniz yok" }, { status: 403 });
        }
        return NextResponse.redirect(new URL("/superadmin/yetki-yok", request.url));
      }
    }
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ message: "Oturum geçersiz" }, { status: 401 });
    }
    const response = NextResponse.redirect(new URL("/klinik/giris", request.url));
    response.cookies.delete(TOKEN_NAME);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
