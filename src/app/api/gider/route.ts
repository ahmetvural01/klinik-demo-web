import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { findEligibleDoctor } from "@/lib/hakedis";
import { isValidDateKey, turkeyDayRangeUtc, turkeyYearMonth } from "@/lib/tz";

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
    if ((from && !isValidDateKey(from)) || (to && !isValidDateKey(to))) {
      return NextResponse.json({ error: "Geçersiz tarih aralığı" }, { status: 400 });
    }
    if (from && to && from > to) {
      return NextResponse.json({ error: "Başlangıç tarihi bitiş tarihinden sonra olamaz" }, { status: 400 });
    }

    const where: Record<string, unknown> = {
      status: "AKTIF",
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
    };
    if (categoryId) where.categoryId = categoryId;
    if (from || to) {
      where.tarih = {
        ...(from ? { gte: turkeyDayRangeUtc(from).start } : {}),
        ...(to ? { lte: turkeyDayRangeUtc(to).end } : {})
      };
    }

    const [expenses, totalAgg] = await Promise.all([
      (prisma as any).expense.findMany({
        where,
        include: {
          expenseCategory: { select: { id: true, name: true } },
          doctor: { select: { id: true, fullName: true } },
        },
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
  // Payment/Purchase/FirmaIslem'in tersine gider kaydı hiç idempotency
  // koruması olmadan oluşturuluyordu — çift tıklama veya ağ tekrar denemesi
  // aynı gideri iki kez kaydedip toplamları ve doktor hakedişini şişirebilirdi
  // (bkz. denetim raporu). Aynı desen burada da uygulanıyor.
  const requestKey = req.headers.get("idempotency-key")?.trim() || null;
  let institutionId: string | null | undefined;
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    institutionId = auth.user.institutionId;
    if (!institutionId) {
      return NextResponse.json({ error: "Gider kaydı için kurum bağlamı zorunlu" }, { status: 403 });
    }

    if (requestKey && (requestKey.length < 8 || requestKey.length > 100)) {
      return NextResponse.json({ error: "İşlem anahtarı geçersiz" }, { status: 400 });
    }

    if (requestKey) {
      const existingExpense = await (prisma as any).expense.findUnique({ where: { requestKey } });
      if (existingExpense) {
        if (institutionId && existingExpense.institutionId !== institutionId) {
          return NextResponse.json({ error: "İşlem anahtarı başka bir kayıtta kullanılmış" }, { status: 409 });
        }
        return NextResponse.json({ ...existingExpense, duplicatePrevented: true }, { status: 200 });
      }
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
    }
    let { categoryId, category } = body;
    const { tarih, description, tutar, yontem = "NAKIT", faturaNo, kdvOrani = 0, doctorId, periodYear, periodMonth } = body;

    if (!tarih || !tutar) {
      return NextResponse.json({ error: "Tarih ve tutar zorunlu" }, { status: 400 });
    }
    const tutarNum = Number(tutar);
    const kdvOraniNum = Number(kdvOrani);
    const validMethods = new Set(["NAKIT", "KREDI_KARTI", "HAVALE_EFT", "MAIL_ORDER", "DIGER"]);
    if (typeof yontem !== "string" || !validMethods.has(yontem)) {
      return NextResponse.json({ error: "Geçersiz ödeme yöntemi" }, { status: 400 });
    }
    if (Number.isNaN(new Date(tarih).getTime())) {
      return NextResponse.json({ error: "Geçerli bir tarih girilmelidir" }, { status: 400 });
    }
    if (!Number.isFinite(tutarNum) || tutarNum <= 0 || tutarNum > 99_999_999.99) {
      return NextResponse.json({ error: "Tutar pozitif bir sayı olmalıdır" }, { status: 400 });
    }
    if (!Number.isFinite(kdvOraniNum) || kdvOraniNum < 0 || kdvOraniNum > 100) {
      return NextResponse.json({ error: "KDV oranı 0-100 arasında olmalıdır" }, { status: 400 });
    }
    if (description !== undefined && description !== null && (typeof description !== "string" || description.trim().length > 1_000)) {
      return NextResponse.json({ error: "Açıklama en fazla 1000 karakter olabilir" }, { status: 400 });
    }
    if (category !== undefined && category !== null && (typeof category !== "string" || category.trim().length > 120)) {
      return NextResponse.json({ error: "Kategori en fazla 120 karakter olabilir" }, { status: 400 });
    }
    if (faturaNo !== undefined && faturaNo !== null && (typeof faturaNo !== "string" || faturaNo.trim().length > 100)) {
      return NextResponse.json({ error: "Fatura numarası en fazla 100 karakter olabilir" }, { status: 400 });
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
      const datePeriod = turkeyYearMonth(tarihDate);
      if (periodYear !== undefined && (!Number.isInteger(periodYear) || periodYear < 2000 || periodYear > 2100)) {
        return NextResponse.json({ error: "Hakediş yılı geçersiz" }, { status: 400 });
      }
      if (periodMonth !== undefined && (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12)) {
        return NextResponse.json({ error: "Hakediş ayı geçersiz" }, { status: 400 });
      }
      resolvedPeriodYear = Number.isInteger(periodYear) ? periodYear : datePeriod.year;
      resolvedPeriodMonth = Number.isInteger(periodMonth) && periodMonth >= 1 && periodMonth <= 12
        ? periodMonth
        : datePeriod.month;

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
      } else {
        const payoutCategory = await (prisma as any).expenseCategory.findFirst({
          where: { id: categoryId, institutionId },
          select: { name: true, isDoctorPayout: true },
        });
        if (!payoutCategory) {
          return NextResponse.json({ error: "Kategori bulunamadı veya bu kuruma ait değil" }, { status: 404 });
        }
        if (!payoutCategory.isDoctorPayout) {
          return NextResponse.json({ error: "Doktor hakedişi ödemesi yalnızca hakediş kategorisine kaydedilebilir" }, { status: 400 });
        }
        category = payoutCategory.name;
      }
    } else if (categoryId) {
      // doctorId gönderilmeden doğrudan "Doktor Hakedişi" kategorisiyle kayıt
      // atılmaya çalışılırsa reddet — aksi halde gider kaydedilir ama hiçbir
      // doktorun hakediş hesabına yansımaz, para "kaybolmuş" gibi görünür
      // (bkz. denetim raporu: sessiz veri bozulması riski).
      const category_ = await (prisma as any).expenseCategory.findFirst({
        where: { id: categoryId, ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}) },
        select: { name: true, isDoctorPayout: true },
      });
      if (!category_) {
        return NextResponse.json({ error: "Kategori bulunamadı veya bu kuruma ait değil" }, { status: 404 });
      }
      if (category_?.isDoctorPayout) {
        return NextResponse.json({ error: "\"Doktor Hakedişi\" kategorisiyle gider kaydedilirken doktor seçilmesi zorunludur." }, { status: 400 });
      }
      category = category_.name;
    }

    if (!category) {
      return NextResponse.json({ error: "Kategori zorunlu" }, { status: 400 });
    }

    const expense = await (prisma as any).expense.create({
      data: {
        requestKey,
        tarih: new Date(tarih),
        institutionId,
        categoryId: categoryId || null,
        category: category.trim(),
        description: description?.trim() || null,
        tutar: Number(tutar),
        yontem,
        faturaNo: resolvedDoctorId ? null : (faturaNo?.trim() || null),
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
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      if (requestKey) {
        const existingExpense = await (prisma as any).expense.findUnique({ where: { requestKey } });
        if (existingExpense && (!institutionId || existingExpense.institutionId === institutionId)) {
          return NextResponse.json({ ...existingExpense, duplicatePrevented: true }, { status: 200 });
        }
      }
      return NextResponse.json(
        { error: "Bu gider zaten kaydedildi. Liste güncelleniyor.", duplicatePrevented: true },
        { status: 409 },
      );
    }
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
