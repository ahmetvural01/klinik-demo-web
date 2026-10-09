import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { computeDoctorMonthlyHakedis, computeDoctorMonthlyOdenen, monthRangeUtc } from "@/lib/hakedis";
import { turkeyYearMonth } from "@/lib/tz";
import { requireActiveBranch } from "@/lib/branch-context";

// Firma ödemesinden (FirmaIslem ODEME) otomatik oluşan gider, firmanın cari
// hesabıyla bağlıdır. Burada silinir/değiştirilirse firma ekstresi "ödendi"
// derken kasa çıkışı kaybolur ya da iki ekran farklı tutar gösterir. Bu
// kayıtlar yalnız firma ekranından (işlem iptali) yönetilir.
const LINKED_FIRMA_MESSAGE = "Bu gider bir firma ödemesinden otomatik oluştu. Değiştirmek veya iptal etmek için firmanın ekstresinden ödemeyi iptal edin.";
function isLinkedFirmaExpense(expense: { sourceType?: string | null; description?: string | null }) {
  return expense.sourceType === "FIRMA_ISLEM" || /\[SISTEM:FIRMA_ISLEM:/.test(expense.description || "");
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

    const expense = await (prisma as any).expense.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        branchId: branch.branchId,
      },
      include: { expenseCategory: { select: { id: true, name: true } } }
    });
    if (!expense) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    return NextResponse.json(expense);
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
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
      return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
    }
    const existing = await (prisma as any).expense.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        branchId: branch.branchId,
      },
      // institutionId/branchId seçilmezse aşağıdaki bileşik anahtarlı update tanımsız alanla
      // çağrılıyor ve HER düzenleme 500 ile düşüyordu.
      select: { id: true, institutionId: true, branchId: true, doctorId: true, tarih: true, tutar: true, categoryId: true, category: true, periodYear: true, periodMonth: true, sourceType: true, description: true },
    });
    if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    if (isLinkedFirmaExpense(existing)) {
      return NextResponse.json({ error: LINKED_FIRMA_MESSAGE }, { status: 409 });
    }

    const validMethods = new Set(["NAKIT", "KREDI_KARTI", "HAVALE_EFT", "MAIL_ORDER", "DIGER"]);
    if (body.yontem !== undefined && (typeof body.yontem !== "string" || !validMethods.has(body.yontem))) {
      return NextResponse.json({ error: "Geçersiz ödeme yöntemi" }, { status: 400 });
    }
    if (body.tarih !== undefined && (typeof body.tarih !== "string" || Number.isNaN(new Date(body.tarih).getTime()))) {
      return NextResponse.json({ error: "Geçerli bir tarih girilmelidir" }, { status: 400 });
    }

    if (body.tutar !== undefined && (!Number.isFinite(Number(body.tutar)) || Number(body.tutar) <= 0 || Number(body.tutar) > 99_999_999.99)) {
      return NextResponse.json({ error: "Tutar pozitif bir sayı olmalıdır" }, { status: 400 });
    }
    if (body.kdvOrani !== undefined && (!Number.isFinite(Number(body.kdvOrani)) || Number(body.kdvOrani) < 0 || Number(body.kdvOrani) > 100)) {
      return NextResponse.json({ error: "KDV oranı 0-100 arasında olmalıdır" }, { status: 400 });
    }
    if (body.description !== undefined && body.description !== null && (typeof body.description !== "string" || body.description.trim().length > 1_000)) {
      return NextResponse.json({ error: "Açıklama en fazla 1000 karakter olabilir" }, { status: 400 });
    }
    if (body.category !== undefined && (typeof body.category !== "string" || body.category.trim().length < 1 || body.category.trim().length > 120)) {
      return NextResponse.json({ error: "Kategori 1-120 karakter olmalıdır" }, { status: 400 });
    }
    if (body.faturaNo !== undefined && body.faturaNo !== null && (typeof body.faturaNo !== "string" || body.faturaNo.trim().length > 100)) {
      return NextResponse.json({ error: "Fatura numarası en fazla 100 karakter olabilir" }, { status: 400 });
    }

    if (existing.doctorId && body.yontem !== undefined && body.yontem !== "NAKIT" && body.yontem !== "HAVALE_EFT") {
      return NextResponse.json({ error: "Doktor hakedişi ödemeleri sadece nakit veya havale/EFT ile yapılabilir" }, { status: 400 });
    }

    // Bir hakediş ödemesinin hangi döneme (ay/yıl) sayıldığı, kayıt
    // oluşturulduktan sonra değiştirilemez — aksi halde tek bir işlemle iki
    // farklı ayın "ödenen" toplamı geriye dönük olarak bozulur.
    if (existing.doctorId && (body.periodYear !== undefined || body.periodMonth !== undefined)) {
      const nextYear = body.periodYear ?? existing.periodYear;
      const nextMonth = body.periodMonth ?? existing.periodMonth;
      if (nextYear !== existing.periodYear || nextMonth !== existing.periodMonth) {
        return NextResponse.json({ error: "Hakediş ödemesinin dönemi (ay/yıl) sonradan değiştirilemez — gerekiyorsa kaydı iptal edip yeniden oluşturun." }, { status: 400 });
      }
    }
    // Kategori başka bir kurumdan taşınamaz; ayrıca doktora bağlı olmayan bir
    // gider "Doktor Hakedişi" kategorisine geçirilerek hakediş hesabından
    // koparılamaz.
    let resolvedCategoryName: string | undefined;
    if (body.categoryId !== undefined && body.categoryId !== null && typeof body.categoryId !== "string") {
      return NextResponse.json({ error: "Kategori seçimi geçersiz" }, { status: 400 });
    }
    if (body.categoryId) {
      const targetCategory = await (prisma as any).expenseCategory.findFirst({
        where: { id: body.categoryId, ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}) },
        select: { name: true, isDoctorPayout: true },
      });
      if (!targetCategory) {
        return NextResponse.json({ error: "Kategori bulunamadı veya bu kuruma ait değil" }, { status: 404 });
      }
      if (!existing.doctorId && targetCategory.isDoctorPayout) {
        return NextResponse.json({ error: "\"Doktor Hakedişi\" kategorisine sadece doktor seçilerek (yeni kayıt olarak) geçilebilir." }, { status: 400 });
      }
      if (existing.doctorId && !targetCategory.isDoctorPayout) {
        return NextResponse.json({ error: "Doktor hakedişi ödemesi normal gider kategorisine taşınamaz." }, { status: 400 });
      }
      resolvedCategoryName = targetCategory.name;
    } else if (existing.doctorId && body.categoryId !== undefined) {
      return NextResponse.json({ error: "Doktor hakedişi ödemesinin kategorisi kaldırılamaz." }, { status: 400 });
    }

    // Tutar artırılıyorsa, doktorun o dönem hakedişini aşmadığından emin ol —
    // önceden bu sadece formda (istemci tarafında) kontrol ediliyordu, doğrudan
    // API çağrısıyla trivially bypass edilebiliyordu (bkz. denetim raporu Tema 5).
    if (existing.doctorId && body.tutar !== undefined) {
      const newTutar = Number(body.tutar);
      const existingDatePeriod = turkeyYearMonth(new Date(existing.tarih));
      const year = body.periodYear ?? existing.periodYear ?? existingDatePeriod.year;
      const month = body.periodMonth ?? existing.periodMonth ?? existingDatePeriod.month;
      const doctor = await prisma.user.findUnique({
        where: { id: existing.doctorId },
        select: { kkYuzde: true, genelYuzde: true, maasYuzde: true, branchMemberships: { where: { branchId: branch.branchId }, select: { kkYuzde: true, genelYuzde: true, maasYuzde: true }, take: 1 } },
      });
      if (doctor && Number.isInteger(year) && Number.isInteger(month)) {
        const { start, end } = monthRangeUtc(year, month);
        const branchRates = doctor.branchMemberships[0];
        const rates = {
          kkYuzde: Number(branchRates?.kkYuzde ?? doctor.kkYuzde ?? 0),
          genelYuzde: Number(branchRates?.genelYuzde ?? doctor.genelYuzde ?? 0),
          maasYuzde: Number(branchRates?.maasYuzde ?? doctor.maasYuzde ?? 0),
        };
        const [hakedisRows, odenenMap] = await Promise.all([
          computeDoctorMonthlyHakedis({ doctorId: existing.doctorId, institutionId: auth.user.institutionId!, branchId: branch.branchId, rates, rangeStart: start, rangeEnd: end }),
          computeDoctorMonthlyOdenen({ doctorId: existing.doctorId, institutionId: auth.user.institutionId, branchId: branch.branchId, rangeStart: start, rangeEnd: end }),
        ]);
        const hakedilen = hakedisRows.find((r) => r.year === year && r.month === month)?.hakedilen ?? 0;
        const odenenKey = `${year}-${String(month).padStart(2, "0")}`;
        const odenenToplam = odenenMap.get(odenenKey) || 0;
        const odenenHaricBu = odenenToplam - Number(existing.tutar);
        if (odenenHaricBu + newTutar > hakedilen + 0.01) {
          return NextResponse.json({
            error: `Bu tutar doktorun ${month}/${year} dönemi hakedişini aşıyor. Kalan: ${Math.max(0, hakedilen - odenenHaricBu).toFixed(2)} TL`,
          }, { status: 400 });
        }
      }
    }

    // Yalnızca düzenleme formunun gönderdiği alanlar güncellenir — ham `body`yi
    // doğrudan Prisma'ya vermek institutionId gibi alanların dışarıdan
    // değiştirilebilmesine (mass assignment / kiracı sızıntısı) yol açardı.
    const data: Record<string, unknown> = {};
    if (body.tarih !== undefined) data.tarih = new Date(body.tarih);
    if (body.categoryId !== undefined) data.categoryId = body.categoryId || null;
    if (resolvedCategoryName !== undefined) data.category = resolvedCategoryName;
    else if (body.category !== undefined) data.category = body.category.trim();
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.tutar !== undefined) data.tutar = Number(body.tutar);
    if (body.yontem !== undefined) data.yontem = body.yontem;
    if (body.faturaNo !== undefined) data.faturaNo = existing.doctorId ? null : (body.faturaNo?.trim() || null);
    if (body.kdvOrani !== undefined) data.kdvOrani = existing.doctorId ? 0 : Number(body.kdvOrani);
    // doctorId burada kasıtlı olarak whitelist'e alınmadı (hangi doktora ait olduğunu
    // değiştirmek hassas bir işlem, şu an arayüzde de sunulmuyor) — sadece hangi
    // hakediş dönemine (ay/yıl) sayıldığı düzeltilebilir.
    if (body.periodYear !== undefined) data.periodYear = body.periodYear === null ? null : Number(body.periodYear);
    if (body.periodMonth !== undefined) data.periodMonth = body.periodMonth === null ? null : Number(body.periodMonth);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Güncellenecek alan bulunamadı" }, { status: 400 });
    }

    const expense = await (prisma as any).expense.update({
      where: {
        id_institutionId_branchId: {
          id: existing.id,
          institutionId: existing.institutionId,
          branchId: existing.branchId,
        },
      },
      data,
      include: { expenseCategory: { select: { id: true, name: true } } }
    });
    await writeAudit(auth.user.id, "GIDER_UPDATE", `Gider güncellendi (${params.id})`);
    return NextResponse.json(expense);
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

    // Soft delete (status = IPTAL)
    const existing = await (prisma as any).expense.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        branchId: branch.branchId,
      },
      select: { id: true, institutionId: true, branchId: true, sourceType: true, description: true },
    });
    if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    if (isLinkedFirmaExpense(existing)) {
      return NextResponse.json({ error: LINKED_FIRMA_MESSAGE }, { status: 409 });
    }

    await (prisma as any).expense.update({
      where: {
        id_institutionId_branchId: {
          id: existing.id,
          institutionId: existing.institutionId,
          branchId: existing.branchId,
        },
      },
      data: { status: "IPTAL" }
    });
    await writeAudit(auth.user.id, "GIDER_DELETE", `Gider iptal edildi (${params.id})`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
