import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { parsePagination } from "@/lib/pagination";
import { turkeyTodayStartUtc } from "@/lib/tz";
import { shouldHidePatientPhone } from "@/lib/patient-visibility";

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
    const auth = await requireAuth("payments:read");
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

    if (status && status !== "HEPSI") {
      if (planStatuses.has(status)) {
        baseWhere.status = status;
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

    const todayStart = turkeyTodayStartUtc();
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

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
        where: { plan: baseWhere, status: "GECIKTI" },
        select: { planId: true },
        distinct: ["planId"],
        take: 20000,
      }),
      (prisma as any).taksit.aggregate({
        _sum: { kalan: true },
        where: { plan: { ...baseWhere, status: { notIn: ["TAMAMLANDI", "IPTAL"] } } },
      }),
      (prisma as any).taksit.count({ where: { plan: baseWhere, status: "BEKLIYOR" } }),
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

    const hidePhone = shouldHidePatientPhone(user.role);
    const items = hidePhone
      ? plans.map((p: any) => ({
          ...p,
          patient: p.patient ? { ...p.patient, phone: "***" } : p.patient,
        }))
      : plans;

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
    const auth = await requireAuth("payments:write");
    if (auth.error) return auth.error;
    const user = auth.user;
    if (user.role !== "SUPERADMIN" && !user.institutionId) {
      return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
    }

    const body = await req.json();
    const {
      patientId, doctorId, baslik, toplamBorc, pesnat = 0,
      taksitSayisi, period = "AYLIK", startDate, notes,
      taksitler: customTaksitler
    } = body;

    if (!patientId || !doctorId || !toplamBorc) {
      return NextResponse.json({ error: "Gerekli alanlar eksik" }, { status: 400 });
    }
    if (!customTaksitler?.length && (!taksitSayisi || !startDate)) {
      return NextResponse.json({ error: "Gerekli alanlar eksik" }, { status: 400 });
    }

    if (user.role !== "SUPERADMIN") {
      const [patient, doctor] = await Promise.all([
        (prisma as any).patient.findFirst({
          where: { id: patientId, institutionId: user.institutionId },
          select: { id: true },
        }),
        (prisma as any).user.findFirst({
          where: { id: doctorId, institutionId: user.institutionId, isActive: true },
          select: { id: true },
        }),
      ]);
      if (!patient) return NextResponse.json({ error: "Hasta bulunamadı" }, { status: 404 });
      if (!doctor) return NextResponse.json({ error: "Doktor bulunamadı" }, { status: 404 });
    }

    const kalan = Number(toplamBorc) - Number(pesnat);

    let taksitlerCreate: { siraNo: number; vadeDate: Date; tutar: number; odenen: number; kalan: number; status: string }[];

    if (Array.isArray(customTaksitler) && customTaksitler.length > 0) {
      taksitlerCreate = customTaksitler.map((t: { date: string; amount: number }, i: number) => ({
        siraNo: i + 1,
        vadeDate: new Date(t.date),
        tutar: Number(Number(t.amount).toFixed(2)),
        odenen: 0,
        kalan: Number(Number(t.amount).toFixed(2)),
        status: "BEKLIYOR"
      }));
    } else {
      const taksitTutar = Math.round((kalan / Number(taksitSayisi)) * 100) / 100;
      const periodDays: Record<string, number> = {
        HAFTALIK: 7, IKIHALFTALIK: 14, AYLIK: 30,
        IKIAYLIK: 60, UCAYLIK: 90, ALTIAYLIK: 180, YILLIK: 365
      };
      const days = periodDays[period] ?? 30;
      const start = new Date(startDate);
      taksitlerCreate = Array.from({ length: Number(taksitSayisi) }, (_, i) => {
        const vadeDate = new Date(start);
        vadeDate.setDate(vadeDate.getDate() + days * (i + 1));
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
      const sum = Math.round(taksitlerCreate.reduce((acc, t) => acc + t.tutar, 0) * 100) / 100;
      const diff = Math.round((kalan - sum) * 100) / 100;
      if (diff !== 0) {
        const last = taksitlerCreate[taksitlerCreate.length - 1];
        last.tutar = Math.round((last.tutar + diff) * 100) / 100;
        last.kalan = last.tutar;
      }
    }

    const effectiveTaksitSayisi = Array.isArray(customTaksitler) && customTaksitler.length > 0
      ? customTaksitler.length
      : Number(taksitSayisi);
    const effectiveStartDate = taksitlerCreate[0]?.vadeDate ?? new Date(startDate);

    const plan = await (prisma as any).taksitPlan.create({
      data: {
        patientId, doctorId, baslik: baslik || null,
        toplamBorc: Number(toplamBorc),
        pesnat: Number(pesnat),
        taksitSayisi: effectiveTaksitSayisi,
        period: period || "AYLIK", startDate: effectiveStartDate, notes: notes || null,
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
