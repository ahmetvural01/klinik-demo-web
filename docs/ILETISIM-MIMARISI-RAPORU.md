# SMS + WhatsApp Yeniden Mimarisi — Analiz Raporu

Durum: Onay bekleniyor. Bu raporda anlatılan hiçbir Prisma alanı/migration
veya kod değişikliği henüz uygulanmadı.

Bu rapor iki isteği tek çatı altında birleştirir: (1) hasta oluşturulduğunda
otomatik başlayan, token tabanlı SMS izin akışı, (2) SMS/WhatsApp'ı tek
merkezi servisten geçiren, çok kiracılı (multi-tenant) bildirim mimarisi.
`docs/SMS-IZIN-MIMARISI.md` dosyasında zaten onay bekleyen bir SMS izin
taslağı var; bu rapor o taslağı temel alır, üstüne token/link akışını ve
WhatsApp tarafını ekler. İki dosya çakışmasın diye SMS izin veri modelinin
tek referansı bundan sonra bu rapor olacak.

## 0. Mevcut Durumun Tespiti (kod okunarak doğrulandı)

- **SMS gönderimi merkezi değil.** `sendSms()` (`src/lib/sms.ts`) doğrudan 12
  farklı yerden çağrılıyor: `appointments/route.ts`, `sms/route.ts`,
  `sms/bulk/route.ts`, `sms-jobs.ts`, `appointment-reminders.ts`,
  `birthday-reminders.ts`, `patient-payment-reminders.ts`,
  `billing-reminders.ts`, `public/booking/send-code/route.ts`. Sadece
  randevu "bilgilendirme" SMS'i `notify.ts` içindeki `sendNotification()`
  sarmalayıcısından geçip SMS/WhatsApp arasında yönlendiriliyor — geri kalan
  11 nokta WhatsApp'ı hiç görmüyor ve hiçbir izin kontrolünden geçmiyor.
- **Hasta SMS izni bugün yok.** `Patient` modelinde yalnızca
  `preferredContactChannel`, `whatsappOptInAt/OutAt`,
  `communicationConsentSource` var — bunlar WhatsApp'a özel. SMS için ayrı
  bir onay/ret durumu, token, veya audit izi bulunmuyor. `Setting.smsEnabled`
  ve `smsDefaultInfo/Reminder/Survey` klinik geneli anahtarlar; hasta bazlı
  değil.
- **WhatsApp altyapısı zaten çok kiracılı tasarlanmış — ama tek yönlü.**
  `WhatsappProviderConfig.institutionId` alanı var, `sendWhatsapp()` önce
  kurumun kendi sağlayıcısını, sonra platform genelini (`institutionId:
  null`) dener. `Institution.whatsappEnabled` süperadmin kapısı olarak zaten
  kullanılıyor (`notify.ts` yorumu bunu doğruluyor: "Yalnızca süperadmin
  tarafından açılabilir"). **Eksik olan:** klinik tarafında kendi Meta
  Business/telefon/API bilgisini girebileceği bir arayüz yok — bugün
  `WhatsappProviderConfig` sadece `superadmin/whatsapp-provider` API'siyle,
  yani süperadmin tarafından elle giriliyor (`src/app/superadmin/sms/_tabs/
  WhatsappProviderTab.tsx`). Klinik paneli (`(panel)/sms`) yalnızca
  Templates, BulkSend ve WhatsappMessages (gelen kutusu) sekmelerine sahip;
  kendi sağlayıcısını tanımlayacağı bir sekme yok.
- **SMS sağlayıcısı platform geneli.** `SmsProviderConfig`'te
  `institutionId` yok — tüm klinikler aynı SMS sağlayıcı havuzunu kullanıp
  kendi `smsBalance` kredisinden düşüyor. Bu, isteneni etkilemiyor (SMS
  sağlayıcı klinik başına değil) ama WhatsApp'ın neden farklı ve klinik
  başına olması gerektiğini teyit ediyor: WhatsApp kredi tüketmiyor, kendi
  Meta hesabından gidiyor.

## 1. SMS İzin Mimarisi

### 1.1 Otomatik başlatma

Hasta kaydı oluşturulduğunda (`POST /api/patients`), kayıt işlemiyle aynı
transaction'da değil ama hemen ardından (best-effort, hasta kaydını
SMS gönderiminin başarısına bağımlı kılmadan):

1. `PatientSmsConsentToken` üretilir (tek kullanımlık, süreli).
2. `dispatchPatientSms()` merkezi servisi `SERVICE_CONSENT_REQUEST` şablonu
   ile SMS kuyruğuna alır — bu SMS, izin kontrolünden **muaftır** (henüz
   izin durumu `PENDING` olduğu için, izin isteme SMS'inin kendisi izne tabi
   olamaz; bu tek istisna merkezi serviste açıkça kodlanır ve başka hiçbir
   şablon bu muafiyeti kullanamaz).
3. Telefon numarası formatı geçersizse veya SMS gönderimi başarısız olursa
   hasta kaydı yine de oluşur; durum `PENDING` kalır ve personel "Tekrar
   Gönder" ile deneyebilir.

### 1.2 Token akışı

- Token, veritabanında düz metin **saklanmaz** — yalnızca SHA-256 hash'i
  saklanır (mevcut `field-crypto.ts` desenine paralel, ama bu tek yönlü
  bir hash olmalı, şifreleme değil, çünkü doğrulama tarafında çözmeye
  gerek yok, sadece eşleştirme gerekiyor).
- URL: `/sms-onay/[token]` — **login gerektirmez**, `(panel)` layout'un
  dışında, `middleware.ts`'te public route listesine eklenir (mevcut
  `/public/booking` benzeri).
- Süre: varsayılan 7 gün (`expiresAt`), klinik ayarlarından
  değiştirilebilir değil — bu sabit bir güvenlik parametresi olarak kalır.
- Tek kullanımlık: `usedAt` dolduğunda token bir daha kabul edilmez; sayfa
  "Bu bağlantı daha önce kullanılmış" mesajı gösterir.
- Süresi dolmuş token'a gelen istek: "Bu bağlantının süresi doldu, kliniğe
  tekrar SMS göndermesini isteyebilirsiniz" mesajı; personel "Tekrar
  Gönder"i kullanır.
- Token'ın hangi hasta/kurumla eşleştiği doğrulandıktan sonra sayfa yalnızca
  hastanın adının ilk harfi + kurum adını gösterir (tam kişisel veri
  URL'den sızmasın diye ekranda asgari bilgi).

### 1.3 Onay ekranı

Sade, tek sayfa, iki büyük buton: **ONAYLIYORUM** / **ONAYLAMIYORUM**.
Üstünde istenen açıklama metni birebir kullanılır. Seçim yapıldığı anda
(ek onay adımı olmadan) sunucuya POST edilir, token `usedAt` ile işaretlenir
ve `PatientSmsPreference.serviceStatus` + `PatientSmsPreferenceEvent`
kaydı oluşur. Kullanıcıya "Tercihiniz kaydedildi" ekranı gösterilir.

### 1.4 Veri modeli (SMS-IZIN-MIMARISI.md'yi genişletir)

Mevcut taslaktaki `PatientSmsPreference`, `PatientSmsPreferenceEvent`,
`SmsDispatch`, `SmsSpecialDayRule` aynen korunur (bkz. o dosya). Bu rapor
şunu ekler:

**`PatientSmsConsentToken`** (yeni)

| Alan | Amaç |
| --- | --- |
| `id` | Kayıt kimliği |
| `institutionId`, `patientId` | Kapsam |
| `tokenHash` | SHA-256, `@unique` |
| `purpose` | `INITIAL`, `RESEND` |
| `expiresAt` | Süre sonu |
| `usedAt` | Kullanım zamanı (null = kullanılmadı) |
| `usedFromIp`, `usedUserAgent` | Kötüye kullanım tespiti için asgari iz |
| `resultStatus` | `ENABLED` / `DISABLED` — token kullanıldığında yazılır |
| `createdById` | Manuel "tekrar gönder" ise personel; otomatikse null |
| `createdAt` | — |

`PatientSmsPreference` tablosuna eklenecek alanlar (kullanıcının hasta
kartında istediği görünürlük için):

- `firstConsentAt` — ilk ONAYLIYORUM zamanı
- `lastRejectionAt` — son ONAYLAMIYORUM zamanı
- `lastRequestSentAt` — son izin isteği SMS'inin gönderim zamanı
- `consentTokenId` — hangi token'dan onaylandığı (`PatientSmsConsentToken`
  ilişkisi)

`serviceStatus` değerleri bu akışla `PENDING`, `ENABLED`, `DISABLED`,
`EXPIRED` olacak şekilde genişler (taslaktaki `UNKNOWN/ENABLED/DISABLED`
yerine — "Süresi Doldu" durumunun hasta kartında ayrı gösterilmesi
istendiği için `EXPIRED` eklenir; bu durum token süresi dolduğunda ve
hasta hiç yanıt vermediğinde otomatik hesaplanır, ayrı bir alan yazılmaz,
`expiresAt < now() && usedAt == null` koşulundan türetilir).

### 1.5 Hasta kartı

İletişim bölümüne yeni kart:

- **SMS İzin Durumu**: Onay Bekliyor / Onaylandı / Reddedildi / Süresi Doldu
  (renkli badge, mevcut `Badge.tsx` bileşeni kullanılır)
- İlk onay tarihi, son ret tarihi, son izin SMS'i gönderim tarihi
- "Hangi bağlantıdan onaylandığı" → token `purpose` (İlk SMS / Tekrar
  Gönderim) + `usedAt` tarihi
- Token durumu: Aktif / Kullanıldı / Süresi Doldu
- **"SMS Onayını Tekrar Gönder"** butonu (bkz. 1.6)

Tüm bu alanlar salt okunur — personel doğrudan durumu değiştiremez, sadece
tekrar gönderim tetikleyebilir. Bu, "personelin manuel işlem yapmasına
gerek kalmasın" isteğiyle ve mevcut `[[Design Principles]]` prensibiyle
(geçersiz aksiyona izin verme) uyumlu.

### 1.6 Tekrar Onay

- Personel "Tekrar Gönder"e basar → yeni `PatientSmsConsentToken`
  (`purpose: RESEND`) üretilir, eski token'lar **silinmez**, sadece artık
  geçersizdir (kullanılmamışsa süresi dolana kadar teknik olarak geçerli
  kalabilir ama pratikte yeni token tercih edilir — eski token kullanılırsa
  da sorun olmaz, sadece hangi token'ın kullanıldığı kayda geçer).
- Hasta yeni bağlantıdan onay verirse `PatientSmsPreference` güncellenir,
  `PatientSmsPreferenceEvent` geçmişine yeni satır eklenir (eskiler
  silinmez — ekleme temelli, taslaktaki ilkeyle birebir aynı).

## 2. Merkezi Mesaj Servisi

Bugünkü `notify.ts`, tek bir çağrı noktasında (randevu bilgilendirme)
SMS/WhatsApp yönlendirmesi yapıyor ama izin kontrolü yok. Bunun yerine tek
giriş noktası:

```ts
dispatchPatientMessage({
  institutionId,
  patientId,
  eventType: "APPOINTMENT_REMINDER" | "APPOINTMENT_CREATED" | ... ,
  purpose: "SERVICE" | "GREETING",
  idempotencyKey,
  variables,
  actorId,
})
```

Bu servis sırayla:

1. Hasta/kurum eşleşmesini ve arşiv durumunu doğrular.
2. `eventType` → kanal tercihini çözer: önce klinik bazlı
   `NotificationChannelPreference` (bkz. §4), sonra `Institution
   .whatsappEnabled` açık mı diye bakar; kapalıysa SMS'e düşer.
3. Seçilen kanal SMS ise: `PatientSmsPreference.serviceStatus` (veya
   `GREETING` için `greetingStatus`) kontrol edilir; `ENABLED` değilse
   gönderim **SUPPRESSED** olarak loglanır, sağlayıcıya hiç gidilmez.
4. Seçilen kanal WhatsApp ise: mevcut `whatsappOptInAt/OutAt` kontrolü
   aynen kalır (WhatsApp izni SMS izninden bağımsız, kullanıcının
   isteğiyle birebir örtüşüyor: "WhatsApp alanları SMS tercihinden
   bağımsız kalır").
5. Şablon çözülür (`sms-templates.ts` / `WhatsappTemplate`), idempotency
   anahtarı kontrol edilir, gönderim yapılır, `SmsDispatch` veya
   `WhatsappMessage` tablosuna yazılır.

`sms.ts` / `whatsapp.ts` içindeki düşük seviye `sendSms`/`sendWhatsapp`
fonksiyonları **kalır** (sağlayıcı adaptör katmanı olarak) ama artık
doğrudan çağrılmazlar — yalnızca `dispatchPatientMessage()` içinden
çağrılırlar. Mevcut 11 çağrı noktası bu servise taşınır (aşama 3, §7).

Toplu SMS (`sms/bulk/route.ts`) ve manuel tekil SMS (`sms/route.ts`) da
aynı kapıdan geçer — farkı, `eventType` yerine doğrudan `templateCode` ve
`purpose: SERVICE` ile çağrılmalarıdır; izin kontrolü aynen uygulanır,
yani izni olmayan hastaya toplu SMS gönderiminde de o hasta otomatik
atlanır ve arayüzde "İzni olmadığı için gönderilmedi" olarak raporlanır.

## 3. WhatsApp Mimarisi

### Öneri: mevcut çok kiracılı model korunsun, self-servis eklensin

`WhatsappProviderConfig.institutionId` + `sendWhatsapp()`'in kurum-önce
sağlayıcı seçimi zaten doğru mimari — teknik olarak değiştirilmesi
gerekmiyor. Eksik olan tek şey **klinik kendi ayarını kendi girebilsin**
isteği. Bunun için:

- **SuperAdmin tarafı** (mevcut, değişmiyor): `Institution.whatsappEnabled`
  aç/kapat yetkisi. Bu, `[[Design Principles]]` ile uyumlu şekilde tek
  yetkiyi kapsar — SuperAdmin API/telefon detaylarına karışmaz.
- **Klinik tarafı** (yeni): `(panel)/sms` altına, yalnızca
  `institution.whatsappEnabled === true` ise görünen yeni bir "WhatsApp"
  sekmesi. Burada klinik kendi `WhatsappProviderConfig` kaydını
  (`institutionId` kendi kurumu, `providerType: META_CLOUD`) oluşturur:
  Meta Business hesabı token'ı, `phoneNumberId`, `businessAccountId`,
  gönderici görünen adı. Yeni bir API rotası gerekir:
  `src/app/api/whatsapp/provider/route.ts` (klinik kendi kaydını
  GET/PUT/POST edebilir, `institutionId` middleware'den session'dan
  alınır — süperadmin API'sinden farklı olarak yalnızca kendi kurumunu
  görebilir/düzenleyebilir).
- **Kolaylık** ("kurumlar çaba sarf etmeden kullanabilmeli"): Meta Cloud
  API kurulumu normalde teknik bilgi ister (Business Manager, WABA,
  telefon doğrulama, template onayı). Bunu azaltmanın iki yolu var:
  1. Adım adım sihirbaz (wizard) — Meta'nın "Embedded Signup" akışını
     kullanmak (Meta bunu tam olarak bu senaryo için sunuyor: klinik kendi
     Facebook hesabıyla giriş yapar, Meta tarafında WABA otomatik
     oluşturulur, token bize webhook ile geri döner). Bu en az sürtünmeli
     yoldur ama Meta App Review + Tech Provider başvurusu gerektirir
     (bizim tarafımızda tek seferlik kurulum).
  2. Embedded Signup kurulana kadar ara çözüm: mevcut manuel form (token,
     phoneNumberId gibi alanları klinik Meta Business panelinden kopyalar)
     + net Türkçe yönlendirme metni ve "Bağlantıyı Test Et" butonu (zaten
     `superadmin/whatsapp-provider/test-send` var, aynısı klinik tarafına
     da eklenir).
  Bu rapor **öneri** olarak Embedded Signup'ı işaretler ama ilk aşamada
  manuel form + test-send ile başlanmasını, Embedded Signup'ın ayrı bir
  sonraki aşama olmasını önerir (Meta başvuru süreci haftalar sürebilir,
  bu da "hemen kullanılabilir" hedefiyle çelişir).

### Neden platform genel sağlayıcı (`institutionId: null`) tamamen kaldırılmıyor

Mevcut kodda `institutionId: null` olan bir "genel" WhatsApp sağlayıcısı da
denenebiliyor (fallback). Bu, kullanıcının "her klinik kendi hesabını
bağlasın" isteğiyle tam örtüşmüyor — mesajın klinik numarasından değil,
paylaşılan bir numaradan gitme riski var. Öneri: bu fallback'i **kaldır**,
`whatsappEnabled` açık ama klinik kendi sağlayıcısını tanımlamamışsa
WhatsApp denenmesin, direkt SMS'e düşülsün (zaten `notify.ts`'in
davranışı budur — sadece `sendWhatsapp` içindeki genel fallback sorgusu
gereksiz ve mimariyle çelişiyor).

## 4. İletişim Kanalı Seçimi

Basit başla, esnek bırak:

**`Setting.defaultNotificationChannel`**: `"SMS" | "WHATSAPP"` — yalnızca
`whatsappEnabled` kurumlarda seçilebilir bir radio grubu olarak SMS
Ayarları'na eklenir.

İleride tür bazlı override için (kullanıcının "ileride farklı kanal"
isteği), boş bırakılan alan otomatik `defaultNotificationChannel`'a düşecek
şekilde **`NotificationChannelRule`** tablosu (opsiyonel, ilk sürümde
oluşturulup boş bırakılabilir):

| Alan | Amaç |
| --- | --- |
| `institutionId` | Kapsam |
| `eventType` | `APPOINTMENT_CREATED`, `APPOINTMENT_REMINDER`, vb. |
| `channel` | `SMS` \| `WHATSAPP` \| `null` (= varsayılanı kullan) |

`dispatchPatientMessage()` kanal çözümlemesi: önce bu tabloya, yoksa
`Setting.defaultNotificationChannel`'a, o da yoksa `SMS`'e düşer. Bu
tasarım ilk sürümde UI'da hiç gösterilmese bile veri modelinde hazır
durur, ileride tek bir ayarlar sayfası eklemek yeterli olur.

## 5. API Değişiklikleri (özet)

| Rota | Değişiklik |
| --- | --- |
| `POST /api/patients` | Kayıt sonrası `dispatchPatientMessage` ile izin isteği SMS'i tetiklenir (best-effort, hata kaydı loglanır ama isteği başarısız etmez) |
| `GET/POST /api/public/sms-consent/[token]` | Yeni, public — token doğrular, ONAY/RET işler |
| `POST /api/patients/[id]/sms-consent/resend` | Yeni — personelin "Tekrar Gönder" aksiyonu |
| `GET/PUT /api/whatsapp/provider` | Yeni — klinik kendi WhatsApp sağlayıcısını yönetir |
| `POST /api/whatsapp/provider/test-send` | Yeni — klinik tarafı test gönderimi |
| `src/app/api/sms/route.ts`, `sms/bulk/route.ts`, `appointments/route.ts`, `sms-jobs.ts`, `appointment-reminders.ts`, `birthday-reminders.ts`, `patient-payment-reminders.ts`, `billing-reminders.ts` | `sendSms`/`sendNotification` çağrıları `dispatchPatientMessage`'a taşınır |
| `middleware.ts` | `/sms-onay/*` public route listesine eklenir |

## 6. SMS Ayarları Ekranındaki Değişiklikler

- Mevcut Templates / BulkSend / WhatsappMessages sekmeleri korunur.
- Yeni **"İzin Yönetimi"** sekmesi: kurum genelinde kaç hastanın
  Onaylandı/Reddedildi/Bekliyor/Süresi Doldu olduğunun özeti, toplu
  "süresi dolanlara tekrar gönder" aksiyonu (opsiyonel, ilk sürümde
  atlanabilir).
- `whatsappEnabled` kurumlarda yeni **"WhatsApp"** sekmesi (bkz. §3).
- Yeni **"Bildirim Kanalı"** ayarı (bkz. §4) — yalnızca WhatsApp aktifse
  görünür.

## 7. Uygulama Sırası

1. `docs/SMS-IZIN-MIMARISI.md` + bu rapordaki birleşik Prisma şeması onayı
   ve migration (backfill dahil — mevcut hastalar `PENDING` başlar, `SMS
   izni isteniyor` SMS'i **geriye dönük toplu gönderilmez**, yalnızca yeni
   kayıtlarda ve manuel "Tekrar Gönder"de tetiklenir; mevcut hasta
   tabanına toplu ilk-izin SMS'i göndermek ayrı bir klinik kararı ve ayrı
   bir onay gerektirir).
2. `dispatchPatientMessage` merkezi servisi + adaptör sınırı.
3. Hasta oluşturma akışına otomatik izin isteği SMS'i.
4. Public onay sayfası + token doğrulama.
5. Hasta kartı: SMS İzin Durumu kartı + Tekrar Gönder.
6. Mevcut 11 doğrudan `sendSms` çağrısının merkezi servise taşınması.
7. Klinik tarafı WhatsApp sağlayıcı ayarları + test gönderimi.
8. Bildirim kanalı seçimi ayarı.
9. Genel WhatsApp fallback'inin kaldırılması.
10. Eski alanların (`smsDefaultInfo/Reminder/Survey`) kullanım dışı
    bırakılması.

Bu rapor onaylanmadan Prisma şeması veya migration uygulanmayacaktır.
Hukuki sınıflandırma (SMS izin metninin KVKK/ticari elektronik ileti
mevzuatına uygunluğu) için klinik hukuk danışmanı görüşü ayrıca alınmalıdır
— bu, mevcut taslakta da belirtilen bir ön koşuldur.

## 8. Onay Gerektiren Açık Kararlar

- İlk izin isteği SMS'inin şablonu sabit mi olacak, yoksa klinik
  düzenleyebilecek mi? (Öneri: yasal metin sabit kalsın, yalnızca klinik
  adı değişken olsun.)
- Süresi dolan token'lar için otomatik hatırlatma yapılsın mı, yoksa
  yalnızca personel manuel mi tetiklesin? (Öneri: yalnızca manuel — otomatik
  tekrar hatırlatma SMS'i, izin istenen kişiye istenmeyen ek SMS yükü
  bindirebilir.)
- Mevcut hastalara (migration öncesi kayıtlı) toplu ilk izin SMS'i
  gönderilsin mi, yoksa yalnızca ileri kayıtlarda mı başlasın?
- WhatsApp Embedded Signup için Meta Tech Provider başvurusu şimdi mi
  başlatılsın, yoksa ilk sürüm manuel form ile mi gitsin?
