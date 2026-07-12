import { NextRequest, NextResponse } from "next/server";
import { extractModuleFromPath, hasModuleAccess } from "@/lib/superadmin-modules";
import { metricIncrement } from "@/lib/metrics";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";

const TOKEN_NAME = "klinik_token";

const PUBLIC_PREFIXES = [
  "/",
  "/giris",
  "/klinik/giris",
  "/superadmin",
  "/api/auth/login",
  "/api/demo-requests",
  "/api/auth/superadmin/login",
  "/api/auth/superadmin/impersonate",
  "/api/auth/logout",
  "/api/system/health",
  "/randevu-al",
  "/api/public/booking",
];

// Rol bazlı sayfa erişim haritası
// Her rol için erişilemeyen sayfa prefix'leri
const ROLE_DENIED_PAGES: Record<string, string[]> = {
  DOKTOR: [
    "/muhasebe", "/kasa", "/gider", "/firma", "/firma-detay", "/stok",
    "/rapor", "/personel", "/personel-ekle", "/ayar", "/log",
    "/fiyat", "/sms", "/taksit", "/dashboard",
  ],
  ASISTAN: [
    "/muhasebe", "/kasa", "/gider", "/firma", "/firma-detay", "/stok",
    "/rapor", "/personel", "/personel-ekle", "/ayar", "/log",
    "/fiyat", "/finans", "/muayene", "/taksit", "/dashboard",
  ],
  BANKO: [
    "/gider", "/firma", "/firma-detay", "/stok", "/rapor",
    "/personel", "/personel-ekle", "/ayar", "/log",
    "/fiyat", "/finans", "/tedavi-plani",
    "/lab", "/muayene", "/recete", "/dashboard",
  ],
  MUHASEBE: [
    "/personel", "/personel-ekle", "/ayar", "/log",
    "/randevu", "/hasta", "/hasta-detay", "/hasta-ekle",
    "/hasta-takip", "/tedavi-plani", "/lab", "/muayene",
    "/recete", "/dashboard",
  ],
};

// API rol kısıtlamaları: hangi API prefix'leri hangi roller için yasak
const API_ROLE_DENIED: Record<string, string[]> = {
  DOKTOR:   ["/api/gider", "/api/firma", "/api/purchases", "/api/kasa", "/api/stock", "/api/muhasebe", "/api/reports", "/api/settings", "/api/logs", "/api/sms", "/api/prices", "/api/taksit-plani"],
  ASISTAN:  ["/api/gider", "/api/firma", "/api/purchases", "/api/kasa", "/api/stock", "/api/muhasebe", "/api/reports", "/api/settings", "/api/logs", "/api/finance", "/api/sms", "/api/taksit-plani"],
  // NOT: /api/examinations ASISTAN için izinli — requireAuth("examinations:read") ile GET, requireAuth("examinations:write") ile POST kontrolü yapılır
  BANKO:    ["/api/gider", "/api/firma", "/api/purchases", "/api/stock", "/api/muhasebe/trend", "/api/reports", "/api/settings", "/api/logs", "/api/finance", "/api/prices", "/api/lab-orders", "/api/treatment-plans", "/api/examinations", "/api/prescriptions"],
  MUHASEBE: ["/api/settings", "/api/logs", "/api/appointments", "/api/patients", "/api/examinations", "/api/treatment-plans", "/api/lab-orders", "/api/prescriptions"],
};

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  if (pathname === "/superadmin") return true;
  return PUBLIC_PREFIXES.some((p) => p !== "/" && p !== "/superadmin" && pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  metricIncrement("api_requests_total");
  const { pathname } = request.nextUrl;
  const ip = getClientIpFromHeaders(request.headers);

  if (pathname.startsWith("/api/")) {
    const limit = checkRateLimit(`mw:${ip}`, 400, 60_000);
    if (!limit.ok) {
      metricIncrement("rate_limit_hits_total");
      return NextResponse.json({ message: "Çok fazla istek gönderildi. Lütfen kısa bir süre sonra tekrar deneyin." }, { status: 429 });
    }
  }

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
    metricIncrement("auth_failures_total");
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
      metricIncrement("auth_failures_total");
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

    // Rol bazlı sayfa & API erişim kontrolü (SUPERADMIN ve YONETICI hariç)
    const role = payload.role;
    if (role && role !== "SUPERADMIN" && role !== "YONETICI") {
      // Sayfa erişim kontrolü
      if (!pathname.startsWith("/api/")) {
        const denied = ROLE_DENIED_PAGES[role] ?? [];
        if (denied.some(p => pathname === p || pathname.startsWith(p + "/"))) {
          return NextResponse.redirect(new URL("/yetkisiz", request.url));
        }
      }
      // API erişim kontrolü
      if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
        const deniedApis = API_ROLE_DENIED[role] ?? [];
        if (deniedApis.some(p => pathname === p || pathname.startsWith(p + "/"))) {
          return NextResponse.json({ message: "Bu işlem için yetkiniz yok." }, { status: 403 });
        }
      }
    }
  } catch {
    metricIncrement("auth_failures_total");
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
