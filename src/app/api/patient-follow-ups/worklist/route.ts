import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { appointmentNeedsFollowUp } from "@/lib/appointment-follow-up";
import { loadPatientListExtras } from "@/lib/patient-list-extras";
import { shouldHidePatientPhoneForUser } from "@/lib/patient-visibility-server";
import { FOLLOW_UP_INCLUDE, maskFollowUpPhone } from "../follow-up-include";

const DAY_MS = 86_400_000;
const FOLLOW_UP_LIMIT = 500;
// Randevudan türeyen ("Gelmedi" / randevu notunda takip durumu) satırlar son 90 günden gelir.
const DERIVED_DAYS = 90;
const DERIVED_LIMIT = 500;
const VISIT_LIMIT = 300;
const CLOSED_DAY_OPTIONS = new Set([30, 90, 365]);

function parseStoredTypes(value?: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 80) : [];
  } catch {
    return [];
  }
}

/**
 * Yapılacaklar > Hasta aramaları listesinin TEK isteği. Önceden ekran üç
 * istek atıyordu: son 90 günün TÜM randevuları (en fazla 500, en eskiden
 * başlayarak — yoğun klinikte son haftaların "Gelmedi" satırları listeye hiç
 * gelmiyordu), aramalar ve ardından ayrı bir istekle hastaların randevu
 * bilgisi (liste çizildikten sonra satırlar düşüyor, ekran zıplıyordu; hız
 * raporu TG1-TG2). Burada yalnız aramaya dönüşecek randevular (Gelmedi ya da
 * notunda takip durumu olan, henüz bir aramaya bağlanmamış) en yeniden
 * okunur ve ziyaret bilgisi aynı yanıtta döner.
 *
 * Kurallar GET /api/patient-follow-ups ve /patient-visits ile aynıdır:
 * kurum + aktif şube, arşivlenmemiş hasta; açık aramalar tarihten bağımsız,
 * kapalılar seçilen dönemde; randevu satırları ve ziyaret bilgisi yalnız
 * randevu okuma yetkisiyle; telefon yalnız telefon görme yetkisiyle.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("hastatracking:read");
    if (auth.error) return auth.error;
    const branch = requireActiveBranch(auth.user.branchContext);
    if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
    const institutionId = auth.user.institutionId;
    if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });

    const requestedClosedDays = Number(request.nextUrl.searchParams.get("closedDays") || 90);
    const closedDays = CLOSED_DAY_OPTIONS.has(requestedClosedDays) ? requestedClosedDays : 90;
    const now = new Date();
    const closedFrom = new Date(now.getTime() - closedDays * DAY_MS);
    const derivedFrom = new Date(now.getTime() - DERIVED_DAYS * DAY_MS);

    const [canSeeAppointments, hidePhone, setting] = await Promise.all([
      hasEffectivePermission(auth.user, "appointments:read"),
      shouldHidePatientPhoneForUser(auth.user),
      prisma.setting.findUnique({ where: { institutionId }, select: { followUpCustomTypes: true } }),
    ]);

    const [followUps, appointmentRows] = await Promise.all([
      prisma.patientFollowUp.findMany({
        where: {
          institutionId,
          AND: [
            // Açık arama tarih aralığına bakılmadan her zaman gelir (HL-03); aralık yalnız kapalılara uygulanır.
            { OR: [{ status: "ACIK" }, { createdAt: { gte: closedFrom, lte: now } }, { closedAt: { gte: closedFrom, lte: now } }] },
            // Aramanın sahibi hastadır; arşivlenmiş hastanın araması listede kalmaz (HL-V05).
            { patient: { institutionId, homeBranchId: branch.branchId, archivedAt: null } },
          ],
        },
        include: FOLLOW_UP_INCLUDE,
        orderBy: [{ status: "asc" }, { nextActionAt: "asc" }, { createdAt: "desc" }],
        take: FOLLOW_UP_LIMIT,
      }),
      canSeeAppointments
        ? prisma.appointment.findMany({
            where: {
              institutionId,
              branchId: branch.branchId,
              startAt: { gte: derivedFrom, lte: now },
              patient: { archivedAt: null },
              // Bir aramaya bağlanmış randevu ikinci kez satır üretmez (HL-V02).
              followUps: { none: {} },
              OR: [{ status: "GELMEDI" }, { note: { contains: "Takip durumu:", mode: "insensitive" } }],
            },
            select: {
              id: true,
              startAt: true,
              endAt: true,
              status: true,
              note: true,
              patient: { select: { id: true, fullName: true, phone: true, phoneCountryCode: true, whatsappOptInAt: true, whatsappOptOutAt: true } },
              doctor: { select: { id: true, fullName: true } },
            },
            orderBy: { startAt: "desc" },
            take: DERIVED_LIMIT + 1,
          })
        : Promise.resolve([]),
    ]);

    const appointmentsTruncated = appointmentRows.length > DERIVED_LIMIT;
    const appointments = appointmentRows
      .slice(0, DERIVED_LIMIT)
      .filter((appointment) => appointmentNeedsFollowUp(appointment.status, appointment.note))
      .map((appointment) => (hidePhone ? { ...appointment, patient: { ...appointment.patient, phone: null } } : appointment));

    // "Randevusu var" ve sonradan gelen hastanın "Gelmedi" satırını düşürmek için ziyaret bilgisi.
    let visits: Record<string, { lastVisitAt: string | null; nextAppointment: { startAt: string; doctorName: string | null } | null }> = {};
    if (canSeeAppointments) {
      const patientIds = Array.from(new Set([
        ...followUps.filter((followUp) => followUp.status === "ACIK").map((followUp) => followUp.patientId),
        ...appointments.map((appointment) => appointment.patient.id),
      ])).slice(0, VISIT_LIMIT);
      if (patientIds.length > 0) {
        const extras = await loadPatientListExtras({
          institutionId,
          branchId: branch.branchId,
          patients: patientIds.map((id) => ({ id })),
          includeVisits: true,
          includeBalance: false,
        });
        visits = {};
        for (const [id, extra] of extras) {
          if (extra.lastVisitAt || extra.nextAppointment) visits[id] = { lastVisitAt: extra.lastVisitAt, nextAppointment: extra.nextAppointment };
        }
      }
    }

    return NextResponse.json({
      followUps: followUps.map((item) => maskFollowUpPhone(item, hidePhone)),
      appointments,
      visits,
      customTypes: parseStoredTypes(setting?.followUpCustomTypes),
      canSeeAppointments,
      appointmentsTruncated,
    });
  } catch (error) {
    console.error("[patient-follow-ups/worklist GET] fallback:", error);
    return NextResponse.json({ message: "Hasta arama listesi yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
}
