import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { requireBranchManager } from "@/lib/branch-context";
import { ALL_PERMISSIONS } from "@/lib/role-permissions";
import { getPermissionMap } from "@/lib/role-permission-store";

type Params = { params: Promise<{ id: string }> };

const RATE_KEYS = ["genelYuzde", "kkYuzde", "maasYuzde"] as const;
type RateKey = (typeof RATE_KEYS)[number];
// Hakediş hesabının oran girilmemiş hekimde kullandığı değerler (api/staff/[id] ile aynı).
const DEFAULT_RATES: Record<RateKey, number> = { genelYuzde: 15, kkYuzde: 3, maasYuzde: 40 };

/**
 * Gövdedeki oran: alan hiç yoksa `undefined` (DEĞİŞMEZ), boş/null ise `null`
 * (şubeye özel oran kaldırılır, genel oran geçerli olur), sayıysa o değer.
 * Önceden gönderilmeyen alan da `null` sayılıyordu: yalnız `{ enabled: true }`
 * gönderen "Erişim ver" ve Personel'deki "Yeniden aktif et", doktorun şube
 * oranlarını siliyor ve oran geçmişine %0/%0/%0 satırı yazıyordu — o andan
 * sonraki hakediş sıfır hesaplanıyordu.
 */
function readRate(body: Record<string, unknown> | null, key: RateKey): { ok: true; value: number | null | undefined } | { ok: false } {
  if (!body || !Object.prototype.hasOwnProperty.call(body, key)) return { ok: true, value: undefined };
  const raw = body[key];
  if (raw === null || raw === "") return { ok: true, value: null };
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? { ok: true, value: number } : { ok: false };
}

const toNumber = (value: Prisma.Decimal | number | null | undefined) => (value === null || value === undefined ? null : Number(value));

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAuth("branches:assign");
  if (auth.error) return auth.error;
  const managed = requireBranchManager(auth.user.branchContext);
  if (!managed.ok) return NextResponse.json({ message: managed.message }, { status: 403 });
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });

  const { id: userId } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const enabled = body?.enabled !== false;
  const staff = await prisma.user.findFirst({
    where: { id: userId, institutionId, role: { not: "SUPERADMIN" } },
    select: { id: true, fullName: true, role: true, isActive: true, genelYuzde: true, kkYuzde: true, maasYuzde: true },
  });
  if (!staff) return NextResponse.json({ message: "Personel bulunamadı." }, { status: 404 });
  if (enabled && !staff.isActive) return NextResponse.json({ message: "Pasif personele şube erişimi verilemez." }, { status: 409 });

  const requestedCodes = body?.permissionCodes === null
    ? null
    : Array.isArray(body?.permissionCodes)
      ? Array.from(new Set<string>((body.permissionCodes as unknown[]).filter((code): code is string => typeof code === "string" && ALL_PERMISSIONS.includes(code))))
      : undefined;
  if (requestedCodes) {
    // Rol tavanı: izin haritası bir kez okunur (önceden her kod için ayrı sorgu).
    const granted = (await getPermissionMap())[staff.role] ?? [];
    if (!granted.includes("*") && requestedCodes.some((code) => !granted.includes(code))) {
      return NextResponse.json({ message: "Personelin rolünde bulunmayan bir yetki şube üzerinden verilemez." }, { status: 400 });
    }
  }

  const rates: Partial<Record<RateKey, number | null>> = {};
  for (const key of RATE_KEYS) {
    const result = readRate(body, key);
    if (!result.ok) return NextResponse.json({ message: "Hakediş oranları 0 ile 100 arasında olmalıdır." }, { status: 400 });
    if (result.value !== undefined) rates[key] = result.value;
  }
  const ratesProvided = Object.keys(rates).length > 0;

  try {
    const membership = await prisma.$transaction(async (tx) => {
      const existing = await tx.userBranch.findUnique({ where: { userId_branchId: { userId, branchId: managed.branchId } } });
      if (!enabled) {
        if (existing?.isBranchManager) throw new Error("MANAGER_CONTROL_PLANE");
        if (!existing) return null;
        await tx.userBranch.update({ where: { id: existing.id }, data: { isActive: false, isPrimary: false } });
        if (existing.isPrimary) {
          const fallback = await tx.userBranch.findFirst({ where: { userId, isActive: true, NOT: { id: existing.id } }, orderBy: { createdAt: "asc" } });
          if (fallback) await tx.userBranch.update({ where: { id: fallback.id }, data: { isPrimary: true } });
        }
        return null;
      }

      const hasPrimary = await tx.userBranch.count({ where: { userId, isActive: true, isPrimary: true } });
      const data = {
        isActive: true,
        ...(requestedCodes !== undefined && { permissionCodes: requestedCodes === null ? Prisma.DbNull : requestedCodes }),
        ...rates,
      };
      const updated = await tx.userBranch.upsert({
        where: { userId_branchId: { userId, branchId: managed.branchId } },
        create: { institutionId, userId, branchId: managed.branchId, isPrimary: hasPrimary === 0, ...data },
        update: data,
      });

      // Oran geçmişi yalnız GERÇEKTEN değişen etkin oran için yazılır (personel
      // formundaki api/staff/[id] kuralıyla aynı): etkin oran = şube oranı ??
      // genel oran ?? varsayılan. İlk değişiklikte önceki değer başlangıç
      // satırı olarak saklanır; geçmiş ayların hakedişi değişmez.
      if (staff.role === "DOKTOR" && ratesProvided) {
        const effective = (branchValue: Prisma.Decimal | number | null | undefined, key: RateKey) => toNumber(branchValue) ?? toNumber(staff[key]) ?? DEFAULT_RATES[key];
        const before = Object.fromEntries(RATE_KEYS.map((key) => [key, effective(existing?.[key], key)])) as Record<RateKey, number>;
        const after = Object.fromEntries(RATE_KEYS.map((key) => [key, effective(key in rates ? rates[key] : existing?.[key], key)])) as Record<RateKey, number>;
        if (RATE_KEYS.some((key) => before[key] !== after[key])) {
          const hasHistory = await tx.doctorRateHistory.findFirst({ where: { institutionId, branchId: managed.branchId, doctorId: userId }, select: { id: true } });
          if (!hasHistory) {
            await tx.doctorRateHistory.create({ data: { institutionId, branchId: managed.branchId, doctorId: userId, ...before, effectiveFrom: new Date(0) } });
          }
          await tx.doctorRateHistory.create({ data: { institutionId, branchId: managed.branchId, doctorId: userId, ...after, effectiveFrom: new Date() } });
        }
      }
      return updated;
    });
    await writeAudit(auth.user.id, enabled ? "STAFF_BRANCH_ACCESS_UPDATE" : "STAFF_BRANCH_ACCESS_REVOKE", `${staff.fullName}; Şube: ${managed.branchId}`);
    return NextResponse.json({ ok: true, membership });
  } catch (error) {
    if (error instanceof Error && error.message === "MANAGER_CONTROL_PLANE") {
      return NextResponse.json({ message: "Şube yöneticisi bağlantısı bu ekrandan kaldırılamaz." }, { status: 409 });
    }
    throw error;
  }
}
