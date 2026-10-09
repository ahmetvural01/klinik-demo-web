import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAnyAuth } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { findConnectedWhatsapp } from "@/lib/whatsapp-connection";

/** Süperadmin panosuyla aynı düşük kredi eşiği (bkz. api/superadmin/dashboard). */
const LOW_BALANCE_THRESHOLD = 50;

// İzin SMS'indeki bağlantı hastanın telefonunda açılabilmeli: https olmalı ve
// localhost / özel ağ adresi olmamalı. Yalnız "adres dolu mu" bakmak, açılmayan
// bir bağlantıyı "hazır" gösteriyordu.
function consentLinkReady(raw: string) {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host === "::1" || host === "[::1]") return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

// İletişim sayfasının üst satırındaki tek durum özeti ve sekmelerin ortak
// bilgisi: SMS açık mı, kaç kredi kaldı, WhatsApp bağlı mı, otomatik
// mesajlar açık mı, mesajlarda görünen klinik adı/telefonu. Sekmeler
// /api/settings'i okumak zorunda kalmasın diye (BANKO'da settings:read yok)
// gereken alanlar burada, iletişim yetkisiyle döner. Yalnız kullanıcının
// kendi kurumu okunur; başka kurumun bakiyesi dönmez.
export async function GET() {
  const auth = await requireAnyAuth(["sms:read", "whatsapp:read"]);
  if (auth.error) return auth.error;
  const institutionId = auth.user.institutionId;
  if (!institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları erişebilir." }, { status: 403 });
  }
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 403 });

  const [canReadSms, canReadWhatsapp, institution, setting, provider] = await Promise.all([
    hasEffectivePermission(auth.user, "sms:read"),
    hasEffectivePermission(auth.user, "whatsapp:read"),
    prisma.institution.findUnique({
      where: { id: institutionId },
      select: { name: true, phone: true, smsBalance: true, whatsappEnabled: true },
    }),
    prisma.setting.findUnique({
      where: { institutionId },
      select: {
        institutionName: true,
        institutionPhone: true,
        smsEnabled: true,
        defaultNotificationChannel: true,
        whatsappSmsFallback: true,
        paymentReminderSmsEnabled: true,
        birthdaySmsEnabled: true,
        reviewLink: true,
      },
    }),
    findConnectedWhatsapp(institutionId),
  ]);
  if (!institution) return NextResponse.json({ message: "Klinik bulunamadı." }, { status: 404 });

  const whatsappVisible = Boolean(institution.whatsappEnabled && canReadWhatsapp);
  const appUrl = process.env.APP_URL || "";
  return NextResponse.json({
    clinic: {
      // Randevu, ödeme, doğum günü ve toplu mesajlar Ayarlar'daki görünen adı;
      // izin SMS'i ve kutlama taraması Kurum kaydındaki adı kullanır.
      displayName: setting?.institutionName || institution.name,
      displayPhone: setting?.institutionPhone || institution.phone || "",
      legalName: institution.name,
      legalPhone: institution.phone || "",
      reviewLink: setting?.reviewLink || "",
    },
    branch: {
      name: auth.user.branchContext.activeBranch?.name || "",
      multiple: auth.user.branchContext.branches.length > 1,
    },
    sms: canReadSms
      ? {
          enabled: setting?.smsEnabled ?? true,
          balance: institution.smsBalance,
          lowBalanceThreshold: LOW_BALANCE_THRESHOLD,
        }
      : null,
    whatsapp: whatsappVisible
      ? { connected: Boolean(provider), phone: provider?.displayPhoneNumber || null }
      : null,
    automations: {
      paymentReminders: setting?.paymentReminderSmsEnabled ?? false,
      birthday: setting?.birthdaySmsEnabled ?? false,
    },
    defaultChannel: setting?.defaultNotificationChannel === "WHATSAPP" ? "WHATSAPP" : "SMS",
    whatsappSmsFallback: setting?.whatsappSmsFallback ?? true,
    consentLink: { ready: consentLinkReady(appUrl), address: appUrl },
  });
}
