import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { normalizeCategory } from "@/lib/stock-category";

export const dynamic = "force-dynamic";

const nameKey = (value: string) => value.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

// POST /api/stock/[id]/restore — arşivlenen stok kartını geri alır. Arşivleme
// ile aynı yetki (stock:delete) gerekir; geçmiş hareketler zaten saklandığı
// için yalnız kart tekrar listede görünür hale gelir.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
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
    select: { id: true, name: true, isActive: true, institutionId: true, branchId: true },
  });
  if (!existing) return NextResponse.json({ error: "Stok kartı bulunamadı" }, { status: 404 });
  if (existing.isActive) return NextResponse.json({ ok: true, alreadyActive: true });

  // Aynı adla (harf farkı gözetmeden) aktif başka kart varsa geri almak
  // stoğu iki karta böler; kullanıcıya hangi kartın kullanıldığı söylenir.
  const activeItems = await (prisma as any).stockItem.findMany({
    where: { institutionId: existing.institutionId, branchId: existing.branchId, isActive: true },
    select: { name: true },
  });
  const conflict = activeItems.find((row: { name: string }) => nameKey(row.name) === nameKey(existing.name));
  if (conflict) {
    return NextResponse.json(
      { error: `"${conflict.name}" adıyla aktif bir stok kartı var. Bu kartı geri almak yerine mevcut kartı kullanın.` },
      { status: 409 },
    );
  }

  const restored = await (prisma as any).stockItem.update({
    where: {
      id_institutionId_branchId: {
        id: existing.id,
        institutionId: existing.institutionId,
        branchId: existing.branchId,
      },
    },
    data: { isActive: true },
  });
  await writeAudit(auth.user.id, "STOCK_ITEM_RESTORE", `"${existing.name}" stok kartı arşivden geri alındı (${params.id})`);
  return NextResponse.json({ ...restored, category: normalizeCategory(restored.category) });
}
