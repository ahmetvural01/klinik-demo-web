import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { invalidateUserSessionCache, requireAuth, writeAudit } from "@/lib/api";
import { DEFAULT_SUPERADMIN_MODULES } from "@/lib/superadmin-modules";

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const admins = await prisma.user.findMany({
    where: { role: "SUPERADMIN" },
    orderBy: { createdAt: "desc" },
    select: { id: true, fullName: true, identityNo: true, email: true, isActive: true, createdAt: true, twoFactorEnabled: true },
  });
  // Son giriş, giriş denetim kayıtlarından okunur (kullanıcı tablosunda ayrı alan yok).
  const lastLogins = admins.length
    ? await prisma.auditLog.groupBy({ by: ["userId"], where: { action: "LOGIN", userId: { in: admins.map((admin) => admin.id) } }, _max: { createdAt: true } })
    : [];
  const lastLoginById = new Map(lastLogins.map((row) => [row.userId, row._max.createdAt]));

  return NextResponse.json(
    admins.map((admin) => ({
      id: admin.id,
      fullName: admin.fullName,
      // TC kimlik no tarayıcıya tam gönderilmez; yalnız son 4 hane.
      identityNoMasked: admin.identityNo ? `•••••••${admin.identityNo.slice(-4)}` : null,
      email: admin.email,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
      twoFactorEnabled: admin.twoFactorEnabled,
      lastLoginAt: lastLoginById.get(admin.id) ?? null,
      isSelf: admin.id === auth.user.id,
    }))
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = (await request.json()) as {
    fullName?: string;
    identityNo?: string;
    password?: string;
    email?: string;
  };

  const fullName = body.fullName?.trim() || "";
  const identityNo = body.identityNo?.trim() || "";
  const password = body.password || "";
  const email = body.email?.trim() || null;
  const modules = DEFAULT_SUPERADMIN_MODULES;

  if (!fullName || !identityNo || password.length < 8 || password.length > 72) {
    return NextResponse.json({ message: "Ad soyad, TC kimlik no ve 8-72 karakter şifre zorunlu" }, { status: 400 });
  }
  if (!/^\d{11}$/.test(identityNo)) {
    return NextResponse.json({ message: "TC kimlik numarası 11 rakam olmalı" }, { status: 400 });
  }
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ message: "Geçerli bir e-posta adresi girin" }, { status: 400 });
  }

  // Superadmin hesapları kuruma bağlı değildir (institutionId=null), bu yüzden
  // benzersizlik kontrolü sadece diğer superadmin'lere karşı yapılır — bir klinik
  // personelinin TC'si tesadüfen aynıysa bu, superadmin oluşturmayı engellememeli.
  const exists = await prisma.user.findFirst({ where: { identityNo, role: "SUPERADMIN" } });
  if (exists) {
    return NextResponse.json({ message: "Bu TC kimlik numarası zaten kayıtlı" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      fullName,
      identityNo,
      email,
      role: "SUPERADMIN",
      institutionId: null,
      passwordHash,
      isActive: true,
      superadminPermission: {
        create: {
          modules,
        },
      },
    },
    include: { superadminPermission: true },
  });

  await writeAudit(auth.user.id, "SUPERADMIN_CREATE", `Yeni platform yöneticisi eklendi: ${user.fullName}`);

  return NextResponse.json({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    isActive: user.isActive,
    modules,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = (await request.json()) as {
    id?: string;
    fullName?: string;
    email?: string | null;
    isActive?: boolean;
    password?: string;
  };

  if (!body.id) {
    return NextResponse.json({ message: "id zorunlu" }, { status: 400 });
  }
  if (body.password !== undefined && (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 72)) {
    return NextResponse.json({ message: "Şifre 8-72 karakter olmalı" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: body.id }, include: { superadminPermission: true } });
  if (!target || target.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Kullanıcı bulunamadı" }, { status: 404 });
  }
  // [id] rotasındaki kuralla aynı: etkin en az bir platform yöneticisi kalmalı.
  if (body.isActive === false && target.isActive) {
    const otherActiveCount = await prisma.user.count({ where: { role: "SUPERADMIN", isActive: true, id: { not: body.id } } });
    if (otherActiveCount === 0) {
      return NextResponse.json({ message: "Son etkin platform yöneticisi pasife alınamaz." }, { status: 400 });
    }
  }

  const userData: {
    fullName?: string;
    email?: string | null;
    isActive?: boolean;
    passwordHash?: string;
    mustChangePassword?: boolean;
    tokenVersion?: { increment: number };
  } = {};
  if (typeof body.fullName === "string" && body.fullName.trim()) userData.fullName = body.fullName.trim();
  if (typeof body.email !== "undefined") userData.email = body.email ? body.email.trim() : null;
  if (typeof body.isActive === "boolean") userData.isActive = body.isActive;
  if (typeof body.password === "string") {
    userData.passwordHash = await bcrypt.hash(body.password, 10);
    userData.mustChangePassword = false;
    userData.tokenVersion = { increment: 1 };
  }

  await prisma.user.update({ where: { id: body.id }, data: userData });
  if (typeof body.password === "string" || (target.isActive && body.isActive === false)) {
    invalidateUserSessionCache(body.id);
  }

  const beforeParts: string[] = [];
  const afterParts: string[] = [];
  const pushDiff = (label: string, before: unknown, after: unknown) => {
    const b = before === null || before === undefined || before === "" ? "-" : String(before);
    const a = after === null || after === undefined || after === "" ? "-" : String(after);
    if (b !== a) {
      beforeParts.push(`${label}: ${b}`);
      afterParts.push(`${label}: ${a}`);
    }
  };

  pushDiff("Ad Soyad", target.fullName, body.fullName ?? target.fullName);
  pushDiff("E-posta", target.email, typeof body.email === "undefined" ? target.email : body.email);
  pushDiff("Durum", target.isActive ? "Aktif" : "Pasif", typeof body.isActive === "boolean" ? (body.isActive ? "Aktif" : "Pasif") : (target.isActive ? "Aktif" : "Pasif"));
  if (typeof body.password === "string" && body.password.length >= 6) {
    beforeParts.push("Şifre: Güncellenmedi");
    afterParts.push("Şifre: Güncellendi");
  }
  const detail = [
    `${auth.user.fullName || "Personel"} tarafından superadmin kaydı güncellendi: ${target.fullName}.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
  ].join("\n");

  await writeAudit(auth.user.id, "SUPERADMIN_UPDATE", detail);

  return NextResponse.json({ ok: true });
}
