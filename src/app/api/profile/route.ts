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
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const profile = await prisma.user.findUnique({
    where: { id: auth.user.id },
    include: { profile: true }
  });

  return NextResponse.json(profile);
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const body = await request.json();
  const currentProfile = await prisma.profile.findUnique({ where: { userId: auth.user.id } });
  const passwordUpdated = Boolean(body.newPassword);

  if (body.newPassword) {
    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await prisma.user.update({
      where: { id: auth.user.id },
      data: { passwordHash }
    });
  }

  const profile = await prisma.profile.upsert({
    where: { userId: auth.user.id },
    update: {
      workStart: body.workStart,
      workEnd: body.workEnd,
      hideAsDoctor: Boolean(body.hideAsDoctor),
      educationMode: Boolean(body.educationMode)
    },
    create: {
      userId: auth.user.id,
      workStart: body.workStart ?? "08:30",
      workEnd: body.workEnd ?? "18:00",
      hideAsDoctor: Boolean(body.hideAsDoctor),
      educationMode: Boolean(body.educationMode)
    }
  });

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
