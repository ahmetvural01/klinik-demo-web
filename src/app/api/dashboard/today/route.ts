import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { turkeyTodayStartUtc } from "@/lib/tz";
import { shouldHidePatientPhoneForRole } from "@/lib/patient-visibility-server";
import type { AppointmentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

// Randevu günü geçmiş ama kimse "Tamamlandı / Gelmedi / İptal" işaretlememiş
// kayıtlar. Ham ONAYLANDI eski istemcilerden kalan değerdir ve ekranda
// "Planlandı" görünür; ham GELDI ekranda "Bekliyor"dur (hasta gelmiş, randevu
// kapatılmamış). Durum otomatik değiştirilmez — yalnız personelin önüne konur.
const OPEN_STATUSES: AppointmentStatus[] = ["BEKLIYOR", "ONAYLANDI", "GELDI"];
const LOOKBACK_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Anasayfa "Bugün" listesi ve Randevular sekme sayaçları için tek, hafif
 * özet: onay bekleyen online talepler, bekleme listesindeki hastalar ve
 * önceki günlerden açık kalan randevular. Önceden online talepler ve bekleme
 * listesi yalnız ilgili pencere açılınca yükleniyordu; hiçbir sayaçta
 * görünmediği için hastaya "sizi arayacağız" denen talepler sahipsiz kalıyordu.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });

  const scope = { institutionId, branchId: branch.branchId };
  const todayStart = turkeyTodayStartUtc();
  const openPastWhere = {
    ...scope,
    status: { in: OPEN_STATUSES },
    startAt: { gte: new Date(todayStart.getTime() - LOOKBACK_DAYS * DAY_MS), lt: todayStart },
  };

  // ?lite=1: yalnız sayılar (üst bar/menü rozetleri ve takvim sayaçları için).
  if (request.nextUrl.searchParams.get("lite") === "1") {
    try {
      const [onlineRequests, waitlist, openPastCount] = await Promise.all([
        prisma.bookingRequest.count({ where: { ...scope, status: "BEKLIYOR" } }),
        prisma.waitlist.count({ where: { ...scope, status: { in: ["BEKLIYOR", "ARANDI"] } } }),
        prisma.appointment.count({ where: openPastWhere }),
      ]);
      return NextResponse.json({ onlineRequests, waitlist, openPast: { count: openPastCount, lookbackDays: LOOKBACK_DAYS, items: [] } });
    } catch (error) {
      console.error("[dashboard today GET lite]", error);
      return NextResponse.json({ message: "Günlük özet yüklenemedi." }, { status: 503 });
    }
  }

  try {
    const [onlineRequests, waitlist, openPastCount, openPastItems, hidePhone] = await Promise.all([
      prisma.bookingRequest.count({ where: { ...scope, status: "BEKLIYOR" } }),
      prisma.waitlist.count({ where: { ...scope, status: { in: ["BEKLIYOR", "ARANDI"] } } }),
      prisma.appointment.count({ where: openPastWhere }),
      prisma.appointment.findMany({
        where: openPastWhere,
        orderBy: { startAt: "desc" },
        take: 50,
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          note: true,
          patient: { select: { id: true, fullName: true, phone: true } },
          doctor: { select: { id: true, fullName: true } },
        },
      }),
      shouldHidePatientPhoneForRole(auth.user.role),
    ]);

    return NextResponse.json({
      onlineRequests,
      waitlist,
      openPast: {
        count: openPastCount,
        lookbackDays: LOOKBACK_DAYS,
        items: openPastItems.map((item) => ({
          ...item,
          patient: item.patient ? { ...item.patient, phone: hidePhone ? null : item.patient.phone } : item.patient,
        })),
      },
    });
  } catch (error) {
    console.error("[dashboard today GET]", error);
    return NextResponse.json({ message: "Günlük özet yüklenemedi." }, { status: 503 });
  }
}
