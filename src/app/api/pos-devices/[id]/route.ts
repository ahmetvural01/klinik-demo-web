import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "Aktif" : "Pasif";
  return String(v);
}

export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;

  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek" }, { status: 400 });
  }
  const existing = await (prisma as any).posDevice.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
  });
  if (!existing) return NextResponse.json({ message: "POS cihazı bulunamadı" }, { status: 404 });
  if (body.name !== undefined && (!String(body.name).trim() || String(body.name).trim().length > 120)) {
    return NextResponse.json({ message: "POS cihaz adı 1-120 karakter olmalı" }, { status: 400 });
  }
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    return NextResponse.json({ message: "Aktiflik bilgisi geçersiz" }, { status: 400 });
  }

  const updated = await (prisma as any).posDevice.update({
    where: { id: existing.id },
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

export async function DELETE(_: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;

  const existing = await (prisma as any).posDevice.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
  });
  if (!existing) return NextResponse.json({ message: "POS cihazı bulunamadı" }, { status: 404 });

  const paymentCount = await prisma.payment.count({ where: { posId: existing.id } });
  if (paymentCount > 0) {
    const deactivated = await (prisma as any).posDevice.update({ where: { id: existing.id }, data: { isActive: false } });
    await writeAudit(auth.user.id, "POS_DEACTIVATE", `Geçmiş tahsilatı bulunan POS pasife alındı: ${deactivated.name}`);
    return NextResponse.json({ ok: true, deactivated: true, message: "Geçmiş tahsilatlar korundu; POS cihazı pasife alındı." });
  }

  const deleted = await (prisma as any).posDevice.delete({ where: { id: existing.id } });
  await writeAudit(auth.user.id, "POS_DELETE", `POS cihazı silindi: ${deleted.name}`);
  return NextResponse.json({ ok: true, deactivated: false });
}
