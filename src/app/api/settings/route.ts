import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "Açık" : "Kapalı";
  return String(v);
}

const SETTING_LABELS: Record<string, string> = {
  institutionName: "Kurum Adı",
  institutionPhone: "Kurum Telefonu",
  appointmentDurationMin: "Randevu Süresi (dk)",
  smsDefaultInfo: "SMS Bilgilendirme",
  smsDefaultReminder: "SMS Hatırlatma",
  smsDefaultSurvey: "SMS Anket",
  reminderLeadHours: "Hatırlatma Süresi (saat)",
  logoUrl: "Logo URL",
  primaryColor: "Ana Renk",
};

export async function GET() {
  const auth = await requireAuth("*");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Sadece klinik kullanicilari ayarlara erisebilir" }, { status: 403 });
  }

  const settings = await prisma.setting.findUnique({
    where: { institutionId: auth.user.institutionId },
  });
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth("*");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Sadece klinik kullanicilari ayar guncelleyebilir" }, { status: 403 });
  }

  const body = await request.json();

  const institution = await prisma.institution.findUnique({
    where: { id: auth.user.institutionId },
  });

  if (!institution) {
    return NextResponse.json({ message: "Klinik bulunamadi" }, { status: 404 });
  }

  const current = await prisma.setting.findUnique({
    where: { institutionId: auth.user.institutionId },
  });

  const updated = current
    ? await prisma.setting.update({ where: { institutionId: auth.user.institutionId }, data: body })
    : await prisma.setting.create({
        data: {
          institutionId: auth.user.institutionId,
          institutionName: body.institutionName || institution.name,
          institutionPhone: body.institutionPhone || institution.phone,
          ...body,
        },
      });

  const beforeParts: string[] = [];
  const afterParts: string[] = [];
  Object.entries(SETTING_LABELS).forEach(([key, label]) => {
    const oldVal = fmt(current ? (current as unknown as Record<string, unknown>)[key] : undefined);
    const newVal = fmt((updated as unknown as Record<string, unknown>)[key]);
    if (oldVal !== newVal) {
      beforeParts.push(`${label}: ${oldVal}`);
      afterParts.push(`${label}: ${newVal}`);
    }
  });

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından sistem ayarları güncellendi.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
  ].join("\n");

  await writeAudit(auth.user.id, "SETTINGS_UPDATE", detail);

  return NextResponse.json(updated);
}
