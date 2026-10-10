import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiTiming } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { turkeyTodayStartUtc } from "@/lib/tz";
import { shouldHidePatientPhoneForUser } from "@/lib/patient-visibility-server";
import { OPEN_PAST_LOOKBACK_DAYS, openPastWhere } from "./open-past";
import { homeSummaryResponse } from "./home-summary";

export const dynamic = "force-dynamic";

/**
 * Günlük özet. Üç biçim:
 * - `?ozet=1`: ana sayfanın "Yapılacaklar" listesi ve başlık sayıları (her
 *   bölüm kendi izniyle; bkz. home-summary.ts). Ana sayfayı açabilen herkes.
 * - `?lite=1`: Randevular sayfasının sayaçları (online talep, bekleme listesi,
 *   açık kalan randevu sayısı).
 * - parametresiz: aynı sayılar + açık kalan randevuların ilk 50'si (ana
 *   sayfadaki "Açık kalan randevular" penceresi).
 * Önceden online talepler ve bekleme listesi yalnız ilgili pencere açılınca
 * yükleniyordu; hiçbir sayaçta görünmediği için hastaya "sizi arayacağız"
 * denen talepler sahipsiz kalıyordu.
 */
export const GET = withApiTiming("dashboard-today", async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("ozet") === "1") return homeSummaryResponse();

  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });

  const scope = { institutionId, branchId: branch.branchId };
  const todayStart = turkeyTodayStartUtc();
  const openPastFilter = openPastWhere(scope, todayStart);

  // ?lite=1: yalnız sayılar (üst bar/menü rozetleri ve takvim sayaçları için).
  if (request.nextUrl.searchParams.get("lite") === "1") {
    try {
      const [onlineRequests, waitlist, openPastCount] = await Promise.all([
        prisma.bookingRequest.count({ where: { ...scope, status: "BEKLIYOR" } }),
        prisma.waitlist.count({ where: { ...scope, status: { in: ["BEKLIYOR", "ARANDI"] } } }),
        prisma.appointment.count({ where: openPastFilter }),
      ]);
      return NextResponse.json({ onlineRequests, waitlist, openPast: { count: openPastCount, lookbackDays: OPEN_PAST_LOOKBACK_DAYS, items: [] } });
    } catch (error) {
      console.error("[dashboard today GET lite]", error);
      return NextResponse.json({ message: "Günlük özet yüklenemedi." }, { status: 503 });
    }
  }

  try {
    const [onlineRequests, waitlist, openPastCount, openPastItems, hidePhone] = await Promise.all([
      prisma.bookingRequest.count({ where: { ...scope, status: "BEKLIYOR" } }),
      prisma.waitlist.count({ where: { ...scope, status: { in: ["BEKLIYOR", "ARANDI"] } } }),
      prisma.appointment.count({ where: openPastFilter }),
      prisma.appointment.findMany({
        where: openPastFilter,
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
      // Kişiye özel "Telefon ve TC görme" kısıtı da uygulanır (yalnız rol değil).
      shouldHidePatientPhoneForUser(auth.user),
    ]);

    return NextResponse.json({
      onlineRequests,
      waitlist,
      openPast: {
        count: openPastCount,
        lookbackDays: OPEN_PAST_LOOKBACK_DAYS,
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
});
