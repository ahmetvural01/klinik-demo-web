import { invalidateUserSessionCache, requireAuth, writeAudit } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// PUT /api/superadmin/institutions/[id]/users/[userId] - Kullanıcı bilgilerini güncelle
export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string; userId: string }> }
) {
  const params = await props.params;
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek" }, { status: 400 });
  }
  const validRoles = new Set(["YONETICI", "DOKTOR", "ASISTAN", "BANKO", "MUHASEBE"]);
  if (body.role !== undefined && !validRoles.has(body.role)) {
    return NextResponse.json({ message: "Geçersiz kurum kullanıcı rolü" }, { status: 400 });
  }
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    return NextResponse.json({ message: "Aktiflik bilgisi geçersiz" }, { status: 400 });
  }
  if (body.fullName !== undefined && (typeof body.fullName !== "string" || !body.fullName.trim() || body.fullName.trim().length > 120)) {
    return NextResponse.json({ message: "Ad soyad 1-120 karakter olmalı" }, { status: 400 });
  }
  const normalizedEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : body.email;
  if (normalizedEmail && !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    return NextResponse.json({ message: "Geçerli bir e-posta adresi girin" }, { status: 400 });
  }
  if (body.password !== undefined && (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 72)) {
    return NextResponse.json({ message: "Şifre 8-72 karakter olmalı" }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, role: true, isActive: true, institutionId: true },
  });

  if (!existingUser || existingUser.institutionId !== params.id) {
    return NextResponse.json({ message: "Kullanıcı bulunamadı" }, { status: 404 });
  }

  const institution = await prisma.institution.findUnique({
    where: { id: params.id },
    select: { maxActiveUsers: true, maxActiveDoctors: true },
  });

  if (!institution) {
    return NextResponse.json({ message: "Kurum bulunamadı" }, { status: 404 });
  }

  // Email benzersizliği (varsa)
  if (normalizedEmail) {
    const emailConflict = await prisma.user.findFirst({
      where: { email: normalizedEmail, NOT: { id: params.userId } },
    });
    if (emailConflict) {
      return NextResponse.json({ message: "Bu email başka kullanıcıda kayıtlı" }, { status: 400 });
    }
  }

  const targetRole = body.role || existingUser.role;
  const targetIsActive = body.isActive !== undefined ? body.isActive : existingUser.isActive;

  const updateData: Record<string, unknown> = {};
  if (body.fullName !== undefined) updateData.fullName = body.fullName.trim();
  if (body.email !== undefined) updateData.email = normalizedEmail || null;
  if (body.role) updateData.role = body.role;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  if (body.password) {
    updateData.passwordHash = await bcrypt.hash(body.password, 10);
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      // Aynı kurumda eşzamanlı kullanıcı aktifleştirme/rol değiştirme
      // işlemlerini tek sıraya al; aksi halde iki istek de eski sayımı görüp
      // lisans limitini birlikte aşabilir.
      await tx.$queryRaw`SELECT "id" FROM "Institution" WHERE "id" = ${params.id} FOR UPDATE`;
      const currentInstitution = await tx.institution.findUnique({
        where: { id: params.id },
        select: { maxActiveUsers: true, maxActiveDoctors: true },
      });
      if (!currentInstitution) throw new Error("INSTITUTION_NOT_FOUND");

      if (targetIsActive) {
        const [activeUsers, activeDoctors] = await Promise.all([
          tx.user.count({ where: { institutionId: params.id, isActive: true, NOT: { id: params.userId } } }),
          tx.user.count({ where: { institutionId: params.id, isActive: true, role: "DOKTOR", NOT: { id: params.userId } } }),
        ]);
        if (currentInstitution.maxActiveUsers && activeUsers + 1 > currentInstitution.maxActiveUsers) {
          throw new Error("ACTIVE_USER_LIMIT");
        }
        if (targetRole === "DOKTOR" && currentInstitution.maxActiveDoctors && activeDoctors + 1 > currentInstitution.maxActiveDoctors) {
          throw new Error("ACTIVE_DOCTOR_LIMIT");
        }
      }

      return tx.user.update({
        where: { id: params.userId },
        data: updateData,
        select: {
          id: true,
          fullName: true,
          email: true,
          identityNo: true,
          role: true,
          isActive: true,
          updatedAt: true,
        },
      });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ACTIVE_USER_LIMIT") {
      return NextResponse.json({ message: "Aktif kullanıcı limiti aşılıyor" }, { status: 409 });
    }
    if (message === "ACTIVE_DOCTOR_LIMIT") {
      return NextResponse.json({ message: "Aktif doktor limiti aşılıyor" }, { status: 409 });
    }
    if (message === "INSTITUTION_NOT_FOUND") {
      return NextResponse.json({ message: "Kurum bulunamadı" }, { status: 404 });
    }
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ message: "Bu e-posta başka bir kullanıcıda kayıtlı" }, { status: 409 });
    }
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2034") {
      return NextResponse.json({ message: "Kullanıcı aynı anda başka bir işlemle güncellendi. Tekrar deneyin." }, { status: 409 });
    }
    throw error;
  }

  if (existingUser.isActive && body.isActive === false) {
    invalidateUserSessionCache(params.userId);
  }

  await writeAudit(auth.user.id, "SUPERADMIN_INSTITUTION_USER_UPDATE", `Kurum ${params.id} kullanıcısı güncellendi: ${updated.fullName} (${updated.role})`);

  return NextResponse.json(updated);
}

// DELETE /api/superadmin/institutions/[id]/users/[userId] - Kullanıcıyı pasif yap
export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string; userId: string }> }
) {
  const params = await props.params;
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const existingUser = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { institutionId: true },
  });
  if (!existingUser || existingUser.institutionId !== params.id) {
    return NextResponse.json({ message: "Kullanıcı bulunamadı" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: params.userId },
    data: { isActive: false },
    select: { id: true, fullName: true, isActive: true },
  });

  invalidateUserSessionCache(params.userId);

  await writeAudit(auth.user.id, "SUPERADMIN_INSTITUTION_USER_DEACTIVATE", `Kurum ${params.id} kullanıcısı pasife alındı: ${updated.fullName}`);

  return NextResponse.json(updated);
}
