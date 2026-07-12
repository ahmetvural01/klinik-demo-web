import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// GET /api/superadmin/institutions/[id]/users - Klinik kullanıcılarını listele
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const users = await prisma.user.findMany({
    where: { institutionId: params.id },
    select: {
      id: true,
      fullName: true,
      email: true,
      identityNo: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      profile: {
        select: { workStart: true, workEnd: true, photoUrl: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(users);
}

// POST /api/superadmin/institutions/[id]/users - Yeni personel ekle
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json();

  if (!body.fullName || !body.identityNo || !body.password) {
    return NextResponse.json({ message: "Ad, TC kimlik no ve şifre zorunlu" }, { status: 400 });
  }

  const institution = await prisma.institution.findUnique({
    where: { id: params.id },
    select: { maxActiveUsers: true, maxActiveDoctors: true },
  });

  if (!institution) {
    return NextResponse.json({ message: "Kurum bulunamadı" }, { status: 404 });
  }

  const [activeUsers, activeDoctors] = await Promise.all([
    prisma.user.count({ where: { institutionId: params.id, isActive: true } }),
    prisma.user.count({ where: { institutionId: params.id, isActive: true, role: "DOKTOR" } }),
  ]);

  if (institution.maxActiveUsers && activeUsers >= institution.maxActiveUsers) {
    return NextResponse.json({ message: "Aktif kullanıcı limiti dolu" }, { status: 409 });
  }

  const requestedRole = body.role || "DOKTOR";
  if (requestedRole === "DOKTOR" && institution.maxActiveDoctors && activeDoctors >= institution.maxActiveDoctors) {
    return NextResponse.json({ message: "Aktif doktor limiti dolu" }, { status: 409 });
  }

  // TC kimlik no benzersizliği SADECE bu kurum içinde kontrol edilir — başka bir
  // klinikte aynı TC'li personel olması bu kurumdaki eklemeyi engellememeli
  // (bkz. User.identityNo şema notu — kurumlar arası TC çakışması geçerlidir).
  const existing = await prisma.user.findFirst({
    where: { identityNo: body.identityNo, institutionId: params.id },
  });
  if (existing) {
    return NextResponse.json({ message: "Bu TC kimlik no bu kurumda zaten kayıtlı" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(body.password, 10);

  const user = await prisma.user.create({
    data: {
      fullName: body.fullName,
      identityNo: body.identityNo,
      email: body.email || null,
      passwordHash,
      role: body.role || "DOKTOR",
      institutionId: params.id,
      isActive: true,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      identityNo: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  // Profil oluştur
  await prisma.profile.create({
    data: { userId: user.id },
  });

  return NextResponse.json(user, { status: 201 });
}
