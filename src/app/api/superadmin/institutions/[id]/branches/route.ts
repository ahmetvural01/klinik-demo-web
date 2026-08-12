import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function slugify(value: string) {
  return value.toLocaleLowerCase("tr-TR")
    .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "sube";
}

async function authorize() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth;
  if (auth.user.role !== "SUPERADMIN") {
    return { error: NextResponse.json({ message: "Yetki yok" }, { status: 403 }) };
  }
  return auth;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const { id: institutionId } = await params;
  const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { id: true } });
  if (!institution) return NextResponse.json({ message: "Kurum bulunamadı." }, { status: 404 });

  const [branches, managers] = await Promise.all([
    prisma.clinicBranch.findMany({
      where: { institutionId },
      include: {
        memberships: {
          where: { isBranchManager: true, isActive: true },
          select: { userId: true, user: { select: { fullName: true } } },
        },
        _count: { select: { memberships: true, appointments: true, clinicUnits: true } },
      },
      orderBy: [{ isHeadquarters: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: { institutionId, isActive: true, role: "YONETICI" },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  return NextResponse.json({ branches, managers });
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const { id: institutionId } = await params;
  const body = await request.json().catch(() => null);
  const name = text(body?.name, 100);
  if (name.length < 2) return NextResponse.json({ message: "Şube adı en az 2 karakter olmalıdır." }, { status: 400 });

  try {
    const branch = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Institution" WHERE "id" = ${institutionId} FOR UPDATE`;
      const institution = await tx.institution.findUnique({ where: { id: institutionId }, select: { id: true, maxActiveBranches: true } });
      if (!institution) throw new Error("NOT_FOUND");
      const activeCount = await tx.clinicBranch.count({ where: { institutionId, isActive: true } });
      if (institution.maxActiveBranches && activeCount >= institution.maxActiveBranches) throw new Error("LIMIT");

      const base = slugify(name);
      let slug = base;
      for (let suffix = 2; await tx.clinicBranch.findUnique({ where: { institutionId_slug: { institutionId, slug } } }); suffix += 1) slug = `${base}-${suffix}`;
      const created = await tx.clinicBranch.create({
        data: {
          institutionId,
          name,
          slug,
          code: text(body?.code, 20).toLocaleUpperCase("tr-TR") || null,
          phone: text(body?.phone, 30) || null,
          email: text(body?.email, 160).toLowerCase() || null,
          address: text(body?.address, 300) || null,
          district: text(body?.district, 80) || null,
          city: text(body?.city, 80) || null,
          colorCode: /^#[0-9a-f]{6}$/i.test(body?.colorCode || "") ? body.colorCode : "#0f766e",
          sortOrder: activeCount,
        },
      });
      const managerIds = Array.isArray(body?.managerIds)
        ? Array.from(new Set<string>(body.managerIds.filter((id: unknown): id is string => typeof id === "string")))
        : [];
      const validManagers = await tx.user.findMany({ where: { id: { in: managerIds }, institutionId, isActive: true, role: "YONETICI" }, select: { id: true, _count: { select: { branchMemberships: true } } } });
      if (validManagers.length !== managerIds.length) throw new Error("INVALID_MANAGER");
      if (validManagers.length) {
        for (const manager of validManagers) {
          await tx.userBranch.create({
            data: { institutionId, branchId: created.id, userId: manager.id, isBranchManager: true, isPrimary: manager._count.branchMemberships === 0 },
          });
        }
      }
      return created;
    }, { isolationLevel: "Serializable" });
    await writeAudit(auth.user.id, "SUPERADMIN_BRANCH_CREATE", `${institutionId}; ${branch.name}`);
    return NextResponse.json(branch, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ message: "Kurum bulunamadı." }, { status: 404 });
    if (message === "LIMIT") return NextResponse.json({ message: "Kurumun aktif şube sınırına ulaşıldı." }, { status: 409 });
    if ((error as { code?: string })?.code === "P2002") return NextResponse.json({ message: "Aynı ad veya kodda bir şube zaten var." }, { status: 409 });
    return NextResponse.json({ message: "Şube oluşturulamadı." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const { id: institutionId } = await params;
  const body = await request.json().catch(() => null);
  const branchId = typeof body?.id === "string" ? body.id : "";
  const current = await prisma.clinicBranch.findFirst({ where: { id: branchId, institutionId } });
  if (!current) return NextResponse.json({ message: "Şube bulunamadı." }, { status: 404 });
  if (body?.isActive === false && current.isHeadquarters) return NextResponse.json({ message: "Merkez şube pasife alınamaz." }, { status: 409 });

  const managerIds = Array.isArray(body?.managerIds)
    ? Array.from(new Set<string>(body.managerIds.filter((id: unknown): id is string => typeof id === "string")))
    : null;
  try {
    const branch = await prisma.$transaction(async (tx) => {
      const updated = await tx.clinicBranch.update({
        where: { id: branchId },
        data: {
          ...(body.name !== undefined && { name: text(body.name, 100) }),
          ...(body.code !== undefined && { code: text(body.code, 20).toLocaleUpperCase("tr-TR") || null }),
          ...(body.phone !== undefined && { phone: text(body.phone, 30) || null }),
          ...(body.email !== undefined && { email: text(body.email, 160).toLowerCase() || null }),
          ...(body.address !== undefined && { address: text(body.address, 300) || null }),
          ...(body.district !== undefined && { district: text(body.district, 80) || null }),
          ...(body.city !== undefined && { city: text(body.city, 80) || null }),
          ...(typeof body.isActive === "boolean" && { isActive: body.isActive }),
          ...(/^#[0-9a-f]{6}$/i.test(body?.colorCode || "") && { colorCode: body.colorCode }),
        },
      });
      if (managerIds) {
        const valid = await tx.user.findMany({ where: { id: { in: managerIds }, institutionId, isActive: true, role: "YONETICI" }, select: { id: true, _count: { select: { branchMemberships: true } } } });
        if (valid.length !== managerIds.length) throw new Error("INVALID_MANAGER");
        await tx.userBranch.updateMany({ where: { institutionId, branchId, isBranchManager: true }, data: { isBranchManager: false } });
        for (const manager of valid) {
          await tx.userBranch.upsert({
            where: { userId_branchId: { userId: manager.id, branchId } },
            create: { institutionId, branchId, userId: manager.id, isBranchManager: true, isActive: true, isPrimary: manager._count.branchMemberships === 0 },
            update: { isBranchManager: true, isActive: true },
          });
        }
      }
      return updated;
    });
    await writeAudit(auth.user.id, "SUPERADMIN_BRANCH_UPDATE", `${institutionId}; ${branch.name}`);
    return NextResponse.json(branch);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_MANAGER") return NextResponse.json({ message: "Geçersiz şube yöneticisi seçimi." }, { status: 400 });
    if ((error as { code?: string })?.code === "P2002") return NextResponse.json({ message: "Aynı ad veya kodda bir şube zaten var." }, { status: 409 });
    return NextResponse.json({ message: "Şube güncellenemedi." }, { status: 500 });
  }
}
