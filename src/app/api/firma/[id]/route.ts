import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

    const firma = await (prisma as any).firma.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        branchId: branch.branchId,
      },
      include: {
        islemler: {
          where: { status: "AKTIF", branchId: branch.branchId },
          orderBy: { tarih: "asc" }
        },
        kontaktler: {
          where: { isActive: true },
          orderBy: { isPrimary: "desc" }
        }
      }
    });
    if (!firma) return NextResponse.json({ error: "Bulunamadi" }, { status: 404 });
    return NextResponse.json(firma);
  } catch {
    return NextResponse.json({ error: "Bulunamadi" }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });
    
    const body = await req.json();
    const { kategori, paymentTerms, customPaymentDays, name, phone, iban, ibanName, notes, isActive } = body;
    // Body'den yalnızca izin verilen alanlar alınır — önceden `...rest` ile
    // gövdenin TAMAMI Prisma update'ine geçiyordu; bir kullanıcı body'ye
    // `institutionId` ekleyerek kendi kurumuna ait bir firma kaydını başka
    // bir kuruma taşıyabilirdi (bkz. denetim raporu, IDOR).
    const existing = await (prisma as any).firma.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        branchId: branch.branchId,
      },
      select: { id: true, kategori: true },
    });
    if (!existing) return NextResponse.json({ error: "Bulunamadi" }, { status: 404 });

    // Kategori LAB'dan çıkarılırsa, bu firmaya bağlı lab siparişleri artık
    // yeni fatura/işlem eklerken firma kartı bulunamıyor gibi davranır ve
    // zincir kopar (bkz. denetim raporu Tema 3/5).
    if (existing.kategori === "LAB" && kategori && kategori !== "LAB") {
      const linkedOrderCount = await (prisma as any).labOrder.count({ where: { firmaId: params.id, branchId: branch.branchId } });
      if (linkedOrderCount > 0) {
        return NextResponse.json({
          error: `Bu firmaya bağlı ${linkedOrderCount} laboratuvar siparişi var. Kategori LAB'dan çıkarılamaz.`,
        }, { status: 400 });
      }
    }

    const firma = await (prisma as any).firma.update({
      where: {
        id_institutionId_branchId: {
          id: existing.id,
          institutionId: existing.institutionId,
          branchId: existing.branchId,
        },
      },
      data: {
        ...(typeof name === "string" ? { name } : {}),
        ...(typeof phone === "string" ? { phone } : {}),
        ...(typeof iban === "string" ? { iban } : {}),
        ...(typeof ibanName === "string" ? { ibanName } : {}),
        ...(typeof notes === "string" ? { notes } : {}),
        ...(typeof isActive === "boolean" ? { isActive } : {}),
        kategori: kategori || undefined,
        paymentTerms: paymentTerms || undefined,
        customPaymentDays: customPaymentDays || undefined
      },
      include: {
        kontaktler: {
          where: { isActive: true }
        }
      }
    });
    await writeAudit(auth.user.id, "FIRMA_UPDATE", `Tedarikçi güncellendi (${params.id})`);
    return NextResponse.json(firma);
  } catch {
    return NextResponse.json({ error: "Firma guncellenemedi" }, { status: 503 });
  }
}
