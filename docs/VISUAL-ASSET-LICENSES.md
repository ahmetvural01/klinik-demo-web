# Görsel/Motion Varlık Envanteri

Bu belge, KlinikModern arayüzünde kullanılan üçüncü taraf görsel/motion varlıklarının kaynağını, lisansını ve
uygulandığı ekranları kayıt altına alır. Gerçek secret veya kullanıcı verisi içermez.

## Kullanımda olan varlıklar

### 1. Microsoft Fluent Emoji — Flat stili
- **Kaynak:** `github.com/microsoft/fluentui-emoji`
- **Lisans:** MIT — `github.com/microsoft/fluentui-emoji/blob/main/LICENSE` içeriği doğrudan indirilip okunarak doğrulandı.
- **Ticari kullanım:** Serbest, attribution zorunlu değil.
- **Nasıl kullanılıyor:** Statik SVG dosyaları `public/icons/modules/*.svg` altında repoya gerçek varlık olarak eklendi
  (build sırasında internetten çekilmiyor). `src/components/ui/ModuleIcon.tsx` bu dosyaları modül anahtarına
  (`ModuleKey`) eşler.
- **Uygulandığı yerler:** Sidebar/topbar modül ikonları (klinik + süperadmin), tüm `EmptyState` illüstrasyonları
  (15+ farklı bağlam: Hasta, Randevu-Ajanda, Firma, Tedavi Planı, Laboratuvar, Stok, SMS, WhatsApp, Muhasebe,
  Rapor, Görevler, Personel, Süperadmin-Kurumlar), toast rozetleri (`ToastProvider` → `icon` alanı).
- **Dosya boyutu:** Her ikon ~1–3 KB (statik SVG, JS bundle'a dahil değil).

### 2. SVG Spinners
- **Kaynak:** `github.com/n3r4zzurr0/svg-spinners` (Utkarsh Verma)
- **Lisans:** MIT — repo LICENSE dosyası doğrudan doğrulandı.
- **Nasıl kullanılıyor:** "3-dots-fade" deseni elle uyarlanıp `src/components/ui/Spinner.tsx` içine gömüldü
  (harici dosya/JS runtime gerektirmez, ~500 bayt, `currentColor` ile tema rengine bağlı).
- **Uygulandığı yerler:** Tüm `Button` `loading` durumları, Stok/SMTP sayfa yükleme göstergeleri.

### 3. unDraw — sahne illüstrasyonları
- **Kaynak (varlıkların kendisi):** `undraw.co` — resmi lisans sayfası (`undraw.co/license`) doğrudan getirilip okundu:
  ticari kullanım ücretsiz, atıf gerektirmiyor, değiştirme (yeniden renklendirme dahil) serbest. Tek kısıtlama
  illüstrasyonların "ürünün kendisi" olarak satılmaması/paketlenmemesi — burada yalnızca UI'ı desteklemek için
  kullanıldı.
- **Kaynak (dosya indirme noktası):** `github.com/cuuupid/undraw-illustrations` — unDraw SVG'lerinin git tabanlı
  aynası. Kendi `LICENSE` dosyası da ayrıca indirilip **MIT olduğu doğrulandı**.
  Orijinal unDraw yazarına (Katerina Limpitsouni) atıf zorunlu olmasa da iyi niyet gereği burada belirtilir.
- **Değişiklik:** Her SVG'nin varsayılan `#6c63ff` vurgu rengi, marka birincil rengine (`#0d7d6f`) `sed` ile
  yeniden boyandı (yalnızca vurgu rengi; ten tonu/ikincil renkler orijinal haliyle bırakıldı — unDraw'ın kendi
  "tek renk özelleştirme" konvansiyonuyla tutarlı). Aynı sayfada birden fazla illüstrasyon çakışmasın diye SVG
  içindeki `id`/`url(#...)` referansları dosya adına göre namespace'lendi.
  Dosyalar `public/illustrations/*.svg` altında repoya gerçek varlık olarak eklendi (build sırasında internetten
  çekilmiyor).
- **Nasıl kullanılıyor:** `src/components/ui/SceneIllustration.tsx` → `createSceneIllustration(scene, width)`,
  `EmptyState`'in `illustrative` sözleşmesiyle aynı `{ className }` arayüzünü sağlar.
- **Uygulandığı yerler (boş durumlar, modüle özgü sahne):** Hasta listesi (`doctor_kw5l` → hekim+hasta sahnesi),
  Randevu Ajanda + Anasayfa "bugün randevu yok" (`schedule_pnbk` → takvim sahnesi), Muhasebe kayıt/taksit/hatırlatma
  boş durumları (`wallet_aym5`), Laboratuvar (`medicine_b1ol`), Stok (`building_blocks_n0nc`), Rapor
  (`data_report_bi6l`), SMS (`chatting_2yvo`), WhatsApp mesajları (`group_chat_v059` — SMS'ten **bilerek farklı**
  bir sahne, iki kanal artık aynı ikonu paylaşmıyor), Firma (`Building_leu4`), Görevler (`to_do_list_a49b`),
  Personel + Muhasebe "kayıtlı doktor yok" (`team_ih79`), Tedavi Planı (`business_plan_5i9d`). Ayrıca ileride
  kullanılmak üzere indirilip hazırlanan ama henüz bir ekrana bağlanmamış sahneler: `search-empty`,
  `success-scene`, `permission-denied`, `network-error`, `no-data`.
- **Dosya boyutu:** Sahne başına ~4–63 KB (ortalama ~25 KB) — modül ikonlarından (~1–3 KB) belirgin şekilde daha
  zengin, çünkü bunlar tek glif değil çok-elemanlı illüstrasyonlar; yalnızca boş/bağlamsal durumlarda render edilir,
  liste satırlarında tekrarlanmaz.

## Araştırılan ama entegre edilmeyen kaynaklar

Görev kapsamında ek profesyonel kaynaklar araştırıldı. Sonuç ve gerekçe:

| Kaynak | Bulgu | Karar |
|---|---|---|
| **Health Icons** (`resolvetosavelives/healthicons`) | LICENSE dosyası doğrudan indirilip **MIT olduğu doğrulandı**. Sağlık/diş temalı ikon seti — bu ürüne tematik olarak uygun. | **Entegre edilmedi.** Repo'nun dosya/klasör yapısı bu oturumda da güvenle keşfedilemedi. Yanlış/optimize edilmemiş bir dosya indirip entegre etmek yerine, doğru dosyanın bulunup doğrulanacağı bir sonraki tura bırakıldı — unDraw ile aynı kalite barına ulaşınca eklenecek. |
| **Lordicon** | Ücretsiz katman genellikle "kişisel kullanım" veya filigranlı; ticari lisans çoğu ikon için ayrı satın alma gerektiriyor. | Kullanılmadı — varlık bazında ticari lisans durumu güvenilir şekilde doğrulanamadı. |
| **LottieFiles (genel kütüphane), Rive** | Platform genelinde "Free" etiketi bireysel dosya bazında değişken lisans anlamına geliyor; toplu/güvenli doğrulama ve bir runtime player entegrasyonu bu görevin "yalnız görsel kalite, yeni motion sistemi yok" kısıtına da uymuyor. | Kullanılmadı. |
| **Icons8 Animated, IconScout, DrawKit, ManyPixels, Storyset** | Ücretsiz katmanlar genellikle attribution/format kısıtlı veya dosya-bazında lisans farklı; tek tek doğrulanamadı. | Kullanılmadı. |
| **OpenMoji** | CC BY-SA 4.0 — atıf **ve** türev çalışmaların aynı lisansla paylaşılması gerektiriyor (share-alike), bu da kapalı kaynak bir SaaS ürünü için ek bir yükümlülük anlamına geliyor. Fluent Emoji (MIT, atıfsız) zaten aynı işlevi karşılıyor. | Kullanılmadı — gereksiz lisans yükümlülüğünden kaçınıldı. |
| **SVG Repo** | Tek bir toplu lisans yok — her SVG'nin kendi (CC0/MIT/CC-BY/ticari-değil karışık) lisansı var; dosya bazında doğrulama gerekiyor. | Kullanılmadı bu turda; unDraw zaten ihtiyacı karşıladığı için ek araştırmaya öncelik verilmedi. |

**İlke (değişmedi):** Lisansı dosya bazında açıkça doğrulanamayan hiçbir varlık kullanılmadı. Uygun hazır varlık
bulunamayan/doğrulanamayan yerlerde, mevcut merkezi motion bileşenleri (`StatusFeedback`, CSS keyframe sistemi —
`globals.css`) kullanıldı; bu, "kendi ikon/illüstrasyonunu çiz" ile aynı şey değildir — evrensel, telif konusu
olmayan check/x gibi minimal semboller üzerine kurulu, orkestrasyonlu hareket sistemidir, yeni bir illüstratif
karakter/ikon ailesi değildir.

## Motion bileşenleri (üçüncü taraf değil, dahili)

- `src/components/ui/StatusFeedback.tsx` — çizilen check/x, MIT kaynaklardan bağımsız, dahili.
- `src/components/ui/CountUp.tsx` — bağımsız, dış kütüphane yok.
- `src/app/globals.css` içindeki keyframe sistemi (`ui-row-in`, `ui-kpi-in`, `ui-badge-pulse`, `ui-tab-panel-in`,
  `ui-settle-in`, `ui-progress-line`, `ui-today-breathe`, drag-drop motion sınıfları) — tamamı dahili, üçüncü taraf
  dosya indirmez.
