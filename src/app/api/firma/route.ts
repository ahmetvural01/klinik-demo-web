import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { firmaCreateSchema, formatZodError } from "@/lib/validators";

export const GET = withApiTiming("firma", async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;

    const firmaWhere = {
      isActive: true,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    };

    const [firmas, islemSums] = await Promise.all([
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
        _count: { _all: true },
      }),
    ]);

    const sumsByFirma = new Map<string, { borc: number; odenen: number; totalIslem: number; odemeCount: number }>();
    for (const row of islemSums) {
      const entry = sumsByFirma.get(row.firmaId) || { borc: 0, odenen: 0, totalIslem: 0, odemeCount: 0 };
      const amount = Number(row._sum.tutar ?? 0);
      if (row.islemTipi === "ALIM" || row.islemTipi === "HIZMET") entry.borc += amount;
      else if (row.islemTipi === "ODEME") { entry.odenen += amount; entry.odemeCount += row._count._all; }
      entry.totalIslem += row._count._all;
      sumsByFirma.set(row.firmaId, entry);
    }

    return NextResponse.json(
      firmas.map((f: any) => {
        const sums = sumsByFirma.get(f.id) || { borc: 0, odenen: 0, totalIslem: 0, odemeCount: 0 };

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
          bakiye: sums.borc - sums.odenen,
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
    const parsed = firmaCreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Firma bilgileri geçersiz", errors: formatZodError(parsed.error) }, { status: 400 });
    }
    const { name, phone, iban, ibanName, notes, kategori, paymentTerms, customPaymentDays } = parsed.data;

    const firma = await (prisma as any).firma.create({
      data: {
        name,
        institutionId: auth.user.institutionId,
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
    if (err.code === "P2002") return NextResponse.json({ error: "Bu firma adi zaten kayitli" }, { status: 409 });
    return NextResponse.json({ error: "Firma kaydı oluşturulamadı" }, { status: 503 });
  }
}
