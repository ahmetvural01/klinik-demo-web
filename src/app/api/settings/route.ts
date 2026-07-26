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
      return NextResponse.json({ message: "Yalnızca klinik kullanıcıları ayarlara erişebilir." }, { status: 403 });
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
      return NextResponse.json({ message: "Yalnızca klinik kullanıcıları ayarları güncelleyebilir." }, { status: 403 });
    }

    const body = await request.json();
    const data = normalizeSettingsPayload(body && typeof body === "object" ? body : {});

    const institution = await prisma.institution.findUnique({
      where: { id: auth.user.institutionId },
    });

    if (!institution) {
      return NextResponse.json({ message: "Klinik bulunamadı." }, { status: 404 });
    }

    const current = await prisma.setting.findUnique({
      where: { institutionId: auth.user.institutionId },
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
    return NextResponse.json({ message: "Ayarlar güncellenemedi." }, { status: 503 });
  }
}
