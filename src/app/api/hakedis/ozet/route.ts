import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiTiming } from "@/lib/api";
import { computeDoctorMonthlyHakedis, computeDoctorMonthlyOdenen, effectiveDoctorWhere, monthRangeUtc } from "@/lib/hakedis";

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
  const doctors = await prisma.user.findMany({
    where: effectiveDoctorWhere(institutionId),
    select: { id: true, fullName: true, kkYuzde: true, genelYuzde: true, maasYuzde: true },
    orderBy: { fullName: "asc" },
  });

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const { start, end } = monthRangeUtc(year, month);

  const rows = await Promise.all(doctors.map(async (doctor) => {
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
      doctor: { id: doctor.id, fullName: doctor.fullName },
      ciro: monthRow?.ciro ?? 0,
      hakedilen,
      odenen,
      kalan: Math.round((hakedilen - odenen) * 100) / 100,
    };
  }));

  rows.sort((a, b) => b.kalan - a.kalan);

  return NextResponse.json({ year, month, doctors: rows });
});
