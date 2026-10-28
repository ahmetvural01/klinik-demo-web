import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Ana sayfa › "Başlarken" (yalnız klinik yöneticisi): kliniği kullanıma
 * hazırlayan adımlar ve hangisinin yapıldığı. Her adım kendi kaydından
 * anlaşılır; kullanıcı ayrıca "yaptım" işaretlemez.
 */
export async function GET() {
  const auth = await requireAuth("settings:read");
  if (auth.error) return auth.error;
  const institutionId = auth.user.institutionId;
  if (!institutionId || !(await hasEffectivePermission(auth.user, "settings:write"))) {
    return NextResponse.json({ steps: [] });
  }

  const [setting, institution, staff, prices, labs, patients, appointments, whatsapp] = await Promise.all([
    prisma.setting.findUnique({
      where: { institutionId },
      select: { institutionPhone: true, institutionAddress: true, dailySchedules: true, closingTime: true, openingTime: true },
    }),
    prisma.institution.findUnique({ where: { id: institutionId }, select: { phone: true, address: true, smsBalance: true, whatsappEnabled: true } }),
    prisma.user.count({ where: { institutionId, isActive: true } }),
    prisma.priceItem.count({ where: { institutionId } }),
    // Lab işi açmak için Laboratuvar türünde firma gerekir; yoksa doktor ilk lab işinde takılıyordu.
    prisma.firma.count({ where: { institutionId, kategori: "LAB", isActive: true } }),
    prisma.patient.count({ where: { institutionId } }),
    prisma.appointment.count({ where: { institutionId } }),
    prisma.whatsappWebSession.count({ where: { institutionId, credsEncrypted: { not: null } } }),
  ]);

  let schedules: unknown[] = [];
  try {
    const parsed = JSON.parse(setting?.dailySchedules || "[]");
    schedules = Array.isArray(parsed) ? parsed : [];
  } catch {
    schedules = [];
  }
  const hoursSet = schedules.length > 0 || (setting?.openingTime || "08:30") !== "08:30" || (setting?.closingTime || "23:00") !== "23:00";
  const whatsappConnected = Boolean(institution?.whatsappEnabled && whatsapp > 0);

  const steps = [
    { key: "klinik", done: Boolean((setting?.institutionPhone || institution?.phone) && (setting?.institutionAddress || institution?.address)) },
    { key: "saatler", done: hoursSet },
    { key: "ekip", done: staff > 1 },
    { key: "fiyat", done: prices > 0 },
    { key: "lab", done: labs > 0 },
    { key: "mesaj", done: (institution?.smsBalance || 0) > 0 || whatsappConnected },
    { key: "hasta", done: patients > 0 },
    { key: "randevu", done: appointments > 0 },
  ];
  return NextResponse.json({ steps });
}
