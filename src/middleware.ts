import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { metricIncrement } from "@/lib/metrics";
import { checkLocalRateLimit, getClientIpFromHeaders } from "@/lib/edge-rate-limit";

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
// private rota ayrımı. Sayfa/API bazlı
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

// Oturumu olmayan ya da biten klinik sayfa isteği giriş ekranına gider; açılmak
// istenen adres `next` ile taşınır ki girişten sonra kaldığı yere dönülsün.
// Next.js'in iç `_rsc` parametresi adrese yazılmaz. Giriş formu `next`'i yalnız
// güvenli bir panel yoluysa kullanır (clinic-login-form.tsx).
function clinicLoginRedirect(request: NextRequest) {
  const target = new URL("/klinik/giris", request.url);
  const params = new URLSearchParams(request.nextUrl.search);
  params.delete("_rsc");
  const query = params.toString();
  target.searchParams.set("next", `${request.nextUrl.pathname}${query ? `?${query}` : ""}`);
  target.searchParams.set("neden", "oturum");
  return NextResponse.redirect(target);
}

// API hız sınırı. Önceden yalnız IP başına dakikada 400 istekti; oysa bir
// klinikteki tüm bilgisayarlar genelde AYNI dış IP'yi paylaşır. Birkaç
// personelin açık sekmeleri (yoklamalar, sayfa açılışları, gerçek zamanlı
// yenilemeler) bu ortak kovayı doldurunca o dakikanın geri kalanında herkesin
// ekranı 429 alıp boş/bozuk açılıyordu. Artık imzası doğrulanmış oturumda
// sınır KULLANICI başınadır; IP için yalnız yüksek bir taşkın tavanı kalır.
// Oturumsuz istekler (giriş, herkese açık uçlar) eskisi gibi IP başına sınırlı.
const API_LIMIT_WINDOW_MS = 60_000;
const ANON_API_LIMIT_PER_IP = 400;
const USER_API_LIMIT = 600;
const IP_API_CEILING = 4000;

// Ghost (süperadmin gizli klinik girişi) ayrı bir çerezde taşınır ve
// yalnızca KLİNİK yüzeyinde (süperadmin rotaları HARİÇ) önceliklidir —
// böylece süperadmin'in kendi /superadmin sekmesi, başka bir sekmede
// açılan ghost oturumundan etkilenmez (bkz. src/lib/auth.ts notu).
function readSessionToken(request: NextRequest, pathname: string) {
  return !isSuperadminSurfacePath(pathname)
    ? (request.cookies.get(GHOST_TOKEN_NAME)?.value || request.cookies.get(TOKEN_NAME)?.value)
    : request.cookies.get(TOKEN_NAME)?.value;
}

type VerifiedSession = { userId: string | null; ghost: boolean } | null;

async function verifySessionToken(token: string): Promise<VerifiedSession> {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET tanımlı değil");
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    return {
      userId: typeof payload.userId === "string" ? payload.userId : null,
      ghost: payload.ghost === true,
    };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  metricIncrement("api_requests_total");
  const { pathname } = request.nextUrl;
  const ip = getClientIpFromHeaders(request.headers);
  const token = readSessionToken(request, pathname);
  // JWT her istekte en fazla bir kez doğrulanır (hız sınırı + oturum kontrolü ortak).
  let verified: VerifiedSession | undefined;
  const verifyOnce = async () => {
    if (verified === undefined) verified = token ? await verifySessionToken(token) : null;
    return verified;
  };

  if (pathname.startsWith("/api/")) {
    const session = await verifyOnce();
    const allowed = session?.userId
      ? checkLocalRateLimit(`mw:u:${session.userId}${session.ghost ? ":g" : ""}`, USER_API_LIMIT, API_LIMIT_WINDOW_MS).ok
        && checkLocalRateLimit(`mw:ipmax:${ip}`, IP_API_CEILING, API_LIMIT_WINDOW_MS).ok
      : checkLocalRateLimit(`mw:${ip}`, ANON_API_LIMIT_PER_IP, API_LIMIT_WINDOW_MS).ok;
    if (!allowed) {
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

  if (!token) {
    metricIncrement("auth_failures_total");
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ message: "Oturum gerekli" }, { status: 401 });
    }
    if (pathname.startsWith("/superadmin")) {
      return NextResponse.redirect(new URL("/superadmin", request.url));
    }
    return clinicLoginRedirect(request);
  }

  // Sayfa yetkilendirmesi yalnızca imzası doğrulanmış JWT ile yapılır.
  // Rol bazlı sayfa/API yetkilendirmesi artık BURADA yapılmaz — her API
  // route'u kendi requireAuth(permission) çağrısıyla DB tabanlı yetki
  // matrisine göre karar verir (bkz. yukarıdaki not). Sayfa linki zaten
  // yalnızca yetkili roller için menüde görünür; doğrudan URL ile girilirse
  // sayfanın kendi veri çağrıları aynı requireAuth() kontrolünden 403 alır.
  const session = await verifyOnce();
  if (!session) {
    metricIncrement("auth_failures_total");
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ message: "Oturum geçersiz" }, { status: 401 });
    }
    // /superadmin altındaki bozuk oturum eskisi gibi düz giriş ekranına gider.
    const response = pathname.startsWith("/superadmin")
      ? NextResponse.redirect(new URL("/klinik/giris", request.url))
      : clinicLoginRedirect(request);
    response.cookies.delete(TOKEN_NAME);
    response.cookies.delete(GHOST_TOKEN_NAME);
    return response;
  }

  return withPathnameHeader(request, pathname);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
