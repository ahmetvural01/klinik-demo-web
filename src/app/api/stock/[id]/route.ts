import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { applyStockMovement } from "@/lib/stock-ledger";
import { formatZodError, stockItemUpdateSchema, stockMovementSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

const CATEGORY_ALIASES: Record<string, string[]> = {
  "Anestezi": ["Anestezi", "ANESTEZI"],
  "İmplant": ["İmplant", "Implant", "İMPLANT", "IMPLANT"],
  "Protez": ["Protez", "PROTEZ"],
  "Dolgu": ["Dolgu", "DOLGU"],
  "Ortodonti": ["Ortodonti", "ORTODONTI"],
  "Cerrahi": ["Cerrahi", "CERRAHI"],
  "Sarf": ["Sarf", "SARF"],
  "Diğer": ["Diğer", "Diger", "DİĞER", "DIGER"],
};

function normalizeCategory(value?: string | null) {
  if (!value) return "Sarf";
  const normalized = value.trim();
  for (const [label, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((alias) => alias.toLocaleLowerCase("tr-TR") === normalized.toLocaleLowerCase("tr-TR"))) return label;
  }
  return normalized;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("finance:read");
  if (auth.error) return auth.error;

  const item = await (prisma as any).stockItem.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
    include: {
      movements: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { fullName: true } } },
      },
    },
  });
  if (!item) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  return NextResponse.json({ ...item, category: normalizeCategory(item.category) });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("finance:write");
  if (auth.error) return auth.error;

  const parsed = stockItemUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Stok kartı bilgileri geçersiz", errors: formatZodError(parsed.error) }, { status: 400 });
  }
  const { name, category, unit, minQuantity, barcode, expiresAt, storageLocation } = parsed.data;
  const existing = await (prisma as any).stockItem.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  if (name !== undefined) {
    const nameConflict = await (prisma as any).stockItem.findFirst({
      where: {
        id: { not: params.id },
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        isActive: true,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true, name: true },
    });
    if (nameConflict) {
      return NextResponse.json(
        { error: `"${nameConflict.name}" isimli başka bir stok kartı zaten var.` },
        { status: 409 }
      );
    }
  }

  let updated;
  try {
    updated = await (prisma as any).stockItem.update({
      where: { id: params.id },
      data: {
        name,
        category: category !== undefined ? normalizeCategory(category) : undefined,
        unit,
        minQuantity,
        unitPrice: null,
        supplier: null,
        barcode,
        expiresAt:   expiresAt   !== undefined ? (expiresAt ? new Date(expiresAt) : null) : undefined,
        storageLocation,
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: `"${name}" isimli başka bir stok kartı zaten var.` }, { status: 409 });
    }
    throw error;
  }

  await writeAudit(auth.user.id, "STOCK_ITEM_UPDATE", `Stok kalemi güncellendi (${params.id})`);
  return NextResponse.json({ ...updated, category: normalizeCategory(updated.category) });
}

// PATCH: stock movement (GIRIS/CIKIS)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("finance:write");
  if (auth.error) return auth.error;

  const parsed = stockMovementSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Stok hareketi bilgileri geçersiz", errors: formatZodError(parsed.error) }, { status: 400 });
  }
  const { type, quantity, note, supplier, unitPrice } = parsed.data;
  try {
    const result = await (prisma as any).$transaction(async (tx: any) => {
      return applyStockMovement({
        tx,
        stockItemId: params.id,
        institutionId: auth.user.institutionId,
        userId: auth.user.id,
        type,
        quantity,
        note,
        supplier,
        unitPrice,
      });
    });

    await writeAudit(auth.user.id, "STOCK_MOVEMENT", `${type === "GIRIS" ? "Stok girişi" : "Stok çıkışı"}: ${quantity} adet (${params.id})`);
    return NextResponse.json({ ...result.item, category: normalizeCategory(result.item.category), isCritical: result.isCritical });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Stok hareketi kaydedilemedi" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("finance:write");
  if (auth.error) return auth.error;

  const existing = await (prisma as any).stockItem.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  await (prisma as any).stockItem.update({
    where: { id: existing.id },
    data:  { isActive: false },
  });

  await writeAudit(auth.user.id, "STOCK_ITEM_DELETE", `Stok kalemi pasifleştirildi (${params.id})`);
  return NextResponse.json({ ok: true });
}
