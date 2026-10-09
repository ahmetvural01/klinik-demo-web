import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";

const FIRMA_KATEGORILERI = ["TEDARICI", "HIZMET_SAGLAYICI", "LAB", "KONTRAKTOR", "BANK", "DIGER"] as const;

// GET: tek firma + cari özet (pasif firmalar da döner). Firma detay ekranı
// önceden tüm aktif firmalar listesini çekip içinde arıyordu; pasife alınan
// firma "bulunamadı" oluyor, kalan borcu ve "Aktif Et" düğmesi kayboluyordu.
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
        kontaktler: {
          where: { isActive: true },
          orderBy: { isPrimary: "desc" }
        }
      }
    });
    if (!firma) return NextResponse.json({ error: "Firma bulunamadı" }, { status: 404 });

    const sums = await (prisma as any).firmaIslem.groupBy({
      by: ["islemTipi"],
      where: { firmaId: firma.id, branchId: branch.branchId, status: "AKTIF" },
      _sum: { tutar: true },
    });
    let borc = 0;
    let odenen = 0;
    for (const row of sums) {
      const amount = Number(row._sum.tutar ?? 0);
      if (row.islemTipi === "ODEME") odenen += amount;
      else borc += amount;
    }
    const { kontaktler, ...rest } = firma;
    return NextResponse.json({
      ...rest,
      kontaktler,
      borc: Math.round(borc * 100) / 100,
      odenen: Math.round(odenen * 100) / 100,
      bakiye: Math.round((borc - odenen) * 100) / 100,
      toplamKontakt: kontaktler?.length || 0,
    });
  } catch (error) {
    console.error("[firma/:id GET]", error);
    return NextResponse.json({ error: "Firma yüklenemedi. Lütfen tekrar deneyin." }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
    }
    const { kategori, paymentTerms, customPaymentDays, name, phone, iban, ibanName, notes, isActive } = body;
    if (typeof name === "string" && name.trim().length < 2) {
      return NextResponse.json({ error: "Firma adı en az 2 karakter olmalı" }, { status: 400 });
    }
    if (kategori !== undefined && kategori !== null && kategori !== "" && !FIRMA_KATEGORILERI.includes(kategori)) {
      return NextResponse.json({ error: "Firma türü geçersiz" }, { status: 400 });
    }
    // Body'den yalnızca izin verilen alanlar alınır — önceden `...rest` ile
    // gövdenin TAMAMI Prisma update'ine geçiyordu; bir kullanıcı body'ye
    // `institutionId` ekleyerek kendi kurumuna ait bir firma kaydını başka
    // bir kuruma taşıyabilirdi (bkz. denetim raporu, IDOR).
    // institutionId/branchId seçilmediği için aşağıdaki bileşik anahtar
    // undefined kalıyor ve her güncelleme ("Düzenle", "Pasife Al") hata
    // veriyordu; artık kayıttan okunur.
    const existing = await (prisma as any).firma.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        branchId: branch.branchId,
      },
      select: { id: true, kategori: true, institutionId: true, branchId: true },
    });
    if (!existing) return NextResponse.json({ error: "Firma bulunamadı" }, { status: 404 });

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

    const trimmedOrNull = (value: unknown) => (typeof value === "string" ? (value.trim() || null) : undefined);
    const firma = await (prisma as any).firma.update({
      where: {
        id_institutionId_branchId: {
          id: existing.id,
          institutionId: existing.institutionId,
          branchId: existing.branchId,
        },
      },
      data: {
        ...(typeof name === "string" ? { name: name.trim() } : {}),
        // Boşaltılan alan gerçekten silinir (önceden boş metin olarak kalıyordu).
        ...(typeof phone === "string" ? { phone: trimmedOrNull(phone) } : {}),
        ...(typeof iban === "string" ? { iban: trimmedOrNull(iban) } : {}),
        ...(typeof ibanName === "string" ? { ibanName: trimmedOrNull(ibanName) } : {}),
        ...(typeof notes === "string" ? { notes: trimmedOrNull(notes) } : {}),
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
    await writeAudit(
      auth.user.id,
      "FIRMA_UPDATE",
      typeof isActive === "boolean" && Object.keys(body).length === 1
        ? `Tedarikçi ${isActive ? "aktif edildi" : "pasife alındı"} (${firma.name})`
        : `Tedarikçi güncellendi (${firma.name})`,
    );
    return NextResponse.json(firma);
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code === "P2002") return NextResponse.json({ error: "Bu adla kayıtlı başka bir firma var." }, { status: 409 });
    console.error("[firma/:id PATCH]", error);
    return NextResponse.json({ error: "Firma güncellenemedi. Lütfen tekrar deneyin." }, { status: 500 });
  }
}
