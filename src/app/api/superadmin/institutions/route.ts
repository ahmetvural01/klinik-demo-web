import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getPlanDefaultLimits } from "@/lib/subscription-plans";
import bcrypt from "bcryptjs";

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const institutions = await prisma.institution.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      subscriptionPlan: true,
      smsBalance: true,
      isActive: true,
      serviceMode: true,
      adsEnabled: true,
      adIntensity: true,
      createdAt: true,
      owner: { select: { fullName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(institutions);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    ownerName?: string;
    ownerIdentityNo?: string;
    ownerPassword?: string;
    email?: string;
    phone?: string;
    address?: string;
    taxNo?: string;
    subscriptionPlan?: "TEMEL" | "PROFESYONEL" | "KURUMSAL";
    smsBalance?: number;
  };

  const name = body.name?.trim() || "";
  const ownerName = body.ownerName?.trim() || "";
  const ownerIdentityNo = body.ownerIdentityNo?.trim() || "";
  const ownerPassword = body.ownerPassword || "";
  const email = body.email?.trim() || "";
  const phone = body.phone?.trim() || "";

  if (!name || !ownerName || !ownerIdentityNo || !ownerPassword || !email) {
    return NextResponse.json({ message: "Klinik, owner ve iletisim alanlari zorunlu" }, { status: 400 });
  }

  if (ownerIdentityNo.length !== 11) {
    return NextResponse.json({ message: "Owner TC kimlik 11 haneli olmali" }, { status: 400 });
  }

  if (ownerPassword.length < 6) {
    return NextResponse.json({ message: "Owner sifresi en az 6 karakter olmali" }, { status: 400 });
  }

  const [existingInstitutionByName, existingInstitutionByEmail] = await Promise.all([
    prisma.institution.findUnique({ where: { name } }),
    prisma.institution.findUnique({ where: { email } }),
  ]);

  if (existingInstitutionByName) {
    return NextResponse.json({ message: "Bu klinik adi zaten kullaniliyor" }, { status: 409 });
  }

  if (existingInstitutionByEmail) {
    return NextResponse.json({ message: "Bu e-posta zaten kullaniliyor" }, { status: 409 });
  }

  // Owner TC kimlik burada kasıtlı olarak global kontrol edilmiyor: aynı kişi
  // (aynı TC) birden fazla kliniğin owner'ı/personeli olabilir — kurumlar TC
  // bazında birbirini engellememeli (bkz. User.identityNo şema notu). Yeni
  // institution'ın kendi içinde zaten çakışma olamaz çünkü henüz hiç kullanıcısı yok.

  const passwordHash = await bcrypt.hash(ownerPassword, 10);

  const plan = body.subscriptionPlan || "TEMEL";
  const planLimits = getPlanDefaultLimits(plan);

  const created = await prisma.$transaction(async (tx) => {
    const institution = await tx.institution.create({
      data: {
        name,
        email,
        phone,
        address: body.address?.trim() || null,
        taxNo: body.taxNo?.trim() || null,
        subscriptionPlan: plan,
        smsBalance: typeof body.smsBalance === "number" ? body.smsBalance : 0,
        serviceMode: "NORMAL",
        throttleMs: 0,
        maxActiveDoctors: planLimits.maxActiveDoctors,
        maxActiveUsers: planLimits.maxActiveUsers,
      },
    });

    const owner = await tx.user.create({
      data: {
        fullName: ownerName,
        identityNo: ownerIdentityNo,
        role: "YONETICI",
        institutionId: institution.id,
        passwordHash,
        isActive: true,
      },
    });

    const updatedInstitution = await tx.institution.update({
      where: { id: institution.id },
      data: { ownerId: owner.id },
      include: { owner: { select: { fullName: true } } },
    });

    await tx.setting.create({
      data: {
        institutionId: institution.id,
        institutionName: name,
        institutionAddress: body.address?.trim() || null,
        institutionPhone: phone,
      },
    });

    return updatedInstitution;
  });

  await writeAudit(auth.user.id, "SUPERADMIN_INSTITUTION_CREATE", `Kurum oluşturuldu: ${created.name} / Owner: ${ownerName}`);
  return NextResponse.json(created);
}
