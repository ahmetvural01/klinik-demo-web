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
  activePriceList: "Tedavi Fiyat Kaynağı",
};

function normalizeSettingsPayload(body: Record<string, unknown>) {
  const data = { ...body };
  if ("activePriceList" in data && data.activePriceList !== "standard" && data.activePriceList !== "custom") {
    data.activePriceList = "standard";
  }
  delete data.id;
  delete data.institutionId;
  delete data.updatedAt;
  return data;
}

export async function GET() {
  try {
    const auth = await requireAuth("dashboard:read");
    if (auth.error) return auth.error;

    if (!auth.user.institutionId) {
      return NextResponse.json({ message: "Sadece klinik kullanicilari ayarlara erisebilir" }, { status: 403 });
    }

    const [settings, institution] = await Promise.all([
      prisma.setting.findUnique({ where: { institutionId: auth.user.institutionId } }),
      prisma.institution.findUnique({
        where: { id: auth.user.institutionId },
        select: { name: true, email: true, phone: true, address: true, taxNo: true, registryNo: true, website: true, logo: true },
      }),
    ]);
    return NextResponse.json({
      ...settings,
      institutionSlug: institution?.name || "",
      institutionName: settings?.institutionName || institution?.name || "",
      institutionPhone: settings?.institutionPhone || institution?.phone || "",
      institutionEmail: institution?.email || "",
      institutionAddress: institution?.address || "",
      institutionTaxNo: institution?.taxNo || "",
      institutionRegistryNo: institution?.registryNo || "",
      institutionWebsite: institution?.website || "",
      logoUrl: institution?.logo || "",
    });
  } catch (error) {
    console.error("[settings GET] fallback:", error);
    return NextResponse.json({ message: "Ayarlar yüklenemedi. Lütfen sistem yöneticinize bildiriniz." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth("settings:write");
    if (auth.error) return auth.error;

    if (!auth.user.institutionId) {
      return NextResponse.json({ message: "Sadece klinik kullanicilari ayar guncelleyebilir" }, { status: 403 });
    }

    const body = await request.json();
    const data = normalizeSettingsPayload(body && typeof body === "object" ? body : {});

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
      ? await prisma.setting.update({ where: { institutionId: auth.user.institutionId }, data })
      : await prisma.setting.create({
          data: {
            institutionId: auth.user.institutionId,
            institutionName: typeof data.institutionName === "string" ? data.institutionName : institution.name,
            institutionPhone: typeof data.institutionPhone === "string" ? data.institutionPhone : institution.phone,
            ...data,
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
  } catch (error) {
    console.error("[settings PUT] fallback:", error);
    return NextResponse.json({ message: "Ayarlar güncellenemedi" }, { status: 503 });
  }
}
