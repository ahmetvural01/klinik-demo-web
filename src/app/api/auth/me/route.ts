import { NextRequest, NextResponse } from "next/server";
import { getVisibleRole } from "@/lib/auth";
import { requireAuth, requireSuperadmin } from "@/lib/api";
import { getPermissionMap } from "@/lib/role-permission-store";
import type { Role } from "@prisma/client";
import { getBranchScopedPermissions } from "@/lib/branch-context";

export const dynamic = "force-dynamic";

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
    const permissions = getBranchScopedPermissions(
      auth.user.branchContext,
      permissionMap[auth.user.role as Role] || [],
      Boolean(auth.user.ghost),
    );
    return NextResponse.json({
      id: auth.user.id,
      fullName: auth.user.fullName,
      role: auth.user.role,
      institutionId: auth.user.institutionId,
      activeBranchId: auth.user.branchContext.activeBranchId,
      scopeKey: `${auth.user.id}:${auth.user.institutionId || "platform"}:${auth.user.branchContext.activeBranchId || "none"}`,
      permissions,
    });
  }

  const auth = await requireSuperadmin();
  if (auth.error) return auth.error;
  const user = auth.user;
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
