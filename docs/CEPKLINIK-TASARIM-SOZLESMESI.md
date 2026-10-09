# CepKlinik — ortak arayüz sözleşmesi

Amaç: her ekranın aynı parçalarla, aynı sözcüklerle ve aynı yerleşimle çalışması.
Kullanıcı bir ekranda öğrendiğini diğerinde tekrar öğrenmek zorunda kalmamalı.
Bu belge yeni ekran yazarken ve mevcut ekranı düzeltirken uyulacak kurallardır.

## 1. Sayfa iskeleti

Her panel sayfası yukarıdan aşağı aynı sırayı izler:

1. `PageHeader` — modül ikonu, sayfa adı (h1), en fazla bir satır açıklama, sağda
   sayfanın **tek** birincil eylemi (ör. "Yeni hasta"). Başlık üst barda tekrar
   edilmez; süs etiketi ("Klinik yönetim paneli") kullanılmaz.
2. `Tabs` — sayfanın bölümleri varsa başlığın hemen altında. Sekme seçimi adres
   çubuğunda `?tab=` ile tutulur (`useTabParam`).
3. `Toolbar` — liste üstünde arama (`SearchInput`), filtreler (`Select`,
   `DoctorSelect`), sağda ikincil eylemler (dışa aktar vb.). Uygulanan filtreler
   `ActiveFilters` ile kaldırılabilir etiket olarak görünür.
4. İçerik — liste için `ListTable` (+`ListPager`), boş durumda `EmptyState`,
   hata durumunda `LoadErrorState` (yeniden dene düğmesiyle), yüklenirken iskelet.

Özet sayaç kutuları (StatsCard) yalnız kullanıcının karar vermesini sağlayan,
listede zaten görünmeyen bir bilgi için kullanılır; listedeki satır sayısını
tekrar eden sayaç konmaz.

## 2. Ortak bileşenler (src/components/...)

| İhtiyaç | Kullanılacak bileşen | Kullanılmayacak |
| --- | --- | --- |
| Sekme | `ui/Tabs` + `useTabParam` | Elle `role="tab"` düğme dizisi, `.panel-tab`, `.ui-view-tab` |
| Arama kutusu | `ui/SearchInput` | Elle `<Search>` ikonlu input |
| Filtre/araç çubuğu | `ui/Toolbar`, `ActiveFilters` | Elle kenarlıklı filtre kutusu |
| Metin/sayı/tarih alanı | `ui/Input` | Sınıf yığınlı çıplak `<input>` |
| Açılır liste | `ui/Select` | Sınıf yığınlı çıplak `<select>` |
| Çok satırlı metin | `ui/Textarea` | |
| Alan etiketi/hata/ipucu | `ui/FormField` (+ `FormSection` uzun formlarda) | Elle `<label><span>` |
| Hasta seçimi | `patient/PatientPicker` | Her ekranda ayrı `/api/patients?q=` araması |
| Doktor seçimi | `staff/DoctorSelect`; liste gerekiyorsa `lib/staff-roles` → `selectDoctors` | `hideAsDoctor === false` gibi yerel kurallar |
| Düğme | `ui/Button` (primary, secondary, danger, ghost) | Sınıf yığınlı `<button>` |
| Satır/ikon eylemi | `ui/IconButton` (title zorunlu) | Elle ikon düğmesi |
| Pencere | `ui/Modal` (footer: Vazgeç + birincil) | Elle sabit konumlu katman |
| Onay | `confirmDialog` | `window.confirm` |
| Liste | `ui/ListTable` (+ `pager`) | Elle `<table>`; ayrıca mobil için ikinci elle yazılmış liste |
| Durum etiketi | `ui/Badge` (tone: success, warning, critical, info, neutral) | Elle renkli span |
| Boş/hata durumu | `ui/EmptyState`, `ui/LoadErrorState` | Elle metin |
| Açık/kapalı ayar | `ui/Switch` (etiket eylemi anlatır: "Ödeme hatırlatmalarını otomatik gönder") | Onay kutusu veya "Açık/Kapalı" yazan düğme |
| Birbirini dışlayan seçenek | `ui/ChoiceCards` (variant "cards" açıklamalı, "pills" kısa) | Elle kart/çip/düğme grubu |
| Uzun ayar formunda kaydet | `ui/SaveBar` (değişiklik varken altta yapışkan Vazgeç/Kaydet) | Sayfa sonunda kaybolan Kaydet |
| Listeden çoklu seçim | `ui/ListTable` `selection` özelliği (satıra tıklamak seçer, başlıkta tümünü seç) | Elle onay kutulu liste |

## 3. Sözcükler

- Pencereyi kapatan ikincil düğme: **Vazgeç** ("İptal" randevu/iş durumu olarak
  da kullanıldığı için düğmede kullanılmaz).
- Formu kaydeden düğme: **Kaydet**. Yeni kayıt açan sayfa düğmesi: **Yeni …**
  (Yeni hasta, Yeni randevu, Yeni lab işi). Silme yerine arşivleme yapılıyorsa
  düğme **Arşivle** der ve çöp kutusu ikonu kullanmaz.
- Hastanın tüm bilgilerinin bulunduğu ekran: **Hasta dosyası**.
- Hastadan alınan para: **Tahsilat**; tedarikçiye/personele yapılan: **Ödeme**.
- Boş değer: tek uzun çizgi "—" (soluk renk). Çift tire, "null", "undefined" yok.
- Telefon `formatPhoneNumber`, para `formatCurrency` ya da mevcut TL biçimi,
  tarih mevcut `formatDate` / kısa tarih yardımcılarıyla gösterilir.
- Kod adları (BEKLIYOR, GELDI, YONETICI) ekranda görünmez; etiket haritası kullanılır.

## 4. Düğme kuralı

Bir görünümde en fazla bir birincil (dolu renkli) düğme. Diğerleri secondary
veya ghost. Satır eylemleri `IconButton`; en sık iki eylem görünür, nadir/tehlikeli
eylem (arşivle, sil) sonda ve danger tonunda.

## 5. Derin bağlantı

Birincil "Yeni …" eylemi olan her liste sayfası `?yeni=1` ile açıldığında kendi
oluşturma formunu açar; hasta bağlamı varsa `patientId` (ve varsa `patientName`)
ile hastayı önceden seçer. Üst bardaki "Yeni" menüsü bu bağlantıları kullanır.

## 6. Görsel sadelik

Sürekli tekrar eden animasyon (yüzen ikon, parlama, nabız), hover'da parlama,
satır satır gecikmeli giriş animasyonu, sayıların sayarak gelmesi kullanılmaz.
Gölge ve gradyan yalnız katman ayırmak için. Yazı ağırlığı: sayfa başlığı ve
önemli sayı kalın; gövde metni normal/yarı kalın.

## 7. Dokunulmayacaklar

Yetki kontrolleri (`requireAuth`, `can(...)`), kurum/şube filtresi, finans
ledger/idempotency mantığı, SMS izin kontrolü ve mevcut "kullanıcı geri
bildirimi" yorumlarıyla gerekçelendirilmiş iş kuralları korunur. Görsel
düzenleme işlev doğrulamasının yerine geçmez.
