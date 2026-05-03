import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

type Params = { params: { id: string } };

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "Aktif" : "Pasif";
  return String(v);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  const existing = await (prisma as any).posDevice.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ message: "POS cihazı bulunamadı" }, { status: 404 });

  const updated = await (prisma as any).posDevice.update({
    where: { id: params.id },
    data: {
      ...(body.name     !== undefined && { name:     body.name.trim() }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });

  const beforeParts: string[] = [];
  const afterParts: string[] = [];
  const pushDiff = (label: string, before: unknown, after: unknown) => {
    const b = fmt(before);
    const a = fmt(after);
    if (b !== a) {
      beforeParts.push(`${label}: ${b}`);
      afterParts.push(`${label}: ${a}`);
    }
  };

  pushDiff("POS Adı", existing.name, updated.name);
  pushDiff("Durum", existing.isActive, updated.isActive);

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından POS cihazı güncellendi.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
  ].join("\n");

  await writeAudit(auth.user.id, "POS_UPDATE", detail);
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;

  const deleted = await (prisma as any).posDevice.delete({ where: { id: params.id } });
  await writeAudit(auth.user.id, "POS_DELETE", `POS cihazı silindi: ${deleted.name}`);
  return NextResponse.json({ ok: true });
}
