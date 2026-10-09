import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { firmaCreateSchema, formatZodError } from "@/lib/validators";
import { requireActiveBranch } from "@/lib/branch-context";

// GET /api/firma?durum=aktif|pasif|tumu — varsayılan yalnız aktif firmalar
// (Muhasebe, Laboratuvar ve hasta dosyası seçicileri bu varsayılana güvenir).
// Tedarikçi listesi "tumu" ile pasife alınmış ama borcu kalan firmaları da
// görür; aksi halde pasife alınan firmanın borcu toplamlardan düşüyordu.
export const GET = withApiTiming("firma", async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

    const durum = new URL(req.url).searchParams.get("durum");
    const firmaWhere = {
      ...(durum === "tumu" ? {} : { isActive: durum !== "pasif" }),
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      branchId: branch.branchId,
    };

    const [firmas, islemSums, pendingOrders] = await Promise.all([
      (prisma as any).firma.findMany({
        where: firmaWhere,
        include: {
          kontaktler: {
            where: { isActive: true },
            select: { id: true, ad: true, unvan: true, email: true, telefon: true, isPrimary: true }
          }
        },
        orderBy: { name: "asc" }
      }),
      // borc/odenen ve vendorScore'un işlem sayısı girdileri artık tüm işlem
      // geçmişi Node'a çekilmeden DB'de gruplanıp toplanıyor.
      (prisma as any).firmaIslem.groupBy({
        by: ["firmaId", "islemTipi"],
        where: { status: "AKTIF", firma: firmaWhere },
        _sum: { tutar: true },
        _max: { tarih: true },
        _count: { _all: true },
      }),
      // Teslimat bekleyen siparişler: listede "sipariş bekliyor" bilgisi
      // (stok ve borç teslimde oluştuğu için başka hiçbir yerde görünmüyordu).
      (prisma as any).purchase.groupBy({
        by: ["firmaId"],
        where: {
          status: "AKTIF",
          receiptStatus: "SIPARIS_VERILDI",
          ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
          branchId: branch.branchId,
        },
        _count: { _all: true },
      }),
    ]);
    const pendingByFirma = new Map<string, number>(
      pendingOrders.map((row: any) => [row.firmaId as string, Number(row._count?._all || 0)]),
    );

    const sumsByFirma = new Map<string, { borc: number; odenen: number; totalIslem: number; odemeCount: number; sonIslem: Date | null }>();
    for (const row of islemSums) {
      const entry = sumsByFirma.get(row.firmaId) || { borc: 0, odenen: 0, totalIslem: 0, odemeCount: 0, sonIslem: null };
      const lastDate = row._max?.tarih ? new Date(row._max.tarih) : null;
      if (lastDate && (!entry.sonIslem || lastDate > entry.sonIslem)) entry.sonIslem = lastDate;
      const amount = Number(row._sum.tutar ?? 0);
      if (row.islemTipi === "ALIM" || row.islemTipi === "HIZMET") entry.borc += amount;
      else if (row.islemTipi === "ODEME") { entry.odenen += amount; entry.odemeCount += row._count._all; }
      entry.totalIslem += row._count._all;
      sumsByFirma.set(row.firmaId, entry);
    }

    return NextResponse.json(
      firmas.map((f: any) => {
        const sums = sumsByFirma.get(f.id) || { borc: 0, odenen: 0, totalIslem: 0, odemeCount: 0, sonIslem: null };

        // Vendor Score hesaplama: ödeme disiplini + kalite + hız
        const totalIslem = sums.totalIslem;
        const odemeDisiplini = totalIslem > 0 ? Math.round((sums.odemeCount / totalIslem) * 100) : 50;
        const kaliteSkoru = totalIslem > 0 ? 100 : 50; // (totalIslem - 0) / totalIslem, orijinal formülle birebir

        const score = Math.round((odemeDisiplini * 0.4 + kaliteSkoru * 0.35 + 70 * 0.25));

        const { kontaktler, ...rest } = f;
        return {
          ...rest,
          borc: sums.borc,
          odenen: sums.odenen,
          bakiye: Math.round((sums.borc - sums.odenen) * 100) / 100,
          sonIslemTarihi: sums.sonIslem ? sums.sonIslem.toISOString() : null,
          bekleyenSiparis: pendingByFirma.get(f.id) || 0,
          vendorScore: Math.min(100, Math.max(0, score)),
          primaryKontakt: kontaktler?.find((k: any) => k.isPrimary) || null,
          toplamKontakt: kontaktler?.length || 0
        };
      })
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ message: "Tedarikçi verileri yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });
    if (!auth.user.institutionId) {
      return NextResponse.json({ message: "Firma kaydı için kurum bağlamı zorunlu" }, { status: 403 });
    }
    const parsed = firmaCreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Firma bilgileri geçersiz", errors: formatZodError(parsed.error) }, { status: 400 });
    }
    const { name, phone, iban, ibanName, notes, kategori, paymentTerms, customPaymentDays } = parsed.data;

    // Aynı ad farklı büyük/küçük harfle ("İmplant A.Ş." / "implant a.ş.") ikinci
    // bir cari açmasın: veritabanı kısıtı harf farkını ayırt ediyordu.
    const nameKey = (value: string) => value.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
    const sameBranchFirmas = await (prisma as any).firma.findMany({
      where: { institutionId: auth.user.institutionId, branchId: branch.branchId },
      select: { name: true, isActive: true },
    });
    const duplicate = sameBranchFirmas.find((row: { name: string }) => nameKey(row.name) === nameKey(name));
    if (duplicate) {
      return NextResponse.json({
        error: duplicate.isActive
          ? `"${duplicate.name}" adlı firma zaten kayıtlı.`
          : `"${duplicate.name}" adlı firma pasif durumda kayıtlı. Tedarikçi listesinde "Pasif" filtresinden açıp aktif edebilirsiniz.`,
      }, { status: 409 });
    }

    const firma = await (prisma as any).firma.create({
      data: {
        name,
        institutionId: auth.user.institutionId,
        branchId: branch.branchId,
        phone,
        iban,
        ibanName,
        notes,
        kategori,
        paymentTerms,
        customPaymentDays,
        vendorScore: 0
      },
      include: {
        kontaktler: true
      }
    });
    await writeAudit(auth.user.id, "FIRMA_CREATE", `"${name}" tedarikçi kaydı oluşturuldu`);
    return NextResponse.json(firma, { status: 201 });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") return NextResponse.json({ error: "Bu adla kayıtlı bir firma zaten var." }, { status: 409 });
    return NextResponse.json({ error: "Firma kaydı oluşturulamadı" }, { status: 503 });
  }
}
