import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(req: NextRequest) {
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

    const where: Record<string, unknown> = {};
    if (patientId) where.patientId = patientId;
    if (user.role !== "SUPERADMIN") where.patient = { institutionId: user.institutionId };

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
    const hidePhone = user.role === "DOKTOR" || user.role === "ASISTAN";
    const result = hidePhone
      ? plans.map((p: any) => ({
          ...p,
          patient: p.patient ? { ...p.patient, phone: "***" } : p.patient,
        }))
      : plans;

    return NextResponse.json(result);
  } catch (e) {
    console.error("[taksit-plani GET] fallback:", e);
    return NextResponse.json([]);
  }
}

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
      const taksitTutar = kalan / Number(taksitSayisi);
      const periodDays: Record<string, number> = {
        HAFTALIK: 7, IKIHALFTALIK: 14, AYLIK: 30,
        IKIAYLIK: 60, UCAYLIK: 90, ALTIAYLIK: 180, YILLIK: 365
      };
      const days = periodDays[period] ?? 30;
      const start = new Date(startDate);
      taksitlerCreate = Array.from({ length: Number(taksitSayisi) }, (_, i) => {
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
      });
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

    return NextResponse.json(plan, { status: 201 });
  } catch (e) {
    console.error("[taksit-plani POST] fallback:", e);
    return NextResponse.json({ error: "Taksit planı oluşturulamadı" }, { status: 503 });
  }
}
