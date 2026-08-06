import { NextRequest, NextResponse } from "next/server";
import { decodeTokenUserFromToken, getVisibleRole } from "@/lib/auth";
import { requireAuth } from "@/lib/api";
import { getPermissionMap } from "@/lib/role-permission-store";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

function readCookie(headers: Headers, name: string) {
  const raw = headers.get("cookie") || "";
  const parts = raw.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function isSuperadminCaller(request: NextRequest) {
  // Bu uç hem /superadmin sayfalarından hem klinik panelinden çağrılan
  // paylaşılan bir endpoint — istek path'inin kendisi (/api/auth/me) hangi
  // sayfanın çağırdığını söylemez. Referer HEADER'I GÜVENLİK SINIRI OLARAK
  // KULLANILMAZ — tarayıcı gizlilik ayarları veya Referrer-Policy nedeniyle
  // eksik/boş gelebilir. Bilinen 3 süperadmin çağrı noktası (bkz.
  // src/app/superadmin/{institutions,institutions/[id],panel}/page.tsx)
  // artık açık bir ?surface=superadmin query param'ı ile isteği işaretler;
  // bu, tarayıcı davranışına bağlı olmayan GÜVENİLİR birincil sinyaldir.
  // Referer yalnızca bu param'ı göndermeyen olası başka çağrılar için son
  // çare (best-effort) bir ikincil sinyal olarak kalır — eksik olması hiçbir
  // yetki yükselmesine yol açmaz, çünkü gerçek yetkilendirme her zaman
  // middleware.ts'teki pathname bazlı kurala göre yapılır (bkz. o dosyadaki
  // not); bu fonksiyon yalnızca /api/auth/me'nin kimlik GÖRÜNTÜLEME
  // seçimini etkiler.
  if (request.nextUrl.searchParams.get("surface") === "superadmin") return true;
  try {
    const referer = request.headers.get("referer");
    if (!referer) return false;
    return new URL(referer).pathname.startsWith("/superadmin");
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!isSuperadminCaller(request)) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const permissionMap = await getPermissionMap();
    const permissions = auth.user.ghost ? ["*"] : (permissionMap[auth.user.role as Role] || []);
    return NextResponse.json({
      id: auth.user.id,
      fullName: auth.user.fullName,
      role: auth.user.role,
      actualRole: auth.user.actualRole,
      institutionId: auth.user.institutionId,
      permissions,
    });
  }

  const token = readCookie(request.headers, "klinik_token");
  const user = token ? decodeTokenUserFromToken(token) : null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // SUPERADMIN rolü olduğu gibi döndürülür (superadmin panel sayfaları bu değeri kontrol eder)
  // Klinik panel kullanıcıları için getVisibleRole uygulanır
  const role = user.role === "SUPERADMIN" ? "SUPERADMIN" : getVisibleRole(user.role);
  return NextResponse.json({
    id: user.id,
    fullName: user.fullName,
    role,
    institutionId: user.institutionId,
    superadminModules: user.superadminModules ?? null,
    permissions: ["*"],
  });
}
