import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { findEligibleDoctor } from "@/lib/hakedis";

export const GET = withApiTiming("gider", async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const takeParam = Number.parseInt(searchParams.get("take") || "", 10);
    const take = Number.isFinite(takeParam) && takeParam > 0 ? Math.min(takeParam, 1000) : 500;

    const where: Record<string, unknown> = {
      status: "AKTIF",
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    };
    if (categoryId) where.categoryId = categoryId;
    if (from || to) {
      where.tarih = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to + "T23:59:59") } : {})
      };
    }

    const [expenses, totalAgg] = await Promise.all([
      (prisma as any).expense.findMany({
        where,
        include: { expenseCategory: { select: { id: true, name: true } } },
        orderBy: { tarih: "desc" },
        take,
      }),
      (prisma as any).expense.aggregate({ _sum: { tutar: true }, where }),
    ]);

    const total = Number(totalAgg._sum.tutar ?? 0);
    return NextResponse.json({ expenses, total });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;

    const body = await req.json();
    let { categoryId, category } = body;
    const { tarih, description, tutar, yontem = "NAKIT", faturaNo, kdvOrani = 0, doctorId, periodYear, periodMonth } = body;

    if (!tarih || !tutar) {
      return NextResponse.json({ error: "Tarih ve tutar zorunlu" }, { status: 400 });
    }

    let resolvedDoctorId: string | null = null;
    let resolvedPeriodYear: number | null = null;
    let resolvedPeriodMonth: number | null = null;

    if (doctorId) {
      if (!auth.user.institutionId) {
        return NextResponse.json({ error: "Kurum bilgisi olmadan doktor hakedişi kaydedilemez" }, { status: 403 });
      }
      if (yontem !== "NAKIT" && yontem !== "HAVALE_EFT") {
        return NextResponse.json({ error: "Doktor hakedişi ödemeleri sadece nakit veya havale/EFT ile yapılabilir" }, { status: 400 });
      }
      const doctor = await findEligibleDoctor({ doctorId, institutionId: auth.user.institutionId });
      if (!doctor) {
        return NextResponse.json({ error: "Doktor bu kurumda bulunamadı" }, { status: 404 });
      }
      resolvedDoctorId = doctorId;

      const tarihDate = new Date(tarih);
      resolvedPeriodYear = Number.isInteger(periodYear) ? periodYear : tarihDate.getUTCFullYear();
      resolvedPeriodMonth = Number.isInteger(periodMonth) && periodMonth >= 1 && periodMonth <= 12
        ? periodMonth
        : tarihDate.getUTCMonth() + 1;

      // Kategori verilmemişse "Doktor Hakedişi" kategorisini bul ya da oluştur —
      // kullanıcı her seferinde kategori seçmek zorunda kalmasın.
      if (!categoryId) {
        const payoutCategory = await (prisma as any).expenseCategory.upsert({
          where: { institutionId_name: { institutionId: auth.user.institutionId, name: "Doktor Hakedişi" } },
          update: { isDoctorPayout: true },
          create: { institutionId: auth.user.institutionId, name: "Doktor Hakedişi", isDoctorPayout: true },
        });
        categoryId = payoutCategory.id;
        category = payoutCategory.name;
      }
    }

    if (!category) {
      return NextResponse.json({ error: "Kategori zorunlu" }, { status: 400 });
    }

    const expense = await (prisma as any).expense.create({
      data: {
        tarih: new Date(tarih),
        institutionId: auth.user.institutionId,
        categoryId: categoryId || null,
        category,
        description: description || null,
        tutar: Number(tutar),
        yontem,
        faturaNo: resolvedDoctorId ? null : (faturaNo || null),
        kdvOrani: resolvedDoctorId ? 0 : Number(kdvOrani),
        status: "AKTIF",
        doctorId: resolvedDoctorId,
        periodYear: resolvedPeriodYear,
        periodMonth: resolvedPeriodMonth,
      }
    });
    await writeAudit(auth.user.id, "GIDER_CREATE", `${tutar} TL gider eklendi (${category})`);
    return NextResponse.json(expense, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
