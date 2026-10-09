import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiTiming } from "@/lib/api";
import { computeDoctorMonthlyHakedis, computeDoctorMonthlyOdenen, effectiveDoctorWhere, monthRangeUtc } from "@/lib/hakedis";
import { turkeyDateKey } from "@/lib/tz";
import { requireActiveBranch } from "@/lib/branch-context";

// GET /api/hakedis/ozet
// Kurumdaki tüm uygun doktorlar için: kapanmış aylardan ödenecek toplam, en eski
// ödenmemiş ay ve içinde bulunulan ayda biriken hakediş — Muhasebe > Hakediş
// sekmesinin "genel bakış" listesi.
export const GET = withApiTiming("hakedis-ozet", async function GET(_req: NextRequest) {
  const auth = await requireAuth("finance:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok || !auth.user.institutionId) return NextResponse.json({ message: branch.ok ? "Kurum bağlamı zorunlu" : branch.message }, { status: 403 });

  const institutionId = auth.user.institutionId;
  const activeDoctors = await prisma.user.findMany({
    where: effectiveDoctorWhere(institutionId, branch.branchId),
    select: { id: true, fullName: true, kkYuzde: true, genelYuzde: true, maasYuzde: true, branchMemberships: { where: { branchId: branch.branchId }, select: { kkYuzde: true, genelYuzde: true, maasYuzde: true }, take: 1 } },
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
      branchMemberships: { some: { branchId: branch.branchId } },
      OR: [{ role: "DOKTOR" }, { role: "YONETICI" }],
    },
    select: { id: true, fullName: true, kkYuzde: true, genelYuzde: true, maasYuzde: true, branchMemberships: { where: { branchId: branch.branchId }, select: { kkYuzde: true, genelYuzde: true, maasYuzde: true }, take: 1 } },
  });
  const doctors = [...activeDoctors, ...inactiveDoctors];

  // getUTCFullYear()/getUTCMonth() yerine Türkiye takvim tarihi kullanılır —
  // aksi halde ayın ilk günü 00:00-02:59 Türkiye saatinde bu ekran hâlâ bir
  // önceki ayı "içinde bulunulan ay" sayardı (bkz. denetim raporu).
  const [yearStr, monthStr] = turkeyDateKey().split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  // İçinde bulunulan ay ödenemez (ay kapanınca ödenir). "Kime ne borçluyuz?"
  // sorusunun cevabı bu yüzden son 12 ayın KAPANMIŞ aylarındaki kalanlardır;
  // önceden yalnız bu ay gösteriliyor, ödenmesi gereken geçmiş aylar hiç
  // görünmüyordu.
  const MONTHS_BACK = 12;
  const startIndex = year * 12 + (month - 1) - (MONTHS_BACK - 1);
  const { start } = monthRangeUtc(Math.floor(startIndex / 12), (startIndex % 12) + 1);
  const { end } = monthRangeUtc(year, month);
  const keyOf = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  const currentKey = keyOf(year, month);

  const inactiveIds = new Set(inactiveDoctors.map((d) => d.id));
  const allRows = await Promise.all(doctors.map(async (doctor) => {
    const branchRates = doctor.branchMemberships[0];
    const rates = {
      kkYuzde: Number(branchRates?.kkYuzde ?? doctor.kkYuzde ?? 3),
      genelYuzde: Number(branchRates?.genelYuzde ?? doctor.genelYuzde ?? 15),
      maasYuzde: Number(branchRates?.maasYuzde ?? doctor.maasYuzde ?? 40),
    };
    const [hakedisRows, odenenMap] = await Promise.all([
      computeDoctorMonthlyHakedis({ doctorId: doctor.id, institutionId: auth.user.institutionId!, branchId: branch.branchId, rates, rangeStart: start, rangeEnd: end }),
      computeDoctorMonthlyOdenen({ doctorId: doctor.id, institutionId, branchId: branch.branchId, rangeStart: start, rangeEnd: end }),
    ]);
    const hakedisByKey = new Map(hakedisRows.map((row) => [keyOf(row.year, row.month), row]));

    let odenecek = 0;
    let odenecekAy = 0;
    let negatifAy = 0;
    let enEski: { year: number; month: number; kalan: number } | null = null;
    for (let i = MONTHS_BACK - 1; i >= 1; i--) {
      const idx = year * 12 + (month - 1) - i;
      const y = Math.floor(idx / 12);
      const m = (idx % 12) + 1;
      const key = keyOf(y, m);
      const hakedilen = hakedisByKey.get(key)?.hakedilen ?? 0;
      const odenen = odenenMap.get(key) || 0;
      const kalan = Math.round((hakedilen - odenen) * 100) / 100;
      if (kalan > 0.5) {
        odenecek += kalan;
        odenecekAy += 1;
        if (!enEski) enEski = { year: y, month: m, kalan };
      } else if (kalan < -0.5) {
        negatifAy += 1;
      }
    }

    const monthRow = hakedisByKey.get(currentKey);
    const hakedilen = monthRow?.hakedilen ?? 0;
    const odenen = Math.round((odenenMap.get(currentKey) || 0) * 100) / 100;
    return {
      doctor: { id: doctor.id, fullName: doctor.fullName, isActive: !inactiveIds.has(doctor.id) },
      // Kapanmış aylardan ödenmesi gereken toplam (yalnız kalanı pozitif aylar — her biri ayrı ödenir).
      odenecek: Math.round(odenecek * 100) / 100,
      odenecekAy,
      enEskiOdenmemis: enEski,
      // Lab gideri o ayın hakedişini aştığı (negatif kalan) kapanmış ay sayısı — bilgi amaçlı.
      negatifAy,
      // İçinde bulunulan ay: yalnız bilgi, henüz ödenemez.
      buAy: { ciro: monthRow?.ciro ?? 0, hakedilen, odenen, kalan: Math.round((hakedilen - odenen) * 100) / 100 },
      // Geriye dönük uyumluluk (eski istemciler): bu ayın değerleri.
      ciro: monthRow?.ciro ?? 0,
      hakedilen,
      odenen,
      kalan: Math.round((hakedilen - odenen) * 100) / 100,
    };
  }));

  // Pasif doktor ödenecek ya da bu ay hareketi yoksa listeyi kalabalıklaştırmasın.
  const rows = allRows.filter((row) => row.doctor.isActive || row.odenecek > 0.5 || Math.abs(row.kalan) > 0.5);

  rows.sort((a, b) => b.odenecek - a.odenecek || b.buAy.hakedilen - a.buAy.hakedilen || a.doctor.fullName.localeCompare(b.doctor.fullName, "tr"));

  return NextResponse.json({ year, month, doctors: rows });
});
