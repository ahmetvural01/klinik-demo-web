# KlinikModern — Kapsamlı Sistem Envanteri

> Bu rapor, kod tabanının doğrudan taranmasıyla derlenmiştir (Next.js 14 App Router, TypeScript, Prisma/PostgreSQL).
> Tüm sayfaları, formları, butonları, iş kurallarını ve modüller arası veri akışını tek bir referans belgesinde toplar.
> Bir HTML/görsel sürümü Artifact olarak da yayınlanmıştır; bu dosya kalıcı, aranabilir referans kopyasıdır.

## İçindekiler

1. [Genel Bakış & Mimari](#1-genel-bakış--mimari)
2. [Kullanıcı Rolleri](#2-kullanıcı-rolleri)
3. [Hasta, Randevu & Tedavi Domaini](#3-hasta-randevu--tedavi-domaini)
4. [Finans & Operasyon Domaini](#4-finans--operasyon-domaini)
5. [İletişim, Personel, Ayarlar & Yönetim](#5-iletişim-personel-ayarlar--yönetim)
6. [Süperadmin Paneli](#6-süperadmin-paneli)
7. [Kimlik Doğrulama & Yetki Sistemi](#7-kimlik-doğrulama--yetki-sistemi)
8. [Ortak UI Bileşenleri](#8-ortak-ui-bileşenleri)
9. [Modüller Arası Bağlantı Haritası](#9-modüller-arası-bağlantı-haritası)

---

## 1. Genel Bakış & Mimari

Sistem iki tamamen ayrı arayüz yüzeyinden oluşur: hasta/klinik işlerini yürüten **Klinik Paneli** ve platformu
işleten **Süperadmin Paneli**. İkisi de aynı Next.js uygulaması içindedir, ama kimlik doğrulama, yetki modeli ve
tasarım dili birbirinden bağımsız yönetilir.

- **Çok kiracılı mimari:** Her kurum-bağımlı tablo bir `institutionId` kolonu taşır; veritabanı seviyesinde
  satır-bazlı izolasyon (RLS) yoktur — izolasyon her API route'unun kendi sorgusuna `institutionId` filtresi
  eklemesine dayanır. Bu filtrenin unutulması, kliniklerin birbirinin verisini görmesine yol açabilecek en kritik
  hata sınıfıdır.
- **Durum etiketleri ↔ ham veri ayrımı:** Randevu durumu gibi bazı alanlarda veritabanındaki ham değer değişmez;
  arayüzde gösterilen etiket ayrı bir katmanda türetilir (bkz. §3). Bu, kullanıcı diline uyum sağlarken
  şema/entegrasyon uyumluluğunu korumak için bilinçli bir tasarım deseni olarak tüm sistemde tekrarlanır.
- **Tek bildirim kapısı:** Hastaya giden HER SMS/WhatsApp mesajı (otomatik veya manuel) tek bir fonksiyondan
  (`dispatchPatientMessage`) geçer — izin kontrolü, kanal seçimi, kredi düşümü ve tekrar-önleme merkezi olarak
  burada uygulanır (bkz. §5).

---

## 2. Kullanıcı Rolleri

Klinik tarafında beş rol, platform tarafında ayrı bir `SUPERADMIN` rolü vardır. Rol bazlı yetkiler süperadmin
panelindeki **Rol Yetkileri** ekranından canlı olarak düzenlenebilir (bkz. §7).

| Rol | Kapsam | Tipik kısıtlamalar |
|---|---|---|
| **YONETICI** | Klinik yöneticisi — finans dahil tüm modüllere tam erişim | — |
| **DOKTOR** | Muayene, tedavi, hasta yönetiminde tam yetki | Finans kısıtlı; hasta telefonu gizli |
| **ASISTAN** | Randevu ve hasta kaydı odaklı | Finans göremez; muayene/tedavi/reçete *yazamaz* (yalnız görüntüler); hasta telefonu gizli |
| **BANKO** | Ön büro — randevu, hasta iletişimi, takip/tahsilat odaklı | Personel/sistem ayarlarına erişemez; Muhasebe'de Hakediş sekmesini göremez |
| **MUHASEBE** | Finans, muhasebe ve raporlar | Hasta klinik verisine erişemez (hasta adına tıklayamaz) |
| **SUPERADMIN** | Platform operatörü — tüm kurumlar genelinde, kurum bağımsız | Kendi hesabına atanan modül listesiyle sınırlı (bkz. §6) |

> **"Doktor olarak göster" istisnası:** Bir `YONETICI` kendi profilinden "doktor olarak göster" işaretlerse
> (`hideAsDoctor=false`), randevu/hakediş/personel listelerinde bir diş hekimi gibi davranılır — mesai saatleri
> ve komisyon oranları alanları da bu durumda açılır.

---

## 3. Hasta, Randevu & Tedavi Domaini

### 3.1 Hasta Listesi — `/hasta`

`src/app/(panel)/hasta/page.tsx`. Kayıtlı hastaların arama, filtreleme ve sıralama yapılabilen ana listesi;
masaüstünde tablo, mobilde kart görünümü.

- **Üst şerit:** "Toplam Hasta" ve "Bu Ay Yeni" özet kutucukları + **"Yeni Hasta"** butonu.
- **Filtreler:** ad/TC/telefon/kurum/referans arama (`/` kısayolu), doktor filtresi, SMS izin durumu filtre çipi
  (`?smsConsent=` ile başka modüllerden gelinebilir).
- **Rozetler:** Bulaşıcı Hastalık, Medikal uyarı, %X indirim.
- **Satır aksiyonları:** "Randevu Oluştur" (hasta önceden seçili şekilde Randevu'ya gider), "Düzenle", "Sil"
  (yalnız SUPERADMIN/YONETICI).

> **Hasta silme = arşivleme.** Fiziksel silme yoktur; klinik/finans/laboratuvar/yasal geçmiş korunur, gelecekteki
> randevular iptal edilir.

### 3.2 Hasta Kayıt / Düzenleme Formu — `PatientFormModal.tsx`

4 bölüm:

| Bölüm | Alanlar |
|---|---|
| Kimlik | Yabancı uyruklu, TC/Pasaport No (yapısal doğrulama — geçmezse uyarı verir ama engellemez), Ad Soyad*, Cinsiyet*, Doğum Tarihi |
| İletişim & Kurum | Telefon* (DOKTOR/ASISTAN'da gizli), Anlaşmalı Kurum, Referans Eden Kişi, Meslek, İndirim Oranı %, Adres |
| Medikal Anamnez | Kan Grubu, 7 sağlık durumu checkbox'ı (Alerji/Kalp/Diyabet/Böbrek/Hepatit/Kan Sorunu/Bulaşıcı Hastalık + detay), Ameliyatlar/İlaçlar/Diğer Hastalıklar |
| Notlar | Hasta Notu (serbest metin) |

> **Mükerrer kayıt uyarısı:** yeni kayıtta TC/telefon/ad ile 350ms debounce'lu arama yapılır, benzer hastalar amber
> uyarı kutusunda listelenir — kayıt engellenmez, sadece uyarılır.

### 3.3 Hasta Detayı — `/hasta-detay`

`hasta-detay-content.tsx` (~5300 satır) — sistemin en kapsamlı ekranı.

Üst şeritte avatar, rozetler (Bulaşıcı Hastalık / Sağlık uyarısı / Kalan X TL), **"İşlem Ekle"** açılır menüsü
(Randevu/Tedavi/Ödeme/Lab/Reçete/Not kısayolları), **"Dışa Aktar"** (10 bölümlü PDF/Excel), **"Düzenle"**,
**"Hasta Listesi"**. Alt mini-istatistik satırı (Randevu/Tedavi/Ödenen/Kalan) ilgili sekmelere kısayoldur.

**Sekmeler:**

- **Özet** — Açık İşler paneli, hızlı Hasta Notu, sağ panelde Hasta Profili + Sağlık Uyarıları + SMS İzin Durumu
  kartı (Onay Bekliyor/Onaylandı/Reddedildi/Süresi Doldu).
- **Randevular** — basit tablo; satır tıklayınca Randevu takviminde ilgili güne odaklanır.
- **Bu Hastanın Görevleri** — bu hastaya özel görev CRUD (Tip: Parça Sipariş/Lab/Arama/Evrak/Diğer, Öncelik, Termin).
- **Tedavi** (en karmaşık sekme):
  - Fiyat kaynağı seçici: **TDB 2026** (resmi tarife) vs **Özel Liste**.
  - Diş şeması (`OdontogramSelector`) — Yetişkin/Çocuk toggle, "Üst Çene/Alt Çene/Tüm Çene" toplu ekleme, dişe
    tıklayınca otomatik listeye ekler.
  - **Muayene Listesi (Tedavi Bekleyen):** inline düzenleme, toplu seçim ile "Seçilenleri Tedaviye Aktar"/"Sil".
  - **Yapılan Tedaviler:** inline düzenlenebilir hücreler, satır kaydet/sil, alt toplamda toplam ücret.
  - ASISTAN rolünde muayene/tedavi/reçete yazma butonları gizlenir — yalnızca görüntüleme.
- **Finans** — bakiye özeti, Ödeme Al, taksit planı sihirbazı (bkz. §4.1).
- **Reçete** — ilaç şablonlarından çoklu ilaç ekleme, reçeteyi yazan doktor seçimi.
- **Notlar** — genişletilmiş not arşivi.
- **Laboratuvar** — bu hastaya ait lab işleri özeti + detay paneli.
- **Belgeler & Onam** — onam formları + belge/röntgen yükleme (JPG/PNG/WEBP/PDF, 15MB).

### 3.4 Randevu Takvimi — `/randevu`

`page.tsx` (~3200 satır). Görünüm modları: **Gün** (Saat × Doktor matrisi, sürükle-bırak ile yeniden zamanlama,
boş hücreye tıklayınca hızlı randevu oluşturma), **Hafta**, **Ay**, **Ajanda** (liste + durum filtre çipleri).

- **Araç çubuğu:** tarih navigasyonu, doktor filtresi, "+ Yeni Randevu", "Zamanı Kapat" (doktor blok modalı),
  "Bekleme" (bekleme listesi), "Online Talepler", "Dışa Aktar" (Yazdır/Excel/Oda Listesi).
- **Yeni Randevu formu:** Hasta*, Hekim*, Tedavi (21 önceden tanımlı, renk kodlu tür), Tedavi Alanı (opsiyonel
  koltuk/oda), Tarih-saat*, Süre, Not, 3 SMS onay kutusu (Bilgilendirme/Hatırlatma/Değerlendirme). Çakışma varsa
  uyarı + önerilen uygun saat çipleri.

**Durum sistemi — ham veri ↔ ekran etiketi:**

| Ham DB değeri | Ekranda gösterilen |
|---|---|
| `BEKLIYOR` | "Planlandı" (kafa karışıklığını önlemek için yeniden etiketlenir) |
| `GELDI` | "Bekliyor" (hasta bekleme salonunda anlamına gelir) |
| `TAMAMLANDI / GELMEDI / IPTAL` | değişmeden gösterilir |

> **Durum geçiş kuralları:** İptal edilmiş randevu doğrudan başka duruma alınamaz — önce "Planlandı"ya dönmeli.
> "Gelmedi" yalnızca randevu saati geçtikten sonra işaretlenebilir. "Bekliyor" (erken gelen hasta) her zaman
> işaretlenebilir.

### 3.5 Hasta Takip / Geri Arama Merkezi — `/hasta-takip`

Randevusuna gelmeyen, aranması gereken veya manuel açılan takiplerin birleşik listesi — hem randevu kaynaklı
(otomatik) hem tamamen manuel ("Manuel Takip Ekle") kayıtları kapsar. Gecikmiş takip uyarı çipi, gelişmiş filtreler
(takip tipi, durum, doktor, 30/60/90 gün), detay modalında hızlı aksiyonlar ("Tekrar Ara", "Ulaşılamadı",
"Dönüş Bekleniyor", "Takibi Kapat").

### 3.6 Tedavi Planları — `/tedavi-plani`

Çok adımlı paket tedavilerin (ör. implant + kuron) plan bazında takibi. Durum: Planlandı/Devam Ediyor/Tamamlandı/İptal.
Her plan kartında adım ilerleme çubuğu; detayda adım bazlı durum (Bekliyor/Yapıldı/İptal).

> **Kilit kuralı:** Plan Tamamlandı/İptal durumundayken adımlar düzenlenemez/silinemez — önce plan yeniden aktif
> duruma alınmalı.

> **Not — `/muayene` kaldırıldı:** Bağımsız muayene sayfası artık yok; bilgilendirme ekranına dönüştürülmüş. Diş
> şeması ve tedavi işlemleri artık Hasta Detayı → Tedavi sekmesinde yönetiliyor.

---

## 4. Finans & Operasyon Domaini

Muhasebe, fiyatlandırma, stok, laboratuvar ve tedarikçi yönetimi — kliniğin parasal ve malzeme hareketlerinin
uçtan uca izlenebildiği modüller. Hepsi `Prisma.Decimal` ile hesap yapar (JS `number` yuvarlama riskine karşı).

### 4.1 Muhasebe Merkezi — `/muhasebe`

`page.tsx` (~2670 satır). 3 sekme: **Muhasebe Defteri**, **Alacaklar**, **Hakediş**. `BANKO` Hakediş'i göremez;
`DOKTOR`/`ASISTAN` sayfaya hiç giremez.

**Birleşik "İşlem Ekle" modalı** — Gelir / Gider sekmeleri (Gider, BANKO'da kapalı); Gider altında Normal Gider /
Firma Ödemesi alt seçimi.

| Form | Alanlar |
|---|---|
| Gelir (Tahsilat) | Tarih*, Hasta*, Doktor*, Tutar*, Yöntem* (Nakit/Kredi Kartı/Havale-EFT/Mail Order/Diğer), POS* (kart/mail order ise zorunlu), Açıklama |
| Gider (Normal) | Tarih*, Gider Türü*, Tutar*, Yöntem, KDV (%0/10/20), Fatura No, Açıklama |
| Gider (Doktor Hakedişi) | Doktor*, Hakediş Dönemi (Ay)* — yalnız kalan bakiyesi >0.5₺ olan dönemler listelenir, Tutar (kalanı aşamaz), Yöntem yalnız Nakit/Havale-EFT |
| Firma Ödemesi | Firma* (bakiyesiyle), Tarih*, Tutar* (en eski borçtan otomatik mahsup), Yöntem, Fatura No, KDV, Açıklama |

> **Idempotency:** her kayıt isteği `Idempotency-Key` header'ı ile gönderilir — çift tıklama/ağ hatası sonrası
> retry mükerrer kayıt oluşturmaz.

**Sekme: Alacaklar** — Tüm Bakiyeler / Taksitli Planlar toggle'ı. Taksitli Planlar'da KPI kartları (Toplam Kalan,
Bekleyen, Gecikmiş Plan, Bugün Vadeli), Alacak Yaşlandırma Tablosu (Bugün Vadeli / 1-30 / 31-60 / 60+ / Gelecek),
alt sekmeler: Plan Listesi, "Yeni Plan", Hatırlatmalar.

- **Yeni Plan:** Hasta*, Doktor*, Başlık, Toplam Borç*, Peşinat, Taksit Sayısı* (1-120), Periyot
  (Haftalık…Yıllık), İlk Taksit Tarihi.
- **Taksit Detayı:** her taksit satırında "Tahsilat Yap" (tutar kalanı aşamaz).

**Sekme: Hakediş** — Doktor seçilmeden: tüm doktorların bu ayki Ciro/Hakedilen/Ödenen/Kalan özeti. Doktor
seçilince: 3 KPI kartı + `HakedisMonthlyPanel` aylık döküm + bir aya tıklayınca doktor+dönem+kalan tutar önceden
dolu ödeme modalı açılır.

### 4.2 Fiyat Listesi — `/fiyat`

Kurum genelinde tek aktif kaynak: **TDB Tarifesi** (resmi) veya **Özel Liste** — toggle, kurum ayarı olarak
kaydedilir ("hasta kartında tedavi ekleyen tüm personel aynı listeyi görür"). TDB tablosu salt okunur; Özel
Fiyatlar tablosunda "Fiyat Ekle", satır içi "Düzenle"/"Sil".

### 4.3 Stok Yönetimi — `/stok`

4 KPI kartı (Toplam Değer, Kritik Stok, SKT Yakın, SKT Geçmiş). "Yeni Stok Kartı" yalnız ürün kartı açar —
fiyat/tedarikçi/miktar `/firma` üzerindeki satın alma akışından girilir. Satır aksiyonları: Stok Çıkışı,
Hareketler (geçmiş + barkod üretimi), Düzenle, Arşivle.

> **FEFO parti (lot) takibi:** çıkışlar `allocateLots` ile en yakın SKT önce, sonra en eski geliş tarihine göre
> partilerden düşülür. Stok çıkışı `Idempotency-Key` ile korunur; kayıt satır kilidi (`SELECT … FOR UPDATE`) ile
> eşzamanlı çift işlemi engeller.

### 4.4 Laboratuvar Takibi — `/lab`

`page.tsx` (~2660 satır). Dış laboratuvarlara gönderilen işlerin (zirkonyum, protez, implant üstü restorasyon…)
çok adımlı süreç takibi. İş türüne göre önceden tanımlı gönderim→istek adım zincirleri (workflow şablonları) vardır.

**Görsel durum türetimi:**

| Durum | Koşul |
|---|---|
| Yeni/Beklemede | hiç gönderim yok |
| Klinikte | son gönderim geri geldi, bekleyen adım yok |
| Laboratuvarda | bekleyen adım var, 4 günden az |
| Gecikiyor | bekleyen adım 4+ gündür laboratuvarda |
| Tamamlandı | hastaya takıldı, bekleyen adım yok |

Modallar: Yeni İş, Gönderim Ekle, Laboratuvardan Geldi (prova/randevu planlama checkbox'ı — Hasta Takip'te
otomatik kayıt açar), Fatura Kalemi, Adımı Düzenle, Tamamlandı İşaretle, **RPT Olarak Yeniden Aç** (tekrar
tedavi — ücretsiz takip edilir, yeni fatura eklenemez).

### 4.5 Firma / Satın Alma — `/firma`, `/firma-detay`

Tedarikçi/Laboratuvar/Yüklenici/Banka/Diğer kategorili firmaların cari hesabı. LAB kategorisindeki firmalarda
"Alım" yerine "Laboratuvar İşi Oluştur" (→ `/lab?new=1&labName=…`) görünür. Satın Alma modalında teslim durumu:
**Teslim Alındı** (stok anında girer) veya **Sipariş Verildi** (yalnız cari borç, stok teslim işaretlenince artar).

### 4.6 Hesaplama Mantığı (arka plan kütüphaneleri)

> **Doktor Hakediş Formülü (`hakedis.ts`):**
> `kkMasraf = KK tahsilatı × kkYuzde%`; `genelMasraf = ciro × genelYuzde%`;
> `brüt = ciro − (kkMasraf + labCost + genelMasraf)`; `hakedilen = brüt × maasYuzde%`.
> Her ay **kendi döneminde geçerli olan oranla** hesaplanır (`DoctorRateHistory`) — geçmişte ödenmiş bir ayın
> hakedişi, oran sonradan değişse bile sessizce değişmez. Ay sınırları Türkiye yerel saatine göredir.

> **Taksit otomatik mahsup (`taksit-integration.ts`):** hasta ödemesi alındığında, o hastanın (varsa yalnız
> ilgili doktora ait) gecikmiş/bekleyen taksitleri en eski vadeden başlayarak otomatik düşülür. Ödeme iptal/VOID
> edilirse mahsup tersine çevrilir.

> **Kısıtlama zinciri (`billing.ts`):** kurumun ödenmemiş faturaları `paymentGraceUntil` alanını belirler; bu
> değer geçmişse ve yazma işlemi ise `requireAuth()` isteği 423 ile reddeder — bu mekanizma muhasebe, stok, lab
> dahil tüm yazma uçlarını kapsar.

---

## 5. İletişim, Personel, Ayarlar & Yönetim

### 5.1 SMS / WhatsApp Merkezi — `/sms`

7 sekme, lazy-mount edilir (yalnız ziyaret edilen sekme DOM'a girer). WhatsApp sekmeleri, süperadmin modülü
açmadıkça hiç render edilmez.

- **Kayıtlar** — gönderim denetimi: Toplam/Başarılı/Başarısız kartları, SMS İzin Durumu Özeti (5 sayaç, her biri
  Hastalar listesine filtreli link), kayıt tablosu.
- **Ayarlar** — SMS sistemi aktif / Ödeme hatırlatma / Doğum günü toggle'ları, Varsayılan Bildirim Kanalı
  (SMS/WhatsApp), Ödeme Hatırlatma Penceresi (1-30 gün), Değerlendirme Bağlantısı.
- **WhatsApp** — iki panelli görüşme arayüzü; 24 saatlik pencere kapalıysa yalnız onaylı şablonla mesaj gönderilebilir.
- **WhatsApp Ayarları** — Twilio bağlantısı: Hesap SID, Auth Token, Numara; klinik kendi bağlantısını kendi kurar.
- **Şablonlar** — Varsayılan Şablon / Kendi Şablonum (override): BILGI, HATIRLATMA, ANKET, ODEME_YAKLASIYOR,
  ODEME_GECIKTI, DOGUM_GUNU.
- **Kutlama Günleri** — süperadmin'in tanımladığı günlerden hangilerinin bu klinikte otomatik gönderileceği —
  varsayılan hepsi kapalı.
- **Toplu Gönderim** — Seçili Hastalar / Tüm Hastalar hedef seçimi, 7 hazır bayram şablonu, kanal otomatik
  (izin+bağlantıya göre).

### 5.2 Personel — `/personel`, `/personel-ekle`

Liste: arama, Unvan/Durum filtresi. Ekle/Düzenle formu: Kimlik No (TC, 11 hane), Ad Soyad, Unvan. **Yeni kayıtta
ilk şifre otomatik TC kimlik numarasıdır** — personel ilk girişte kendi şifresini belirlemeye yönlendirilir.
Doktor/rol için Mesai Başlangıç-Bitiş + Doktor Ödeme Oranları (KK Masraf %, Genel Masraf %, Maaş %).

> **Pasife alma çift onayı:** aktif randevusu/takibi olan personeli pasife almak sunucudan 409 (`requiresForce`)
> döner; ikinci bir açık onay ("Yine de pasife almak istiyor musunuz?") gerekir.

### 5.3 Ayarlar — `/ayar`

- **Genel Ayarlar** — Klinik Bilgileri, Logo, Online Randevu Talep Bağlantısı, Randevu Süresi (5-240dk).
- **Çalışma Saatleri** — genel öğle arası + 7 gün için ayrı açılış/kapanış/öğle arası.
- **Fiyat Listesi** — `/fiyat` sayfası gömülü render edilir.
- **POS Cihazları** — cihaz adı CRUD, Pasif Yap/Aktif Yap.
- **Tedavi Türleri** — isim + renk seçici, randevu formundaki tedavi listesini besler.
- **Tedavi Alanları (Uniteler)** — koltuk/oda tanımı; randevuda aynı alan aynı saatte ikinci kez seçilemez.
- **Paketler** — çok seanslı paket şablonları (Paket Adı, Seans Sayısı, Fiyat, Geçerlilik gün).

### 5.4 Raporlar — `/rapor`

Tarih aralığı seçilebilir KPI paneli. Sekmeler: **Genel Bakış & Gün Sonu** (kapanış özeti, veri tutarlılığı
skoru /100), **Giderler & Vergi** (KDV özeti, 2026 gelir vergisi dilim tahmini), **İşlem Analizi** (en çok yapılan
işlemler, en çok işlem gören dişler).

### 5.5 Görevler — `/gorevler`

Personel içi görev/todo merkezi — Tür (Parça Sipariş/Laboratuvar/Arama/Evrak/Diğer), Öncelik (Düşük/Orta/Yüksek),
çoklu atama, termin. Yönetici/SuperAdmin "Bana Atananlar"/"Tüm Görevler" arasında geçiş yapabilir.

### 5.6 Anasayfa — `/anasayfa`

Role göre kişiselleştirilmiş günlük özet: Randevu Takvimi, Taksit Takvimi (Yönetici/SuperAdmin/Muhasebe/Banko),
rol bazlı "Bugün Dikkat Gerekenler" listesi, Duyurular, Klinik İçi Mesajlar (chat).

### 5.7 Diğer Sayfalar

- **Sistem İzleme** (`/sistem-izleme`) — API gecikme metrikleri, alarm durumları, Klinik Veri Tutarlılığı denetimi
  (Rapor sayfasıyla çapraz bağlantılı).
- **Reçete** (`/recete`) — A5 yazdırılabilir salt-okunur reçete görünümü.
- **Profilim** (`/profil`) — mesai saatleri, şifre değiştirme, "Diğer Tüm Cihazlardan Çıkış Yap", İki Faktörlü
  Doğrulama (QR + yedek kodlar).

### 5.8 Bildirim Motoru — `src/lib/notification-dispatch.ts`

Hasta bildirimlerinin **tek çıkış kapısı** — `dispatchPatientMessage`. Akış:

1. **Idempotency** — aynı olay anahtarı ikinci kez gönderim yapmaz.
2. **Kanal seçimi** — WhatsApp yalnız izin+bağlantı+varsayılan kanal uygunsa denenir.
3. **WhatsApp başarısız → SMS** — sessiz değil, kayıtta şeffaf not düşülür.
4. **İzin kontrolü** — SMS izni yoksa `SUPPRESSED`.
5. **Kredi rezervasyonu** — atomik `decrement`, yarış durumu yok.
6. **Başarısızlıkta iade** — rezerve edilen kredi anında geri yüklenir.

Her deneme `SmsDispatch` tablosuna denetim kaydı olarak yazılır (telefon maskeli, mesaj SHA-256 hash'i).

### 5.9 Arka Plan Zamanlayıcı — `src/lib/scheduler.ts`

Ayrı bir cron servisi yerine uygulama içi zamanlayıcı (Render'da tek sürekli süreç). Dakikada bir randevu
hatırlatma taraması; saatte bir fatura hatırlatma, hasta taksit hatırlatma, doğum günü SMS, kutlama günü SMS
taramaları. Her tarama try/catch ile izole edilir — biri hata verirse diğerleri/zamanlayıcı durmaz.

---

## 6. Süperadmin Paneli

Platform operatörünün tüm klinikleri, faturalandırmayı, SMS/WhatsApp altyapısını ve rol yetki matrisini yönettiği
ayrı yüzey. Erişim, klinik içi rollerden bağımsız bir **modül** sistemiyle kısıtlanır.

> **13 modül:** `dashboard, institutions, roles, invoices, sms, ads, smtp, reports, support, audit, announcements,
> settings, admins`. Her süperadmin hesabına atanan modül listesi JWT'ye gömülür; bir route hiçbir modül kuralına
> kayıtlı değilse **varsayılan olarak reddedilir** (fail-closed).

- **Kontrol Paneli** (`/superadmin/panel`) — salt-okunur dashboard: Toplam Klinik/Bekleyen Fatura/Platform SMS
  Stoku/Toplam Gelir kartları, sistem geneli sayaçlar, "Dikkat Gerektirenler" bandı, Son Sistem Hareketleri, Son
  Kaydolan Klinikler.
- **Klinik Yönetimi** (`/superadmin/institutions`, `[id]`, `[id]/import`) — "Yeni Klinik", "Kliniğe Gir" (ghost
  giriş). Klinik Detayı: Abonelik/Ödeme Durumu kartı, SMS bakiye artır/azalt, Servis Modu seçimi:

  | Servis Modu | Etki |
  |---|---|
  | `NORMAL` | kısıtlama yok |
  | `LIMITED` | randevu/ödeme/hasta/personel *yazma* kapalı, okuma açık |
  | `READ_ONLY` | tüm yazma işlemleri kapalı |
  | `SUSPENDED` | erişim tamamen kapalı |

  Toplu Veri Aktarımı: 3 adım — Excel şablonu indir → yükle (önizleme JSON'u döner) → onayla ve aktar (geri
  alınamaz, açık onay ister).
- **Faturalar ve Ödemeler** (`/superadmin/invoices`) — "Yeni Fatura Oluştur", "Ödendi İşaretle", "Hatırlatma
  Gönder" (E-posta+SMS), "Gecikmiş Faturaları İşaretle" (toplu).
- **SMS Yönetimi** (`/superadmin/sms` — 6 alt sekme) — Paketler, Stok (platform SMS cüzdanı), Şablonlar (kliniğin
  kendi override'ı önceliklidir), Kutlama Günleri, API Bağlantısı (çoklu sağlayıcı), WhatsApp (her sağlayıcı tek
  bir kliniğe bağlı).
- **Kurum Duyuruları & Reklamlar** — duyurular hedef kurum(lar)a bağlıdır; reklamlar Başlık/İçerik/Öncelik/Maks.
  Gösterim/Günlük Limit ile yönetilir.
- **Rol ve Yetki Yönetimi** (`/superadmin/role-permissions`) — klinik rollerinin tüm yetki matrisi; kategori
  sekmeleri, rol×izin checkbox matrisi, risk rozetleri.

  > **Anında etkili:** Kaydet'e basıldığında "bu değişiklik anında platformdaki TÜM kliniklerin her API/sayfa
  > yetki kontrolüne yansır" uyarısıyla onay istenir.

- **Admin Yetkileri** (`/superadmin/admins`) — diğer süperadmin hesaplarının 13 modüle erişimini yönetir.
- **SMTP, Destek, Raporlar, Denetim Günlüğü, Sistem Ayarları:**
  - SMTP Ayarları — tek global yapılandırma; kayıtlı şifre maskeli döner, "Test Gönder" canlı test maili yollar.
  - Destek Talepleri — Açık/Yanıtlandı ayrımı `answer` alanının doluluğuna dayanır.
  - Sistem Raporları — ödenen toplam, aktif klinik, SMS kullanımı, gelir büyümesi + en yoğun kliniklerin sıralaması.
  - Denetim Günlüğü — platform geneli audit log, server-side sayfalama, CSV dışa aktarma.
  - Sistem Ayarları — Onam Metni (tüm kliniklerde ortak) ve Tema (platform geneli tek renk teması).

---

## 7. Kimlik Doğrulama & Yetki Sistemi

Tek bir `/api/auth/login` ucu hem klinik hem süperadmin girişini yönetir; yetki kararı hiçbir zaman tek bir yerde
değil, katmanlı bir zincirde verilir.

**Giriş Akışı:**

1. **Klinik girişi** — kurum adı (case-insensitive) → TC ile kullanıcı ara → brute-force koruması (5 deneme/15dk)
   → bcrypt doğrula → 2FA açıksa 5dk'lık pending token, değilse 7 günlük JWT.
2. **Gizli superadmin erişimi** — klinikte TC bulunamazsa, aynı TC/şifre bir SUPERADMIN ile eşleşiyorsa doğrudan
   o kliniğe tam yetkili token verilir — audit log'a "Superadmin gizli erişim" olarak yazılır.
3. **Süperadmin girişi** — ayrı uç (`/api/auth/superadmin/login`), IP bazlı rate limit (30/dk), JWT'ye
   `superadminModules` gömülür.
4. **2FA doğrulama** — TOTP veya tek kullanımlık yedek kod; aynı TOTP adımının tekrarı (replay) engellenir.

**Çerez Mimarisi — `klinik_token` vs `klinik_ghost_token`:** İki ayrı çerez kullanılır çünkü tek çerez
paylaşıldığında, süperadmin başka bir sekmede "Kliniğe Gir"e bastığında aynı tarayıcıdaki kendi açık
`/superadmin` sekmesi de anında ghost kimliğine dönüp oturumdan düşüyordu. Çözüm route-bazlı önceliktir:
`/superadmin` ve `/api/superadmin/*` her zaman `klinik_token`'ı kullanır; diğer rotalar ghost çerezi varsa onu
önceliklendirir.

**`requireAuth()` — Merkezi API Yetki Kapısı (`src/lib/api.ts`)** — her korumalı API route'unun çağırdığı zincir:

1. JWT çöz (DB'ye gitmeden)
2. Rol önizleme (süperadmin kendi hesabından bir klinik rolünü test edebilir)
3. Aktiflik + tokenVersion (60sn cache'li — pasifleştirilmiş kullanıcının eski token'ı en geç 60sn içinde reddedilir)
4. Ghost muafiyeti (ghost oturumlar normal RBAC ve servis kısıtlarından muaftır)
5. institutionId zorunluluğu (SUPERADMIN olmayan her kullanıcı için)
6. Servis modu kontrolü (SUSPENDED/READ_ONLY/LIMITED/gecikmiş ödeme → 423)
7. RBAC (`can(role, permission)` — nihai izin kontrolü)

> **Middleware rol kararı vermez:** `src/middleware.ts` yalnızca oturum geçerliliğini ve süperadmin modül
> kısıtlamasını kontrol eder. Klinik rolleri için 403 kararı her zaman ilgili API route'unun kendi
> `requireAuth(permission)` çağrısından gelir — DB'deki (Rol Yetkileri ekranından yönetilen) matrisle çelişen
> sabit kodlanmış bir engel listesi bilinçli olarak kaldırılmıştır.

**Ghost / Impersonation Oturumları:** `POST /api/auth/superadmin/impersonate` — süperadmin kendi şifresini tekrar
girmek zorundadır (IP+kullanıcı bazlı rate limit: 5/15dk). Hedef kurumda önce bir YONETICI, yoksa herhangi bir
aktif kullanıcı bulunur; isim sonuna `[SA]` eklenerek ayrı bir ghost token üretilir. Ghost oturumlar kurumun kendi
`/log` ekranından **görünmez** ama süperadmin'in `/superadmin/audit` ekranında görünür.

**tokenVersion ile Oturum İptali:** `User.tokenVersion`, şifre değişimi veya "diğer tüm cihazlardan çıkış yap"
işleminde artırılır. JWT'deki değer DB'deki güncel değerle uyuşmazsa oturum anında geçersiz sayılır — çalınmış
bir token'ın şifre değişse bile 7 gün geçerli kalmasını engeller.

---

## 8. Ortak UI Bileşenleri

`src/components/ui/` — hem klinik hem süperadmin yüzeyinin paylaştığı, tekrar kullanılan temel yapı taşları.

| Bileşen | Amaç |
|---|---|
| **Modal** | Tüm diyalogların tek kaynağı. Focus trap, ESC, önceki odağa dönüş. `isDirty` ile kaydedilmemiş form varken kapatma onay ister. |
| **Button / IconButton** | 4 varyant (primary/secondary/danger/ghost), `loading` durumunda otomatik Spinner, `href` ile Link'e dönüşür. |
| **Badge** | 5 ton (critical/warning/success/info/neutral) — durum renkleri kurum temasından bağımsız sabittir. |
| **FormField / FormSection** | Heterojen input tiplerini tek label+hata+ipucu standardına sarar; `aria-invalid` otomatik bağlanır. |
| **Tooltip** | 3 konumlu hover ipucu — IconButton'larda kullanılır. |
| **SearchSelect** | Klavye navigasyonlu ARIA combobox — hasta/doktor/kurum arama-seç deseni. |
| **ListTable** | Standart veri tablosu; yükleniyor/boş/sayfalama durumlarını dahili yönetir. |
| **ProfessionalDataTable** | `@tanstack/react-table` tabanlı, sıralanabilir, büyük veri setleri için. |
| **ListPager** | "N-M / Toplam kayıt" + Önceki/Sonraki, opsiyonel sayfa boyutu seçici. |
| **EmptyState** | Boş liste illüstrasyonu + başlık + açıklama + aksiyon. |
| **ConfirmProvider** | `confirmDialog()` — tüm "emin misiniz?" onaylarının tek kaynağı, native `confirm()` yerine. |
| **ToastProvider** | `showToastSafe()` — sağ üst bildirim yığını, success/error/info. |
| **Spinner** | 3 nokta fade animasyonlu, tema rengine bağlı yükleniyor göstergesi. |
| **ModuleIcon** | Fluent Emoji "Flat" setiyle modül ikonografisi — klinik ve süperadmin sidebar'ları paylaşır. |
| **IconFrame** | Tek renkli ikonları saran pastel kare çerçeve; `accent` rengi kurum temasından bağımsız sabittir. |
| **PhoneCountrySelect** | Ülke kodu + arama destekli telefon seçici, viewport'a göre otomatik konumlanır. |
| **ListSkeleton** | Kart ve tablo satırları için animasyonlu yükleniyor placeholder'ları. |

---

## 9. Modüller Arası Bağlantı Haritası

| Kaynak | Hedef |
|---|---|
| Hasta Listesi | → Hasta Detayı (satır tıklama) · → Randevu (hasta önceden seçili) |
| Hasta Detayı | → Randevu · Tedavi Planı · Muhasebe (Finans linki) · Reçete · Laboratuvar |
| Randevu | → Hasta Detayı · Online talepler (`/randevu-al/[kurum]` herkese açık form) |
| Hasta Takip | → Görev Merkezi · Randevu · (otomatik) Randevu GELMEDİ durumundan beslenir |
| Fiyat Listesi | → Hasta Detayı tedavi/muayene fiyatları · → Hakediş ciro hesabı |
| Muhasebe (Gelir) | → Taksit otomatik mahsup → Alacaklar bakiyeleri |
| Muhasebe (Doktor Hakedişi gideri) | → Hakediş "Ödenen" hesabı |
| Firma / Satın Alma | → Stok (miktar + parti) · → Firma cari hesabı · LAB kategorisi → Laboratuvar sayfası |
| Laboratuvar | → Firma cari hesabı (hizmet borcu) · → Hakediş `labCost` gider kalemi · → Hasta Takip (prova randevusu) |
| SMS/WhatsApp | → Hasta Listesi (izin durumu filtreli link) · tüm otomatik tetikleyiciler → Bildirim Motoru |
| Süperadmin Fatura/Servis Modu | → `requireAuth()` üzerinden TÜM klinik yazma işlemlerini kısıtlayabilir |
| Süperadmin Rol Yetkileri | → tüm kliniklerin RBAC matrisini anında değiştirir |

---

*Görsel/HTML sürüm: bu raporun Artifact olarak yayınlanmış, gezinme menülü hâli — bağlantı için ilgili sohbete bakınız.*
