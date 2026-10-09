import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { isValidDateKey, turkeyDateKey, turkeyDayRangeUtc } from "@/lib/tz";

export const dynamic = "force-dynamic";

const MAX_ROWS = 6000;
const MAX_DAYS = 42;
const ITEMS_PER_DAY = 3;

type DaySummary = {
  total: number;
  cancelled: number;
  items: Array<{ id: string; startAt: Date; status: string; patientName: string; doctorName: string }>;
};

/**
 * Ay görünümü için gün bazlı özet: her gün kaç randevu var ve ilk birkaçı.
 * Liste ucu (/api/appointments) güvenlik için 500 kayıtla sınırlı olduğundan
 * kalabalık bir klinikte ayın ikinci yarısı boş görünüyordu. Burada yalnız
 * gereken alanlar okunur ve sunucuda güne göre toplanır.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });

  const from = request.nextUrl.searchParams.get("from") || "";
  const to = request.nextUrl.searchParams.get("to") || "";
  const doctorId = request.nextUrl.searchParams.get("doctorId") || undefined;
  if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) {
    return NextResponse.json({ message: "Geçerli bir tarih aralığı verin (YYYY-AA-GG)." }, { status: 400 });
  }
  const start = turkeyDayRangeUtc(from).start;
  const end = turkeyDayRangeUtc(to).end;
  if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_DAYS) {
    return NextResponse.json({ message: "Tarih aralığı en fazla 6 hafta olabilir." }, { status: 400 });
  }

  try {
    const rows = await prisma.appointment.findMany({
      where: {
        institutionId,
        branchId: branch.branchId,
        startAt: { gte: start, lte: end },
        ...(doctorId ? { doctorId } : {}),
      },
      select: {
        id: true,
        startAt: true,
        status: true,
        patient: { select: { fullName: true } },
        doctor: { select: { fullName: true } },
      },
      orderBy: { startAt: "asc" },
      take: MAX_ROWS + 1,
    });
    const truncated = rows.length > MAX_ROWS;
    const days: Record<string, DaySummary> = {};
    for (const row of rows.slice(0, MAX_ROWS)) {
      const key = turkeyDateKey(row.startAt);
      const day = days[key] || (days[key] = { total: 0, cancelled: 0, items: [] });
      if (row.status === "IPTAL") {
        day.cancelled += 1;
        continue;
      }
      day.total += 1;
      if (day.items.length < ITEMS_PER_DAY) {
        day.items.push({ id: row.id, startAt: row.startAt, status: row.status, patientName: row.patient?.fullName || "Hasta", doctorName: row.doctor?.fullName || "" });
      }
    }
    return NextResponse.json({ days, truncated });
  } catch (error) {
    console.error("[appointments month-summary GET]", error);
    return NextResponse.json({ message: "Aylık özet yüklenemedi." }, { status: 503 });
  }
}
