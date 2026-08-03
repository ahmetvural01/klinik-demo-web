import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { extractModuleFromPath, hasModuleAccess } from "@/lib/superadmin-modules";
import { metricIncrement } from "@/lib/metrics";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { parseRolePreview, ROLE_PREVIEW_COOKIE } from "@/lib/role-preview";

const TOKEN_NAME = "klinik_token";
const GHOST_TOKEN_NAME = "klinik_ghost_token";

const PUBLIC_PREFIXES = [
  "/",
  "/giris",
  "/klinik/giris",
  "/superadmin",
  "/api/auth/login",
  "/api/demo-requests",
  "/api/auth/superadmin/login",
  "/api/auth/superadmin/verify-2fa",
  "/api/auth/superadmin/impersonate",
  "/api/auth/logout",
  "/health",
  "/api/system/health",
  "/randevu-al",
  "/api/public/booking",
  "/sms-onay",
  "/api/public/sms-consent",
];

// Rol bazlı modül erişimi (DOKTOR/ASİSTAN/BANKO/MUHASEBE gibi klinik rollerinin
// hangi sayfa/API'ye erişebileceği) BURADA sabit kodlanmaz — tamamen
// src/lib/role-permissions.ts + role-permission-store.ts (Süperadmin > Rol
// Yetkileri ekranı) tarafından, her API route'undaki requireAuth(permission)
// çağrısıyla yönetilir. Önceden burada da sabit bir DOKTOR/ASİSTAN/BANKO/
// MUHASEBE sayfa/API engel listesi vardı; bu liste DB'deki yetki matrisiyle
// çakışabiliyordu (ör. MUHASEBE'ye Rol Yetkileri ekranından appointments:read
// verilse bile middleware /api/appointments'ı sabit olarak 403'lüyordu — bkz.
// denetim raporu). Middleware'de yalnızca GERÇEKTEN değiştirilemez, rol
// bazında değil sabit güvenlik kuralları kalır: oturum doğrulama, public/
// private rota ayrımı ve süperadmin'in kendi modül erişim kısıtlaması
// (superadmin-modules.ts — bu platform operatörünün KENDİ hesabına uygulanan
// ayrı bir mekanizma, klinik rol yetkileriyle ilgisi yok). Sayfa/API bazlı
// asıl yetki reddi artık her zaman requireAuth() içinden, Türkçe ve anlaşılır
// bir mesajla (`{"message": "Bu işlem için yetkiniz yok."}`, 403) döner.

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  if (pathname === "/superadmin") return true;
  return PUBLIC_PREFIXES.some((p) => p !== "/" && p !== "/superadmin" && pathname.startsWith(p));
}

function isSuperadminSurfacePath(pathname: string) {
  return (
    pathname.startsWith("/superadmin") ||
    pathname.startsWith("/api/superadmin") ||
    pathname.startsWith("/api/auth/superadmin")
  );
}

// src/lib/auth.ts'teki readAuthToken() ghost/klinik_token seçimini rotaya
// göre yapabilmek için pathname'e ihtiyaç duyuyor (Route Handler'lara
// pathname doğrudan verilmiyor) — bu yüzden istek buradan geçerken bir
// header olarak taşınır. Her NextResponse.next() çağrısında uygulanmalı.
function withPathnameHeader(request: NextRequest, pathname: string) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
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
    return withPathnameHeader(request, pathname);
  }

  // Ghost (süperadmin gizli klinik girişi) ayrı bir çerezde taşınır ve
  // yalnızca KLİNİK yüzeyinde (süperadmin rotaları HARİÇ) önceliklidir —
  // böylece süperadmin'in kendi /superadmin sekmesi, başka bir sekmede
  // açılan ghost oturumundan etkilenmez (bkz. src/lib/auth.ts notu).
  const token = !isSuperadminSurfacePath(pathname)
    ? (request.cookies.get(GHOST_TOKEN_NAME)?.value || request.cookies.get(TOKEN_NAME)?.value)
    : request.cookies.get(TOKEN_NAME)?.value;

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

  // Sayfa yetkilendirmesi yalnızca imzası doğrulanmış JWT ile yapılır.
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET tanımlı değil");
    const verified = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    const payload = verified.payload as {
      role?: string;
      superadminModules?: string[];
    };
    const previewRole = payload.role === "SUPERADMIN"
      ? parseRolePreview(request.cookies.get(ROLE_PREVIEW_COOKIE)?.value)
      : null;
    const effectiveRole = previewRole || payload.role;

    if (
      effectiveRole === "SUPERADMIN" &&
      pathname !== "/superadmin/yetki-yok" &&
      pathname !== "/api/auth/superadmin/permissions"
    ) {
      const requiredModule = extractModuleFromPath(pathname);
      // Süperadmin yüzeyindeki (/superadmin veya /api/superadmin altındaki) bir
      // sayfa/route superadmin-modules.ts'teki MODULE_ROUTE_RULES'a kaydedilmeyi
      // unutursa, extractModuleFromPath null döner ve modül kısıtlaması hiç
      // UYGULANMAZ (fail-open) — kısıtlı bir süperadmin hesabı o route'a modülü
      // kapalı olsa bile erişebilirdi (bkz. denetim raporu). Bu yüzden süperadmin
      // yüzeyinde eşleşmeyen bir route varsayılan olarak REDDEDİLİR; yeni bir
      // route eklerken MODULE_ROUTE_RULES'a kaydedilmesi zorunlu hale gelir.
      const isSuperadminSurface = pathname.startsWith("/superadmin/") || pathname.startsWith("/api/superadmin/");
      if (isSuperadminSurface && !requiredModule) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ message: "Bu modüle erişim yetkiniz yok" }, { status: 403 });
        }
        return NextResponse.redirect(new URL("/superadmin/yetki-yok", request.url));
      }
      if (requiredModule && !hasModuleAccess(payload.superadminModules, requiredModule)) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ message: "Bu modüle erişim yetkiniz yok" }, { status: 403 });
        }
        return NextResponse.redirect(new URL("/superadmin/yetki-yok", request.url));
      }
    }

    // Rol bazlı sayfa/API yetkilendirmesi artık BURADA yapılmaz — her API
    // route'u kendi requireAuth(permission) çağrısıyla DB tabanlı yetki
    // matrisine göre karar verir (bkz. yukarıdaki not). Sayfa linki zaten
    // yalnızca yetkili roller için menüde görünür; doğrudan URL ile girilirse
    // sayfanın kendi veri çağrıları aynı requireAuth() kontrolünden 403 alır.

  } catch {
    metricIncrement("auth_failures_total");
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ message: "Oturum geçersiz" }, { status: 401 });
    }
    const response = NextResponse.redirect(new URL("/klinik/giris", request.url));
    response.cookies.delete(TOKEN_NAME);
    response.cookies.delete(GHOST_TOKEN_NAME);
    return response;
  }

  return withPathnameHeader(request, pathname);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
