import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { effectiveDoctorWhere } from "@/lib/hakedis";
import { APPOINTMENT_TREATMENT_OPTIONS } from "@/lib/appointment-follow-up";
import { FALLBACK_DAILY_SCHEDULES, normalizeDailySchedules } from "@/lib/working-hours-core";

export const dynamic = "force-dynamic";

function parseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Randevu takvimi ve randevu formu için gereken salt-okunur bilgiler:
 * çalışma saatleri, randevu aralığı, kurumun SMS varsayılanları, tedavi
 * türleri ve randevu verilebilen hekimler.
 *
 * Önceden takvim bu bilgileri /api/settings (settings:read) ve
 * /api/treatment-types (settings:read) uçlarından alıyordu; Banko, Doktor ve
 * Asistan rollerinde bu yetki olmadığından takvim boş çalışma saatiyle
 * açılıyor, "Seçilen gün için çalışma saati tanımlanmamış" uyarısı yeni
 * randevu düğmesini kilitliyor ve kuruma özel tedavi türleri "Muayene"
 * görünüyordu. Bu uç yalnız randevu okuma yetkisi ister ve yalnız takvimin
 * ihtiyaç duyduğu alanları döndürür (ayar yazma/okuma yetkisi genişletilmez).
 * Hekim listesi randevu API'sinin kabul ettiği kuralla (effectiveDoctorWhere)
 * aynıdır; böylece listede görünen herkese gerçekten randevu verilebilir.
 */
export async function GET() {
  const auth = await requireAuth("appointments:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı." }, { status: 403 });

  try {
    const [setting, institution, treatmentTypes, doctors, branchCount] = await Promise.all([
      prisma.setting.findUnique({
        where: { institutionId },
        select: {
          institutionName: true,
          openingTime: true,
          closingTime: true,
          appointmentDuration: true,
          holidayDays: true,
          dailySchedules: true,
          lunchStart: true,
          lunchEnd: true,
          smsEnabled: true,
          smsDefaultInfo: true,
          smsDefaultReminder: true,
          smsDefaultSurvey: true,
        },
      }),
      prisma.institution.findUnique({ where: { id: institutionId }, select: { name: true } }),
      prisma.treatmentType.findMany({
        where: { institutionId },
        orderBy: { order: "asc" },
        select: { value: true, label: true, color: true, isActive: true },
      }),
      prisma.user.findMany({
        where: effectiveDoctorWhere(institutionId, branch.branchId),
        select: {
          id: true,
          fullName: true,
          role: true,
          isActive: true,
          profile: { select: { hideAsDoctor: true, workStart: true, workEnd: true } },
        },
        orderBy: { fullName: "asc" },
      }),
      prisma.clinicBranch.count({ where: { institutionId, isActive: true } }),
    ]);

    const lunchStart = setting?.lunchStart || "";
    const lunchEnd = setting?.lunchEnd || "";
    const rawSchedules = parseJsonArray(setting?.dailySchedules);
    const dailySchedules = normalizeDailySchedules(
      rawSchedules.length > 0 ? rawSchedules : FALLBACK_DAILY_SCHEDULES,
      lunchStart,
      lunchEnd,
    );

    const activeTypes = treatmentTypes.filter((type) => type.isActive !== false);
    const treatments = (activeTypes.length > 0 ? activeTypes : APPOINTMENT_TREATMENT_OPTIONS)
      .map((type) => ({ value: type.value, label: type.label, color: type.color }));

    return NextResponse.json({
      institutionName: setting?.institutionName || institution?.name || "",
      openingTime: setting?.openingTime || "08:30",
      closingTime: setting?.closingTime || "18:00",
      appointmentDuration: Number(setting?.appointmentDuration || 15),
      holidayDays: parseJsonArray(setting?.holidayDays).map(String),
      dailySchedules,
      sms: {
        enabled: setting?.smsEnabled ?? true,
        info: setting?.smsDefaultInfo ?? true,
        reminder: setting?.smsDefaultReminder ?? false,
        survey: setting?.smsDefaultSurvey ?? false,
      },
      treatments,
      doctors,
      multiBranch: branchCount > 1,
    });
  } catch (error) {
    console.error("[appointments calendar-settings GET]", error);
    return NextResponse.json({ message: "Takvim ayarları yüklenemedi." }, { status: 503 });
  }
}
