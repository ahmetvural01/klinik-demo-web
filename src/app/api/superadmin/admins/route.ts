import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { DEFAULT_SUPERADMIN_MODULES, normalizeModules, SUPERADMIN_MODULES } from "@/lib/superadmin-modules";

function hasSettingsAccess(modules?: string[]) {
  if (!modules) return true;
  return modules.includes("settings") || modules.includes("admins");
}

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  if (!hasSettingsAccess(auth.user.superadminModules)) return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const admins = await prisma.user.findMany({
    where: { role: "SUPERADMIN" },
    orderBy: { createdAt: "desc" },
    include: { superadminPermission: true },
  });

  return NextResponse.json(
    admins.map((admin) => ({
      id: admin.id,
      fullName: admin.fullName,
      identityNo: admin.identityNo,
      email: admin.email,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
      modules: normalizeModules(admin.superadminPermission?.modules || DEFAULT_SUPERADMIN_MODULES),
    }))
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  if (!hasSettingsAccess(auth.user.superadminModules)) return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = (await request.json()) as {
    fullName?: string;
    identityNo?: string;
    password?: string;
    email?: string;
    modules?: string[];
  };

  const fullName = body.fullName?.trim() || "";
  const identityNo = body.identityNo?.trim() || "";
  const password = body.password || "";
  const email = body.email?.trim() || null;
  const modules = normalizeModules(body.modules || DEFAULT_SUPERADMIN_MODULES);

  if (!fullName || !identityNo || password.length < 6) {
    return NextResponse.json({ message: "Ad soyad, TC ve en az 6 haneli şifre zorunlu" }, { status: 400 });
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

  await writeAudit(auth.user.id, "SUPERADMIN_CREATE", `Yeni superadmin eklendi: ${user.fullName}`);

  return NextResponse.json({
    id: user.id,
    fullName: user.fullName,
    identityNo: user.identityNo,
    email: user.email,
    isActive: user.isActive,
    modules,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  if (!hasSettingsAccess(auth.user.superadminModules)) return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = (await request.json()) as {
    id?: string;
    fullName?: string;
    email?: string | null;
    isActive?: boolean;
    password?: string;
    modules?: string[];
  };

  if (!body.id) {
    return NextResponse.json({ message: "id zorunlu" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: body.id }, include: { superadminPermission: true } });
  if (!target || target.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Kullanıcı bulunamadı" }, { status: 404 });
  }

  const prevModulesRaw = target.superadminPermission?.modules;
  const prevModules = normalizeModules(Array.isArray(prevModulesRaw) ? prevModulesRaw.filter((m) => typeof m === "string") : []);

  const userData: { fullName?: string; email?: string | null; isActive?: boolean; passwordHash?: string } = {};
  if (typeof body.fullName === "string" && body.fullName.trim()) userData.fullName = body.fullName.trim();
  if (typeof body.email !== "undefined") userData.email = body.email ? body.email.trim() : null;
  if (typeof body.isActive === "boolean") userData.isActive = body.isActive;
  if (typeof body.password === "string" && body.password.length >= 6) {
    userData.passwordHash = await bcrypt.hash(body.password, 10);
  }

  await prisma.user.update({ where: { id: body.id }, data: userData });

  if (Array.isArray(body.modules)) {
    const modules = normalizeModules(body.modules.filter((m) => SUPERADMIN_MODULES.includes(m as never)));
    await prisma.superadminPermission.upsert({
      where: { userId: body.id },
      update: { modules },
      create: { userId: body.id, modules },
    });
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
  if (Array.isArray(body.modules)) {
    const nextModules = normalizeModules(body.modules.filter((m) => SUPERADMIN_MODULES.includes(m as never)));
    pushDiff("Modüller", prevModules.join(", "), nextModules.join(", "));
  }

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından superadmin kaydı güncellendi: ${target.fullName}.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
  ].join("\n");

  await writeAudit(auth.user.id, "SUPERADMIN_UPDATE", detail);

  return NextResponse.json({ ok: true });
}
