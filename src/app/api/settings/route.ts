import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { validateWorkingHoursSettings } from "@/lib/working-hours-core";

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "Açık" : "Kapalı";
  return String(v);
}

const SETTING_LABELS: Record<string, string> = {
  institutionName: "Kurum Adı",
  institutionPhone: "Kurum Telefonu",
  appointmentDuration: "Randevu Süresi (dk)",
  smsDefaultInfo: "SMS Bilgilendirme",
  smsDefaultReminder: "SMS Hatırlatma",
  smsDefaultSurvey: "SMS Anket",
  reminderLeadHours: "Hatırlatma Süresi (saat)",
  logoUrl: "Kurum Logosu",
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
  // Institution tablosunda tutulur, Setting'in parçası değil — PUT gövdesine
  // sızarsa Prisma "bilinmeyen alan" hatası verir.
  delete data.whatsappEnabled;
  delete data.institutionSlug;
  delete data.appUrl;
  return data;
}

function validateLogoUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const logoUrl = String(value).trim();
  const allowedRemote = /^https:\/\/.+/i.test(logoUrl);
  const allowedEmbedded = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(logoUrl);
  if (!allowedRemote && !allowedEmbedded) return null;
  // Küçük bir kurum logosu için veritabanında gereksiz büyük veri tutulmasın.
  if (logoUrl.length > 550_000) return null;
  return logoUrl;
}

export async function GET() {
  try {
    const auth = await requireAuth("dashboard:read");
    if (auth.error) return auth.error;

    if (!auth.user.institutionId) {
      return NextResponse.json({ message: "Yalnızca klinik kullanıcıları ayarlara erişebilir." }, { status: 403 });
    }

    const [settings, institution] = await Promise.all([
      prisma.setting.findUnique({ where: { institutionId: auth.user.institutionId } }),
      prisma.institution.findUnique({
        where: { id: auth.user.institutionId },
        select: { name: true, email: true, phone: true, address: true, taxNo: true, registryNo: true, website: true, logo: true, whatsappEnabled: true },
      }),
    ]);
    return NextResponse.json({
      ...settings,
      institutionSlug: institution?.name || "",
      whatsappEnabled: institution?.whatsappEnabled ?? false,
      // SMS onay bağlantılarının (/sms-onay/[token]) hangi adresten üretildiği
      // — SMS Ayarları ekranında "Onay bağlantısı çalışma durumu" için.
      appUrl: process.env.APP_URL || "",
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
      return NextResponse.json({ message: "Yalnızca klinik kullanıcıları ayarları güncelleyebilir." }, { status: 403 });
    }
    const institutionId = auth.user.institutionId;

    const body = await request.json();
    const data = normalizeSettingsPayload(body && typeof body === "object" ? body : {});
    const requestedLogo = data.logoUrl;
    delete data.logoUrl;
    const logoUrl = validateLogoUrl(requestedLogo);
    if (requestedLogo && !logoUrl) {
      return NextResponse.json({ message: "Logo PNG, JPG, WEBP veya GIF biçiminde olmalı; güvenli bir HTTPS bağlantısı ya da 400 KB altı bir dosya kullanın." }, { status: 400 });
    }

    const institution = await prisma.institution.findUnique({
      where: { id: institutionId },
    });

    if (!institution) {
      return NextResponse.json({ message: "Klinik bulunamadı." }, { status: 404 });
    }

    const current = await prisma.setting.findUnique({
      where: { institutionId },
    });

    const duration = Number(data.appointmentDuration ?? current?.appointmentDuration ?? 15);
    if (!Number.isInteger(duration) || duration < 5 || duration > 240) {
      return NextResponse.json({ message: "Randevu süresi 5 ile 240 dakika arasında olmalıdır." }, { status: 400 });
    }

    // Yalnızca istemci tarafında (sms/page.tsx) sınırlanıyordu — doğrudan API
    // çağrısıyla negatif/aşırı büyük bir değer sessizce kaydedilip hatırlatma
    // penceresini anlamsız hale getirebilirdi (bkz. denetim raporu).
    if (data.paymentReminderWindowDays !== undefined) {
      const windowDays = Number(data.paymentReminderWindowDays);
      if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 30) {
        return NextResponse.json({ message: "Ödeme hatırlatma penceresi 1 ile 30 gün arasında olmalıdır." }, { status: 400 });
      }
    }

    let parsedDailySchedules: unknown = [];
    const dailySchedulesRaw = data.dailySchedules ?? current?.dailySchedules ?? "[]";
    try {
      parsedDailySchedules =
        typeof dailySchedulesRaw === "string" ? JSON.parse(dailySchedulesRaw) : dailySchedulesRaw;
    } catch {
      return NextResponse.json({ message: "Çalışma günü ayarları geçerli bir biçimde değil." }, { status: 400 });
    }
    const workingHoursError = validateWorkingHoursSettings({
      dailySchedules: parsedDailySchedules,
      lunchStart: data.lunchStart ?? current?.lunchStart ?? "",
      lunchEnd: data.lunchEnd ?? current?.lunchEnd ?? "",
    });
    if (workingHoursError) {
      return NextResponse.json({ message: workingHoursError }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Logo Institution üzerinde tek kaynakta tutulur; onam/PDF ve menü aynı
      // görseli okur. Boş logo, mevcut logonun bilinçli olarak kaldırılmasıdır.
      if (requestedLogo !== undefined) {
        await tx.institution.update({
          where: { id: institutionId },
          data: { logo: logoUrl || "" },
        });
      }

      return current
        ? tx.setting.update({ where: { institutionId }, data })
        : tx.setting.create({
            data: {
              institutionId,
              institutionName: typeof data.institutionName === "string" ? data.institutionName : institution.name,
              institutionPhone: typeof data.institutionPhone === "string" ? data.institutionPhone : institution.phone,
              ...data,
            },
          });
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

  if (requestedLogo !== undefined && (institution.logo || "") !== (logoUrl || "")) {
    beforeParts.push(`Kurum Logosu: ${institution.logo ? "Tanımlı" : "Yok"}`);
    afterParts.push(`Kurum Logosu: ${logoUrl ? "Tanımlı" : "Kaldırıldı"}`);
  }

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından sistem ayarları güncellendi.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
  ].join("\n");

    await writeAudit(auth.user.id, "SETTINGS_UPDATE", detail);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[settings PUT] fallback:", error);
    return NextResponse.json({ message: "Ayarlar güncellenemedi." }, { status: 503 });
  }
}
