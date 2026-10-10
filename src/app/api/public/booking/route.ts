import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/api";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { formatZodError, publicBookingSchema } from "@/lib/validators";
import { getDailySchedules } from "@/lib/working-hours";
import { checkWorkingDay } from "@/lib/working-hours-core";
import { turkeyDateKey } from "@/lib/tz";
import { maskPatientName, maskPatientPhone } from "@/lib/audit-mask";
import { verifyPublicBookingOtp } from "@/lib/public-booking-otp";
import { effectiveDoctorWhere } from "@/lib/hakedis";
import { normalizeLocalPhone } from "@/lib/phone-number";
import { can } from "@/lib/rbac";

/**
 * Kurum sahibi hesabı yoksa talebin kaydını (ve kliniğin açık ekranlarına
 * giden "yeni talep" sinyalini) yazacak personel: talepleri onaylayabilen
 * (appointments:approve) aktif biri. Önceden roller koda sabitti (Yönetici,
 * Banko); matriste talepleri onaylayan Asistan olan klinikte kayıt ve sinyal
 * hiç yazılmıyordu. İzin rol başına bir kez çözülür. Kimse yoksa herhangi bir
 * aktif personel (sinyal yine gitsin).
 */
async function findRequestReviewerId(institutionId: string): Promise<string | undefined> {
  const staff = await prisma.user.findMany({
    where: { institutionId, isActive: true },
    select: { id: true, role: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const allowedByRole = new Map<string, boolean>();
  for (const member of staff) {
    if (!allowedByRole.has(member.role)) allowedByRole.set(member.role, await can(member.role, "appointments:approve"));
    if (allowedByRole.get(member.role)) return member.id;
  }
  return staff[0]?.id;
}

export async function POST(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers);
  const rate = await checkRateLimit(`public-booking:${ip}`, 5, 15 * 60_000);
  if (!rate.ok) {
    return NextResponse.json({ error: "Çok fazla talep gönderildi. Lütfen daha sonra tekrar deneyin." }, { status: 429 });
  }

  try {
    const body = await req.json();
    // Kod gönderme ucuyla aynı kanonik telefon (bkz. send-code/route.ts).
    const parsed = publicBookingSchema.safeParse({
      ...(body && typeof body === "object" ? body : {}),
      phone: normalizeLocalPhone(String((body as { phone?: unknown })?.phone ?? ""), "+90"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error)[0] || "Geçersiz veri" }, { status: 400 });
    }
    const { kurum, branchId, fullName, phone, code, tcNo, doctorId, preferredFrom, note } = parsed.data;

    const preferredDate = new Date(preferredFrom);
    const preferredDateKey = turkeyDateKey(preferredDate);
    if (preferredDateKey < turkeyDateKey()) {
      return NextResponse.json({ error: "Geçmiş bir tarih seçilemez." }, { status: 400 });
    }

    const institution = await prisma.institution.findFirst({
      where: {
        isActive: true,
        OR: [
          { id: kurum },
          { name: { equals: kurum, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        ownerId: true,
        branches: {
          where: { isActive: true },
          select: { id: true },
          orderBy: [{ isHeadquarters: "desc" }, { sortOrder: "asc" }],
        },
      },
    });
    if (!institution) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 });
    const selectedBranch = branchId
      ? institution.branches.find((branch) => branch.id === branchId)
      : institution.branches[0];
    if (!selectedBranch) return NextResponse.json({ error: "Aktif şube bulunamadı" }, { status: 404 });

    const dailySchedules = await getDailySchedules(institution.id);
    const workingDayError = checkWorkingDay(
      preferredDateKey,
      dailySchedules,
      "Randevu talebi"
    );
    if (workingDayError) {
      return NextResponse.json({ error: workingDayError }, { status: 400 });
    }

    if (doctorId) {
      const doctor = await prisma.user.findFirst({
        where: { id: doctorId, ...effectiveDoctorWhere(institution.id, selectedBranch.id) },
        select: { id: true },
      });
      if (!doctor) return NextResponse.json({ error: "Doktor bulunamadı" }, { status: 404 });
    }

    // Kodu ancak diğer tüm alanlar ve ilişkiler doğrulandıktan sonra tüket.
    // Böylece takvim/doktor doğrulama hatası kullanıcının geçerli kodunu yakmaz.
    const otpResult = await verifyPublicBookingOtp(institution.id, phone, code);
    if (!otpResult.ok) {
      return NextResponse.json({ error: otpResult.error || "Doğrulama kodu hatalı" }, { status: 400 });
    }

    const request = await prisma.bookingRequest.create({
      data: {
        institutionId: institution.id,
        branchId: selectedBranch.id,
        doctorId,
        fullName,
        phone,
        tcNo,
        preferredFrom: preferredDate,
        note,
      },
    });
    const auditUserId = institution.ownerId || await findRequestReviewerId(institution.id);
    if (auditUserId) {
      await writeAudit(auditUserId, "PUBLIC_BOOKING_REQUEST_CREATE", `Online randevu talebi: ${maskPatientName(fullName)} / ${maskPatientPhone(phone)} / ${preferredDate.toLocaleString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}`);
    }

    return NextResponse.json({ ok: true, id: request.id }, { status: 201 });
  } catch (error) {
    console.error("[public booking POST]", error);
    return NextResponse.json({ error: "Talep gönderilemedi" }, { status: 503 });
  }
}
