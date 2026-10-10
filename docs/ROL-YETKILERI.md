# Rol yetkileri — önerilen varsayılan

Bu belge, klinik rollerinin (Yönetici, Doktor, Asistan, Banko, Muhasebe) varsayılan yetkilerini ve gerekçelerini anlatır. Matrisin kendisi `src/lib/role-permissions.ts` dosyasındaki `DEFAULT_ROLE_PERMISSIONS` sabitindedir. Süperadmin › Rol Yetkileri ekranı aynı listeyi gösterir.

Önceki varsayılan rastgele verilmişti. Örneğin bankoda reçete yazma, asistanda tahsilat iptali, muhasebede takvim ve laboratuvar açıktı. Yeni matris her rolün günlük işinden çıkarıldı. İlke: **kişi işini eksiksiz yapabilmeli, işine ait olmayan bilgiyi görmemeli** (KVKK'nin ölçülülük ilkesi).

## 1. Kısaca ne değişti

- **Kurum özeti ve son işlemler** (`dashboard:stats`) artık yalnız yöneticide. Bu ekran işlem kaydı içeriyor.
- **Tahsilat iptali** ve **taksit planı iptali** yalnız muhasebe ve yöneticide. Banko ve asistan tahsilat alır, iptal edemez.
- **Doktor** tahsilat, taksit ve Muhasebe ekranını görmez. Kendi hakedişini görür. Randevu iptali artık kapalı.
- **Asistan** küçük klinikte bankoya da bakar: randevu, hasta araması ve hasta dosyasından tahsilat. Muhasebe ekranını görmez. Reçete ve tedavi kaydını yalnız okur.
- **Muhasebe** hasta dosyasını, takvimi ve laboratuvarı görmez. Bunlar sağlık bilgisi içerir. Hakediş dökümü açıldı (önceden ekranda vardı ama sunucu reddediyordu). Fiyat değiştirme kapandı.
- **Telefon ve TC** banko, asistan ve muhasebede açık, doktorda kapalı.
- **Ayarlar, personel yönetimi, işlem kayıtları, hasta arşivleme, toplu SMS ve duyuru yayınlama** yalnız yöneticide.

## 2. Rol × günlük iş

"✓" = yapabilir, "—" = yapamaz. Yönetici her şeyi yapar (`*`).

| Günlük iş | Doktor | Asistan | Banko | Muhasebe |
|---|:-:|:-:|:-:|:-:|
| Ana sayfa, ekip mesajları, duyurular, kendi görevleri, destek talebi | ✓ | ✓ | ✓ | ✓ |
| Takvimi görmek, randevu vermek/taşımak, "Hasta geldi" | ✓ | ✓ | ✓ | — |
| Randevu iptali, online talep onayı | — | ✓ | ✓ | — |
| Hasta bulmak ve dosyayı açmak (anamnez dahil) | ✓ | ✓ | ✓ | — |
| Hasta kaydetmek, anamnez/not güncellemek | ✓ | ✓ | ✓ | — |
| Hasta telefonu ve TC'yi görmek | — | ✓ | ✓ | ✓ (alacak/taksit listesinde) |
| Hasta aramaları (geri arama listesi) | ✓ (kayıt açar) | ✓ | ✓ | — |
| Tedavi kaydı girmek ve iptal etmek | ✓ | okur | — | — |
| Tedavi planı | ✓ | okur | — | — |
| Reçete yazmak | ✓ | okur, yazdırır | — | — |
| Laboratuvar işi açmak, göndermek, teslim almak | ✓ | ✓ | ✓ | — |
| Lab işini "hastaya takıldı" kapatmak | ✓ | ✓ | — | — |
| Lab işini iptal etmek | ✓ | — | — | — |
| Röntgen/fotoğraf yüklemek | ✓ (arşivler de) | ✓ | — | — |
| Belge yüklemek, onam imzalatmak | ✓ | ✓ | ✓ | — |
| Hasta dosyasından tahsilat almak | — | ✓ | ✓ | ✓ |
| Muhasebe ekranı (gün kasası, taksitler) | — | — | ✓ (yalnız tahsilat ve taksit) | ✓ |
| Taksit planı kurmak | — | — | ✓ | ✓ |
| Tahsilat iptali/iade, taksit planı iptali | — | — | — | ✓ |
| Gider, tedarikçi ödemesi, satın alma | — | — | — | ✓ |
| Hasta alacakları listesi | — | — | — | ✓ |
| Hakediş | kendisininki | — | — | tüm hekimler |
| Raporlar ve dışa aktarma | — | — | — | ✓ |
| SMS/WhatsApp ile hastaya yazmak | — | — | ✓ | — |
| Fiyat listesini görmek | ✓ | ✓ | ✓ | ✓ |
| Stoktan malzeme düşmek, teslim alınanı girmek | görür | ✓ | ✓ | ✓ |

Yalnız yöneticide kalanlar: ayarlar, personel ekleme/düzenleme, şube erişimi, işlem kayıtları ve hasta erişim kaydı, kurum özeti, hasta arşivleme, belge arşivleme, toplu SMS ve kutlama mesajları, duyuru yayınlama, tüm ekip görevlerini görme, fiyat değiştirme, stok kartını pasife alma.

## 3. Menüler

| Rol | Menü |
|---|---|
| Yönetici (13) | Ana sayfa, Randevular, Hastalar, Yapılacaklar, Laboratuvar, İletişim · Finans: Muhasebe, Raporlar · Stok: Stok, Satın alma · Yönetim: Personel, Ayarlar, İşlem kayıtları |
| Doktor (9) | Ana sayfa, Randevular, Hastalar, Yapılacaklar, Laboratuvar, Hakedişim, Fiyat listesi, Stok, Personel |
| Asistan (8) | Ana sayfa, Randevular, Hastalar, Yapılacaklar, Laboratuvar, Fiyat listesi, Stok, Personel |
| Banko (10) | Ana sayfa, Randevular, Hastalar, Yapılacaklar, Laboratuvar, İletişim · Finans: Muhasebe, Fiyat listesi · Stok · Personel |
| Muhasebe (8) | Ana sayfa, Muhasebe, Raporlar, Fiyat listesi, Yapılacaklar, Stok, Satın alma, Personel |

Menü `src/lib/nav.ts` dosyasından hesaplanır. Bir öğe yalnız o sayfa açılabiliyorsa görünür.

## 4. Gerekçeler

**Telefon ve TC.** Bu izin hem telefonu hem TC'yi açar. Banko ve asistan hastayı arar ve kaydeder. Muhasebe borçluyu arar. Doktorun günlük işinde hasta aramak yok. Hasta kaçırma riski de en çok burada, bu yüzden doktorda kapalı. Sonucu: doktorun reçete çıktısında TC satırı boş basılır.

**Sağlık verisi muhasebeye kapalı.** "Hastalar — Görüntüleme" izni anamnezi ve hasta notlarını da açar. Bu yüzden muhasebede yok. Muhasebe hastayı alacak ve taksit listelerinden görür. Takvim, laboratuvar ve hasta aramaları da klinik bilgi taşıdığı için kapalı.

**Muhasebe ekranı doktora ve asistana kapalı.** Asistan tahsilatı hasta dosyasının Hesap sekmesinden alır ve hastanın borcunu görür. Alınan ödeme açık taksitlere kendiliğinden işlenir. Kasa, gider, alacak listesi ve hakediş asistanda kapalı.

**İptal ve iade ayrı tutuldu.** Parayı alan kişi kaydı silemez. Tahsilat iptali, taksit planı iptali ve tedavi kaydı iptali kayıt sahibinde ya da muhasebe/yöneticide. Tedavi kaydı iptali doktorun kendi kaydıdır.

**Dışa aktarma ve işlem kayıtları.** Muhasebe ve rapor dışa aktarma yalnız muhasebe ve yöneticide. İşlem kayıtları ve hasta erişim kaydı yalnız yöneticide.

**Hekim seçimi için personel listesi herkeste.** Randevu, lab ve görev formlarındaki hekim seçici bu listeyi kullanır. Listede TC, fotoğraf ve hakediş oranı yoktur.

## 5. Kişi bazında daraltma

Matris tüm kliniklerde ortaktır ve her rolün üst sınırıdır. Klinik yöneticisi Personel › Şube erişimi'nden bir kişinin izinlerini daraltabilir, rolün üstüne çıkaramaz.

Örnek: yalnız koltuk başında çalışan bir asistanın tahsilat izni buradan kapatılır.

Telefon/TC maskelemesi kişi bazlı şube daraltmasını da uygular: sunucu (`src/lib/patient-visibility-server.ts`) rol matrisiyle birlikte kişinin şube izinlerine bakar (Dalga 2).

## 6. Mevcut kurulumda uygulama

1. **Matris hiç kaydedilmemişse** yeni varsayılan yayınla birlikte kendiliğinden geçerli olur. Hiç kaydedilmemiş demek: Rol Yetkileri'nden kaydedilmemiş, "Varsayılana döndür" kullanılmamış, betik çalışmamış (veritabanında sürüm 1, "system"). Bu davranış `src/lib/role-permission-store.ts` dosyasında.
2. **Matris daha önce kaydedildiyse** eski matris geçerli kalır. Kod onu sessizce değiştirmez. Uygulamak için Süperadmin › Rol Yetkileri › **Varsayılana döndür**. Bu işlem tüm özelleştirmeleri siler. Bilerek yapılmış bir değişiklik varsa ardından yeniden işaretlenir.
   - Neyin değişeceğini Rol Yetkileri ekranındaki "Önerilen varsayılandan farklar" bölümü rol bazında gösterir (eklenecek / kaldırılacak yetkiler); onay penceresi aynı listeyi tekrarlar. Matris hiç özelleştirilmemişse ekranda "Önerilen varsayılan kullanılıyor" rozeti görünür ve düğme pasiftir.
3. **`npm run backfill:fine-grained-permissions` emekliye ayrıldı.** Betik artık matrise yazmaz, yalnız uyarı verir; `PILOT-DEPLOY-CHECKLIST.md` §3 de onu "çalıştırılmaz" diye anlatıyor. Eski betik şu izinleri geri veriyor ve kurulumu varsayılan güncellemelerinden koparıyordu:
   - doktora randevu iptali,
   - banko ve asistana taksit planı iptali,
   - herkese kurum özeti.
4. **`npm run test:role-permissions` güncel varsayılan matrisi bekler.** Test matrise geçici olarak yazar, sonunda Rol Yetkileri satırını (sürüm ve "kaydeden" dahil) ilk haline geri yükler; kurulum varsayılanı izliyorsa izlemeye devam eder. Yine de yalnız test veritabanında çalıştırılır.
5. **Kişi bazlı daraltmalar korunur.** Daraltma listesi olan kişiye role yeni eklenen izin kendiliğinden açılmaz. Örneğin asistana eklenen tahsilat, daraltılmış bir asistanda kapalı kalır. Daraltması olmayan kişi rolün tamamını alır.
6. **Değişiklik hemen geçerli olur.** Her istek matrisi veritabanından okur. Açık ekranlarda menü bir sonraki yetki yoklamasında güncellenir. Yeniden giriş gerekmez.

Rollere göre ekler ve çıkarmalar (eski varsayılana göre):

| Rol | Eklenen | Kaldırılan |
|---|---|---|
| Doktor | hasta kaydı/anamnez, tedavi planı iptali, lab iptali, röntgen arşivleme, fiyat listesi, destek talebi | kurum özeti, randevu iptali ve online talep onayı, tedavi planı onayı, tahsilat (görme/alma/iptal), taksitler, WhatsApp okuma, stok hareketi ve pasife alma |
| Asistan | telefon/TC, reçete yazdırma, lab "hastaya takıldı", röntgen yükleme, fiyat listesi | kurum özeti, reçete yazma, tahsilat iptali, taksit planı kurma/iptali, WhatsApp, stok pasife alma |
| Banko | online talep onayı, belge ve onam, fiyat listesi | kurum özeti, reçete görme/yazma, tahsilat iptali, taksit planı iptali, toplu SMS, stok pasife alma |
| Muhasebe | hakediş, alacak listesinde telefon, personel listesi, görev açma, mesaj yazma, destek talebi | kurum özeti, fiyat değiştirme, stok pasife alma, laboratuvar, takvim, WhatsApp okuma |

## 7. Ürün sahibinin karar vermesi gerekenler

1. **Doktor ve TC.** E-reçete için TC gerekiyorsa iki yol var:
   - doktora "Telefon ve TC görme" açılır, telefon da açılır;
   - izin telefon ve TC olarak ikiye ayrılır. Bu yeni bir izin demek.
   Öneri: ayırmak.
2. **Asistanın tahsilatı ve telefonu** plan §0.1'e göre açık: küçük klinikte asistan bankoya da bakıyor. Yalnız koltuk başında çalışan asistanlar için kişi bazında kapatılır.
3. **Muhasebe fiyat değiştirsin mi?** Şu an kapalı: fiyat politikası yönetici kararı. Gerekirse Rol Yetkileri'nden açılır. Bu tüm klinikleri etkiler.
4. **Lab faturası.** Lab işi izni olan herkes (doktor, asistan, banko) lab faturası girebiliyor ve bu tedarikçiye borç yazıyor. Finans izni istensin mi?
5. **Hasta dosyasını indirme.** Dosyayı görebilen herkes indirebiliyor. Bölümler kişinin izinlerine göre süzülür ve indirme KVKK erişim kaydına yazılır. Ayrı bir "dışa aktarma" izni istensin mi?
6. **Banko hasta alacak listesini** göremiyor. Bu liste, gider, tedarikçi ve tüm hakedişleri de açan izne bağlı. Ayrı izin gerekir.

## 8. Bilinen uyumsuzluklar (ilgili paketlere iletildi)

Dalga 2'de 1–4, 6 ve 7 giderildi (bkz. §11). Açık kalan:

5. **Doktor kendi zamanını kapatamıyor.** Kodda yalnız yöneticiye sabitlenmiş; Rol Yetkileri'nden verilemiyor (karar bekliyor).

## 9. Şu an etkisi olmayan izinler

Aşağıdaki kutular Rol Yetkileri ekranında görünür ama bugün hiçbir işlemi açıp kapatmaz. Ekrandaki açıklamalarında bu yazıyor.

- **Hiçbir etkisi yok:** `treatment:approve` (plan onayı), `patients:merge` (birleştirme), `reports:write` (özel rapor), `audit:export`, `support:close`.
- **Başka bir izin üzerinden işliyor:**
  - `prescriptions:print`: reçeteyi görebilen yazdırır.
  - `staff:schedule`: çalışma saatlerini personel düzenleme izni değiştirir.
  - `profile:write` ve `profile:password`: herkes kendi profilini ve şifresini değiştirir.

Bu izinler matriste anlamlarına göre dağıtıldı. Özellik geldiğinde ayrıca bir karar gerekmez.

## 10. Doğrulama

Kod düzeyinde bir betik kontrol etti. Veritabanı ve sunucu kullanılmadı. Betik her rolün her günlük işini, gereken izinleri ve izni kullanan sunucu ucuyla eşleştirdi. Sonuç:

- eksik izin yok,
- hiçbir işe bağlanmayan fazla izin yok,
- kapalı olması gereken 28–31 izin her rolde kapalı.

Uçtan uca (tarayıcı + veritabanı) test sonraki adımda yapılacak.

## 11. Dalga 2 rol davranışı değişiklikleri

Matristeki varsayılanlar değişmedi; aşağıdakiler sunucunun bir izni nasıl uyguladığına dair kurallardır.

**Klinik işleri**
- **Doktor tedavi kaydını ve reçeteyi yalnız kendi adına açar.** Başka hekim adına kayıt sunucuda reddedilir (`api/examinations`, `api/prescriptions`). Gizli destek oturumu bu sınırın dışındadır.
- **Online talep bildirimi** `appointments:approve` izni olan aktif kişilere gider. Önceden roller koda sabitti.
- **Personel menüsü** `staff:write`, `staff:delete` ya da `branches:assign` sahibinde görünür. Hekim seçicinin kullandığı personel listesi herkese açık kalır.
- **Hekim kimdir:** Doktor her zaman; yönetici "Doktor olarak gizle" işaretli değilse (profil kaydı olmayan kurum sahibi dahil). İstemci (`lib/staff-roles`) ve sunucu (`lib/hakedis` `effectiveDoctorWhere`) aynı kuralı kullanır.

**Para**
- **İndirim oranı** girmek ve değiştirmek `finance:write` ister.
- **Tahsilatın tutarını, tarihini ya da hekimini düzeltmek** `payments:refund` ister. Tutarı düşürmek kısmi iade demektir.
- **Ödeme ve taksit hatırlatmaları** `installments:read` (görme) ve `installments:write` (kurma/kapatma) ister; randevu izninden ayrıldı.
- **Kurum geneli kasa, gelir-gider defteri, tahsilat ve taksit listeleri** `finance:center` ister. Hasta dosyasındaki tahsilat ve taksitler bu izni istemez.
- **Muhasebe** "Tahsilat al" penceresinde sağlık bilgisi döndürmeyen en az alanlı hasta aramasını kullanır; hasta dosyası iznine gerek yoktur.
- **Hakediş** planlanan (PLANLANDI) ve iptal edilen (IPTAL) tedavileri saymaz; hasta bakiyesi ve Raporlar ile aynı kural. Kural değişmeden önce eski hesapla ödenmiş bir ay "fazla ödendi" ya da eksi kalan göstermez (hakediş ödenenle sınırlanır, ay ayrıntısı eski satırları listeler); yeni kuralla ödenen ay sonradan eski hesaba dönmez.
- **Hakediş oranları** (personel listesinde ve personel penceresinde) yalnız `finance:read` sahibine gönderilir; yönetici `*` ile dahildir. Önceden şube üyeliği üzerinden herkese gidiyordu.

**Kişi ve oturum**
- **Telefon/TC maskelemesi** kişi bazlı şube daraltmasını da uygular (bkz. §5).
- **Rolü değiştirilen personelin açık oturumları kapanır** (şifre sıfırlamada olduğu gibi). Önceden yeniden girişe kadar eski rolle çalışıyordu.
- **Sunucu ölçümleri ve alarmlar** (`/api/system/metrics`, `/api/system/alerts`) platform genelidir; klinik yöneticisine kapandı, yalnız süperadmin okur. Sistem Ayarları › Teknik ölçümler ikisini birlikte `/api/superadmin/system-settings/metrics` ucundan okur (açık bir gizli klinik girişi varken de süperadmin oturumuyla). Kayıt kontrolü (`/api/system/consistency`) kurumla sınırlı kalır.
- **Rol Yetkileri** ekranı önerilen varsayılandan farkları gösterir; "Varsayılana döndür" işlem kaydı neyin değiştiğini (rol bazında +/−) yazar.
