import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth, writeAudit } from "@/lib/api";
import { applyStockMovement } from "@/lib/stock-ledger";
import { formatZodError, stockItemUpdateSchema, stockMovementSchema } from "@/lib/validators";
import { requireActiveBranch } from "@/lib/branch-context";
import { publicErrorResponse } from "@/lib/public-error";
import { normalizeCategory } from "@/lib/stock-category";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("stock:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

  const item = await (prisma as any).stockItem.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      branchId: branch.branchId,
    },
    include: {
      movements: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          user: { select: { fullName: true } },
          lotAllocations: {
            include: {
              lot: {
                select: {
                  lotNo: true,
                  expiresAt: true,
                  unitCost: true,
                  supplierName: true,
                },
              },
            },
          },
        },
      },
      lots: {
        where: { status: { not: "IPTAL" } },
        orderBy: [
          { expiresAt: { sort: "asc", nulls: "last" } },
          { receivedAt: "desc" },
        ],
      },
    },
  });
  if (!item) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  // Maliyet alanları yalnız finans görebilenlere (liste uç noktasıyla aynı kural).
  if (!(await hasEffectivePermission(auth.user, "finance:read"))) {
    return NextResponse.json({
      ...item,
      unitPrice: null,
      category: normalizeCategory(item.category),
      lots: (item.lots || []).map((lot: any) => ({ ...lot, unitCost: null })),
      movements: (item.movements || []).map((movement: any) => ({
        ...movement,
        unitPrice: null,
        lotAllocations: (movement.lotAllocations || []).map((allocation: any) => ({
          ...allocation,
          unitCost: null,
          lot: allocation.lot ? { ...allocation.lot, unitCost: null } : allocation.lot,
        })),
      })),
    });
  }

  return NextResponse.json({ ...item, category: normalizeCategory(item.category) });
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("stock:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

  const parsed = stockItemUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Stok kartı bilgileri geçersiz", errors: formatZodError(parsed.error) }, { status: 400 });
  }
  const { name, category, unit, minQuantity, barcode, expiresAt, storageLocation } = parsed.data;
  const existing = await (prisma as any).stockItem.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      branchId: branch.branchId,
    },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  if (name !== undefined) {
    const nameConflict = await (prisma as any).stockItem.findFirst({
      where: {
        id: { not: params.id },
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        branchId: branch.branchId,
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
      where: {
        id_institutionId_branchId: {
          id: params.id,
          institutionId: auth.user.institutionId,
          branchId: branch.branchId,
        },
      },
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
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("stock:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

  // Çift tıklama / ağ hatası sonrası retry koruması sunucu tarafındadır —
  // istemcinin loading state'ine güvenilmez (bkz. denetim raporu). Aynı
  // Idempotency-Key ile gelen tekrar istek, stok miktarını İKİNCİ KEZ
  // değiştirmeden mevcut hareketi döndürür.
  const requestKey = req.headers.get("Idempotency-Key")?.trim() || null;
  if (requestKey && (requestKey.length < 8 || requestKey.length > 180)) {
    return NextResponse.json({ message: "İşlem anahtarı geçersiz" }, { status: 400 });
  }
  const institutionId = auth.user.institutionId;

  if (requestKey) {
    const existing = await (prisma as any).stockMovement.findFirst({
      where: { institutionId, branchId: branch.branchId, requestKey },
    });
    if (existing) {
      const item = await (prisma as any).stockItem.findFirst({ where: { id: params.id, ...(institutionId ? { institutionId } : {}), branchId: branch.branchId } });
      if (item) {
        return NextResponse.json({ ...item, category: normalizeCategory(item.category), isCritical: Number(item.quantity) < Number(item.minQuantity), duplicateRequest: true });
      }
    }
  }

  const parsed = stockMovementSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Stok hareketi bilgileri geçersiz", errors: formatZodError(parsed.error) }, { status: 400 });
  }
  const { type, quantity, note, supplier } = parsed.data;
  let { unitPrice } = parsed.data;
  // Fiyatı girilmemiş giriş (sayım fazlası, iade) ₺0 maliyetli parti açıp
  // ortalama maliyeti düşürmesin: mevcut partilerin ağırlıklı ortalaması kullanılır.
  if (type === "GIRIS" && unitPrice === undefined) {
    const lots = await (prisma as any).stockLot.findMany({
      where: {
        stockItemId: params.id,
        ...(institutionId ? { institutionId } : {}),
        branchId: branch.branchId,
        status: "AKTIF",
        quantityRemaining: { gt: 0 },
      },
      select: { quantityRemaining: true, unitCost: true },
    });
    const lotQuantity = lots.reduce((sum: number, lot: any) => sum + Number(lot.quantityRemaining || 0), 0);
    if (lotQuantity > 0) {
      const lotCost = lots.reduce((sum: number, lot: any) => sum + Number(lot.quantityRemaining || 0) * Number(lot.unitCost || 0), 0);
      unitPrice = Math.round((lotCost / lotQuantity) * 100) / 100;
    }
  }
  try {
    const result = await (prisma as any).$transaction(async (tx: any) => {
      return applyStockMovement({
        tx,
        stockItemId: params.id,
        institutionId,
        branchId: branch.branchId,
        userId: auth.user.id,
        type,
        quantity,
        note,
        supplier,
        unitPrice,
        requestKey,
      });
    });

    if (!result.duplicate) {
      await writeAudit(auth.user.id, "STOCK_MOVEMENT", `${type === "GIRIS" ? "Stok girişi" : "Stok çıkışı"}: ${quantity} adet (${params.id})`);
    }
    return NextResponse.json({
      ...result.item,
      category: normalizeCategory(result.item.category),
      isCritical: result.isCritical,
      ...(result.duplicate ? { duplicateRequest: true } : {}),
    });
  } catch (error) {
    // Aynı requestKey ile eşzamanlı iki istek, satır kilidi (FOR UPDATE)
    // sayesinde applyStockMovement içindeki kontrolle normalde zaten
    // yakalanır; bu P2002 yalnızca farklı stok kalemlerine aynı anahtarla
    // gelen teorik bir yarış durumu için son savunma hattıdır.
    if (requestKey && error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      const existing = await (prisma as any).stockMovement.findFirst({ where: { institutionId, branchId: branch.branchId, requestKey } });
      const item = existing ? await (prisma as any).stockItem.findFirst({ where: { id: params.id, ...(institutionId ? { institutionId } : {}), branchId: branch.branchId } }) : null;
      if (item) {
        return NextResponse.json({ ...item, category: normalizeCategory(item.category), isCritical: Number(item.quantity) < Number(item.minQuantity), duplicateRequest: true });
      }
    }
    const publicError = publicErrorResponse(error, "Stok hareketi kaydedilemedi. Lütfen tekrar deneyin.");
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("stock:delete");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

  const existing = await (prisma as any).stockItem.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      branchId: branch.branchId,
    },
    // institutionId/branchId seçilmediği için aşağıdaki bileşik anahtar
    // undefined kalıyor ve "Arşivle" her seferinde 500 veriyordu.
    select: { id: true, name: true, institutionId: true, branchId: true },
  });
  if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  await (prisma as any).stockItem.update({
    where: {
      id_institutionId_branchId: {
        id: existing.id,
        institutionId: existing.institutionId,
        branchId: existing.branchId,
      },
    },
    data:  { isActive: false },
  });

  await writeAudit(auth.user.id, "STOCK_ITEM_DELETE", `"${existing.name}" stok kartı arşivlendi (${params.id})`);
  return NextResponse.json({ ok: true });
}
