# CepKlinik — sayfa, sekme ve form inceleme kaydı

Tarih: 9 Ekim 2026. Yerel kaynak doğruluk kaynağıdır. Yayındaki demo yerel değişikliklerin önceki sürümünü çalıştırıyor; yayın yapılmadı.

## Kapsam ve kanıt türleri

167 UI kaynağının envanterinde 53 sayfa, 8 native form, 74 Modal kullanımı ve 573 native kontrol bulundu. Özel form bileşenleri ayrıca incelendi. Bu sayılar ayrı iş akışı veya başarılı kayıt sayısı değildir.

Tarayıcıda ekran açılması, form açılması ve kayıt işleminin tamamlanması ayrı kanıtlardır. Bütün kayıt/silme senaryolarının doğrulandığı iddia edilmiyor. Klinik panelinde bir randevu ziyaretinde React #418 hydration hatası görüldü; sonraki süperadmin taramalarında tekrarlanmadı. Bu bulgu kapatılmış sayılmıyor.

## Hesap ve giriş ayrımı

Aynı kimlik bilgileri iki farklı kullanıcı kaydını açıyor: `/api/auth/login` kurum içindeki YONETICI hesabını; `/api/auth/superadmin/login` ayrı SUPERADMIN hesabını doğruluyor. Klinik oturumuyla süperadmin API erişimi 403, süperadmin oturumuyla 200 döndü. Hesapların rolleri veya izinleri değiştirilmedi. Girişler karşılıklı bağlantılarla ve ayrı rol adlarıyla açıklaştırıldı.

Kullanıcının “sadece süperadmini açmalı” düzeltmesi uygulandı: yerel giriş API'sinde SUPERADMIN kimliği varsa aynı kimlikli klinik kaydına geçilmez; mevcut süperadmin doğrulama handler'ı çağrılır. Şifre, pasif hesap ve kilit kontrolü başarısızsa klinik hesaba dönüş yapılmaz. 2FA gerekiyorsa platform doğrulama endpointi kullanılır; doğrulamadan önce oturum oluşturulmaz. Başarılı giriş doğrudan `/superadmin/panel` açar. Veritabanındaki klinik kayıtları silinmedi. Bu düzeltme henüz canlıya yayımlanmadı.

`test:auth-login-routing` gerçek giriş handler'larıyla süperadmin önceliği, yanlış şifre, pasif hesap, 2FA, kilit ve normal kurum girişini doğrular. `test:forms-browser` klinik ekranından gelen SUPERADMIN yanıtında doğrudan ve 2FA sonrası platforma yönlendirmeyi doğrular.

## Uygulanan düzeltmeler

- FormField hata/ipucu ilişkisi ve SearchSelect erişilebilir adı; yerel form ve filtrelerde eksik alan adları.
- Ağ hatasında kilitlenen giriş, tedarikçi, randevu ve hasta işlemleri; başarısızlıkta veri korunması ve yeniden deneme.
- Hasta toplu işlemlerinde kısmi başarı: yalnız başarılı kayıtlar temizlenir; başarısızlar seçili ve düzenlenebilir kalır.
- Taksit planında tutar, peşinat, tarih ve API ile tutarlı 1–100 taksit sınırı; tekrarlanan gönderim koruması.
- Hakediş yükleme hatası boş sonuç yerine açık hata ve yeniden deneme olarak gösterilir.
- Rapor tarihleri Türkiye saatine göre; geçersiz/ters aralık reddi, bitiş dakikasının tamamının dahil edilmesi.
- İletişim sekmesine URL ile erişim mevcut izin ve kurum hakkını korur.
- Masaüstü menüsü başlangıçta okunur; daraltma açık eylemdir. Süperadmin bölüm başlıkları görünür.
- CepKlinik marka adı, daha sade günlük görünüm ve ortak ekran adları.

## Sayfa envanteri

Aşağıdaki sayılar sayfanın kendi JSX kaynağındadır; import edilen form/sekme bileşenlerinin kontrolleri bu satıra eklenmez. Sıfır kontrol, sayfada hiç form olmadığı anlamına gelmez.

| Kaynak | Modal kullanımı | Native kontrol | Doğrudan yazma çağrısı |
| --- | ---: | ---: | ---: |
| `src/app/(panel)/anasayfa/page.tsx` | 0 | 3 | 5 |
| `src/app/(panel)/ayar/page.tsx` | 0 | 20 | 9 |
| `src/app/(panel)/dashboard/page.tsx` | 0 | 0 | 0 |
| `src/app/(panel)/destek/page.tsx` | 0 | 4 | 1 |
| `src/app/(panel)/finans/page.tsx` | 0 | 1 | 0 |
| `src/app/(panel)/firma-detay/page.tsx` | 3 | 18 | 6 |
| `src/app/(panel)/firma/page.tsx` | 1 | 7 | 0 |
| `src/app/(panel)/fiyat/page.tsx` | 0 | 5 | 5 |
| `src/app/(panel)/gider/page.tsx` | 0 | 0 | 0 |
| `src/app/(panel)/gorevler/page.tsx` | 1 | 7 | 2 |
| `src/app/(panel)/hasta-detay/page.tsx` | 0 | 0 | 0 |
| `src/app/(panel)/hasta-takip/page.tsx` | 2 | 19 | 6 |
| `src/app/(panel)/hasta/page.tsx` | 0 | 3 | 0 |
| `src/app/(panel)/kasa/page.tsx` | 0 | 0 | 0 |
| `src/app/(panel)/lab/page.tsx` | 8 | 25 | 7 |
| `src/app/(panel)/log/page.tsx` | 1 | 5 | 0 |
| `src/app/(panel)/muayene/page.tsx` | 0 | 0 | 0 |
| `src/app/(panel)/muhasebe/page.tsx` | 5 | 58 | 15 |
| `src/app/(panel)/page.tsx` | 0 | 0 | 0 |
| `src/app/(panel)/personel-ekle/page.tsx` | 0 | 9 | 0 |
| `src/app/(panel)/personel/page.tsx` | 0 | 3 | 0 |
| `src/app/(panel)/profil/page.tsx` | 0 | 7 | 7 |
| `src/app/(panel)/randevu/page.tsx` | 5 | 26 | 9 |
| `src/app/(panel)/rapor/page.tsx` | 0 | 2 | 0 |
| `src/app/(panel)/recete/page.tsx` | 0 | 0 | 0 |
| `src/app/(panel)/sistem-izleme/page.tsx` | 0 | 0 | 0 |
| `src/app/(panel)/sms/page.tsx` | 0 | 8 | 1 |
| `src/app/(panel)/stok/page.tsx` | 5 | 20 | 4 |
| `src/app/(panel)/taksit/page.tsx` | 0 | 0 | 0 |
| `src/app/(panel)/tedavi-plani/page.tsx` | 2 | 9 | 4 |
| `src/app/(panel)/yetkisiz/page.tsx` | 0 | 0 | 0 |
| `src/app/giris/page.tsx` | 0 | 0 | 0 |
| `src/app/klinik/giris/page.tsx` | 0 | 0 | 0 |
| `src/app/page.tsx` | 0 | 0 | 0 |
| `src/app/randevu-al/[kurum]/page.tsx` | 0 | 8 | 2 |
| `src/app/sms-onay/[token]/page.tsx` | 0 | 0 | 1 |
| `src/app/superadmin/admins/page.tsx` | 2 | 5 | 2 |
| `src/app/superadmin/ads/page.tsx` | 1 | 12 | 2 |
| `src/app/superadmin/announcements/page.tsx` | 1 | 4 | 2 |
| `src/app/superadmin/audit/page.tsx` | 1 | 3 | 0 |
| `src/app/superadmin/institutions/[id]/import/page.tsx` | 0 | 2 | 2 |
| `src/app/superadmin/institutions/[id]/page.tsx` | 3 | 22 | 7 |
| `src/app/superadmin/institutions/page.tsx` | 2 | 12 | 2 |
| `src/app/superadmin/invoices/page.tsx` | 1 | 6 | 4 |
| `src/app/superadmin/page.tsx` | 0 | 0 | 0 |
| `src/app/superadmin/panel/page.tsx` | 0 | 0 | 0 |
| `src/app/superadmin/reports/page.tsx` | 0 | 0 | 0 |
| `src/app/superadmin/role-permissions/page.tsx` | 0 | 2 | 2 |
| `src/app/superadmin/sistem/page.tsx` | 0 | 0 | 0 |
| `src/app/superadmin/sms/page.tsx` | 0 | 0 | 0 |
| `src/app/superadmin/smtp/page.tsx` | 0 | 9 | 2 |
| `src/app/superadmin/support/page.tsx` | 1 | 1 | 2 |
| `src/app/superadmin/yetki-yok/page.tsx` | 0 | 0 | 0 |

## Canlı tarayıcı inceleme listesi

Aynı sayfanın farklı sekme ve modalı ayrı satırdır. SMS sekmeleri ilk URL taramasından sonra gerçek düğmelere tıklanarak tekrar açıldı. İlk kurum detay taramasındaki yükleme ekranları aşağıda dışlandı; detay ve aktarım sayfası içerik başlığı beklenerek yeniden doğrulandı.

| Tarama | Açılan görünüm |
| --- | --- |
| deep-audit | /anasayfa |
| deep-audit | /randevu |
| deep-audit | /randevu > Online Talepler |
| deep-audit | /hasta |
| deep-audit | /hasta-takip |
| deep-audit | /gorevler |
| deep-audit | /tedavi-plani |
| deep-audit | /recete |
| deep-audit | /lab |
| deep-audit | /lab > Yeni İş |
| deep-audit | /stok |
| deep-audit | /firma |
| deep-audit | /fiyat |
| deep-audit | /finans |
| deep-audit | /personel |
| deep-audit | /personel-ekle |
| deep-audit | /profil |
| deep-audit | /destek |
| deep-audit | /log |
| deep-audit | /sistem-izleme |
| deep-audit | /ayar?tab=genel |
| deep-audit | /ayar?tab=subeler |
| deep-audit | /ayar?tab=calisma |
| deep-audit | /ayar?tab=fiyat |
| deep-audit | /ayar?tab=pos |
| deep-audit | /ayar?tab=tedavi |
| deep-audit | /ayar?tab=uniteler |
| deep-audit | /muhasebe?tab=defter |
| deep-audit | /muhasebe?tab=alacak |
| deep-audit | /muhasebe?tab=hakedis |
| deep-audit | /rapor?tab=genel |
| deep-audit | /rapor?tab=giderler |
| deep-audit | /rapor?tab=islemler |
| deep-audit | /sms?tab=kayitlar |
| deep-audit | /sms?tab=whatsapp |
| deep-audit | /sms?tab=baglanti |
| deep-audit | /sms?tab=ayarlar |
| deep-audit | /sms?tab=sablonlar |
| deep-audit | /sms?tab=kutlama-gunleri |
| deep-audit | /sms?tab=toplu |
| deep-audit | /hasta-detay?id=cmv0pzn1s000d13imk55g6tl3&tab=bilgi |
| deep-audit | /hasta-detay?id=cmv0pzn1s000d13imk55g6tl3&tab=randevular |
| deep-audit | /hasta-detay?id=cmv0pzn1s000d13imk55g6tl3&tab=gorevler |
| deep-audit | /hasta-detay?id=cmv0pzn1s000d13imk55g6tl3&tab=tedavi |
| deep-audit | /hasta-detay?id=cmv0pzn1s000d13imk55g6tl3&tab=odeme |
| deep-audit | /hasta-detay?id=cmv0pzn1s000d13imk55g6tl3&tab=recete |
| deep-audit | /hasta-detay?id=cmv0pzn1s000d13imk55g6tl3&tab=notlar |
| deep-audit | /hasta-detay?id=cmv0pzn1s000d13imk55g6tl3&tab=lab |
| deep-audit | /hasta-detay?id=cmv0pzn1s000d13imk55g6tl3&tab=belgeler |
| forms-audit | /randevu |
| forms-audit | /randevu > + Yeni Randevu |
| forms-audit | /randevu > Zamanı Kapat |
| forms-audit | /randevu > Bekleme |
| forms-audit | /randevu > Online Talepler |
| forms-audit | /hasta |
| forms-audit | /hasta > Yeni Hasta |
| forms-audit | /gorevler |
| forms-audit | /gorevler > Görev Oluştur |
| forms-audit | /hasta-takip |
| forms-audit | /tedavi-plani |
| forms-audit | /recete |
| forms-audit | /lab |
| forms-audit | /lab > Yeni İş |
| forms-audit | /stok |
| forms-audit | /stok > Yeni Stok Kartı |
| forms-audit | /firma |
| forms-audit | /firma > Yeni Firma |
| forms-audit | /firma > Satın Alma Kaydet |
| forms-audit | /destek |
| forms-audit | /muhasebe?tab=alacak > Taksitli Planlar |
| forms-audit | /muhasebe?tab=alacak > Yeni Plan |
| forms-audit | /muhasebe?tab=alacak > Hatırlatmalar |
| forms-audit | /muhasebe?tab=alacak > Hatırlatma Ekle |
| forms-audit | /muhasebe?tab=alacak |
| forms-audit | /sms?tab=kayitlar |
| forms-audit | /sms?tab=ayarlar |
| forms-audit | /sms?tab=sablonlar |
| forms-audit | /sms?tab=kutlama-gunleri |
| forms-audit | /sms?tab=toplu |
| admin-audit | /superadmin/panel |
| admin-audit | /superadmin/institutions |
| admin-audit | /superadmin/institutions > Yeni Klinik |
| admin-audit | /superadmin/admins |
| admin-audit | /superadmin/admins > Yeni Admin |
| admin-audit | /superadmin/role-permissions |
| admin-audit | /superadmin/invoices |
| admin-audit | /superadmin/invoices > Yeni Fatura Oluştur |
| admin-audit | /superadmin/sms |
| admin-audit | /superadmin/sms > Yeni Paket |
| admin-audit | /superadmin/announcements |
| admin-audit | /superadmin/announcements > Yeni Duyuru |
| admin-audit | /superadmin/support |
| admin-audit | /superadmin/ads |
| admin-audit | /superadmin/ads > Yeni Reklam |
| admin-audit | /superadmin/sistem |
| admin-audit | /superadmin/smtp |
| admin-audit | /superadmin/reports |
| admin-audit | /superadmin/audit |
| admin-tabs-audit | /superadmin/sms > Paketler |
| admin-tabs-audit | /superadmin/sms > Paketler > Yeni Paket |
| admin-tabs-audit | /superadmin/sms > Stok |
| admin-tabs-audit | /superadmin/sms > Şablonlar |
| admin-tabs-audit | /superadmin/sms > Şablonlar > Yeni Şablon |
| admin-tabs-audit | /superadmin/sms > Kutlama Günleri |
| admin-tabs-audit | /superadmin/sms > Kutlama Günleri > Yeni Gün |
| admin-tabs-audit | /superadmin/sms > API Bağlantısı |
| admin-tabs-audit | /superadmin/sms > API Bağlantısı > Yeni Sağlayıcı |
| admin-tabs-audit | /superadmin/sms > WhatsApp |
| admin-tabs-audit | /superadmin/sistem > Onam Paketi |
| admin-tabs-audit | /superadmin/sistem > Tema |
| admin-tabs-audit | /superadmin/admins > Hesabı Düzenle |
| admin-detail-audit | /superadmin/institutions/inst-default |
| admin-detail-audit | /superadmin/institutions/inst-default/import |

## İşlem ve regresyon doğrulaması

- Selin Acar: hasta, randevu, 3.500 TL tedavi ve 1.250 TL tahsilat; 2.250 TL bakiye API ve ekranla doğrulandı. Kayıtlar bırakıldı.
- Çift hasta/randevu isteği 409; aynı ödeme idempotency anahtarı ikinci tahsilat oluşturmadı.
- Tedarikçi/satın alma canlı kaydetme denemesi tamamlanmış kanıt üretmedi; başarılı uçtan uca test olarak sayılmıyor.
- `test:client-workflows`: ağ/API hatası, tek gönderim, kısmi toplu başarı ve tarih sınırları.
- `test:forms-browser`: gerçek giriş/2FA, tedarikçi ve taksit bileşenleri; ağ hatası/veri koruma, SMS izin sınırları ve 375/768/1440 menü davranışı.
- `test:demo-form`, `test:working-hours-rules`, TypeScript ve değişen kaynaklarda ESLint geçti.
- Next üretim build geçti. Yerel geçici kopyada gerçek veritabanı olmadan doğrulandı; DB bağlantısı fallback günlükleri vardı. Node 24 kullanıldı; proje Node 20 bildiriyor.
- Veritabanı gerektiren bütün entegrasyon senaryoları çalıştırılmadı. Prisma şeması değişmedi.

## Açık doğrulama sınırları

Her rolün her formdaki yazma işlemi, dosya aktarımı ve tüm finans/stok iptal senaryoları bu taramalarla kanıtlanmış değildir. SMS/WhatsApp gönderimi yapılmadı. Yetki matrisleri, sağlayıcı sırları ve hesap rolleri değiştirilmedi. Görünüm taraması bu işlemlerin yerine geçmez.
