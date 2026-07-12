import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

type Params = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const existing = await prisma.treatmentType.findFirst({
    where: { id: params.id, ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}) },
  });
  if (!existing) return NextResponse.json({ message: "Tedavi türü bulunamadı" }, { status: 404 });

  if (body.label !== undefined && !String(body.label).trim()) {
    return NextResponse.json({ message: "Tedavi adı boş olamaz" }, { status: 400 });
  }
  if (body.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(body.color).trim())) {
    return NextResponse.json({ message: "Geçerli bir renk kodu girin (örn: #2563eb)" }, { status: 400 });
  }

  const updated = await prisma.treatmentType.update({
    where: { id: existing.id },
    data: {
      ...(body.label !== undefined && { label: String(body.label).trim() }),
      ...(body.color !== undefined && { color: String(body.color).trim() }),
      ...(body.isActive !== undefined && { isActive: Boolean(body.isActive) }),
      ...(body.order !== undefined && { order: Number(body.order) }),
    },
  });

  await writeAudit(auth.user.id, "TREATMENT_TYPE_UPDATE", `Tedavi türü güncellendi: ${updated.label}`);
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: Params) {
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
