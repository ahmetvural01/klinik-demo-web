# WhatsApp Cloud API ve Embedded Signup

Bu entegrasyon Meta'nın resmi WhatsApp Business Platform Cloud API altyapısını kullanır. Klinik personeli token, WABA ID, phone number ID, webhook adresi veya uygulama sırrı girmez. Her kurum kendi Meta penceresinden işletmesini ve numarasını seçer; teknik kimlik bilgileri sunucuda alınır ve şifreli saklanır.

## Meta paneli hazırlığı

1. Meta for Developers üzerinde kurumsal uygulamayı oluşturun ve WhatsApp ürününü ekleyin.
2. Uygulamayı doğrulanmış platform işletmesine bağlayın. Solution/Tech Provider gereksinimlerini ve işletme doğrulamasını tamamlayın.
3. Facebook Login for Business altında bir Embedded Signup yapılandırması oluşturun. Yapılandırma kimliğini `META_EMBEDDED_SIGNUP_CONFIG_ID` olarak kaydedin.
4. App Review bölümünde en az `business_management`, `whatsapp_business_management` ve `whatsapp_business_messaging` izinleri için gereken gelişmiş erişimleri tamamlayın.
5. Uygulama alan adını, gizlilik politikası adresini ve üretim HTTPS alan adını Meta uygulama ayarlarına ekleyin. Embedded Signup yalnız güvenilir üretim alan adından başlatılmalıdır.
6. WhatsApp > Configuration/Webhooks ekranında callback adresini `https://UYGULAMA-ALANI/api/webhooks/whatsapp` olarak girin. Verify token alanına sunucudaki `META_WEBHOOK_VERIFY_TOKEN` değerini girin.
7. WhatsApp Business Account webhook nesnesinde `messages` alanına abone olun. Embedded Signup tamamlandığında seçilen WABA için `subscribed_apps` çağrısı ayrıca sunucu tarafından otomatik yapılır.
8. Hastalara 24 saatlik müşteri hizmeti penceresi dışında gidecek randevu, ödeme ve bilgilendirme metinleri için Meta Message Templates bölümünde şablonları oluşturup onaylatın.
9. Uygulamayı canlı moda almadan önce Meta'nın test işletmesi/numarasıyla Embedded Signup, test gönderimi ve webhook durumlarını doğrulayın.

Resmi başvuru kaynakları:

- Meta Embedded Signup: https://www.postman.com/meta/whatsapp-business-platform/collection/du6gzjv/embedded-signup
- Meta WhatsApp Cloud API: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api
- Meta webhook payload referansı: https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference

## Sunucu ortam değişkenleri

```dotenv
APP_URL="https://klinik.example.com"
FIELD_ENCRYPTION_KEY="32-byte-base64-key"
META_APP_ID="..."
META_APP_SECRET="..."
META_EMBEDDED_SIGNUP_CONFIG_ID="..."
META_WEBHOOK_VERIFY_TOKEN="uzun-rastgele-deger"
META_GRAPH_API_VERSION="v25.0"
```

`META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` ve `FIELD_ENCRYPTION_KEY` yalnız sunucu secret store içinde bulunmalıdır. `NEXT_PUBLIC_` öneki kullanılmaz. `META_GRAPH_API_VERSION` yeni sürüme geçişte kod değişikliği gerektirmeden kontrollü yükseltme sağlar.

`FIELD_ENCRYPTION_KEY` üretmek için:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Bağlantı akışı

1. Yetkili klinik kullanıcısı Ayarlar > WhatsApp ekranında `WhatsApp'ı Bağla` komutunu verir.
2. Sunucu kullanıcıya bağlı, on dakika geçerli ve tek kullanımlık bir signup state üretir.
3. Meta Embedded Signup penceresi açılır; kullanıcı işletmesini, WABA hesabını ve telefonunu seçer.
4. Tarayıcı yalnız tek kullanımlık authorization code ile seçilen WABA/telefon kimliklerini sunucuya iletir.
5. Sunucu kodu token'a çevirir; `debug_token` ile app ID ve izinleri doğrular; numaranın WABA içinde olduğunu kontrol eder ve WABA'yı webhook uygulamasına abone eder.
6. Token AES-256-GCM ile şifrelenir. Şifreleme anahtarı yoksa bağlantı düz metin saklanmaz, işlem reddedilir.
7. `phoneNumberId` veritabanında benzersizdir; aynı numara iki kuruma bağlanamaz.

## Durumlar ve hata yönetimi

- `NOT_CONNECTED`: Bağlantı hiç tamamlanmamış veya signup iptal edilmiş.
- `CONNECTING`: Meta penceresi açık ve kısa ömürlü signup oturumu aktif.
- `CONNECTED`: Token, WABA ve numara doğrulanmış; gönderim aktif.
- `ERROR`: Yetki, token, numara veya Meta API hatası nedeniyle yeniden bağlantı gerekli.
- `DISCONNECTED`: Kullanıcı bağlantıyı bilinçli olarak kesmiş.

Token yetkilendirme hatasında sağlayıcı otomatik pasifleştirilir. Bağlantı kesildiğinde token alanı temizlenir, yeni WhatsApp gönderimleri durur ve kurumun varsayılan kanalı SMS'e alınır. Mesaj geçmişi denetim amacıyla korunur.

## Gönderim ve webhook

Tüm otomatik bildirimler `dispatchPatientMessage()` üzerinden gider. Kurum şu politikalardan birini seçebilir:

- Yalnız SMS
- Yalnız WhatsApp
- Önce WhatsApp, başarısızsa SMS

Randevu, ödeme ve genel bilgilendirme grupları ayrı açılıp kapatılabilir. WhatsApp izni olmayan hastada WhatsApp denenmez. SMS fallback yalnız kurum politikası izin veriyorsa ve hastanın SMS izni/bakiyesi uygunsa çalışır.

Webhook gövdesi işlenmeden önce `X-Hub-Signature-256` HMAC imzası doğrulanır. Her webhook `entry/change` kaydı kendi `phone_number_id` ve WABA değeriyle kuruma bağlanır. `sent`, `delivered`, `read` ve `failed` durumları mesaj kaydına; desteklenen durumlar merkezi dispatch kaydına yazılır. Gelen mesajlar şifrelenir ve yalnız aynı kurum içindeki tekil telefon eşleşmesi varsa hastaya bağlanır.

## Dağıtım kontrolü

```bash
npx prisma migrate deploy
npx prisma generate
npm run test:whatsapp-saas
npm run typecheck
npm run lint
npm run build
```
