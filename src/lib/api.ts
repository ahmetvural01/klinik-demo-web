import { NextResponse } from "next/server";
import { decodeTokenUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  bumpRealtimeInstitution as bumpRealtimeInstitutionBus,
  getRealtimeInstitutionVersion as getRealtimeInstitutionVersionBus,
  subscribeRealtimeInstitution as subscribeRealtimeInstitutionBus,
} from "@/lib/realtime-bus";

// ── Kurum bilgisi in-memory cache (60 saniyelik TTL) ───────────────────────
type CachedInstitution = {
  isActive: boolean;
  serviceMode: string;
  serviceNote: string | null;
  throttleMs: number;
  paymentGraceUntil: Date | null;
  suspendedUntil: Date | null;
  expiresAt: number;
};
const _instCache = new Map<string, CachedInstitution>();
const INST_CACHE_TTL_MS = 60_000; // 60 saniye

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
  void bumpRealtimeInstitutionBus(institutionId);
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
  const user = decodeTokenUser();

  if (!user) {
    return { error: NextResponse.json({ message: "Yetkisiz" }, { status: 401 }) };
  }

  if (permission && !can(user.role as import("@prisma/client").Role, permission)) {
    return { error: NextResponse.json({ message: "Yasak" }, { status: 403 }) };
  }

  // SUPERADMIN için kurum kontrolü yok
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

    // Throttle: sadece throttleMs > 0 ise bekle
    if (institution.throttleMs > 0) {
      await new Promise((r) => setTimeout(r, Math.min(institution.throttleMs, 3000)));
    }
  }

  return { user };
}

export async function writeAudit(userId: string, action: string, detail?: string) {
  const currentUser = decodeTokenUser();

  // Ghost token (superadmin gizli giriş) veya SUPERADMIN rolü — log atılmaz
  if (currentUser?.ghost) {
    return;
  }
  if (currentUser?.id === userId && currentUser.role === "SUPERADMIN") {
    return;
  }

  const actor = currentUser?.id === userId
    ? { role: currentUser.role }
    : await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });

  if (actor?.role === "SUPERADMIN") {
    return;
  }

  await prisma.auditLog.create({
    data: {
      userId,
      action,
      detail
    }
  });

  bumpRealtimeInstitution(currentUser?.institutionId || null);
}
