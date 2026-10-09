/* eslint-disable no-console */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeWhatsappPhone } from "../src/lib/whatsapp";

const prisma = new PrismaClient();
const root = path.resolve(__dirname, "..");

function source(file: string) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

async function main() {
  assert.equal(normalizeWhatsappPhone("0532 111 22 33"), "905321112233");
  assert.equal(normalizeWhatsappPhone("+49 151 12345678"), "4915112345678");
  assert.equal(normalizeWhatsappPhone("12"), null);

  // Klinik numarasını QR kod / eşleştirme koduyla bağlar (bağlı cihaz); teknik alan yok.
  const ui = source("src/components/whatsapp/WhatsappWebConnect.tsx");
  assert(!ui.includes("Auth Token"), "Klinik ekranı Auth Token istememeli.");
  assert(!ui.includes("Account SID"), "Klinik ekranı Account SID istememeli.");
  for (const technicalField of [
    "WhatsApp Business Hesap ID",
    "Telefon Numarası ID",
    "Kalıcı Sistem Kullanıcısı Erişim Anahtarı",
    "Meta Uygulama Sırrı",
    "Webhook Doğrulama Anahtarı",
  ]) {
    assert(!ui.includes(technicalField), `Klinik ekranı teknik alan göstermemeli: ${technicalField}`);
  }
  assert(ui.includes("QR kodu göster") && ui.includes("Telefon numarasıyla bağla"), "QR ve telefon numarasıyla bağlama yolları sunulmalı.");
  assert(ui.includes("/api/whatsapp/web"), "Bağlantı kartı QR bağlantı API'sini kullanmalı.");
  assert(ui.includes("sohbetleriniz sisteme alınmaz"), "Kişisel sohbetlerin sisteme alınmadığı açıkça söylenmeli.");

  const smsPage = source("src/app/(panel)/sms/page.tsx");
  assert(smsPage.includes('hasFeature("whatsapp")'), "SMS ekranı kurum WhatsApp özelliğini kontrol etmeli.");
  assert(source("src/app/(panel)/sms/_tabs/SettingsTab.tsx").includes("WhatsappWebConnect"), "WhatsApp bağlantısı İletişim > Ayarlar'dan yönetilmeli.");
  assert(smsPage.includes("baglanti: { tab: \"ayarlar\""), "Eski bağlantı adresi Ayarlar'a yönlenmeli.");

  const settingsPage = source("src/app/(panel)/ayar/page.tsx");
  assert(!settingsPage.includes("WhatsappWebConnect"), "WhatsApp ayarları genel klinik ayarlarında tekrar etmemeli.");

  assert(smsPage.includes('searchParams.get("tab")'), "İletişim merkezi doğrudan sekme bağlantısını desteklemeli.");
  assert(smsPage.includes("anchor: \"whatsapp-baglanti\""), "WhatsApp bağlantı derin bağlantısı doğru bölümü açmalı.");

  const institutionDetail = source("src/app/superadmin/institutions/[id]/page.tsx");
  assert(!institutionDetail.includes("Eksik sunucu ayarları:"), "Kurum ekranı teknik ortam değişkenlerini kullanıcıya dökmemeli.");
  assert(!institutionDetail.includes("Klinik WhatsApp Ekranını Aç"), "Süperadmin kurum formu klinik bağlantı işlemi sunmamalı.");
  assert(!institutionDetail.includes("disabled={!institution.whatsappPlatform.ready"), "Klinik modül yetkisi platform hazırlığından bağımsız yönetilmeli.");
  // Gizli giriş penceresi ayrı bileşene taşındı (GhostLoginModal).
  const ghostLogin = source("src/components/superadmin/GhostLoginModal.tsx");
  assert(ghostLogin.indexOf('window.open("about:blank"') > -1 && ghostLogin.indexOf('window.open("about:blank"') < ghostLogin.indexOf('fetch("/api/auth/superadmin/impersonate"'), "Klinik sekmesi popup engeline takılmadan kullanıcı hareketi sırasında ayrılmalı.");

  const superadminInstitutionApi = source("src/app/api/superadmin/institutions/[id]/route.ts");
  assert(!superadminInstitutionApi.includes("WhatsApp kullanım hakkı verilemez"), "Sunucu klinik modül yetkisini platform hazırlığına bağlamamalı.");

  const providerApi = source("src/app/api/whatsapp/provider/route.ts");
  assert(!providerApi.includes("accessTokenEncrypted: true"), "Klinik API yanıtı şifreli token alanını seçmemeli.");
  assert(providerApi.includes("institutionId_code"), "Sağlayıcı sorgusu kurum bileşik anahtarıyla yapılmalı.");
  assert(providerApi.includes('role === "YONETICI" || role === "SUPERADMIN"'), "Bağlantı yönetimi yönetici ve süperadmin ile sınırlı olmalı.");
  assert(!providerApi.includes("export async function POST"), "Normal sağlayıcı API'si manuel klinik bağlantısı kabul etmemeli.");
  assert(
    providerApi.includes("WhatsApp bağlantısı kullanılamıyor. Yeniden bağlanmayı deneyin."),
    "Klinik sağlayıcı API'si eski teknik bağlantı hatalarını güvenli bir mesajla maskelemeli.",
  );

  const embeddedSignupApi = source("src/app/api/whatsapp/embedded-signup/route.ts");
  assert(embeddedSignupApi.includes("hashEmbeddedSignupState"), "Embedded Signup tek kullanımlık state ile korunmalı.");
  assert(embeddedSignupApi.includes("session.institutionId !== institutionId"), "Embedded Signup oturumu kurumla eşleşmeli.");
  assert(embeddedSignupApi.includes("institutionId: { not: institutionId }"), "Aynı WhatsApp numarası farklı kliniğe bağlanamamalı.");
  assert(embeddedSignupApi.includes("isEncryptedValue(encryptedToken)"), "Meta erişim anahtarı yalnızca şifrelenmiş biçimde kaydedilmeli.");
  assert(embeddedSignupApi.includes("registrationPinEncrypted: encryptedRegistrationPin"), "Telefon kayıt PIN'i yalnız şifreli biçimde saklanmalı.");

  const metaWhatsapp = source("src/lib/meta-whatsapp.ts");
  assert(metaWhatsapp.includes("crypto.randomInt(0, 1_000_000)"), "Cloud API kayıt PIN'i sunucuda güvenli rastgele üretilmeli.");
  assert(metaWhatsapp.includes("/register`"), "Embedded Signup sonrasında telefon Cloud API'ye kaydedilmeli.");
  assert(metaWhatsapp.includes('messaging_product: "whatsapp"'), "Telefon kayıt isteği WhatsApp ürününü belirtmeli.");
  assert(metaWhatsapp.includes("/subscribed_apps`"), "Bağlanan WABA uygulama webhook'una abone edilmeli.");

  const messagesApi = source("src/app/api/whatsapp/messages/route.ts");
  assert(messagesApi.includes("requireWhatsappModule"), "Mesaj API'si kurum özelliğini sunucu tarafında doğrulamalı.");
  assert(!messagesApi.includes('"sms:read"'), "WhatsApp okuma izni SMS iznine geri düşmemeli.");
  assert(!messagesApi.includes('"sms:write"'), "WhatsApp yazma izni SMS iznine geri düşmemeli.");
  assert(messagesApi.includes("whatsappBranchScope"), "WhatsApp görüşmeleri ortak şube kapsamı kullanmalı.");
  assert(
    messagesApi.includes("isHeadquarters") && messagesApi.includes("isBranchManager"),
    "Eşleşmemiş WhatsApp mesajları yalnız merkez şube yöneticisine görünmeli.",
  );

  assert(superadminInstitutionApi.includes("accessTokenEncrypted: null"), "Özellik kapatılırken WhatsApp erişim anahtarı temizlenmeli.");
  assert(superadminInstitutionApi.includes('defaultNotificationChannel: "SMS"'), "Özellik kapatılırken bildirim kanalı SMS'e dönmeli.");

  const webhook = source("src/app/api/webhooks/whatsapp/route.ts");
  assert(webhook.includes("getMetaWhatsappConfig().appSecret"), "Webhook ortak platform uygulamasının sunucu sırrıyla doğrulanmalı.");
  assert(webhook.indexOf('request.headers.get("x-hub-signature-256")') < webhook.indexOf("JSON.parse(raw)"), "Webhook verisi ayrıştırılmadan önce HMAC imzası doğrulanmalı.");
  assert(webhook.includes("institutionId: provider.institutionId"), "Webhook güncellemeleri kuruma bağlı olmalı.");

  const whatsappSender = source("src/lib/whatsapp.ts");
  assert(whatsappSender.includes("META_PLATFORM_NOT_READY"), "Gönderim platform Meta yapılandırması hazır olmadan çalışmamalı.");

  const dispatch = source("src/lib/notification-dispatch.ts");
  assert(dispatch.includes("whatsappSmsFallback"), "Merkezi dispatch SMS fallback tercihini uygulamalı.");
  assert(dispatch.includes("whatsappAppointmentEnabled"), "Randevu WhatsApp tercihi merkezi dispatch içinde uygulanmalı.");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const institutions: string[] = [];
  try {
    const [first, second] = await Promise.all([
      prisma.institution.create({ data: { name: `WA Isolation A ${suffix}`, email: `wa-a-${suffix}@example.invalid` } }),
      prisma.institution.create({ data: { name: `WA Isolation B ${suffix}`, email: `wa-b-${suffix}@example.invalid` } }),
    ]);
    institutions.push(first.id, second.id);
    const phoneNumberId = `wa-phone-${suffix}`;
    await prisma.whatsappProviderConfig.create({
      data: {
        institutionId: first.id,
        code: "META_EMBEDDED",
        name: "Test A",
        providerType: "META_CLOUD",
        phoneNumberId,
        connectionStatus: "CONNECTED",
      },
    });
    let uniqueRejected = false;
    try {
      await prisma.whatsappProviderConfig.create({
        data: {
          institutionId: second.id,
          code: "META_EMBEDDED",
          name: "Test B",
          providerType: "META_CLOUD",
          phoneNumberId,
          connectionStatus: "CONNECTED",
        },
      });
    } catch (error) {
      uniqueRejected = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    }
    assert(uniqueRejected, "Aynı Meta phoneNumberId iki kuruma bağlanamamalı.");
  } finally {
    if (institutions.length) await prisma.institution.deleteMany({ where: { id: { in: institutions } } });
  }

  console.log("WhatsApp SaaS regresyon kontrolleri başarılı.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
