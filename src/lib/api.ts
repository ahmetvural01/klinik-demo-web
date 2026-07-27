import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { decodeTokenUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { metricObserve } from "@/lib/metrics";
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

// ── Kurum bilgisi in-memory cache (60 saniyelik TTL) ───────────────────────
type CachedInstitution = {
  isActive: boolean;
  serviceMode: string;
  serviceNote: string | null;
  throttleMs: number;
  paymentGraceUntil: Date | null;
  suspendedUntil: Date | null;
  isDemo: boolean;
  demoExpiresAt: Date | null;
  expiresAt: number;
};
const _instCache = new Map<string, CachedInstitution>();
const INST_CACHE_TTL_MS = 60_000; // 60 saniye

// ── Kullanıcı isActive kısa-TTL cache ──────────────────────────────────────
// requireAuth() önceden yalnızca JWT'yi çözüyordu, DB'ye hiç bakmıyordu — bir
// personel pasifleştirildiğinde (işten çıkarma vb.) elindeki token, 7 günlük
// süresi dolana kadar TÜM API'lerde geçerliliğini koruyordu (bkz. denetim
// raporu). Institution cache'iyle aynı desende, kısa TTL'li bir kontrol
// eklenerek pasifleştirme birkaç dakika içinde etkili hale getiriliyor —
// her istekte DB'ye gitmeden.
const _userActiveCache = new Map<string, { isActive: boolean; expiresAt: number }>();
const USER_ACTIVE_CACHE_TTL_MS = 60_000;

async function isUserStillActive(userId: string): Promise<boolean> {
  const cached = _userActiveCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.isActive;

  const row = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
  const isActive = row?.isActive ?? false;
  _userActiveCache.set(userId, { isActive, expiresAt: Date.now() + USER_ACTIVE_CACHE_TTL_MS });
  return isActive;
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

async function getCachedInstitution(institutionId: string) {
  const cached = _instCache.get(institutionId);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const institution = await prisma.institution.findUnique({
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

  if (!institution) return null;

  const entry: CachedInstitution = { ...institution, expiresAt: Date.now() + INST_CACHE_TTL_MS };
  _instCache.set(institutionId, entry);
  return entry;
}

function isWritePermission(permission?: string) {
  if (!permission) return false;
  if (permission === "*") return true;
  return permission.includes("write");
}

function isLimitedBlockedPermission(permission?: string) {
  if (!permission) return false;
  return ["appointments:write", "payments:write", "patients:write", "finance:write", "staff:write"].includes(permission);
}

export async function requireAuth(permission?: string) {
  // JWT çözümleme — DB sorgusu yok
  const user = await decodeTokenUser();

  if (!user) {
    return { error: NextResponse.json({ message: "Oturum gerekli" }, { status: 401 }) };
  }

  if (!(await isUserStillActive(user.id))) {
    return { error: NextResponse.json({ message: "Hesabınız pasifleştirilmiş. Lütfen yöneticinizle iletişime geçin." }, { status: 401 }) };
  }

  if (permission === "superadmin" && user.role !== "SUPERADMIN") {
    return { error: NextResponse.json({ message: "Bu işlem için süper yönetici yetkisi gerekli." }, { status: 403 }) };
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
    return { user };
  }

  if (user.role !== "SUPERADMIN" && user.institutionId) {
    const now = new Date();

    // TEK DB sorgusu (cache'li): kurum + gecikmiş fatura sayısı (sadece paymentGraceUntil dolmuşsa)
    const institution = await getCachedInstitution(user.institutionId);

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

  return { user };
}

async function getRequestIp(): Promise<string | null> {
  try {
    const h = await headers();
    // bkz. src/lib/rate-limit.ts getClientIpFromHeaders — zincirin ilk değeri
    // istemci tarafından sahtelenebilir, güvenilir olan tek ters proxy'nin
    // (Render) eklediği SON değerdir.
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) {
      const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0) return parts[parts.length - 1];
    }
    return h.get("x-real-ip") || null;
  } catch {
    // İstek bağlamı dışında (ör. arka plan işleri) — sessizce atla
    return null;
  }
}

export async function writeAudit(userId: string, action: string, detail?: string) {
  const currentUser = await decodeTokenUser();
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
