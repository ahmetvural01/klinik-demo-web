import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// PUT /api/superadmin/institutions/[id]/users/[userId] - Kullanıcı bilgilerini güncelle
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json();

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
  if (body.email) {
    const emailConflict = await prisma.user.findFirst({
      where: { email: body.email, NOT: { id: params.userId } },
    });
    if (emailConflict) {
      return NextResponse.json({ message: "Bu email başka kullanıcıda kayıtlı" }, { status: 400 });
    }
  }

  const targetRole = body.role || existingUser.role;
  const targetIsActive = body.isActive !== undefined ? Boolean(body.isActive) : existingUser.isActive;

  // Kullanıcı aktif kalacak/aktifleşecekse limitleri denetle
  if (targetIsActive) {
    const [activeUsers, activeDoctors] = await Promise.all([
      prisma.user.count({ where: { institutionId: params.id, isActive: true, NOT: { id: params.userId } } }),
      prisma.user.count({ where: { institutionId: params.id, isActive: true, role: "DOKTOR", NOT: { id: params.userId } } }),
    ]);

    if (institution.maxActiveUsers && activeUsers + 1 > institution.maxActiveUsers) {
      return NextResponse.json({ message: "Aktif kullanıcı limiti aşılıyor" }, { status: 409 });
    }

    const doctorWillBeActive = targetRole === "DOKTOR";
    if (doctorWillBeActive && institution.maxActiveDoctors && activeDoctors + 1 > institution.maxActiveDoctors) {
      return NextResponse.json({ message: "Aktif doktor limiti aşılıyor" }, { status: 409 });
    }
  }

  const updateData: Record<string, unknown> = {};
  if (body.fullName) updateData.fullName = body.fullName;
  if (body.email !== undefined) updateData.email = body.email || null;
  if (body.role) updateData.role = body.role;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  if (body.password) {
    updateData.passwordHash = await bcrypt.hash(body.password, 10);
  }

  const updated = await prisma.user.update({
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

  return NextResponse.json(updated);
}

// DELETE /api/superadmin/institutions/[id]/users/[userId] - Kullanıcıyı pasif yap
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
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

  return NextResponse.json(updated);
}
