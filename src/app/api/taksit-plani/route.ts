import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const patientId = searchParams.get("patientId");

    const where: Record<string, unknown> = {};
    if (patientId) where.patientId = patientId;

    const planStatuses = new Set(["AKTIF", "DEVAM_EDIYOR", "TAMAMLANDI", "IPTAL"]);
    const taksitStatuses = new Set(["BEKLIYOR", "ODENDI", "GECIKTI", "IPTAL"]);

    if (status && status !== "HEPSI") {
      if (planStatuses.has(status)) {
        where.status = status;
      } else if (taksitStatuses.has(status)) {
        where.taksitler = { some: { status } };
      }
    }

    const plans = await (prisma as any).taksitPlan.findMany({
      where,
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
      orderBy: { createdAt: "desc" }
    });
    return NextResponse.json(plans);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const body = await req.json();
    const {
      patientId, doctorId, baslik, toplamBorc, pesnat = 0,
      taksitSayisi, period = "AYLIK", startDate, notes
    } = body;

    if (!patientId || !doctorId || !toplamBorc || !taksitSayisi || !startDate) {
      return NextResponse.json({ error: "Gerekli alanlar eksik" }, { status: 400 });
    }

    const kalan = Number(toplamBorc) - Number(pesnat);
    const taksitTutar = kalan / Number(taksitSayisi);

    // Periyot gün sayıları
    const periodDays: Record<string, number> = {
      HAFTALIK: 7, IKIHALFTALIK: 14, AYLIK: 30,
      IKIAYLIK: 60, UCAYLIK: 90, ALTIAYLIK: 180, YILLIK: 365
    };
    const days = periodDays[period] ?? 30;

    const start = new Date(startDate);

    const plan = await (prisma as any).taksitPlan.create({
      data: {
        patientId, doctorId, baslik: baslik || null,
        toplamBorc: Number(toplamBorc),
        pesnat: Number(pesnat),
        taksitSayisi: Number(taksitSayisi),
        period, startDate: start, notes: notes || null,
        status: "AKTIF",
        taksitler: {
          create: Array.from({ length: Number(taksitSayisi) }, (_, i) => {
            const vadeDate = new Date(start);
            vadeDate.setDate(vadeDate.getDate() + days * (i + 1));
            return {
              siraNo: i + 1,
              vadeDate,
              tutar: Number(taksitTutar.toFixed(2)),
              odenen: 0,
              kalan: Number(taksitTutar.toFixed(2)),
              status: "BEKLIYOR"
            };
          })
        }
      },
      include: {
        patient: { select: { id: true, fullName: true } },
        doctor: { select: { id: true, fullName: true } },
        taksitler: true
      }
    });

    return NextResponse.json(plan, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
