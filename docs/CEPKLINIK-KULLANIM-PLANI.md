# CepKlinik — kullanım ve sadeleştirme planı

Amaç: mevcut klinik işlerini doğru, anlaşılır ve az adımla tamamlamak.
Yeni modül eklemek yerine mevcut akışların güvenilirliğini ve kullanımını iyileştirmek.

## İncelemenin kapsamı

Yerel kaynaklar incelendi: panel yerleşimi, menü ve üst bar, günlük görünüm,
tanıtım ve demo formu; hasta, randevu, muhasebe ve ayar ekranlarının yapısı;
Prisma kurum/şube modeli ve mevcut regresyon testleri.
Bu kaynak incelemesi bütün modüllerin uçtan uca doğrulandığı anlamına gelmez.
Uzmanlık kataloğunun belirtilen dosyası bu çalışma kopyasında bulunamadı.

## Bu değişiklikte uygulananlar

- Ürün adı CepKlinik; ortak marka sabitleri, paket adı, logo, tanıtım görseli,
  demo veri üreticileri ve yeni yedek dosyası adları güncellendi.
- Mobil ve açık masaüstü menüsünde bölüm başlıkları görünür.
- Personel ve laboratuvar adları menü/üst barda eşitlendi.
- Tanıtımın ilk ekranı ürünün ne işe yaradığını doğrudan anlatıyor.
  Menüde teknik “Modüller” ve kısaltılmış “SSS” yerine açık etiketler kullanılıyor.
- Demo formunda ek bilgiler kapalı, isteğe bağlı bölümde.
  Bağlantı hatasında form bilgileri korunuyor ve düğme yeniden kullanılabiliyor.
- Günlük randevu kartı seçilen güne göre adlandırılıyor; bağlantı aynı tarihi
  takvime taşıyor. Gerçek hesaplamaya bağlanmamış, sürekli sıfırlanan
  “Bugün Ciro” kartı kaldırıldı; finans mevcut muhasebe ekranından izleniyor.
- Yükleme ve hata sırasında randevu kartlarında yanıltıcı sıfır gösterilmiyor.
  Önceki günün kayıtları yeni gün yüklenirken gösterilmiyor; başarısız
  yükleme boş takvim olarak sunulmuyor.
- Aynı işleri tekrar özetleyen “Açık Uyarılar” kartı kaldırıldı.
  Ayrıntılı dikkat gerekenler listesi korundu.
- Günlük ekrandaki sürekli parıltı, yanıp sönme ve ikon hareketi kaldırıldı.
- Hasta dosyasındaki ikinci bakiye rozeti ve aynı notun profil kartındaki
  tekrarı kaldırıldı. Sağlık uyarıları korundu. Sigorta alanı açık adlandırıldı;
  finans bağlantısı yalnızca ilgili sekmeye yetkisi olanlara gösteriliyor.

Eski tarayıcı depolama anahtarları ve güvenlik önbelleği kimlikleri uyumluluk
için korunuyor. Mevcut kurum isimleri ve veritabanı kayıtları topluca değiştirilmedi.
Tanıtımdaki cepklinik.app gösterimi alan adı kaydı veya yayın işlemi değildir.

## Ekranlar için kararlar ve kabul ölçütleri

| Alan | Kullanıcının ilk işi | Sadeleştirme ilkesi | Doğrulama |
| --- | --- | --- | --- |
| Günlük görünüm | Günün programını ve bekleyen işleri görmek | Önce randevular; ardından eylem gerektiren işler; sohbet ve duyurular ikinci planda | Seçili tarih ve bağlantı aynı; hata boş sonuç gibi görünmez |
| Randevular | Uygun saati bulup randevu açmak | Hasta, doktor, tarih ve saat ilk adımda; ek seçenekler gerektiğinde | Çakışma, çalışma saatleri, bekleme listesi, düzenleme ve iptal |
| Hastalar | Hastayı bulup dosyasını açmak | Tek arama ve açık ana eylem; ayrıntılı filtreler isteğe bağlı | Yetkiye göre telefon gizleme; filtre, sayfalama ve boş sonuç |
| Hasta dosyası | Tedaviye veya ödemeye devam etmek | Kimlik ve klinik riskler görünür; geçmiş ve belgeler ilgili bölümde | Aynı kaydın tutarlı gösterimi; kaydetme hatasında form korunması |
| Muhasebe | Tahsilat veya taksit işlemini tamamlamak | Bakiyeyi tek kaynaktan göster; aynı işlem için tek ana giriş | Kısmi ödeme, çift tıklama, iptal, ledger ve taksit uyumu |
| Görev ve takip | Sıradaki işi tamamlamak | Hasta, sorumlu, vade ve durum; bağlamına doğrudan bağlantı | Yetkili görünüm, tamamlanma, gecikme ve yeniden açma |
| İletişim | İzinli kişiye doğru mesajı göndermek | Alıcı, kanal, şablon ve gönderim durumu açık | Hasta onayı, kurum hakkı, başarısız gönderim ve çift gönderim |
| Stok ve satın alma | Malzeme hareketini kaydetmek | Hareket türü, miktar ve bağlantılı kayıt açık | İade/iptal, yarış durumu, transaction ve idempotency |
| Ayarlar | İlgili ayarı bulup değiştirmek | Günlük işlerden ayrı; klinik, ekip, finans ve iletişim bağlamları açık | Yetki, kaydedilmemiş değişiklik ve başarısız kaydetme |
| Tanıtım ve giriş | Ürünü anlamak, demo açmak veya giriş yapmak | Bir ana eylem; gerekli bilgiler önce, ayrıntılar sonra | Mobil menü, klavye, hatalı giriş ve ağ kesintisi |

## Sonraki inceleme sırası

1. Hasta → randevu → muayene → tedavi → tahsilat zincirini gerçek tarayıcıda
   yönetici, doktor ve banko rolleriyle doğrula.
2. Her ekranın yükleme, boş sonuç, bağlantı hatası, kaydetme başarısızlığı
   ve yeniden deneme durumunu ayrı kontrol et.
3. Tekrarlanan başlık, sayaç, filtre ve eylemleri aynı işin bağlamında birleştir.
   Klinik risk uyarılarını, finansal geçmişi ve denetim kayıtlarını gizleme.
4. 375, 768, 1024 ve 1440 pikselde taşma, okunabilirlik, dokunma hedefleri,
   klavye sırası, modal odağı ve ekran okuyucu etiketlerini doğrula.
5. Hasta dosyası ve muhasebe gibi büyük ekranları ancak bu akışlar doğrulandıktan
   sonra mevcut ortak bileşenlerle küçük parçalara ayır.

## Tamamlanma şartı

Bir akış; yetkili kullanıcı doğru sonucu aldığında, başarısızlık anlaşılır ve
geri alınabilir olduğunda, kurum/şube sınırları korunduğunda ve ilgili
regresyon kontrolleri geçtiğinde tamamlanmış sayılır. Görsel düzenleme
işlev doğrulamasının yerine geçmez.

## 9 Ekim 2026 demo ortamı doğrulaması

Ortam: https://klinik-demo-web.onrender.com — yönetici oturumu.
Yerel değişiklikler bu ortama yayımlanmadı; bu sonuçlar yayındaki sürüme aittir.

- Giriş, anasayfa, randevu, hasta, muhasebe, görev, hasta takip, stok,
  satın alma ve ayar ekranları açıldı. Veriler yüklendikten sonraki tekrar
  taramasında görünür hata, başarısız API yanıtı veya JavaScript hatası yoktu.
  İlk kısa taramada görülen tek JavaScript hatası tekrar üretilemedi.
- 1440 piksel ekranlarda ve 375 piksel mobil anasayfada yatay taşma görülmedi.
  Mobil menü açıldı. Bu kontrol ayrıntılı erişilebilirlik denetimi değildir.
- Selin Acar kaydı oluşturuldu; aynı kimlikle ikinci hasta 409 ile engellendi.
- Dr. Mert Aydın için 9 Ekim 2026, 13:30–14:00 kontrol randevusu oluşturuldu.
  Aynı saat için tekrar istek 409 ile engellendi.
- 26 numaralı dişe 3.500 TL kompozit dolgu ve 1.250 TL nakit ödeme kaydedildi.
  Aynı idempotency anahtarıyla ödeme tekrarı aynı kaydı döndürdü; ikinci
  tahsilat oluşmadı. Hasta dosyasında tedavi, ödeme ve 2.250 TL bakiye doğrulandı.
- Kayıtlar kullanıcının isteğiyle bırakıldı; mevcut kayıtlar silinmedi.
  Randevu SMS, hatırlatma ve anket seçenekleri kapalıydı.

Yerel demo formu regresyonu gerçek Chrome'da, gerçek bileşen ve simüle API
yanıtlarıyla doğrulandı: isteğe bağlı alanlar, ağ kesintisi, 503 yanıtı, form
verisinin korunması ve başarılı yeniden deneme. Test için veritabanı gerekmez:
`npm run test:demo-form`.

Yerel kalite kapıları: `npm run typecheck`, değişen TS/TSX dosyalarında ESLint
ve `git diff --check` geçti. Ağ klasöründeki kurulum çok yavaş olduğundan
tip ve lint kontrolleri aynı kaynakların geçici yerel kopyasında, Prisma Client
üretildikten sonra çalıştırıldı. Ağ klasöründeki tamamlanmamış `npm ci`
süreci durduruldu. Ortam Node 24 kullanıyor; proje Node 20.x istiyor.
Sonraki derin incelemede üretim derlemesi ve form/istemci regresyonları da geçti.
Diğer rollerin bütün yazma senaryoları doğrulanmadı. Güncel sayfa, sekme, form
kapsamı ve açık bulgular [detaylı inceleme kaydında](CEPKLINIK-DETAYLI-INCELEME.md).
