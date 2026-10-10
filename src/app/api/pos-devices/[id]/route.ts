import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";

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
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek" }, { status: 400 });
  }
  const existing = await prisma.posDevice.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      branchId: branch.branchId,
    },
  });
  if (!existing) return NextResponse.json({ message: "POS cihazı bulunamadı" }, { status: 404 });
  if (body.name !== undefined && (!String(body.name).trim() || String(body.name).trim().length > 120)) {
    return NextResponse.json({ message: "POS cihaz adı 1-120 karakter olmalı" }, { status: 400 });
  }
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    return NextResponse.json({ message: "Aktiflik bilgisi geçersiz" }, { status: 400 });
  }

  let updated;
  try {
    updated = await prisma.posDevice.update({
      where: {
        id_institutionId_branchId: {
          id: existing.id,
          institutionId: existing.institutionId,
          branchId: existing.branchId,
        },
      },
      data: {
        ...(body.name     !== undefined && { name:     String(body.name).trim() }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
  } catch (error) {
    // Aynı şubede aynı adla ikinci cihaz olamaz; önceden sunucu hatası dönüyordu.
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ message: "Bu isimde bir POS cihazı zaten var" }, { status: 409 });
    }
    throw error;
  }

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
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const existing = await prisma.posDevice.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      branchId: branch.branchId,
    },
  });
  if (!existing) return NextResponse.json({ message: "POS cihazı bulunamadı" }, { status: 404 });

  // Taksit ödemesi de cihaza bağlıdır (TaksitOdeme.posId, silinmeyi engeller):
  // önceden yalnız tahsilat sayılıyor, taksitte kullanılmış cihaz silinmeye
  // çalışılınca istek sunucu hatasıyla düşüyordu.
  const [paymentCount, installmentPaymentCount] = await Promise.all([
    prisma.payment.count({ where: { posId: existing.id, branchId: branch.branchId } }),
    prisma.taksitOdeme.count({ where: { posId: existing.id, branchId: branch.branchId } }),
  ]);
  if (paymentCount > 0 || installmentPaymentCount > 0) {
    const deactivated = await prisma.posDevice.update({
      where: { id_institutionId_branchId: { id: existing.id, institutionId: existing.institutionId, branchId: existing.branchId } },
      data: { isActive: false },
    });
    await writeAudit(auth.user.id, "POS_DEACTIVATE", `Geçmiş tahsilatı bulunan POS pasife alındı: ${deactivated.name}`);
    return NextResponse.json({ ok: true, deactivated: true, message: "Geçmiş tahsilatlar korundu; POS cihazı pasife alındı." });
  }

  const deleted = await prisma.posDevice.delete({
    where: { id_institutionId_branchId: { id: existing.id, institutionId: existing.institutionId, branchId: existing.branchId } },
  });
  await writeAudit(auth.user.id, "POS_DELETE", `POS cihazı silindi: ${deleted.name}`);
  return NextResponse.json({ ok: true, deactivated: false });
}
