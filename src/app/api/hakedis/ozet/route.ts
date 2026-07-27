import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiTiming } from "@/lib/api";
import { computeDoctorMonthlyHakedis, computeDoctorMonthlyOdenen, effectiveDoctorWhere, monthRangeUtc } from "@/lib/hakedis";
import { turkeyDateKey } from "@/lib/tz";

// GET /api/hakedis/ozet
// Kurumdaki tüm uygun doktorlar için içinde bulunulan ayın hakedilen/ödenen/kalan
// özetini tek seferde döner — Muhasebe > Hakediş sekmesinin "genel bakış" listesi.
export const GET = withApiTiming("hakedis-ozet", async function GET(_req: NextRequest) {
  const auth = await requireAuth("finance:read");
  if (auth.error) return auth.error;

  const allowedRoles = ["SUPERADMIN", "YONETICI", "ADMIN"];
  if (!allowedRoles.includes(auth.user.role)) {
    return NextResponse.json({ message: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const institutionId = auth.user.institutionId;
  const activeDoctors = await prisma.user.findMany({
    where: effectiveDoctorWhere(institutionId),
    select: { id: true, fullName: true, kkYuzde: true, genelYuzde: true, maasYuzde: true },
    orderBy: { fullName: "asc" },
  });

  // Pasifleştirilmiş bir doktorun ödenmemiş kalan hakedişi varsa, önceden bu
  // genel bakış listesinden tamamen kayboluyordu — muhasebe kimseye borç
  // olduğunu fark etmiyordu (bkz. denetim raporu). Pasif doktorlar da ayrıca
  // çekilip, yalnızca kalanı sıfırdan farklı olanlar sonuca eklenir.
  const inactiveDoctors = await prisma.user.findMany({
    where: {
      isActive: false,
      ...(institutionId ? { institutionId } : {}),
      OR: [{ role: "DOKTOR" }, { role: "YONETICI" }],
    },
    select: { id: true, fullName: true, kkYuzde: true, genelYuzde: true, maasYuzde: true },
  });
  const doctors = [...activeDoctors, ...inactiveDoctors];

  // getUTCFullYear()/getUTCMonth() yerine Türkiye takvim tarihi kullanılır —
  // aksi halde ayın ilk günü 00:00-02:59 Türkiye saatinde bu ekran hâlâ bir
  // önceki ayı "içinde bulunulan ay" sayardı (bkz. denetim raporu).
  const [yearStr, monthStr] = turkeyDateKey().split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const { start, end } = monthRangeUtc(year, month);

  const inactiveIds = new Set(inactiveDoctors.map((d) => d.id));
  const allRows = await Promise.all(doctors.map(async (doctor) => {
    const rates = {
      kkYuzde: Number(doctor.kkYuzde ?? 3),
      genelYuzde: Number(doctor.genelYuzde ?? 15),
      maasYuzde: Number(doctor.maasYuzde ?? 40),
    };
    const [hakedisRows, odenenMap] = await Promise.all([
      computeDoctorMonthlyHakedis({ doctorId: doctor.id, rates, rangeStart: start, rangeEnd: end }),
      computeDoctorMonthlyOdenen({ doctorId: doctor.id, institutionId, rangeStart: start, rangeEnd: end }),
    ]);
    const monthRow = hakedisRows.find((r) => r.year === year && r.month === month);
    const hakedilen = monthRow?.hakedilen ?? 0;
    const odenen = Math.round((odenenMap.get(`${year}-${String(month).padStart(2, "0")}`) || 0) * 100) / 100;
    return {
      doctor: { id: doctor.id, fullName: doctor.fullName, isActive: !inactiveIds.has(doctor.id) },
      ciro: monthRow?.ciro ?? 0,
      hakedilen,
      odenen,
      kalan: Math.round((hakedilen - odenen) * 100) / 100,
    };
  }));

  // Pasif doktor kalanı sıfırsa listeyi kalabalıklaştırmasın — yalnızca
  // gerçekten ödenmemiş/fazla ödenmiş bir bakiyesi varsa gösterilir.
  const rows = allRows.filter((row) => row.doctor.isActive || Math.abs(row.kalan) > 0.5);

  rows.sort((a, b) => b.kalan - a.kalan);

  return NextResponse.json({ year, month, doctors: rows });
});
