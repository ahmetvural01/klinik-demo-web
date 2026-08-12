import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { decodeTokenUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { metricObserve } from "@/lib/metrics";
import { parseRolePreview, ROLE_PREVIEW_COOKIE } from "@/lib/role-preview";
import { hasBranchPermission, resolveBranchContext } from "@/lib/branch-context";
import { getClientIpFromHeaders } from "@/lib/edge-rate-limit";
import {
  bumpRealtimeInstitution as bumpRealtimeInstitutionBus,
  getRealtimeInstitutionVersion as getRealtimeInstitutionVersionBus,
  subscribeRealtimeInstitution as subscribeRealtimeInstitutionBus,
} from "@/lib/realtime-bus";

// ── Rota bazlı gecikme ölçümü ────────────────────────────────────────────────
// login dışındaki endpoint'lerde hiç latency ölçümü yoktu; /sistem-izleme'deki
// "API gecikmesi yüksek" uyarısı bu yüzden sadece login'i izliyordu. Bilinen en
// riskli (büyüyen tablo/aggregate) route'lara sarılarak gelecekteki bir
// regresyonun sessizce donmaya dönüşmeden önce alarmda görünmesi sağlanıyor.
export function withApiTiming<Args extends unknown[]>(
  routeName: string,
  handler: (...args: Args) => Promise<NextResponse>
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    const started = Date.now();
    try {
      return await handler(...args);
    } finally {
      metricObserve(`api_request_ms:${routeName}`, Date.now() - started);
    }
  };
}

async function getUserSessionState(userId: string): Promise<{ isActive: boolean; tokenVersion: number }> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, tokenVersion: true },
  });
  return { isActive: row?.isActive ?? false, tokenVersion: row?.tokenVersion ?? 0 };
}

/**
 * Şifre değiştirme gibi tokenVersion'ı artıran işlemlerden hemen sonra
 * çağrılır — aksi halde bu kullanıcı için 60 saniyelik cache'te duran ESKİ
 * tokenVersion, aynı istekte hemen ardından imzalanan YENİ (artırılmış)
 * token ile eşleşmeyip kullanıcıyı anında "oturum sona erdi" hatasıyla
 * kendi işlemiyle dışarı atardı.
 */
export function invalidateUserSessionCache(userId: string) {
  void userId;
}

export function invalidateInstitutionCache(institutionId?: string | null) {
  void institutionId;
}

export function getRealtimeInstitutionVersion(institutionId?: string | null) {
  return getRealtimeInstitutionVersionBus(institutionId);
}

export function subscribeRealtimeInstitution(
  institutionId: string | null | undefined,
  listener: (payload: { institutionId: string; version: number; at: string }) => void,
) {
  return subscribeRealtimeInstitutionBus(institutionId, listener);
}

export function bumpRealtimeInstitution(institutionId?: string | null) {
  return bumpRealtimeInstitutionBus(institutionId);
}

async function getInstitutionState(institutionId: string) {
  return prisma.institution.findUnique({
    where: { id: institutionId },
    select: {
      isActive: true,
      serviceMode: true,
      serviceNote: true,
      throttleMs: true,
      paymentGraceUntil: true,
      suspendedUntil: true,
      isDemo: true,
      demoExpiresAt: true,
    },
  });

}

// "write" kelimesi geçen izinlerin yanı sıra, veri değiştiren TÜM eylem
// soneklerini kapsar. Önceden yalnızca ":write" kontrol ediliyordu — bu
// yüzden READ_ONLY moddaki bir kurumda "appointments:delete",
// "payments:refund", "examinations:delete", "patients:merge" gibi TÜM
// silme/onay/iade/birleştirme uçları hâlâ çalışıyordu; "yazma işlemleri
// kapatıldı" mesajı yanıltıcıydı (bkz. denetim raporu).
const MUTATING_PERMISSION_SUFFIXES = new Set([
  "write", "delete", "approve", "refund", "merge", "complete", "bulk", "close", "schedule",
]);

function isWritePermission(permission?: string) {
  if (!permission) return false;
  if (permission === "*") return true;
  const suffix = permission.slice(permission.indexOf(":") + 1);
  return MUTATING_PERMISSION_SUFFIXES.has(suffix);
}

// LIMITED mod yalnızca 5 sabit izni engelliyordu — muayene, tedavi, reçete,
// laboratuvar, röntgen, taksit, stok, doküman gibi ana klinik iş akışının
// GERÇEK çekirdeği bu listede hiç yoktu ve LIMITED modda serbest kalıyordu
// (bkz. denetim raporu). Artık aynı "değiştirici eylem" soneklerine sahip
// TÜM ana klinik/finans/personel modülleri kısıtlanır; sistem ayarları,
// profil ve dahili mesajlaşma gibi düşük riskli modüller etkilenmez.
const LIMITED_BLOCKED_PREFIXES = new Set([
  "appointments", "payments", "patients", "finance", "staff",
  "examinations", "treatment", "prescriptions", "lab", "xray",
  "installments", "stock", "documents", "hastatracking",
]);

function isLimitedBlockedPermission(permission?: string) {
  if (!permission) return false;
  if (permission === "*") return true;
  const separatorIdx = permission.indexOf(":");
  if (separatorIdx === -1) return false;
  const prefix = permission.slice(0, separatorIdx);
  const suffix = permission.slice(separatorIdx + 1);
  return LIMITED_BLOCKED_PREFIXES.has(prefix) && MUTATING_PERMISSION_SUFFIXES.has(suffix);
}

export async function requireAuth(permission?: string) {
  // JWT çözümleme — DB sorgusu yok
  const tokenUser = await decodeTokenUser();

  if (!tokenUser) {
    return { error: NextResponse.json({ message: "Oturum gerekli" }, { status: 401 }) };
  }

  // Rol önizlemesi yalnız klinik yüzeyini simüle eder. Platform yönetim
  // uçlarında bu cookie sistem sahibinin gerçek yetkisini daraltmamalıdır.
  const previewRole = tokenUser.role === "SUPERADMIN" && permission !== "superadmin"
    ? parseRolePreview((await cookies()).get(ROLE_PREVIEW_COOKIE)?.value)
    : null;
  // Önizleme yalnızca doğrulanmış SUPERADMIN oturumunu daraltır. İstemci
  // cookie'si normal bir kullanıcıya ek yetki kazandıramaz.
  const user = previewRole
    ? { ...tokenUser, role: previewRole, ghost: false, actualRole: tokenUser.role }
    : { ...tokenUser, actualRole: tokenUser.role };

  const sessionState = await getUserSessionState(user.id);
  if (!sessionState.isActive) {
    return { error: NextResponse.json({ message: "Hesabınız pasifleştirilmiş. Lütfen yöneticinizle iletişime geçin." }, { status: 401 }) };
  }
  // Şifre değiştirildiğinde veya "diğer tüm cihazlardan çıkış yap"
  // kullanıldığında tokenVersion artırılır — eldeki eski token artık
  // reddedilir (bkz. src/lib/auth.ts AuthPayload.tokenVersion).
  if (user.tokenVersion !== undefined && user.tokenVersion !== sessionState.tokenVersion) {
    return { error: NextResponse.json({ message: "Oturumunuz sona erdi. Lütfen yeniden giriş yapın." }, { status: 401 }) };
  }

  if (permission === "superadmin" && user.actualRole !== "SUPERADMIN") {
    return { error: NextResponse.json({ message: "Bu işlem için yetkiniz yok." }, { status: 403 }) };
  }

  // Platform oturumu klinik verisi için doğrudan bir anahtar değildir.
  // Süperadmin klinik işlemlerini yalnız denetimli kurum oturumu (ghost)
  // üzerinden yapar; aksi halde boş institutionId filtreleri tüm tenantları
  // kapsayabilir.
  if (user.actualRole === "SUPERADMIN" && !user.ghost && permission && permission !== "superadmin") {
    return {
      error: NextResponse.json(
        { message: "Klinik işlemleri için önce süperadmin panelinden ilgili kuruma giriş yapın." },
        { status: 403 },
      ),
    };
  }

  // Ghost oturum superadmin'in klinik içine görünmez müdahale oturumudur.
  // Klinik tarafında rol yetki matrisi veya servis kısıtlarıyla engellenmemelidir.
  // Yalnızca gerçek /superadmin uçları için yukarıdaki özel kontrol geçerlidir.
  if (!user.ghost && permission && !(await can(user.role as import("@prisma/client").Role, permission))) {
    return { error: NextResponse.json({ message: "Bu işlem için yetkiniz yok." }, { status: 403 }) };
  }

  // SUPERADMIN için kurum kontrolü yok. Diğer tüm roller için institutionId
  // zorunlu: eksikse aşağıdaki `auth.user.institutionId ? {...} : {}` filtre
  // deseni sessizce tüm kurumların verisini döndürür (bkz. denetim raporu,
  // Tema 1). Bu yüzden institutionId'siz non-superadmin oturumu burada,
  // tek merkezi noktada reddediliyor.
  if (user.role !== "SUPERADMIN" && !user.institutionId) {
    return { error: NextResponse.json({ message: "Oturum kurumu bulunamadı. Lütfen yeniden giriş yapın." }, { status: 401 }) };
  }

  if (user.ghost) {
    const branchContext = await resolveBranchContext(user);
    return { user: { ...user, branchContext } };
  }

  if (user.role !== "SUPERADMIN" && user.institutionId) {
    const now = new Date();

    const institution = await getInstitutionState(user.institutionId);

    if (!institution) {
      return { error: NextResponse.json({ message: "Oturum kurumu bulunamadı. Lütfen yeniden giriş yapın." }, { status: 401 }) };
    }

    if (!institution.isActive) {
      return { error: NextResponse.json({ message: "Kurum pasif durumda. Lütfen yöneticinizle iletişime geçin." }, { status: 423 }) };
    }

    if (institution.isDemo && institution.demoExpiresAt && institution.demoExpiresAt < now) {
      return {
        error: NextResponse.json(
          { message: "Demo erişim süresi doldu. Devam etmek için satış ekibiyle iletişime geçin.", demoExpired: true },
          { status: 423 }
        ),
      };
    }

    if (institution.suspendedUntil && institution.suspendedUntil > now) {
      return {
        error: NextResponse.json(
          { message: "Hizmet geçici olarak askıya alındı.", until: institution.suspendedUntil.toISOString(), note: institution.serviceNote || null },
          { status: 423 }
        ),
      };
    }

    if (institution.serviceMode === "SUSPENDED") {
      return {
        error: NextResponse.json(
          { message: "Hizmet askıya alınmış durumda.", note: institution.serviceNote || null },
          { status: 423 }
        ),
      };
    }

    if (institution.serviceMode === "READ_ONLY" && isWritePermission(permission)) {
      return {
        error: NextResponse.json(
          { message: "Bu kurumda yazma işlemleri geçici olarak kapatıldı.", note: institution.serviceNote || null },
          { status: 423 }
        ),
      };
    }

    if (institution.serviceMode === "LIMITED" && isLimitedBlockedPermission(permission)) {
      return {
        error: NextResponse.json(
          { message: "Bu işlem kurum için kısıtlı modda devre dışı.", note: institution.serviceNote || null },
          { status: 423 }
        ),
      };
    }

    // Gecikmiş fatura kilidi: sadece grace süresi dolmuşsa ve write ise ek sorgu yap
    if (institution.paymentGraceUntil && now > institution.paymentGraceUntil && isWritePermission(permission)) {
      const overdueCount = await prisma.invoice.count({
        where: {
          institutionId: user.institutionId,
          status: { not: "PAID" },
          dueDate: { lt: now },
        },
      });

      if (overdueCount > 0) {
        return {
          error: NextResponse.json(
            { message: "Ödeme gecikmesi nedeniyle yazma işlemleri kilitlendi.", graceUntil: institution.paymentGraceUntil.toISOString() },
            { status: 423 }
          ),
        };
      }
    }

    // Okuma istekleri anında dönsün; gecikme sadece yazma işlemlerinde kalsın.
    if (institution.throttleMs > 0 && isWritePermission(permission)) {
      await new Promise((r) => setTimeout(r, Math.min(institution.throttleMs, 3000)));
    }
  }

  const branchContext = await resolveBranchContext(user);
  if (!user.ghost && user.role !== "SUPERADMIN" && !branchContext.activeBranchId) {
    return {
      error: NextResponse.json(
        { message: "Hesabınızın erişebildiği aktif bir şube bulunmuyor. Lütfen yöneticinizle iletişime geçin." },
        { status: 403 },
      ),
    };
  }
  if (!user.ghost && user.role !== "SUPERADMIN" && permission && permission !== "superadmin" && !hasBranchPermission(branchContext, permission)) {
    return { error: NextResponse.json({ message: "Bu şubede bu işlem için yetkiniz yok." }, { status: 403 }) };
  }
  return { user: { ...user, branchContext } };
}

export async function requireAnyAuth(permissions: readonly string[]) {
  const auth = await requireAuth();
  if (auth.error) return auth;
  if (auth.user.ghost) return auth;

  const checks = await Promise.all(permissions.map(async (permission) => ({
    permission,
    allowed: await hasEffectivePermission(auth.user, permission),
  })));
  const selected = checks.find((check) => check.allowed)?.permission;
  if (!selected) {
    return { error: NextResponse.json({ message: "Bu işlem için yetkiniz yok." }, { status: 403 }) };
  }

  // Yetkinin türünü requireAuth'a tekrar geçirerek salt-okunur, kısıtlı mod,
  // fatura kilidi ve yazma gecikmesi gibi kurum politikalarını da uygula.
  // Sadece `can()` kontrolü yapmak bu çapraz kuralları sessizce atlıyordu.
  return requireAuth(selected);
}

export async function requireAllAuth(permissions: readonly string[]) {
  const auth = await requireAuth();
  if (auth.error) return auth;
  if (auth.user.ghost) return auth;

  const checks = await Promise.all(
    permissions.map((permission) => hasEffectivePermission(auth.user, permission)),
  );
  if (checks.some((allowed) => !allowed)) {
    return { error: NextResponse.json({ message: "Bu işlem için gerekli yetkileriniz eksik." }, { status: 403 }) };
  }

  for (const permission of permissions) {
    const policyAuth = await requireAuth(permission);
    if (policyAuth.error) return policyAuth;
  }
  return auth;
}

export async function requireSuperadmin() {
  return requireAuth("superadmin");
}

export async function hasEffectivePermission(
  user: {
    ghost?: boolean;
    role: string;
    branchContext: Parameters<typeof hasBranchPermission>[0];
  },
  permission: string,
) {
  return Boolean(
    user.ghost
    || user.role === "SUPERADMIN"
    || (
      await can(user.role as import("@prisma/client").Role, permission)
      && hasBranchPermission(user.branchContext, permission)
    )
  );
}

async function getRequestIp(): Promise<string | null> {
  try {
    const h = await headers();
    const ip = getClientIpFromHeaders(h);
    return ip === "unknown" ? null : ip.slice(0, 100);
  } catch {
    // İstek bağlamı dışında (ör. arka plan işleri) — sessizce atla
    return null;
  }
}

export async function writeAudit(userId: string, action: string, detail?: string) {
  const currentUser = await decodeTokenUser();
  const branchContext = currentUser?.institutionId
    ? await resolveBranchContext(currentUser).catch(() => null)
    : null;
  let realtimeInstitutionId = currentUser?.institutionId || null;
  let realtimeBumped = false;

  const bumpOnce = async () => {
    if (realtimeBumped) return;
    realtimeBumped = true;
    await bumpRealtimeInstitution(realtimeInstitutionId);
  };

  const actor = currentUser?.id === userId
    ? { role: currentUser.role, institutionId: currentUser.institutionId }
    : await prisma.user.findUnique({ where: { id: userId }, select: { role: true, institutionId: true } });

  // Superadmin ve ghost müdahale oturumları KAYDEDİLİR (isGhost/actorRole
  // alanlarıyla) ama kurumun kendi /log ekranından GÖRÜNMEZ — filtre orada
  // (`src/app/api/logs/route.ts`, `where.NOT` ile actorRole/isGhost) uygulanır.
  // Önceden burada tamamen atlanıyordu; bu da superadmin'in kendi hesap
  // verebilirlik kaydını (`/superadmin/audit`) da boş bırakıyordu (bkz.
  // denetim raporu — ghost/superadmin işlemleri hiçbir yerde iz bırakmıyordu).

  if (!realtimeInstitutionId && actor && "institutionId" in actor) {
    realtimeInstitutionId = actor.institutionId || null;
  }

  await prisma.auditLog.create({
    data: {
      userId,
      branchId: branchContext?.activeBranchId || null,
      action,
      detail,
      actorId: currentUser?.id ?? null,
      actorRole: currentUser?.role ?? null,
      isGhost: Boolean(currentUser?.ghost),
      ip: await getRequestIp(),
    }
  });

  await bumpOnce();
}
