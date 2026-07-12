import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;

    const firma = await (prisma as any).firma.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      include: {
        islemler: {
          where: { status: "AKTIF" },
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
  } catch (e) {
    return NextResponse.json({ error: "Bulunamadi" }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    
    const body = await req.json();
    const { kategori, paymentTerms, customPaymentDays, ...rest } = body;
    const existing = await (prisma as any).firma.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      select: { id: true, kategori: true },
    });
    if (!existing) return NextResponse.json({ error: "Bulunamadi" }, { status: 404 });

    // Kategori LAB'dan çıkarılırsa, bu firmaya bağlı lab siparişleri artık
    // yeni fatura/işlem eklerken firma kartı bulunamıyor gibi davranır ve
    // zincir kopar (bkz. denetim raporu Tema 3/5).
    if (existing.kategori === "LAB" && kategori && kategori !== "LAB") {
      const linkedOrderCount = await (prisma as any).labOrder.count({ where: { firmaId: params.id } });
      if (linkedOrderCount > 0) {
        return NextResponse.json({
          error: `Bu firmaya bağlı ${linkedOrderCount} laboratuvar siparişi var. Kategori LAB'dan çıkarılamaz.`,
        }, { status: 400 });
      }
    }

    const firma = await (prisma as any).firma.update({
      where: { id: existing.id },
      data: {
        ...rest,
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
  } catch (e) {
    return NextResponse.json({ error: "Firma guncellenemedi" }, { status: 503 });
  }
}
