import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withApiTiming } from "@/lib/api";
import { computeDoctorMonthlyHakedis, computeDoctorMonthlyOdenen, findEligibleDoctor, monthRangeUtc } from "@/lib/hakedis";

// GET /api/hakedis?doctorId=X&months=12
// Seçili doktor için son N ayın hakediş/ödenen/kalan dökümünü döner.
export const GET = withApiTiming("hakedis", async function GET(req: NextRequest) {
  const auth = await requireAuth("finance:read");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const doctorId = searchParams.get("doctorId");
  const months = Math.min(24, Math.max(1, Number(searchParams.get("months") || 12)));

  if (!doctorId) {
    return NextResponse.json({ message: "doctorId zorunlu" }, { status: 400 });
  }

  const doctor = await findEligibleDoctor({ doctorId, institutionId: auth.user.institutionId });
  if (!doctor) {
    return NextResponse.json({ message: "Doktor bulunamadı" }, { status: 404 });
  }

  const rates = {
    kkYuzde: Number(doctor.kkYuzde ?? 3),
    genelYuzde: Number(doctor.genelYuzde ?? 15),
    maasYuzde: Number(doctor.maasYuzde ?? 40),
  };

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  // "months" ay önceki ayın başından bu ayın sonuna kadar olan aralık.
  const startMonthIndex = currentYear * 12 + (currentMonth - 1) - (months - 1);
  const rangeStartYear = Math.floor(startMonthIndex / 12);
  const rangeStartMonth = (startMonthIndex % 12) + 1;
  const rangeStart = monthRangeUtc(rangeStartYear, rangeStartMonth).start;
  const rangeEnd = monthRangeUtc(currentYear, currentMonth).end;

  const [hakedisRows, odenenMap] = await Promise.all([
    computeDoctorMonthlyHakedis({ doctorId, rates, rangeStart, rangeEnd }),
    computeDoctorMonthlyOdenen({ doctorId, institutionId: auth.user.institutionId, rangeStart, rangeEnd }),
  ]);

  const hakedisByMonth = new Map(hakedisRows.map((r) => [`${r.year}-${r.month}`, r]));

  const result: { year: number; month: number; hakedilen: number; odenen: number; kalan: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const idx = currentYear * 12 + (currentMonth - 1) - i;
    const year = Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    const key = `${year}-${month}`;
    const hakedilen = hakedisByMonth.get(key)?.hakedilen ?? 0;
    const odenen = Math.round((odenenMap.get(`${year}-${String(month).padStart(2, "0")}`) || 0) * 100) / 100;
    // Hem üretimi hem ödemesi hiç olmayan ayları listede göstermeye gerek yok.
    if (hakedilen === 0 && odenen === 0) continue;
    result.push({ year, month, hakedilen, odenen, kalan: Math.round((hakedilen - odenen) * 100) / 100 });
  }

  return NextResponse.json({
    doctor: { id: doctor.id, fullName: doctor.fullName },
    rates,
    months: result,
  });
});
