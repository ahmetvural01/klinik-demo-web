import { requireAuth, writeAudit } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isValidTurkishIdentityNumber } from "@/lib/tc-kimlik";

const VALID_ROLES = new Set(["YONETICI", "DOKTOR", "ASISTAN", "BANKO", "MUHASEBE"]);

// GET /api/superadmin/institutions/[id]/users - Klinik kullanıcılarını listele
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek" }, { status: 400 });
  }

  if (!body.fullName || !body.identityNo || !body.password) {
    return NextResponse.json({ message: "Ad, TC kimlik no ve şifre zorunlu" }, { status: 400 });
  }
  // Önceden rol, şifre uzunluğu ve TC doğrulanmadan Prisma'ya veriliyordu:
  // geçersiz rol ham bir 500 hatası, kısa şifre ise zayıf hesap üretiyordu.
  // Kurallar PUT ucu ve klinik Personel ekranıyla aynı.
  if (typeof body.fullName !== "string" || !body.fullName.trim() || body.fullName.trim().length > 120) {
    return NextResponse.json({ message: "Ad soyad 1-120 karakter olmalı" }, { status: 400 });
  }
  if (body.role !== undefined && !VALID_ROLES.has(body.role)) {
    return NextResponse.json({ message: "Geçersiz kurum kullanıcı rolü" }, { status: 400 });
  }
  if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 72) {
    return NextResponse.json({ message: "Şifre 8-72 karakter olmalı" }, { status: 400 });
  }
  if (!isValidTurkishIdentityNumber(String(body.identityNo))) {
    return NextResponse.json({ message: "TC kimlik numarası geçerli değil" }, { status: 400 });
  }
  if (body.email && (typeof body.email !== "string" || !/^\S+@\S+\.\S+$/.test(body.email.trim()))) {
    return NextResponse.json({ message: "Geçerli bir e-posta adresi girin" }, { status: 400 });
  }

  const institution = await prisma.institution.findUnique({
    where: { id: params.id },
    select: {
      maxActiveUsers: true,
      maxActiveDoctors: true,
      branches: { where: { isHeadquarters: true, isActive: true }, select: { id: true }, take: 1 },
    },
  });

  if (!institution) {
    return NextResponse.json({ message: "Kurum bulunamadı" }, { status: 404 });
  }
  // Bu uçtan oluşturulan personel şube üyeliği olmadan yaratılıyordu — hiçbir
  // UserBranch kaydı olmayan bir personel /api/staff altındaki hiçbir uçta
  // (liste, detay, güncelleme) görünmüyordu ("personel bulunamadı" 404),
  // çünkü tüm o uçlar branchMemberships üzerinden şube filtreler.
  const headquartersBranchId = institution.branches[0]?.id;
  if (!headquartersBranchId) {
    return NextResponse.json({ message: "Kurumun aktif merkez şubesi bulunamadı" }, { status: 409 });
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
  // E-posta sistem genelinde benzersiz; önceden çakışma ham 500 hatasıydı.
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : null;
  if (email && await prisma.user.findFirst({ where: { email }, select: { id: true } })) {
    return NextResponse.json({ message: "Bu e-posta başka bir kullanıcıda kayıtlı" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(body.password, 10);

  const user = await prisma.user.create({
    data: {
      fullName: body.fullName.trim(),
      identityNo: body.identityNo,
      email,
      passwordHash,
      role: body.role || "DOKTOR",
      institutionId: params.id,
      isActive: true,
      branchMemberships: {
        create: { branchId: headquartersBranchId, isPrimary: true },
      },
    },
    // TC kimlik no yanıtta dönmez (klinik dosyasıyla aynı KVKK kuralı).
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  // Profil oluştur
  await prisma.profile.create({
    data: { userId: user.id },
  });

  await writeAudit(auth.user.id, "SUPERADMIN_INSTITUTION_USER_CREATE", `Kurum ${params.id} için kullanıcı eklendi: ${user.fullName} (${user.role})`);

  return NextResponse.json(user, { status: 201 });
}
