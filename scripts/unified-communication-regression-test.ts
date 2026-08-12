/* eslint-disable no-console */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_CELEBRATION_DAYS, isCelebrationDate } from "../src/lib/celebration-days";
import { DEFAULT_COMMUNICATION_TEMPLATES } from "../src/lib/default-communication-templates";

const root = path.resolve(__dirname, "..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");

function dateRow(code: string) {
  const row = DEFAULT_CELEBRATION_DAYS.find((day) => day.code === code);
  assert(row, `${code} kataloğu bulunamadı.`);
  return {
    month: row.month,
    day: row.day,
    recurrenceRule: row.recurrenceRule || "FIXED",
    weekOfMonth: row.weekOfMonth ?? null,
    weekday: row.weekday ?? null,
    dateOverrides: Array.isArray(row.dateOverrides) ? [...row.dateOverrides] : [],
  };
}

function main() {
  const requiredTemplates = ["BILGI", "RANDEVU_DEGISIKLIK", "RANDEVU_IPTAL", "HATIRLATMA", "ANKET", "ODEME_YAKLASIYOR", "ODEME_VADE_GUNU", "ODEME_GECIKTI", "DOGUM_GUNU"];
  for (const code of requiredTemplates) {
    const template = DEFAULT_COMMUNICATION_TEMPLATES.find((item) => item.code === code);
    assert(template, `${code} sistem şablonu eksik.`);
    assert(template.whatsappContent.trim(), `${code} WhatsApp metni eksik.`);
  }

  assert(isCelebrationDate(dateRow("ANNELER_GUNU"), new Date(2026, 4, 10)), "Anneler Günü değişken tarih kuralı hatalı.");
  assert(isCelebrationDate(dateRow("BABALAR_GUNU"), new Date(2026, 5, 21)), "Babalar Günü değişken tarih kuralı hatalı.");
  assert(isCelebrationDate(dateRow("RAMAZAN_BAYRAMI"), new Date(2026, 2, 20)), "Ramazan Bayramı tarih kataloğu hatalı.");
  assert(isCelebrationDate(dateRow("KURBAN_BAYRAMI"), new Date(2026, 4, 27)), "Kurban Bayramı tarih kataloğu hatalı.");

  const smsPage = source("src/app/(panel)/sms/page.tsx");
  assert(smsPage.includes("paymentReminderDaysBefore"), "Çoklu ödeme hatırlatma günleri arayüzde bulunmalı.");
  assert(smsPage.includes("WhatsappSettingsTab connectionOnly"), "WhatsApp bağlantısı İletişim Merkezi'nde olmalı.");
  assert(!source("src/app/(panel)/ayar/page.tsx").includes("WhatsappSettingsTab"), "WhatsApp genel Ayarlar'da tekrarlanmamalı.");

  const bulkRoute = source("src/app/api/sms/bulk/route.ts");
  assert(bulkRoute.includes("celebrationCode"), "Manuel özel gün gönderimi katalog kodunu korumalı.");
  assert(bulkRoute.includes("targetProfessions"), "Meslek günü alıcıları mesleğe göre filtrelenmeli.");
  assert(
    bulkRoute.includes('channelPreference !== "SMS"') && bulkRoute.includes('effectiveChannelPreference = "SMS"'),
    "Otomatik kanal, WhatsApp yazma yetkisi olmayan kullanıcı için SMS ile sınırlandırılmalı.",
  );

  const bulkTab = source("src/app/(panel)/sms/_tabs/BulkSendTab.tsx");
  assert(
    bulkTab.includes('hasFeature("whatsapp") && can("whatsapp:write")'),
    "Toplu gönderimde WhatsApp seçeneği özellik ve yazma yetkisini birlikte aramalı.",
  );

  const embeddedSignup = source("src/app/api/whatsapp/embedded-signup/route.ts");
  assert(
    embeddedSignup.includes("publicErrorResponse") && !embeddedSignup.includes("error.message.slice"),
    "Embedded Signup teknik sunucu hatalarını kullanıcıya sızdırmamalı.",
  );

  const appointmentReminders = source("src/lib/appointment-reminders.ts");
  assert(
    appointmentReminders.includes("appointment.patient.id !== reminder.patientId"),
    "Randevu hatırlatıcısı reminder ve randevu hastasının aynı olduğunu doğrulamalı.",
  );

  console.log("Birleşik iletişim regresyon kontrolleri başarılı.");
}

main();
