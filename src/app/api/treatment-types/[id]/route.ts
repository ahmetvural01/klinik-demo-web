import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek" }, { status: 400 });
  }
  const existing = await prisma.treatmentType.findFirst({
    where: { id: params.id, ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}) },
  });
  if (!existing) return NextResponse.json({ message: "Tedavi türü bulunamadı" }, { status: 404 });

  if (body.label !== undefined && (!String(body.label).trim() || String(body.label).trim().length > 120)) {
    return NextResponse.json({ message: "Tedavi adı 1-120 karakter olmalı" }, { status: 400 });
  }
  if (body.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(body.color).trim())) {
    return NextResponse.json({ message: "Geçerli bir renk kodu girin (örn: #2563eb)" }, { status: 400 });
  }
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    return NextResponse.json({ message: "Aktiflik bilgisi geçersiz" }, { status: 400 });
  }
  if (body.order !== undefined && (!Number.isInteger(Number(body.order)) || Number(body.order) < 0 || Number(body.order) > 10000)) {
    return NextResponse.json({ message: "Sıra 0-10000 arasında tam sayı olmalı" }, { status: 400 });
  }

  const updated = await prisma.treatmentType.update({
    where: { id: existing.id },
    data: {
      ...(body.label !== undefined && { label: String(body.label).trim() }),
      ...(body.color !== undefined && { color: String(body.color).trim() }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.order !== undefined && { order: Number(body.order) }),
    },
  });

  await writeAudit(auth.user.id, "TREATMENT_TYPE_UPDATE", `Tedavi türü güncellendi: ${updated.label}`);
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;

  const existing = await prisma.treatmentType.findFirst({
    where: { id: params.id, ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}) },
  });
  if (!existing) return NextResponse.json({ message: "Tedavi türü bulunamadı" }, { status: 404 });

  await prisma.treatmentType.delete({ where: { id: existing.id } });
  await writeAudit(auth.user.id, "TREATMENT_TYPE_DELETE", `Tedavi türü silindi: ${existing.label}`);
  return NextResponse.json({ ok: true });
}
