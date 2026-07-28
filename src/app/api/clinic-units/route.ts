import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiTiming, writeAudit } from "@/lib/api";

function getInstitutionId(auth: { user: { institutionId?: string | null } }) {
  return auth.user.institutionId || null;
}

function normalizeName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeCode(value: unknown) {
  const code = typeof value === "string" ? value.trim().toLocaleUpperCase("tr-TR") : "";
  return code || null;
}

export const GET = withApiTiming("clinic-units", async () => {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;
  const institutionId = getInstitutionId(auth);
  if (!institutionId) return NextResponse.json([]);

  const items = await prisma.clinicUnit.findMany({
    where: { institutionId },
    select: { id: true, name: true, code: true, isActive: true, createdAt: true, _count: { select: { appointments: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(items);
});

export const POST = withApiTiming("clinic-units", async (request: NextRequest) => {
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;
  const institutionId = getInstitutionId(auth);
  if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const name = normalizeName(body?.name);
  const code = normalizeCode(body?.code);
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ message: "Tedavi alanı adı 2-80 karakter olmalıdır." }, { status: 400 });
  }
  if (code && code.length > 20) {
    return NextResponse.json({ message: "Tedavi alanı kısa kodu en fazla 20 karakter olabilir." }, { status: 400 });
  }

  try {
    const item = await prisma.clinicUnit.create({ data: { institutionId, name, code } });
    await writeAudit(auth.user.id, "CLINIC_UNIT_CREATE", `Tedavi alanı eklendi: ${item.name}${item.code ? ` (${item.code})` : ""}`);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    const codeValue = (error as { code?: string }).code;
    if (codeValue === "P2002") return NextResponse.json({ message: "Bu isim veya kısa kodla kayıtlı bir tedavi alanı zaten var." }, { status: 409 });
    return NextResponse.json({ message: "Tedavi alanı kaydedilemedi." }, { status: 500 });
  }
});

export const PATCH = withApiTiming("clinic-units", async (request: NextRequest) => {
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;
  const institutionId = getInstitutionId(auth);
  if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ message: "Tedavi alanı seçilmedi." }, { status: 400 });
  const current = await prisma.clinicUnit.findFirst({ where: { id, institutionId } });
  if (!current) return NextResponse.json({ message: "Tedavi alanı bulunamadı." }, { status: 404 });

  const name = body?.name === undefined ? current.name : normalizeName(body.name);
  const code = body?.code === undefined ? current.code : normalizeCode(body.code);
  const isActive = typeof body?.isActive === "boolean" ? body.isActive : current.isActive;
  if (name.length < 2 || name.length > 80) return NextResponse.json({ message: "Tedavi alanı adı 2-80 karakter olmalıdır." }, { status: 400 });
  if (code && code.length > 20) return NextResponse.json({ message: "Tedavi alanı kısa kodu en fazla 20 karakter olabilir." }, { status: 400 });

  try {
    const item = await prisma.clinicUnit.update({ where: { id }, data: { name, code, isActive } });
    await writeAudit(auth.user.id, "CLINIC_UNIT_UPDATE", `Tedavi alanı güncellendi: ${current.name} → ${item.name}; Durum: ${item.isActive ? "Aktif" : "Pasif"}`);
    return NextResponse.json(item);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return NextResponse.json({ message: "Bu isim veya kısa kodla kayıtlı bir tedavi alanı zaten var." }, { status: 409 });
    return NextResponse.json({ message: "Tedavi alanı güncellenemedi." }, { status: 500 });
  }
});
