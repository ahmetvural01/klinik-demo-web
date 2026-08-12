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
      return NextResponse.json({ error: "Bulunamadi" }, { status: 404 });
    }

    return NextResponse.json(kontakt);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
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
    const existing = await (prisma as any).firmaKontakt.findFirst({
      where: {
        id: params.kid,
        firmaId: params.id,
        institutionId: auth.user.institutionId,
        branchId: branch.branchId,
      },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Bulunamadi" }, { status: 404 });

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
      data: {
        ad: ad || undefined,
        unvan: unvan || undefined,
        email: email || undefined,
        telefon: telefon || undefined,
        rol: rol || undefined,
        isPrimary: isPrimary !== undefined ? isPrimary : undefined
      }
    });

    await writeAudit(auth.user.id, "FIRMA_KONTAKT_UPDATE", params.kid);
    return NextResponse.json(kontakt);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
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
    if (!existing) return NextResponse.json({ error: "Bulunamadi" }, { status: 404 });

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
    return NextResponse.json({ message: "Kontakt silindi" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}
