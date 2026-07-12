import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { computeDoctorMonthlyHakedis, computeDoctorMonthlyOdenen, monthRangeUtc } from "@/lib/hakedis";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:read");
    if (auth.error) return auth.error;

    const expense = await (prisma as any).expense.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      include: { expenseCategory: { select: { id: true, name: true } } }
    });
    if (!expense) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    return NextResponse.json(expense);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;

    const body = await req.json();
    const existing = await (prisma as any).expense.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      select: { id: true, doctorId: true, tarih: true, tutar: true, periodYear: true, periodMonth: true },
    });
    if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    if (existing.doctorId && body.yontem !== undefined && body.yontem !== "NAKIT" && body.yontem !== "HAVALE_EFT") {
      return NextResponse.json({ error: "Doktor hakedişi ödemeleri sadece nakit veya havale/EFT ile yapılabilir" }, { status: 400 });
    }

    // Tutar artırılıyorsa, doktorun o dönem hakedişini aşmadığından emin ol —
    // önceden bu sadece formda (istemci tarafında) kontrol ediliyordu, doğrudan
    // API çağrısıyla trivially bypass edilebiliyordu (bkz. denetim raporu Tema 5).
    if (existing.doctorId && body.tutar !== undefined) {
      const newTutar = Number(body.tutar);
      const year = body.periodYear ?? existing.periodYear ?? new Date(existing.tarih).getUTCFullYear();
      const month = body.periodMonth ?? existing.periodMonth ?? new Date(existing.tarih).getUTCMonth() + 1;
      const doctor = await prisma.user.findUnique({
        where: { id: existing.doctorId },
        select: { kkYuzde: true, genelYuzde: true, maasYuzde: true },
      });
      if (doctor && Number.isInteger(year) && Number.isInteger(month)) {
        const { start, end } = monthRangeUtc(year, month);
        const rates = {
          kkYuzde: Number(doctor.kkYuzde || 0),
          genelYuzde: Number(doctor.genelYuzde || 0),
          maasYuzde: Number(doctor.maasYuzde || 0),
        };
        const [hakedisRows, odenenMap] = await Promise.all([
          computeDoctorMonthlyHakedis({ doctorId: existing.doctorId, rates, rangeStart: start, rangeEnd: end }),
          computeDoctorMonthlyOdenen({ doctorId: existing.doctorId, institutionId: auth.user.institutionId, rangeStart: start, rangeEnd: end }),
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
    if (body.category !== undefined) data.category = body.category;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.tutar !== undefined) data.tutar = Number(body.tutar);
    if (body.yontem !== undefined) data.yontem = body.yontem;
    if (body.faturaNo !== undefined) data.faturaNo = existing.doctorId ? null : (body.faturaNo || null);
    if (body.kdvOrani !== undefined) data.kdvOrani = existing.doctorId ? 0 : Number(body.kdvOrani);
    // doctorId burada kasıtlı olarak whitelist'e alınmadı (hangi doktora ait olduğunu
    // değiştirmek hassas bir işlem, şu an arayüzde de sunulmuyor) — sadece hangi
    // hakediş dönemine (ay/yıl) sayıldığı düzeltilebilir.
    if (body.periodYear !== undefined) data.periodYear = body.periodYear === null ? null : Number(body.periodYear);
    if (body.periodMonth !== undefined) data.periodMonth = body.periodMonth === null ? null : Number(body.periodMonth);

    const expense = await (prisma as any).expense.update({
      where: { id: existing.id },
      data,
      include: { expenseCategory: { select: { id: true, name: true } } }
    });
    await writeAudit(auth.user.id, "GIDER_UPDATE", `Gider güncellendi (${params.id})`);
    return NextResponse.json(expense);
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth("finance:write");
    if (auth.error) return auth.error;

    // Soft delete (status = IPTAL)
    const existing = await (prisma as any).expense.findFirst({
      where: {
        id: params.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    await (prisma as any).expense.update({
      where: { id: existing.id },
      data: { status: "IPTAL" }
    });
    await writeAudit(auth.user.id, "GIDER_DELETE", `Gider iptal edildi (${params.id})`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
