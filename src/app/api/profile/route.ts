import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { parseTimeToMinutes, validateWorkHoursRange } from "@/lib/working-hours-core";
import { turkeyTimeKey } from "@/lib/tz";
import { invalidateUserSessionCache, requireAuth, writeAudit } from "@/lib/api";
import { setAuthCookie, signToken } from "@/lib/auth";

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "Açık" : "Kapalı";
  return String(v);
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const profile = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: {
        id: true,
        identityNo: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        institutionId: true,
        genelYuzde: true,
        kkYuzde: true,
        maasYuzde: true,
        twoFactorEnabled: true,
        // Profil ekranı ilk şifresini (TC kimlik no) henüz değiştirmemiş
        // kullanıcıya yalnız şifre formunu gösterir.
        mustChangePassword: true,
        profile: true,
      },
    });

    return NextResponse.json(profile);
  } catch (error) {
    console.error("[profile GET] fallback:", error);
    return NextResponse.json(null);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Geçersiz veri" }, { status: 400 });
  }
  let currentProfile;
  try {
    currentProfile = await prisma.profile.findUnique({ where: { userId: auth.user.id } });
  } catch (error) {
    console.error("[profile PUT currentProfile] fallback:", error);
    currentProfile = null;
  }
  const passwordUpdated = Boolean(body.newPassword);
  if (body.newPassword !== undefined && (typeof body.newPassword !== "string" || body.newPassword.length < 8 || body.newPassword.length > 72)) {
    return NextResponse.json({ message: "Şifre 8-72 karakter olmalı" }, { status: 400 });
  }
  const workStart = body.workStart ?? currentProfile?.workStart ?? "08:30";
  const workEnd = body.workEnd ?? currentProfile?.workEnd ?? "18:00";
  const workHoursError = validateWorkHoursRange(workStart, workEnd, "Çalışma saatleri");
  if (workHoursError) {
    return NextResponse.json({ message: workHoursError }, { status: 400 });
  }

  // Personel ekranındaki (api/staff/[id]) kuralların aynısı: hekim kendi
  // mesaisini daraltırken ya da yönetici kendini hekim listesinden
  // gizlerken gelecekteki randevular sessizce mesai dışında/sahipsiz
  // kalmasın. Önceden Profil bu kontrolleri atlıyordu (bkz. denetim YK-11).
  const oldWorkStart = currentProfile?.workStart || "08:30";
  const oldWorkEnd = currentProfile?.workEnd || "18:00";
  const hoursNarrowed = (workStart > oldWorkStart || workEnd < oldWorkEnd) && (workStart !== oldWorkStart || workEnd !== oldWorkEnd);
  const hidingAsDoctor = body.hideAsDoctor === true && !currentProfile?.hideAsDoctor && auth.user.role === "YONETICI";
  if (hoursNarrowed || hidingAsDoctor) {
    const futureAppointments = await prisma.appointment.findMany({
      where: {
        doctorId: auth.user.id,
        ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
        startAt: { gte: new Date() },
        status: { notIn: ["IPTAL", "GELMEDI"] },
      },
      select: { startAt: true },
    });
    if (hidingAsDoctor && futureAppointments.length > 0) {
      return NextResponse.json({
        message: `${futureAppointments.length} gelecek randevunuz var. Hekim listesinden çıkmadan önce bu randevuları başka bir hekime devredin veya iptal edin.`,
        requiresReassignment: true,
      }, { status: 409 });
    }
    if (hoursNarrowed) {
      const newStartMin = parseTimeToMinutes(workStart);
      const newEndMin = parseTimeToMinutes(workEnd);
      const outsideCount = futureAppointments.filter((appointment) => {
        const minutes = parseTimeToMinutes(turkeyTimeKey(appointment.startAt));
        return newStartMin === null || newEndMin === null || minutes === null || minutes < newStartMin || minutes >= newEndMin;
      }).length;
      if (outsideCount > 0) {
        return NextResponse.json({
          message: `Yeni çalışma saatleriniz dışında kalan ${outsideCount} gelecek randevunuz var. Önce bu randevuları yeniden planlayın veya iptal edin.`,
          requiresReschedule: true,
        }, { status: 409 });
      }
    }
  }

  if (body.newPassword) {
    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    try {
      const updatedUser = await prisma.user.update({
        where: { id: auth.user.id },
        data: { passwordHash, mustChangePassword: false, tokenVersion: { increment: 1 } },
      });
      invalidateUserSessionCache(auth.user.id);
      const freshToken = signToken({
        userId: updatedUser.id,
        role: updatedUser.role,
        institutionId: updatedUser.institutionId,
        fullName: updatedUser.fullName,
        tokenVersion: updatedUser.tokenVersion,
      });
      await setAuthCookie(freshToken);
    } catch (error) {
      console.error("[profile PUT password] fallback:", error);
      return NextResponse.json({ message: "Şifre güncellenemedi" }, { status: 503 });
    }
  }

  let profile;
  try {
    profile = await prisma.profile.upsert({
      where: { userId: auth.user.id },
      update: {
        workStart,
        workEnd,
        hideAsDoctor: typeof body.hideAsDoctor === "boolean" ? body.hideAsDoctor : (currentProfile?.hideAsDoctor ?? false),
        educationMode: typeof body.educationMode === "boolean" ? body.educationMode : (currentProfile?.educationMode ?? false),
        ...(body.photoUrl !== undefined && { photoUrl: body.photoUrl || null }),
      },
      create: {
        userId: auth.user.id,
        workStart,
        workEnd,
        hideAsDoctor: typeof body.hideAsDoctor === "boolean" ? body.hideAsDoctor : false,
        educationMode: typeof body.educationMode === "boolean" ? body.educationMode : false,
        photoUrl: body.photoUrl || null,
      }
    });
  } catch (error) {
    console.error("[profile PUT] fallback:", error);
    return NextResponse.json({ message: "Profil güncellenemedi" }, { status: 503 });
  }

  const beforeParts: string[] = [];
  const afterParts: string[] = [];
  const pushDiff = (label: string, before: unknown, after: unknown) => {
    const b = fmt(before);
    const a = fmt(after);
    if (b !== a) {
      beforeParts.push(`${label}: ${b}`);
      afterParts.push(`${label}: ${a}`);
    }
  };

  pushDiff("Mesai Başlangıç", currentProfile?.workStart, profile.workStart);
  pushDiff("Mesai Bitiş", currentProfile?.workEnd, profile.workEnd);
  pushDiff("Doktor Olarak Gizle", currentProfile?.hideAsDoctor, profile.hideAsDoctor);
  pushDiff("Eğitim Modu", currentProfile?.educationMode, profile.educationMode);
  if (passwordUpdated) {
    beforeParts.push("Şifre: Güncellenmedi");
    afterParts.push("Şifre: Güncellendi");
  }

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından profil ayarları güncellendi.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
  ].join("\n");

  await writeAudit(auth.user.id, "PROFILE_UPDATE", detail);

  return NextResponse.json(profile);
}
