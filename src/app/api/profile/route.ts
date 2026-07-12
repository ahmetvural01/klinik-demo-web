import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

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

  if (body.newPassword) {
    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    try {
      await prisma.user.update({
        where: { id: auth.user.id },
        data: { passwordHash }
      });
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
        workStart: body.workStart,
        workEnd: body.workEnd,
        hideAsDoctor: typeof body.hideAsDoctor === "boolean" ? body.hideAsDoctor : (currentProfile?.hideAsDoctor ?? false),
        educationMode: typeof body.educationMode === "boolean" ? body.educationMode : (currentProfile?.educationMode ?? false),
        ...(body.photoUrl !== undefined && { photoUrl: body.photoUrl || null }),
      },
      create: {
        userId: auth.user.id,
        workStart: body.workStart ?? "08:30",
        workEnd: body.workEnd ?? "18:00",
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
