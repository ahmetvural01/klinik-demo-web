import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getPlanDefaultLimits } from "@/lib/subscription-plans";
import { summarizeInvoices } from "@/components/superadmin/invoice-status";
import bcrypt from "bcryptjs";

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const [institutions, openInvoices, activeUsers, managers] = await Promise.all([
    prisma.institution.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        subscriptionPlan: true,
        billingCycle: true,
        smsBalance: true,
        isActive: true,
        serviceMode: true,
        suspendedUntil: true,
        paymentGraceUntil: true,
        isDemo: true,
        demoExpiresAt: true,
        adsEnabled: true,
        adIntensity: true,
        whatsappEnabled: true,
        createdAt: true,
        owner: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Liste "hangi klinik borçlu?" sorusunu yanıtlasın diye açık faturalar
    // klinik bazında özetlenir (iptal ve ödenmiş faturalar hariç).
    prisma.invoice.findMany({
      where: { status: { in: ["PENDING", "OVERDUE"] } },
      select: { institutionId: true, status: true, amount: true, dueDate: true, paidAt: true },
    }),
    prisma.user.groupBy({ by: ["institutionId"], where: { isActive: true, institutionId: { not: null } }, _count: { _all: true } }),
    // Çoğu klinikte "sahip" alanı boş; ilk klinik yöneticisi gösterilir.
    prisma.user.findMany({
      where: { role: "YONETICI", isActive: true, institutionId: { not: null } },
      select: { institutionId: true, fullName: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const now = new Date();
  const invoicesByInstitution = new Map<string, typeof openInvoices>();
  for (const invoice of openInvoices) {
    const list = invoicesByInstitution.get(invoice.institutionId) ?? [];
    list.push(invoice);
    invoicesByInstitution.set(invoice.institutionId, list);
  }
  const userCount = new Map(activeUsers.map((row) => [row.institutionId as string, row._count._all]));
  const firstManager = new Map<string, string>();
  for (const manager of managers) {
    if (manager.institutionId && !firstManager.has(manager.institutionId)) firstManager.set(manager.institutionId, manager.fullName);
  }

  return NextResponse.json(institutions.map((institution) => {
    const summary = summarizeInvoices(invoicesByInstitution.get(institution.id) ?? [], now);
    return {
      ...institution,
      contactName: institution.owner?.fullName || firstManager.get(institution.id) || null,
      activeUserCount: userCount.get(institution.id) ?? 0,
      openAmount: summary.openAmount,
      openCount: summary.openCount,
      overdueCount: summary.overdueCount,
      overdueAmount: summary.overdueAmount,
      nextDueDate: summary.nextDueDate,
    };
  }));
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
    billingCycle?: "AYLIK" | "YILLIK";
    smsBalance?: number;
  };

  const name = body.name?.trim() || "";
  const ownerName = body.ownerName?.trim() || "";
  const ownerIdentityNo = body.ownerIdentityNo?.trim() || "";
  const ownerPassword = body.ownerPassword || "";
  const email = body.email?.trim() || "";
  const phone = body.phone?.trim() || "";

  if (!name || !ownerName || !ownerIdentityNo || !ownerPassword || !email) {
    return NextResponse.json({ message: "Klinik adı, e-posta, sahibin adı, TC kimlik no ve şifresi zorunlu" }, { status: 400 });
  }

  if (!/^\d{11}$/.test(ownerIdentityNo)) {
    return NextResponse.json({ message: "Sahibin TC kimlik numarası 11 rakam olmalı" }, { status: 400 });
  }

  // Personel ve platform yöneticisi şifreleriyle aynı kural (8-72 karakter);
  // önceden klinik sahibi için 6 karakter yetiyordu.
  if (ownerPassword.length < 8 || ownerPassword.length > 72) {
    return NextResponse.json({ message: "Sahip şifresi 8-72 karakter olmalı" }, { status: 400 });
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ message: "Geçerli bir e-posta adresi girin" }, { status: 400 });
  }

  const billingCycle = body.billingCycle === "YILLIK" ? "YILLIK" : "AYLIK";
  // Açılış hediyesi SMS faturasızdır ama yoktan var edilmez: platform
  // stoğundan düşülür (önceden her yeni kliniğe stoktan bağımsız 500 SMS
  // yazılıyordu; "Sistem toplamı" gerçek alımı tutmuyordu).
  const openingSms = body.smsBalance === undefined || body.smsBalance === null ? 0 : Number(body.smsBalance);
  if (!Number.isInteger(openingSms) || openingSms < 0 || openingSms > 1_000_000) {
    return NextResponse.json({ message: "Açılış SMS miktarı 0 veya daha büyük bir tam sayı olmalı" }, { status: 400 });
  }

  const [existingInstitutionByName, existingInstitutionByEmail] = await Promise.all([
    prisma.institution.findUnique({ where: { name } }),
    prisma.institution.findUnique({ where: { email } }),
  ]);

  if (existingInstitutionByName) {
    return NextResponse.json({ message: "Bu klinik adı başka bir klinikte kullanılıyor" }, { status: 409 });
  }

  if (existingInstitutionByEmail) {
    return NextResponse.json({ message: "Bu e-posta başka bir klinikte kullanılıyor" }, { status: 409 });
  }

  // Owner TC kimlik burada kasıtlı olarak global kontrol edilmiyor: aynı kişi
  // (aynı TC) birden fazla kliniğin owner'ı/personeli olabilir — kurumlar TC
  // bazında birbirini engellememeli (bkz. User.identityNo şema notu). Yeni
  // institution'ın kendi içinde zaten çakışma olamaz çünkü henüz hiç kullanıcısı yok.

  const passwordHash = await bcrypt.hash(ownerPassword, 10);

  const plan = body.subscriptionPlan || "TEMEL";
  const planLimits = getPlanDefaultLimits(plan);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      if (openingSms > 0) {
        const wallet = await tx.platformSmsWallet.upsert({ where: { id: 1 }, update: {}, create: { id: 1, availableBalance: 0 } });
        await tx.$queryRaw`SELECT "id" FROM "PlatformSmsWallet" WHERE "id" = ${wallet.id} FOR UPDATE`;
        const current = await tx.platformSmsWallet.findUniqueOrThrow({ where: { id: wallet.id } });
        if (current.availableBalance < openingSms) {
          throw new Error(`OPENING_SMS_STOCK:${current.availableBalance}`);
        }
        await tx.platformSmsWallet.update({ where: { id: wallet.id }, data: { availableBalance: { decrement: openingSms } } });
      }
      const institution = await tx.institution.create({
        data: {
          name,
          email,
          phone,
          address: body.address?.trim() || null,
          taxNo: body.taxNo?.trim() || null,
          subscriptionPlan: plan,
          billingCycle,
          smsBalance: openingSms,
          serviceMode: "NORMAL",
          throttleMs: 0,
          maxActiveDoctors: planLimits.maxActiveDoctors,
          maxActiveUsers: planLimits.maxActiveUsers,
        },
      });

      const branch = await tx.clinicBranch.create({
        data: {
          institutionId: institution.id,
          name: "Merkez Şube",
          code: "MRK",
          slug: "merkez",
          isHeadquarters: true,
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
          branchMemberships: {
            create: { branchId: branch.id, isPrimary: true },
          },
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
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("OPENING_SMS_STOCK:")) {
      const stock = Number(error.message.split(":")[1]) || 0;
      return NextResponse.json({
        message: `Platform SMS stoğu yetersiz: stokta ${stock.toLocaleString("tr-TR")} SMS var. Açılış SMS miktarını azaltın ya da önce SMS Yönetimi › Stok'tan stok ekleyin.`,
      }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target || "");
      if (target.includes("taxNo")) return NextResponse.json({ message: "Bu vergi numarası başka bir klinikte kullanılıyor." }, { status: 409 });
      return NextResponse.json({ message: "Bu bilgilerle kayıtlı başka bir klinik var (ad, e-posta veya vergi no)." }, { status: 409 });
    }
    throw error;
  }

  await writeAudit(
    auth.user.id,
    "SUPERADMIN_INSTITUTION_CREATE",
    `Klinik açıldı: ${created.name} / Klinik yöneticisi: ${ownerName}${openingSms > 0 ? ` / Açılış hediyesi ${openingSms.toLocaleString("tr-TR")} SMS (platform stoğundan)` : ""}`,
  );
  return NextResponse.json(created);
}
