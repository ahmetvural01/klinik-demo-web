import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withApiTiming } from "@/lib/api";
import { computeDoctorMonthlyHakedis, computeDoctorMonthlyOdenen, findEligibleDoctor, getDoctorMonthDetail, monthRangeUtc } from "@/lib/hakedis";

// GET /api/hakedis/detay?doctorId=X&year=Y&month=M
// Bir doktorun tek bir aya ait hakediş hesabına giren tüm satırları döner.
export const GET = withApiTiming("hakedis-detay", async function GET(req: NextRequest) {
  const auth = await requireAuth("finance:read");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const doctorId = searchParams.get("doctorId");
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));

  if (!doctorId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ message: "doctorId, year ve month (1-12) zorunlu" }, { status: 400 });
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
  const { start, end } = monthRangeUtc(year, month);

  const [detail, hakedisRows, odenenMap] = await Promise.all([
    getDoctorMonthDetail({ doctorId, institutionId: auth.user.institutionId, year, month }),
    computeDoctorMonthlyHakedis({ doctorId, rates, rangeStart: start, rangeEnd: end }),
    computeDoctorMonthlyOdenen({ doctorId, institutionId: auth.user.institutionId, rangeStart: start, rangeEnd: end }),
  ]);

  const monthRow = hakedisRows.find((r) => r.year === year && r.month === month);
  const hakedilen = monthRow?.hakedilen ?? 0;
  const odenen = Math.round((odenenMap.get(`${year}-${String(month).padStart(2, "0")}`) || 0) * 100) / 100;
  const breakdown = monthRow?.breakdown ?? {
    ciro: 0, kk: 0, kkMasraf: 0, genelMasraf: 0, labCost: 0, toplamGider: 0, brut: 0, hakedilen: 0,
  };

  return NextResponse.json({
    doctor: { id: doctor.id, fullName: doctor.fullName },
    year, month, rates,
    summary: { hakedilen, odenen, kalan: Math.round((hakedilen - odenen) * 100) / 100 },
    breakdown,
    ...detail,
  });
});
