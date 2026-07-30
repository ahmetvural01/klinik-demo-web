# SMS Mimarisi Uygulama Onerisi

Durum: Veri modeli ve migration icin kullanici onayi bekleniyor.

Bu sistem kampanya, indirim, reklam, promosyon veya satis SMS'i
gondermeyecektir. Mimari yalnizca iki amaci destekler:

1. Klinik hizmetinin yurutulmesi icin gerekli hizmet SMS'leri
2. Hastanin acik tercihiyle gonderilen onemli gun tebrik SMS'leri

Bu ayrim hem arayuzde hem veri modelinde korunur. Tebrik tercihini kapatmak
randevu ve zorunlu hizmet mesajlarini otomatik olarak kapatmaz.

## Onerilen Prisma Modelleri

### `PatientSmsPreference`

Hastanin guncel tercih anlik gorunumudur.

| Alan | Tip / varsayilan | Amac |
| --- | --- | --- |
| `id` | `String @id` | Kayit kimligi |
| `institutionId` | `String` | Klinik izolasyonu |
| `patientId` | `String @unique` | Hasta ile bire bir baglanti |
| `serviceStatus` | `SmsPreferenceStatus` | Hizmet SMS durumu |
| `greetingStatus` | `SmsPreferenceStatus @default(UNKNOWN)` | Tebrik SMS tercihi |
| `optionalSmsStoppedAt` | `DateTime?` | Istege bagli SMS'lerin topluca durduruldugu zaman |
| `lastChangedById` | `String?` | Son degisikligi yapan personel |
| `lastChangeSource` | `SmsPreferenceSource` | Degisiklik kaynagi |
| `createdAt`, `updatedAt` | `DateTime` | Kayit zamanlari |

`SmsPreferenceStatus`: `UNKNOWN`, `ENABLED`, `DISABLED`

`SmsPreferenceSource`: `PATIENT_CARD`, `PUBLIC_LINK`, `IMPORT`,
`SYSTEM_MIGRATION`

`@@unique([institutionId, patientId])` ve kurum bazli indeks zorunludur.

### `PatientSmsPreferenceEvent`

Tercih gecmisini silmeden tutan ekleme temelli audit tablosudur.

| Alan | Amac |
| --- | --- |
| `institutionId`, `patientId` | Klinik ve hasta izolasyonu |
| `purpose` | `SERVICE`, `GREETING`, `OPTIONAL_ALL` |
| `oldStatus`, `newStatus` | Onceki ve sonraki durum |
| `source` | Degisiklik kaynagi |
| `actorId` | Islemi yapan personel; halka acik tercih icin bos olabilir |
| `requestId`, `ipHash` | Izlenebilirlik ve tekrar korumasi |
| `createdAt` | Degisiklik zamani |

Eski olaylar guncellenmez veya silinmez.

### `SmsDispatch`

Tum manuel ve otomatik gonderimlerin tek gecmis kaydidir.

| Alan | Amac |
| --- | --- |
| `institutionId`, `patientId` | Tenant ve alici |
| `templateCode`, `purpose` | Kullanilan sablon ve gonderim amaci |
| `phoneMasked`, `messageHash` | Hassas veriyi acik tutmadan izlenebilirlik |
| `idempotencyKey` | Ayni olayin ikinci kez gonderilmesini engeller |
| `status` | `QUEUED`, `SENT`, `DELIVERED`, `FAILED`, `SUPPRESSED` |
| `providerCode`, `providerMessageId` | Saglayici mutabakati |
| `attemptCount`, `lastError` | Tekrar deneme ve hata |
| `scheduledFor`, `sentAt`, `deliveredAt` | Zamanlar |
| `createdById`, `createdAt`, `updatedAt` | Kaynak ve audit |

`@@unique([institutionId, idempotencyKey])` cift gonderimi veritabani
seviyesinde de engeller.

### `SmsSpecialDayRule`

Klinik bazli otomatik tebrik kurallaridir.

| Alan | Amac |
| --- | --- |
| `institutionId` | Klinik |
| `templateCode` | Tebrik sablonu |
| `isActive` | Klinik bu gunu kullaniyor mu |
| `sendTime` | Klinigin yerel saatinde gonderim zamani |
| `targetingMode` | `ALL_OPTED_IN`, `BIRTHDAY`, `MANUAL_ONLY` |
| `customMonth`, `customDay` | Ozel gun tanimi |
| `updatedById`, zamanlar | Audit |

Anneler ve Babalar Gunu varsayilan olarak `MANUAL_ONLY` olur. Cinsiyet veya
yastan ebeveynlik cikarimi yapilmaz.

## Mevcut Modellerde Degisiklikler

### `Patient`

- `preferredContactChannel` migration'in ilk asamasinda silinmez. Eski API
  ve import akislari bozulmasin diye gecici uyumluluk alani olarak kalir;
  arayuzde gosterilmez.
- WhatsApp alanlari SMS tercihinden bagimsiz kalir ve hasta kayit formunda
  gosterilmez.
- `smsPreference` ve `smsPreferenceEvents` iliskileri eklenir.

### `SmsTemplate`

Mevcut tablo genisletilir:

- `purpose`: `SERVICE` veya `GREETING`
- `sendTime`: opsiyonel yerel saat
- `version`: artan surum
- `updatedById`: son duzenleyen
- `allowedPlaceholders`: izinli yer tutucularin JSON listesi

Kodlar yalnizca onaylanan ailelerden gelir:

- `SERVICE_APPOINTMENT_CREATED`
- `SERVICE_APPOINTMENT_REMINDER`
- `SERVICE_APPOINTMENT_CHANGED`
- `SERVICE_APPOINTMENT_CANCELLED`
- `SERVICE_REQUIRED_INFORMATION`
- `GREETING_BIRTHDAY`
- `GREETING_RAMADAN_FEAST`
- `GREETING_SACRIFICE_FEAST`
- `GREETING_MAY_19`
- `GREETING_MOTHERS_DAY`
- `GREETING_FATHERS_DAY`
- `GREETING_CUSTOM`

Tedavi adi ve saglik ayrintisi gibi hassas yer tutucular sablonlarda
desteklenmez.

### `Setting`

Eski `birthdaySmsEnabled` dogrudan gonderim anahtari olmaktan cikar ve ilgili
`SmsSpecialDayRule` kaydina donusturulur. Eski `smsDefaultInfo`,
`smsDefaultReminder` ve `smsDefaultSurvey` alanlari gecis boyunca okunur,
merkezi servis devreye alindiktan sonra kaldirilir.

## Merkezi Gonderim Kontrolu

Uygulamanin hicbir noktasi dogrudan `sendSms` cagiramaz. Tek giris:

```ts
dispatchPatientSms({
  institutionId,
  patientId,
  templateCode,
  purpose: "SERVICE" | "GREETING",
  idempotencyKey,
  variables,
  scheduledFor,
  actorId,
})
```

Servis sirayla sunlari denetler:

1. Hasta var mi, arsivli mi ve ayni klinige mi ait?
2. Telefon ulke koduna gore gecerli mi?
3. Sablon aktif mi ve amac ile sablon kodu uyumlu mu?
4. Sablon yasakli ticari ifade veya hassas saglik alani iceriyor mu?
5. Tebrik SMS'i icin acik hasta tercihi var mi?
6. Hizmet SMS'i hasta tarafindan engellenmis mi?
7. Gonderim saati uygun mu?
8. Ayni `idempotencyKey` daha once kullanilmis mi?
9. Klinik SMS bakiyesi ve saglayici hazir mi?

Reddedilen gonderim kredi dusmeden `SUPPRESSED` olarak Turkce gerekceyle
kaydedilir. Saglayiciya yalnizca bu kapidan ulasilir.

## Zamanlanmis Gorevler

- Randevu hatirlatma taramasi mevcut scheduler icinde kalir ancak merkezi
  servisi cagirir.
- Dogum gunu ve ozel gun taramasi tek `greeting scheduler` altinda calisir.
- Gorevler klinik saat dilimine gore calisir.
- Her hedef icin deterministik idempotency anahtari uretilir:
  `clinic:patient:template:date`.
- Gecici saglayici hatalari sinirli ve artan beklemeli tekrar denenir.
  Gecersiz telefon veya ret gibi kalici hatalar tekrar edilmez.
- Teslimat callback'i `SmsDispatch` durumunu gunceller.

## Mevcut Kayitlarin Donusumu

1. Her hasta icin `PatientSmsPreference` kaydi olusturulur.
2. `greetingStatus` tum mevcut hastalarda `UNKNOWN` baslar; otomatik tebrik
   gonderilmez.
3. `serviceStatus`, mevcut hizmet SMS davranisini bozmamak icin `ENABLED`
   baslatilir; telefon gecersizse gonderim yine merkezi kontrolde bastirilir.
4. Mevcut `birthdaySmsEnabled=true` kliniklerde dogum gunu kurali olusturulur
   fakat hasta tebrik tercihi olmadigi icin gonderim yapmaz.
5. Mevcut SMS audit kayitlari silinmez. Yeni gonderimler `SmsDispatch`
   tablosuna yazilir.
6. Randevu, dogum gunu, odeme hatirlatma, toplu SMS ve manuel SMS noktalarinin
   her biri merkezi servise tasinmadan eski dogrudan gonderim kapatilmaz.
7. Pazarlama/toplu kampanya arayuzu yeni mimaride yer almaz. Yalnizca hizmet
   olayi veya izinli tebrik sablonu secilebilir.

## Uygulama Sirasi

1. Prisma migration ve guvenli backfill
2. Merkezi gonderim servisi ve adapter siniri
3. Mevcut tum gonderim noktalarinin merkezi servise tasinmasi
4. Hasta kartinda sade tercih alani ve ekleme temelli audit gecmisi
5. Ozel gun kurallari ve gonderim onizlemesi
6. Teslimat callback'i, hata tekrar denemesi ve operasyon raporu
7. Eski alanlarin kullanim disi birakilmasi

Bu plan onaylanmadan Prisma semasi veya migration uygulanmayacaktir. Canliya
almadan once hizmet ve tebrik SMS'lerinin hukuki siniflandirmasi klinigin
hukuk danismani tarafindan ayrica dogrulanmalidir.
