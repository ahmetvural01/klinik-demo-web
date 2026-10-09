import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string; kid: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok || !auth.user.institutionId) return NextResponse.json({ error: branch.ok ? "Kurum bulunamadı" : branch.message }, { status: 403 });

    const kontakt = await (prisma as any).firmaKontakt.findFirst({
      where: {
        id: params.kid,
        firmaId: params.id,
        institutionId: auth.user.institutionId,
        branchId: branch.branchId,
      },
    });
    
    if (!kontakt) {
      return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    }

    return NextResponse.json(kontakt);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "İşlem tamamlanamadı. Lütfen tekrar deneyin." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string; kid: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok || !auth.user.institutionId) return NextResponse.json({ error: branch.ok ? "Kurum bulunamadı" : branch.message }, { status: 403 });

    const { ad, unvan, email, telefon, rol, isPrimary } = await req.json();
    if (ad !== undefined && (typeof ad !== "string" || !ad.trim())) {
      return NextResponse.json({ error: "Yetkili kişinin adı zorunlu" }, { status: 400 });
    }
    const existing = await (prisma as any).firmaKontakt.findFirst({
      where: {
        id: params.kid,
        firmaId: params.id,
        institutionId: auth.user.institutionId,
        branchId: branch.branchId,
      },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });

    // Eğer primary olarak işaretlenirse, diğer primary'leri false'a çevir
    if (isPrimary) {
      await (prisma as any).firmaKontakt.updateMany({
        where: { institutionId: auth.user.institutionId, branchId: branch.branchId, firmaId: params.id, id: { not: params.kid } },
        data: { isPrimary: false }
      });
    }

    const kontakt = await (prisma as any).firmaKontakt.update({
      where: {
        id_institutionId_branchId: {
          id: params.kid,
          institutionId: auth.user.institutionId,
          branchId: branch.branchId,
        },
      },
      // Boşaltılan alan (unvan, e-posta, telefon, rol) gerçekten silinir;
      // önceden "|| undefined" yüzünden eski değer geri geliyordu. Ad zorunlu.
      data: {
        ad: typeof ad === "string" && ad.trim() ? ad.trim() : undefined,
        unvan: typeof unvan === "string" ? (unvan.trim() || null) : undefined,
        email: typeof email === "string" ? (email.trim() || null) : undefined,
        telefon: typeof telefon === "string" ? (telefon.trim() || null) : undefined,
        rol: typeof rol === "string" ? (rol.trim() || null) : undefined,
        isPrimary: typeof isPrimary === "boolean" ? isPrimary : undefined
      }
    });

    await writeAudit(auth.user.id, "FIRMA_KONTAKT_UPDATE", params.kid);
    return NextResponse.json(kontakt);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "İşlem tamamlanamadı. Lütfen tekrar deneyin." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string; kid: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok || !auth.user.institutionId) return NextResponse.json({ error: branch.ok ? "Kurum bulunamadı" : branch.message }, { status: 403 });
    const existing = await (prisma as any).firmaKontakt.findFirst({
      where: {
        id: params.kid,
        firmaId: params.id,
        institutionId: auth.user.institutionId,
        branchId: branch.branchId,
      },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });

    // Soft delete
    await (prisma as any).firmaKontakt.update({
      where: {
        id_institutionId_branchId: {
          id: params.kid,
          institutionId: auth.user.institutionId,
          branchId: branch.branchId,
        },
      },
      data: { isActive: false }
    });

    await writeAudit(auth.user.id, "FIRMA_KONTAKT_DELETE", params.kid);
    return NextResponse.json({ message: "Yetkili kişi silindi" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "İşlem tamamlanamadı. Lütfen tekrar deneyin." }, { status: 500 });
  }
}
