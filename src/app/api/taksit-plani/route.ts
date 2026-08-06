import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { parsePagination } from "@/lib/pagination";
import { isValidDateKey, turkeyTodayStartUtc } from "@/lib/tz";
import { shouldHidePatientPhoneForRole } from "@/lib/patient-visibility-server";
import { effectiveDoctorWhere } from "@/lib/hakedis";
import { addInstallmentPeriod, INSTALLMENT_PERIODS } from "@/lib/installment-schedule";

const AGING4_KEYS = ["current", "d0_30", "d31_60", "d60p"] as const;

function bucketAging4(rows: { kalan: unknown; vadeDate: Date }[]) {
  const buckets = AGING4_KEYS.map((key) => ({ key, amount: 0, count: 0 }));
  const now = new Date();
  for (const row of rows) {
    const days = Math.floor((now.getTime() - new Date(row.vadeDate).getTime()) / 86400000);
    const bucket = days <= 0 ? buckets[0] : days <= 30 ? buckets[1] : days <= 60 ? buckets[2] : buckets[3];
    bucket.amount += Number(row.kalan || 0);
    bucket.count += 1;
  }
  return buckets;
}

function bucketAging5(rows: { kalan: unknown; vadeDate: Date }[]) {
  // Sıra: Bugün Vadeli, 1-30 Gün Geç, 31-60 Gün, 60+ Gün, Gelecek
  const buckets = [0, 1, 2, 3, 4].map(() => ({ amount: 0, count: 0 }));
  const now = new Date();
  for (const row of rows) {
    const due = new Date(row.vadeDate);
    const diffDays = Math.floor((now.getTime() - due.getTime()) / 86400000);
    const idx =
      due.toDateString() === now.toDateString() ? 0 :
      diffDays > 0 && diffDays <= 30 ? 1 :
      diffDays > 30 && diffDays <= 60 ? 2 :
      diffDays > 60 ? 3 : 4;
    buckets[idx].amount += Number(row.kalan || 0);
    buckets[idx].count += 1;
  }
  return buckets;
}

export const GET = withApiTiming("taksit-plani", async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth("installments:read");
    if (auth.error) return auth.error;
    const user = auth.user;
    if (user.role !== "SUPERADMIN" && !user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const patientId = searchParams.get("patientId");
    const q = (searchParams.get("q") || "").trim();
    const { page, take, skip, pageCount } = parsePagination(searchParams, { defaultTake: 25, maxTake: 100 });

    const baseWhere: Record<string, unknown> = {};
    if (patientId) baseWhere.patientId = patientId;
    if (user.role !== "SUPERADMIN") baseWhere.patient = { institutionId: user.institutionId };

    const planStatuses = new Set(["AKTIF", "DEVAM_EDIYOR", "TAMAMLANDI", "IPTAL"]);
    const taksitStatuses = new Set(["BEKLIYOR", "ODENDI", "GECIKTI", "IPTAL"]);
    if (status && status !== "HEPSI" && !planStatuses.has(status) && !taksitStatuses.has(status)) {
      return NextResponse.json({ error: "Geçersiz taksit durumu" }, { status: 400 });
    }

    const todayStart = turkeyTodayStartUtc();
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    // Vadesi geçmiş BEKLIYOR taksitler yalnızca /api/taksit-plani/mark-gecikti
    // çalıştıktan SONRA DB'de gerçekten "GECIKTI" olur — bu asenkron/fire-and-forget
    // çağrılır (bkz. muhasebe/page.tsx), yani bu endpoint'e gelen bir istek o iş
    // bitmeden önce çalışabilir ve gerçekten gecikmiş bir taksidi "Bekliyor"
    // olarak gösterebilirdi (bkz. denetim raporu). Bu yüzden "GECIKTI" hem filtre
    // hem de dönen veri seviyesinde DB'deki ham değere değil, canlı türetilmiş
    // duruma göre hesaplanır.
    const overdueTaksitWhere = { status: "BEKLIYOR", vadeDate: { lt: todayStart } };
    if (status && status !== "HEPSI") {
      if (planStatuses.has(status)) {
        baseWhere.status = status;
      } else if (status === "GECIKTI") {
        baseWhere.taksitler = { some: { OR: [{ status: "GECIKTI" }, overdueTaksitWhere] } };
      } else if (taksitStatuses.has(status)) {
        baseWhere.taksitler = { some: { status } };
      }
    }

    const searchWhere = q
      ? {
          OR: [
            { patient: { fullName: { contains: q, mode: "insensitive" as const } } },
            { doctor: { fullName: { contains: q, mode: "insensitive" as const } } },
            { baslik: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const listWhere = q ? { AND: [baseWhere, searchWhere] } : baseWhere;

    const [total, plans, geciktenPlanIds, kalanAgg, bekleyen, bugunVade, aging4Rows, aging5Rows] = await Promise.all([
      (prisma as any).taksitPlan.count({ where: listWhere }),
      (prisma as any).taksitPlan.findMany({
        where: listWhere,
        include: {
          patient: { select: { id: true, fullName: true, phone: true } },
          doctor: { select: { id: true, fullName: true } },
          taksitler: {
            orderBy: { siraNo: "asc" },
            select: {
              id: true, siraNo: true, vadeDate: true, tutar: true,
              odenen: true, kalan: true, status: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      (prisma as any).taksit.findMany({
        where: { plan: baseWhere, OR: [{ status: "GECIKTI" }, overdueTaksitWhere] },
        select: { planId: true },
        distinct: ["planId"],
        take: 20000,
      }),
      (prisma as any).taksit.aggregate({
        _sum: { kalan: true },
        where: { plan: { ...baseWhere, status: { notIn: ["TAMAMLANDI", "IPTAL"] } } },
      }),
      // "Bekleyen" vadesi henüz gelmemiş taksitleri sayar — vadesi geçmiş ama
      // henüz GECIKTI'ye çevrilmemiş taksitler burada değil, "geciken"de sayılır
      // (yukarıdaki not).
      (prisma as any).taksit.count({ where: { plan: baseWhere, status: "BEKLIYOR", vadeDate: { gte: todayStart } } }),
      (prisma as any).taksit.count({
        where: { plan: baseWhere, status: "BEKLIYOR", vadeDate: { gte: todayStart, lte: todayEnd } },
      }),
      (prisma as any).taksit.findMany({
        where: { plan: { ...baseWhere, status: { notIn: ["IPTAL", "TAMAMLANDI"] } }, kalan: { gt: 0 } },
        select: { kalan: true, vadeDate: true },
        take: 20000,
      }),
      (prisma as any).taksit.findMany({
        where: { plan: baseWhere, kalan: { gt: 0 }, status: { notIn: ["ODENDI", "IPTAL"] } },
        select: { kalan: true, vadeDate: true },
        take: 20000,
      }),
    ]);

    const hidePhone = await shouldHidePatientPhoneForRole(user.role);
    const withLiveTaksitStatus = (p: any) => ({
      ...p,
      taksitler: (p.taksitler || []).map((t: any) =>
        t.status === "BEKLIYOR" && new Date(t.vadeDate).getTime() < todayStart.getTime()
          ? { ...t, status: "GECIKTI" }
          : t
      ),
    });
    const items = plans.map((p: any) => {
      const withStatus = withLiveTaksitStatus(p);
      return hidePhone
        ? { ...withStatus, patient: withStatus.patient ? { ...withStatus.patient, phone: "***" } : withStatus.patient }
        : withStatus;
    });

    return NextResponse.json({
      items,
      total,
      page,
      pageCount: pageCount(total),
      stats: {
        geciken: geciktenPlanIds.length,
        toplamKalan: Number(kalanAgg._sum.kalan ?? 0),
        bekleyen,
        bugunVade,
        aging4: bucketAging4(aging4Rows),
        aging5: bucketAging5(aging5Rows),
      },
    });
  } catch (e) {
    console.error("[taksit-plani GET] fallback:", e);
    return NextResponse.json({ error: "Taksit planları yüklenemedi." }, { status: 503 });
  }
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth("installments:write");
    if (auth.error) return auth.error;
    const user = auth.user;
    if (!user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
    }
    const {
      patientId, doctorId, baslik, toplamBorc, pesnat = 0,
      taksitSayisi, period = "AYLIK", startDate, notes,
      taksitler: customTaksitler
    } = body;

    if (typeof patientId !== "string" || !patientId || typeof doctorId !== "string" || !doctorId || !toplamBorc) {
      return NextResponse.json({ error: "Gerekli alanlar eksik" }, { status: 400 });
    }
    if (baslik !== undefined && baslik !== null && (typeof baslik !== "string" || baslik.trim().length > 180)) {
      return NextResponse.json({ error: "Plan başlığı en fazla 180 karakter olabilir" }, { status: 400 });
    }
    if (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.trim().length > 2_000)) {
      return NextResponse.json({ error: "Plan notu en fazla 2000 karakter olabilir" }, { status: 400 });
    }
    if (typeof period !== "string" || !INSTALLMENT_PERIODS.has(period)) {
      return NextResponse.json({ error: "Geçersiz taksit dönemi" }, { status: 400 });
    }
    if (customTaksitler !== undefined && !Array.isArray(customTaksitler)) {
      return NextResponse.json({ error: "Özel taksit listesi geçersiz" }, { status: 400 });
    }
    if (!customTaksitler?.length && (!taksitSayisi || !startDate)) {
      return NextResponse.json({ error: "Gerekli alanlar eksik" }, { status: 400 });
    }

    // Mantıksız/negatif değerler sessizce negatif bakiyeli taksitlere yol
    // açmasın diye burada da (istemcinin yanı sıra) doğrulanıyor.
    const toplamBorcNum = Number(toplamBorc);
    const pesnatNum = Number(pesnat) || 0;
    if (!Number.isFinite(toplamBorcNum) || toplamBorcNum <= 0 || toplamBorcNum > 99_999_999.99) {
      return NextResponse.json({ error: "Toplam borç pozitif bir sayı olmalıdır" }, { status: 400 });
    }
    if (!Number.isFinite(pesnatNum) || pesnatNum < 0) {
      return NextResponse.json({ error: "Peşinat negatif olamaz" }, { status: 400 });
    }
    if (pesnatNum >= toplamBorcNum) {
      return NextResponse.json({ error: "Peşinat toplam borçtan küçük olmalıdır" }, { status: 400 });
    }
    if (!customTaksitler?.length) {
      const taksitSayisiNum = Number(taksitSayisi);
      if (!Number.isInteger(taksitSayisiNum) || taksitSayisiNum < 1 || taksitSayisiNum > 100) {
        return NextResponse.json({ error: "Taksit sayısı 1-100 arasında olmalıdır" }, { status: 400 });
      }
      if (typeof startDate !== "string" || !isValidDateKey(startDate)) {
        return NextResponse.json({ error: "Geçerli bir başlangıç tarihi girilmelidir" }, { status: 400 });
      }
    }

    if (Array.isArray(customTaksitler) && customTaksitler.length > 100) {
      return NextResponse.json({ error: "En fazla 100 taksit oluşturulabilir" }, { status: 400 });
    }

    const [patient, doctor] = await Promise.all([
      (prisma as any).patient.findFirst({
        where: { id: patientId, institutionId: user.institutionId, archivedAt: null },
        select: { id: true },
      }),
      (prisma as any).user.findFirst({
        where: { id: doctorId, ...effectiveDoctorWhere(user.institutionId) },
        select: { id: true },
      }),
    ]);
    if (!patient) return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });
    if (!doctor) return NextResponse.json({ error: "Doktor bulunamadı" }, { status: 404 });

    const kalan = Number(toplamBorc) - Number(pesnat);

    let taksitlerCreate: { siraNo: number; vadeDate: Date; tutar: number; odenen: number; kalan: number; status: string }[];

    if (Array.isArray(customTaksitler) && customTaksitler.length > 0) {
      const invalidCustom = customTaksitler.some((t: unknown) => {
        if (!t || typeof t !== "object") return true;
        const row = t as { date?: unknown; amount?: unknown };
        const amount = Number(row.amount);
        return typeof row.date !== "string" || !isValidDateKey(row.date) || !Number.isFinite(amount) || amount <= 0 || amount > 99_999_999.99;
      });
      if (invalidCustom) {
        return NextResponse.json({ error: "Özel taksitlerin tarih ve tutarları geçersiz" }, { status: 400 });
      }
      taksitlerCreate = customTaksitler.map((t: { date: string; amount: number }, i: number) => {
        const amount = Number(Number(t.amount).toFixed(2));
        return { siraNo: i + 1, vadeDate: new Date(t.date), tutar: amount, odenen: 0, kalan: amount, status: "BEKLIYOR" };
      });
      const datesAreOrdered = taksitlerCreate.every((item, index) => index === 0 || item.vadeDate >= taksitlerCreate[index - 1].vadeDate);
      if (!datesAreOrdered) {
        return NextResponse.json({ error: "Taksit vadeleri kronolojik sırada olmalıdır" }, { status: 400 });
      }
    } else {
      const taksitTutar = Math.round((kalan / Number(taksitSayisi)) * 100) / 100;
      const start = new Date(`${startDate}T00:00:00.000Z`);
      taksitlerCreate = Array.from({ length: Number(taksitSayisi) }, (_, i) => {
        const vadeDate = addInstallmentPeriod(start, period, i);
        const isLast = i === Number(taksitSayisi) - 1;
        const tutar = isLast
          ? Math.round((kalan - taksitTutar * (Number(taksitSayisi) - 1)) * 100) / 100
          : taksitTutar;
        return {
          siraNo: i + 1,
          vadeDate,
          tutar,
          odenen: 0,
          kalan: tutar,
          status: "BEKLIYOR"
        };
      });
    }

    // Güvenlik ağı: küsurat nereden gelirse gelsin (istemci ya da yukarıdaki hesap), taksitlerin
    // toplamı her zaman "kalan" ile birebir eşitlensin — aksi halde hasta hesabında asla
    // kapanmayan bir kuruş bakiyesi oluşur.
    if (taksitlerCreate.length > 0) {
      if (taksitlerCreate.some((item) => item.tutar < 0.01)) {
        return NextResponse.json({ error: "Her taksit en az 0,01 TL olmalıdır; taksit sayısını azaltın" }, { status: 400 });
      }
      const sum = Math.round(taksitlerCreate.reduce((acc, t) => acc + t.tutar, 0) * 100) / 100;
      const diff = Math.round((kalan - sum) * 100) / 100;
      if (Array.isArray(customTaksitler) && customTaksitler.length > 0 && Math.abs(diff) > 0.01) {
        return NextResponse.json({ error: "Özel taksitlerin toplamı peşinat sonrası kalan borca eşit olmalıdır" }, { status: 400 });
      }
      if (diff !== 0) {
        const last = taksitlerCreate[taksitlerCreate.length - 1];
        last.tutar = Math.round((last.tutar + diff) * 100) / 100;
        last.kalan = last.tutar;
      }
    }

    const effectiveTaksitSayisi = Array.isArray(customTaksitler) && customTaksitler.length > 0
      ? customTaksitler.length
      : Number(taksitSayisi);
    const effectiveStartDate = Array.isArray(customTaksitler) && customTaksitler.length > 0
      ? taksitlerCreate[0].vadeDate
      : new Date(`${startDate}T00:00:00.000Z`);

    const plan = await (prisma as any).taksitPlan.create({
      data: {
        patientId, doctorId, baslik: baslik?.trim() || null,
        toplamBorc: Number(toplamBorc),
        pesnat: Number(pesnat),
        taksitSayisi: effectiveTaksitSayisi,
        period, startDate: effectiveStartDate, notes: notes?.trim() || null,
        status: "AKTIF",
        taksitler: { create: taksitlerCreate }
      },
      include: {
        patient: { select: { id: true, fullName: true } },
        doctor: { select: { id: true, fullName: true } },
        taksitler: true
      }
    });

    await writeAudit(auth.user.id, "TAKSIT_PLAN_CREATE", `${toplamBorc} TL taksit planı oluşturuldu`);
    return NextResponse.json(plan, { status: 201 });
  } catch (e) {
    console.error("[taksit-plani POST] fallback:", e);
    return NextResponse.json({ error: "Taksit planı oluşturulamadı" }, { status: 503 });
  }
}
