# CepKlinik — ortak arayüz sözleşmesi

Her ekran aynı parçalarla, aynı sözcüklerle ve aynı yerleşimle çalışsın: kullanıcı bir
ekranda öğrendiğini diğerinde yeniden öğrenmek zorunda kalmasın. Bu belge yeni ekran
yazarken ve mevcut ekranı düzeltirken uyulacak kurallardır. Bileşenler
`src/components/ui/` altındadır; her dosyanın başındaki yorum ayrıntılı kullanımı verir.
Canlı örnekler önizleme galerisindedir (`TumBilesenler.tsx`).

Bölüm numaraları kod yorumlarında anılır ("sözleşme §6" gibi); numaralar değiştirilmez.

## 0. Amaç ve sistem geneli kurallar

Ürün sahibinin hedefi: her şey kullanışlı, anlaşılır ve kolay ulaşılır olsun. Amaç yeni
özellik eklemek ya da var olanı azaltmak değil; kullanılamayan özellik işe yaramaz.
Personel veri girmeye üşenirse o veri sistemde de raporda da yoktur. Her ekran
resepsiyon, doktor, yönetici ve muhasebeci gözüyle değerlendirilir; sayfalar hızlı ve
kararlı açılır; tüm sistemde aynı kurallar geçerlidir.

Sadeleştirmek gizlemek değildir: seyrek kullanılan şey doğru yere (katlanır bölüm,
pencere, ayrıntı) taşınır, kaldırılmaz. Tasarım değişikliği serbesttir (sekme birleştirme,
ayarı satıra ya da pencereye taşıma, formu yeniden sıralama); işlev korunur. Yeni yetenek
eklenmez, öneri olarak yazılır.

### 0.1 Yalnız gerekli bilgi
- Her öğe o ekrandaki asıl işe hizmet eder. Süs başlık, etiket ya da hero ("Klinik
  yönetim paneli", "Günlük görünüm"), sekme başında açıklama paragrafı, karar
  verdirmeyen sayaç yok.
- Açıklama gerekiyorsa en fazla tek kısa cümle (`PageHeader` / `Section` `description`).
- Sık gereken bilgi ilk bakışta görünür; seyrek gereken ayrıntı penceresine ya da
  `Disclosure` altına gider.

### 0.2 Tekrar yok
- Bir durum bilgisi (kredi, bakiye, bağlantı, sayı, uyarı) bir ekranda TEK yerde görünür.
- Sekmeyi tekrar eden başlık düğmesi, listeyi ikinci kez özetleyen kart ya da sayaç, aynı
  forma giden ikinci "Düzenle" girişi olmaz.
- Sayfa adı üst barda tekrar edilmez. Aynı süzgeç hem çip hem açılır liste olarak yazılmaz.
  Pager'daki toplam "Tümü (n)" olarak tekrar edilmez. Boş listenin eylemi başlıktaki
  birincil eylemi tekrar etmez.

### 0.3 Kafa karıştıran alan yok
- Etiketler §3 sözlüğündeki adlarla yazılır; aynı kavrama tek ad verilir.
- Teknik ya da belirsiz etiket (ID, null, senkron, token) ve kod adı (BEKLIYOR, YONETICI)
  ekranda görünmez; etiket haritası kullanılır.
- API'nin kullanmadığı alan yok. Pasif seçenek nedenini söyler (`disabledReason`).
- Seyrek alanlar "Diğer bilgiler" (`Disclosure`) altındadır.

### 0.4 Veri girişi zahmetsiz
- Yalnız gerçekten gerekli alanlar zorunludur (`*`) ve en üsttedir. İsteğe bağlı alanlar
  `Disclosure` "Diğer bilgiler" altındadır.
- Akıllı varsayılan, mevcut veriden türetilebiliyorsa kullanılır: bugünün tarihi, oturumdaki
  doktor (doktorsa), açık hasta bağlamı (`patientId`), son kullanılan seçim (ör. son lab
  firması).
- Açılınca ilk alana odaklanır, Enter ile kaydeder, Tab sırası mantıklıdır (`FormModal`).
- Hata, ait olduğu alanın altında söylenir. Hatada form verisi kaybolmaz; çift tıklama
  çift kayıt üretmez.
- Seçimler hızlı kontrollerle yapılır (`QuickDatePicker`, `ToggleChips`, `ChoiceCards`
  pills, aranabilir seçiciler); uzun açılır liste kullanılmaz.
- Kayıt işin yapıldığı yerden açılır: hasta dosyasından açılan form hasta seçili gelir (§5).
- Tekrarlı girişte pencere kapanınca liste, kaydırma konumu ve filtreler yerinde kalır.

### 0.5 Hızlı ve kararlı açılış
- Şelale yok: bağımsız istekler paralel gider (`Promise.all`). Aynı veri aynı sayfada iki
  kez istenmez, ekranda gösterilmeyen veri çekilmez. Arama girişleri debounce'ludur.
  Ağır pencerenin verisi ve bileşeni pencere açılmadan yüklenmez. Gereksiz sık yoklama yok.
- Yükleniyor görünümü sayfanın gerçek düzenidir (`PageSkeleton`, `ListTable loading`);
  veri gelince ekran zıplamaz.
- Bilinmeyen sayı asla "0" ya da "₺0" gösterilmez; yerine iskelet ya da `StatStrip loading`.
- Yenilemede eldeki veri ekranda kalır; arka plan hatası `staleError` ile söylenir.
- Render sırasında `Date.now()`, `new Date()`, `toLocale*`, `localStorage`, `Math.random()`
  kullanılmaz; sunucu ile istemci farklı çizer (hidrasyon hatası #418). Bu değerler effect
  içinde hesaplanır.
- Klinikteki bilgisayarlar aynı dış IP'yi paylaşır; sayfa açılışta ve boştayken mümkün olan
  en az isteği yapar.

### 0.6 Dört rol gözüyle değerlendirme
Her ekranı bu rollerin günlük işiyle yürüyün. Her rol için şunu sorun: bu bilgi işime
yarıyor mu, iş kaç tıkta bitiyor, neyi aramak zorunda kalıyorum?

| Rol | Günlük iş | Önüne çıkmamalı |
| --- | --- | --- |
| Resepsiyon / asistan | Hasta bulmak ve kaydetmek, randevu vermek ve değiştirmek, "geldi" işaretlemek, tahsilat, takip araması, lab işini kaydetmek ve teslim almak, stoktan düşmek. Hız, az alan, klavye ve hasta bağlamı kritiktir. | Yönetim ayrıntısı |
| Doktor | Günün randevuları ve sıradaki hasta, risk ve alerji uyarısı, tedavi kaydı (diş, tedavi ve fiyat tek akışta), reçete, lab siparişi, kendi hakedişi. | Finans ve yönetim ayrıntısı |
| Yönetici | Kliniğin bugünkü durumu (doluluk, bekleyen işler, tahsilat), personel, ayarlar (bir kez kurup unutabilmeli), raporlar. | — |
| Muhasebeci | Tahsilat ve gider, alacaklar ve taksitler, tedarikçi ödemeleri, hakediş, dönem raporu, dışa aktarma. | Klinik ve sağlık ayrıntısı |

## 1. Sayfa iskeleti

Her panel sayfası yukarıdan aşağı aynı sırayı izler:

```
PageHeader      modül ikonu · sayfa adı (h1) · en fazla 1 cümle · sağda TEK birincil eylem
Tabs            sayfanın bölümleri (?tab=, useTabParam) — alt çizgili düz sekme
StatStrip       (gerekirse) yalnız karar verdiren sayılar — tek çerçeveli şerit
İçerik          ListTable (toolbar yuvasında Toolbar + ActiveFilters) · Section · SettingsList · DescriptionList
Durumlar        PageSkeleton · EmptyState · LoadErrorState / staleError · StatusPage
```

Liste sayfasında araç çubuğu (arama · filtreler · Dışa aktar) listenin kartının üst
şerididir: `<ListTable toolbar={<Toolbar …/>} …/>`. Liste yoksa Toolbar `bare` ile sayfa
zemininde çerçevesiz durur. Ayrıntı: §9 Sadelik kuralları.

1. **`PageHeader`:** `icon` bir modül anahtarıdır (`"flask"`, `"calendar"`…). Başlık
   menüdeki addır. Sağda sayfanın tek birincil eylemi durur (ör. "Yeni hasta"), gerekirse
   1–2 ikincil eylem de olabilir.
   - Başlık üst barda tekrar edilmez; süs etiketi yok.
   - `back` yalnız ayrıntı sayfalarında kullanılır.
   - `stats` en fazla 2–3 sayıdır ve listede görünmeyen bilgiyi verir. Yalnız tıklanmayan
     1–2 genel sayı içindir; StatStrip olan sayfada kullanılmaz.
2. **`Tabs`:** sayfanın bölümleridir, süzgeç değildir. Süzgeç için `ChoiceCards` pills,
   `DateRangeFilter` ya da `Select` kullanılır.
   - Seçim adreste `?tab=` ile tutulur (`useTabParam`).
   - Sekme sayacı yalnız eylem gerektiren adet içindir (geciken, bekleyen).
   - Sekme başında açıklama paragrafı yok.
3. **`Toolbar`:** arama `children` içinde her zaman görünür. Seçiciler `filters`'a, "Dışa
   aktar" `actions`'a gider.
   - Listenin araç çubuğu ListTable `toolbar` yuvasına verilir (kartın üst şeridi; ayrı
     kart değil). Liste dışındaki araç çubuğu `bare` alır (çerçevesiz, zeminsiz).
   - `ActiveFilters` de aynı yuvada, Toolbar'ın altında durur
     (`toolbar={<><Toolbar …/><ActiveFilters …/></>}` ya da ListTable `header`).
   - `ActiveFilters` ve `filterCount` yalnız Toolbar `filters` içindeki, telefonda katlanan
     seçimleri içerir. Her zaman görünen seçici (DateRangeFilter `variant="chips"`,
     ChoiceCards pills durum süzgeci) ActiveFilters'a ve filterCount'a eklenmez.
   - `filterCount`, varsayılandan farklı filtre sayısıdır (arama hariç). `ActiveFilters`
     ile aynı kaynaktan hesaplanır.
   - Araç çubuğuna kendi `absolute` açılır kutunuzu koymayın; `ActionMenu` ve `ExportMenu`
     portal kullanır.
4. **`StatStrip`:** yalnız kullanıcının karar vermesini sağlayan ve listede zaten görünmeyen
   sayılar içindir.
   - Tıklanınca süzgeç uygular (`onClick` + `active`) ya da başka sayfaya götürür (`href`).
   - Listedeki satır sayısını tekrar eden sayaç konmaz.
   - **Bir sayı ekranda tek yerde durur.** Tıklanınca süzen durum sayısı ya StatStrip
     kartıdır (1–5 karar sayısı) ya da ChoiceCards pill'idir (Tümü + durumlar); aynı süzgeç
     için ikisi birlikte kullanılmaz. Sekme ve düğme sayacı eylem gerektiren adettir; bilgi
     amaçlı sayaç yalnız pill/çip süzgecinde verilir.
5. **İçerik:** liste için `ListTable` (+`pager`, `mobileCard`), başlıklı kart için `Section`,
   ayar ve otomasyon için `SettingsList`, salt okunur bilgi için `DescriptionList`. Kart
   içinde kart olmaz: `title`'lı ListTable ayrıca Section'a sarılmaz.
6. **Durumlar:**

   | Durum | Kullan |
   | --- | --- |
   | `loading.tsx` | Sayfanın biçimine uyan `PageSkeleton` |
   | Liste yükleniyor | `ListTable loading` |
   | Liste boş | `EmptyState` (ListTable `emptyText` / `emptyDescription` / `emptyAction`) |
   | İlk yükleme hatası | `error` + `onRetry` |
   | Veri ekrandayken yenileme hatası | `staleError` |
   | ListTable dışındaki yüzeyde (StatStrip, Section + DescriptionList, SettingsList) yenileme hatası | Bölümün üstünde `<Callout tone="warning" compact role="status" action={<Button size="sm" variant="ghost" icon={RefreshCw} onClick={retry}>Yeniden dene</Button>}>{hata} Son yüklenen bilgiler gösteriliyor.</Callout>`; veri yerinde kalır |
   | Tam sayfa durum (izin yok, bulunamadı, hata, taşındı, yönlendiriliyor) | `StatusPage` |
7. **Menü, sayfa adı ve kabuk sayıları tek kaynaktan gelir:**
   - Menü öğeleri, sayfa adları (menü adı = h1 = tarayıcı sekmesi) ve hangi adresin hangi
     izinle açıldığı `src/lib/nav.ts`'tedir. Sol menü, üst bar, sayfa koruması
     (`PanelRouteGuard`) ve `/yetkisiz` buradan okur; sayfada ikinci liste yazılmaz.
   - Menü rozetleri, zil ve bekleme salonu sayıları `/api/panel-summary`'den
     `usePanelSummary()` ile okunur. Aynı sayı için sayfada ayrı istek atılmaz.

## 2. Bileşen seçimi

Elle yazılmış desen yerine aşağıdaki bileşenler kullanılır. Dalga 1 boyunca bileşen
API'si donmuştur: dışa açık ad, prop adı ve prop türü değişmez. Yalnız iç düzeltme ve
isteğe bağlı yeni prop eklenebilir. Bir bileşende eksik görürseniz sayfada elle desen
yazmayın, istek olarak bildirin.

### 2.1 Sayfa, gezinme, araç çubuğu

| İhtiyaç | Kullan | Kullanma |
| --- | --- | --- |
| Sayfa başlığı | `PageHeader` | Elle h1 ya da hero kartı, süs etiketi, üst barda ikinci başlık |
| Sayfa bölümleri | `Tabs` + `useTabParam` | Elle `role="tab"`, `.panel-tab`, `.ui-view-tab`; süzgeç için sekme |
| Arama | `SearchInput` | Elle büyüteç ikonlu input |
| Araç ve filtre çubuğu | `Toolbar` (`filters`, `filterCount`, `actions`) + `ActiveFilters` | Elle kenarlıklı filtre kutusu, elle mobil "Filtrele" düğmesi |
| Dönem / tarih aralığı | `DateRangeFilter` + `useDateRangeParam` + `lib/date-presets` | Elle Başlangıç/Bitiş kutuları, yerel dönem Select'i, ham ISO etiket, `toISOString` ile gün hesabı |
| Dışa aktar | `ExportMenu` | Ayrı Excel/PDF düğmeleri, elle açılır menü |
| Sayfayı kapatmadan bakılan liste, mobil menü | `Drawer` | Elle sabit katman, xl Modal |

```tsx
<PageHeader icon="flask" title="Laboratuvar" actions={<Button icon={Plus} onClick={openNew}>Yeni lab işi</Button>} />
const [tab, setTab] = useTabParam(TAB_KEYS, "acik"); // TAB_KEYS = ["acik", "geciken", "teslim"] as const
<Tabs ariaLabel="Laboratuvar bölümleri" value={tab} onChange={setTab} items={[{ key: "acik", label: "Açık işler" }, { key: "geciken", label: "Geciken", count: 2, countTone: "critical", countLabel: "geciken iş" }]} />
<SearchInput value={q} onChange={setQ} placeholder="Hasta, iş türü veya laboratuvar ara" slashShortcut wrapperClassName="flex-1 min-w-[220px]" />
<Toolbar filters={<><DateRangeFilter {...period.filterProps} /><DoctorSelect value={doctorId} onChange={setDoctorId} emptyLabel="Tüm doktorlar" /></>} filterCount={activeFilters.length} actions={<ExportMenu size="md" onExcel={exportExcel} />}>{arama}</Toolbar> // araç çubuğunda md (40px, arama ve seçicilerle aynı); liste başlığında sm
<ActiveFilters filters={activeFilters} onClearAll={clearAll} /> // öğe: { key, label, onRemove }
const period = useDateRangeParam(DATE_PRESET_SETS.takvim, "ay"); // period.range, .error, .activeFilter, .reset()
<DateRangeFilter presets={DATE_PRESET_SETS.gecmis} value={value} onChange={setValue} variant="chips" showRange /> // pencere içi: yerel state + resolveDateRange(value)
<ExportMenu onExcel={exportExcel} onPdf={exportPdf} disabled={rows.length === 0} disabledReason="Dışa aktarılacak kayıt yok" /> // başka biçim varsa: items={[{ key, label, icon, description, onSelect }]}
<Drawer open={open} onClose={close} title="Bekleyenler" footer={<Button variant="secondary" onClick={close}>Kapat</Button>}>…</Drawer>
```

**`DateRangeFilter`**
- Hazır set olarak `DATE_PRESET_SETS.takvim` (finans, rapor) ya da `.gecmis` (kayıt ve
  geçmiş listeleri) kullanılır. Set kısaltılabilir ama dönem adı uydurulmaz.
- Etiket her yerde "Dönem"dir.
- Bitiş varsayılan olarak bugünü geçemez; ileri tarihli listede `allowFuture` verilir.
- Hata metnini bileşen kendisi yazar; `error` varken istek atılmaz.
- `variant="chips"` yalnız dönem sayfanın ana süzgeciyse ve en fazla 5 seçenek varsa.

**Dönem nerede tutulur**
- Liste ve rapor sayfasında dönem adreste tutulur (`?donem=`, `useDateRangeParam`).
- Pencere içinde yerel state ve `resolveDateRange` kullanılır.
- Dönemi başka sayfaya taşıyan bağlantı `writeDateRangeParams` ile kurulur.

**`ExportMenu`**
- Bir görünümde tek dışa aktar düğmesi olur ve bu düğme ikincildir.
- Biçim adları "Excel (CSV)" ve "PDF"tir. Tek biçim varsa menü açılmaz.
- Yalnız Excel ve PDF varsa `onExcel` / `onPdf` kısayolu kullanılır; ad ve ikon hazır
  gelir. Başka biçim için `items` verilir ve her öğeye ikon konur (`FileSpreadsheet`,
  `FileText`).
- `onSelect` Promise döndürürse düğme iş bitene kadar meşgul görünür.
- Yetki sayfada denetlenir: `{can("finance:export") && <ExportMenu … />}`.

**`Drawer`**
- **Form, kısa ya da uzun, her zaman `FormModal`'da açılır** (gerekirse `size="lg"`/`"xl"`);
  Drawer form taşımaz (Enter ile gönderim, çift gönderim ve kayıt sürerken kapanmama
  koruması FormModal'dadır). Onay `confirmDialog`'dur.
- Tek kaydın ayrıntısı `Modal`'dır; liste bağlamı korunarak art arda bakılan kayıtlar ve yan
  panel `Drawer`'dır.
- Mobilde klavye kendiliğinden açılmasın diye otomatik odak yoktur; gerekiyorsa alana
  `data-autofocus` verilir.

### 2.2 Liste ve içerik yüzeyleri

| İhtiyaç | Kullan | Kullanma |
| --- | --- | --- |
| Liste / tablo | `ListTable` (+`pager`, `mobileCard`) | Elle `<table>`; mobil için ikinci elle liste |
| Liste başlığı | ListTable `title` / `subtitle` / `actions` | Elle `header={<h2>…</h2>}` kutusu; listeyi Section'a sarmak |
| Yenileme hatası | ListTable `staleError` + `onRetry` | Elle "Liste yenilenemedi" şeridi |
| Sütunun nasıl hesaplandığı | `ListTableColumn.headerHint` | Tablo üstünde formül paragrafı |
| Yalnız bazı satırlar bir şey açar | `onRowClick` + `isRowClickable` | Hiçbir şey açmayan satırların `role="button"` olması |
| Çoklu seçim ve toplu işlem | ListTable `selection` + `BulkActionBar` (`header` içinde) | Elle onay kutulu liste, "İşaretle (3)" düğmeleri |
| Başlıklı kart | `Section` (liste ve satır içeriğinde `padding="none"`) | Elle `rounded-2xl border bg-white p-5` kart, kart içinde kart |
| Ayar / otomasyon satırı | `SettingsList` / `SettingsGroup` / `SettingsRow` | Her ayara büyük kart ve açıklama paragrafı |
| Etiket–değer | `DescriptionList` (`grid` özet; `rows` ayrıntı, `emphasis` toplam satırı) | Elle `<dl>` ya da iki sütunlu div; boş değere "-" |
| Karar verdiren sayılar | `StatStrip` (`loading`) | `StatsCard` / `AlertCard` (Premium), gradyanlı KPI kartı |
| Uyarı ve bilgi kutusu | `Callout` | Elle `border-amber-200 bg-amber-50` kutusu |
| Durum etiketi | `Badge` | Elle renkli span |
| Sayaç | `CountBadge` (ya da Tabs, Button, ChoiceCards, ToggleChips `count`) | Elle renkli sayı |
| Kişi görseli | `Avatar` (+`avatarInitials`) | Elle baş harf ve renk kodu |
| İlerleme | `ProgressBar` | SVG çizgi, iç içe div, ayrıca yazılmış "%60" |
| Sıralı adımlar | `StepList` | Renkli numara daireleri ve yanında ayrıca durum Badge'i |
| Paylaşılacak bağlantı / kod | `CopyField` | Input + "Kopyala" + toast |
| Tutar ve tarih gösterimi | `Money` / `DateText` (`ui/Money`) | Elle `toLocaleString`, kuruşlu ve kuruşsuz karışık yazım |

```tsx
<ListTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={loading} error={!loaded ? error : null} staleError={loaded ? error : null} onRetry={load} onRowClick={open} getRowAriaLabel={(r) => r.patientName} mobileCard={(r) => <LabCard row={r} />} pager={pager} emptyText="Açık lab işi yok" />
{ key: "borc", header: "Kalan borç", align: "right", headerHint: "İndirimli tedavi tutarı − tahsilatlar", render: (r) => <Money value={r.balance} /> }
<ListTable title="Tahsilatlar" titleAs="h3" subtitle="Bu ay toplam ₺48.250,00" actions={<ExportMenu onExcel={exportExcel} />} … />
<ListTable selection={{ selectedIds, onChange: setSelectedIds }} header={<BulkActionBar count={selectedIds.length} itemLabel="hasta" onClear={() => setSelectedIds([])} actions={<Button size="sm" variant="secondary" icon={Send}>Mesaj gönder</Button>} />} … />
<Section title="Ödeme geçmişi" padding="none" actions={<Button size="sm" variant="ghost">Tümünü gör</Button>}>…</Section>
<SettingsRow icon={Cake} title="Doğum günü" description="Doğum gününde, yılda bir" actions={<Button size="sm" variant="ghost">Metin</Button>} toggle={{ checked, onChange: setChecked, label: "Doğum günü mesajı gönderilsin" }} />
<DescriptionList layout="rows" items={[{ label: "Tedavi toplamı", value: <Money value={total} /> }, { label: "Kalan borç", value: <Money value={rest} />, emphasis: true }]} />
<StatStrip loading={!summary} items={[{ key: "geciken", label: "Geciken taksit", value: summary?.overdue, tone: "critical", onClick: () => setFilter("geciken"), active: filter === "geciken" }]} />
<Callout tone="warning" title="Kredi azaldı" action={<Button size="sm" variant="secondary" href="/sms?tab=ayarlar">Kredi al</Button>}>Kredi bitince SMS gitmez.</Callout>
<Badge tone="success">Teslim alındı</Badge>
<CountBadge count={overdue} tone="critical" label="gecikmiş takip" />
<Avatar name={person.fullName} src={person.photoUrl} size="sm" />
<ProgressBar value={done} max={total} label="Tedavi adımları" valueLabel={`${done} / ${total} adım`} />
<StepList aria-label="Laboratuvar adımları" current="prova" steps={[{ key: "olcu", title: "Ölçü" }, { key: "prova", title: "Prova", actions: <Button size="sm" variant="secondary">Geldi</Button> }]} />
<CopyField label="Online randevu bağlantısı" labelHidden value={bookingLink} openHref />
<Money value={row.amount} tone="auto" /> <DateText value={row.createdAt} format="datetime" />
```

**`ListTable`**
- Araç çubuğu `toolbar` yuvasına verilir; kartın üst şeridi olur, yuvadaki Toolbar'ın
  çerçevesi kendiliğinden kalkar (§9 K1).
- Satır eylem sütunu (`"islem"`) içeriği kadar dardır; başlığı ("İşlem") görsel olarak
  gizlidir, ekran okuyucu duyar. Satırdaki IconButton ve "…" çerçevesiz ve 32 px'tir
  (her ton rengini korur); satır tek satırda 48 px'tir (§9 K3, K9).
- Telefon kartında "…" `mobileCardActions` ile kartın sağ üst köşesine konur; ayrı eylem
  sırası açılmaz. Aynı menü `mobileCard` içinde ikinci kez çizilmez.
- İlk yükleme hatası `error` ile verilir (liste yerine görünür). Veri ekrandayken gelen hata
  `staleError` ile verilir; şerit "{staleError} Son yüklenen liste gösteriliyor." yazar, bu
  yüzden metin tam cümledir ("Tahsilatlar yüklenemedi.").
- Sütun ipucu (`headerHint`) pencere ve çekmece içindeki listede de kullanılabilir; balon
  katmanların önünde çizilir, Esc yalnız balonu kapatır.
- `mobileCard` her listede verilir. Kartta en önemli 2–3 bilgi ve 1 eylem olur.
- Satır eylem sütununun anahtarı `"islem"`dir; masaüstünde yapışkandır. Satırın zemini
  (üzerine gelme, seçim, `rowClassName` vurgusu) yapışkan hücrede de sürer.
- Çok sütunlu tablo tablette sığmıyorsa `cardBelow="lg"` verilir: kart görünümü 1024 px'e
  kadar kullanılır (varsayılan 768 px).
- `title` kısa bir addır. `subtitle` TEK satırdır. `actions` ikincil eylemler içindir;
  birincil eylem sayfa başlığında durur.
- Kayıt sayısı `pager`'da ("26–29 / 29 kayıt") yazıyorsa `subtitle`'da tekrar edilmez.
- Durum Badge'de yazıyorsa satır `rowClassName` ile ayrıca boyanmaz.
- `headerHint` en fazla 2 cümledir.

**`BulkActionBar`**
- Her zaman `header` içine konur; seçim yokken hiçbir şey çizmez.
- Eylemler `Button size="sm" variant="secondary"` olur. Tehlikeli eylem en sonda ve `danger`
  tonundadır.
- Seçili sayı düğme adında tekrar yazılmaz.

**`Section`**
- `description` tek satırdır ve gerekmedikçe verilmez.
- Kapsam ya da durum rozeti `badge` ile verilir; `title` içine gömülmez.
- `actions` bölüme ait ikincil eylemler içindir.
- Kart içine büyük ikon kutusu ya da gradyan konmaz.

**`SettingsRow`**
- Bir satır tek bir ayardır.
- Anahtar (`toggle`) anında kaydeder; `toggle.label` eylemi anlatır.
- Metin, zamanlama gibi ayrıntılar satırdan açılan pencerede düzenlenir (`onOpen` ya da
  `actions`).
- Aynı listede anahtarlı ve anahtarsız satır varsa anahtarsız satıra `reserveToggleSpace`
  verilir; düğmeler aynı hizada durur (sayfada boşluk öğesi yazılmaz).

**Diğer gösterimler**
- `DescriptionList` boş değer için "—"yü kendisi yazar. Yetkiye bağlı satıra `hidden`
  verilir.
- `StatStrip` en fazla 5 sayı gösterir. Değer bilinmiyorsa `loading` verilir, asla 0
  yazılmaz; `loading` iken `hint` de iskelettir. Telefonda tek sayıda kutuda son kutu tam
  genişliktir.
- `Callout`'un varsayılan `role` değeri "status"tır. Kullanıcı eylemine yanıt veren acil hata
  "alert" olur. En fazla bir eylem alır (`action`).
- `CountBadge` yalnız eylem gerektiren adet içindir; 0'ı çizmez, 99'dan büyükse "99+" yazar.
  Durum metni için `Badge` kullanılır.
- `Avatar` yalnız kişi içindir. Ad yanında yazıyorsa `decorative` kalır (varsayılan); tek
  başına duruyorsa `decorative={false}` verilir.
- `StepList`'te durum ayrıca Badge ile tekrar yazılmaz.
- `ProgressBar`'da sayı yalnız `valueLabel`'da, bir kez yazılır.
- `CopyField` kopyalayınca ayrıca toast açılmaz.

### 2.3 Eylem

| İhtiyaç | Kullan | Kullanma |
| --- | --- | --- |
| Düğme | `Button` (`primary`, `secondary`, `ghost`, `danger`, `danger-ghost`) | Sınıf yığınlı `<button>`; ghost + elle `!text-red-600` |
| Sayaçlı düğme | Button `count` / `countTone` / `countLabel` | Elle amber sayı |
| Dış bağlantı (telefon, WhatsApp, PDF) | Button `href` (+`target="_blank"`) | Elle `<a>` düğmesi |
| İkon düğmesi | `IconButton` (`title` zorunlu) | Elle ikon düğmesi, adı olmayan ikon |
| Ek eylemler | `ActionMenu` ("…" ya da `trigger="button"`) | Elle açılır menü, satırda 4–5 düğme |
| Onay | `confirmDialog` (`lib/confirm-client`) | `window.confirm` |
| Kısa bildirim | `showToastSafe` (`lib/toast-client`) | `alert()`, elle bildirim kutusu |

```tsx
<Button icon={Plus} onClick={openNew}>Yeni hasta</Button>
<Button variant="secondary" icon={Inbox} count={pending} countTone="warning" countLabel="bekleyen talep" onClick={openPending}>Bekleyenler</Button>
<Button variant="secondary" icon={Phone} href={`tel:${phone}`}>{formatPhoneNumber(phone)}</Button>
<Button variant="danger-ghost" icon={Archive} onClick={archive}>Arşivle</Button>
<IconButton icon={Pencil} size="sm" title="Düzenle" onClick={edit} />
<ActionMenu items={[{ key: "yazdir", label: "Yazdır", icon: Printer, onSelect: print }, { key: "arsiv", label: "Arşivle", icon: Archive, danger: true, separatorBefore: true, onSelect: archive }]} />
<ActionMenu trigger="button" label="İşlem ekle" icon={Plus} items={items} />
<ActionMenu trigger="button" label="Yeni" icon={Plus} iconOnlyOnMobile items={items} /> // telefonda kare ikon düğmesi; ad ekran okuyucuda kalır
if (!(await confirmDialog({ title: "Tüm şablonlar silinsin mi?", message: "Bu işlem geri alınamaz.", confirmText: "Sil", danger: true, requireText: "SİL" }))) return; // yazılmadan onay pasif
if (!(await confirmDialog({ title: "Plan iptal edilsin mi?", message: "Ödenmemiş taksitler kapanır.", confirmText: "Planı iptal et", danger: true }))) return;
showToastSafe({ type: "success", message: "SMS gönderildi." });
```

### 2.4 Form

| İhtiyaç | Kullan | Kullanma |
| --- | --- | --- |
| Pencere içi form (yeni, düzenle, gerekçeli işlem) | `FormModal` | `Modal` + elle footer + görünmez submit düğmesi + savingRef |
| Salt okunur ayrıntı ya da bilgi penceresi | `Modal` (footer: tek "Kapat" ya da "Vazgeç" + tek birincil) | Elle sabit konumlu katman |
| Alan etiketi, hata, ipucu | `FormField` (`as="div"`, `hintTone="warning"`, `className`) | Elle `<label><span>`, col-span için saran div |
| Uzun sayfa formunda bölüm | `FormSection` | Elle başlıklı kutu |
| Metin, açılır liste, çok satırlı metin | `Input` / `Select` / `Textarea` (`ui/Input`) | Sınıf yığınlı çıplak kontrol |
| Tutar | `MoneyInput` + `lib/money-input` | `type=number`, `Number()`, `replace(",", ".")`, yerel parseAmount, etikette "(₺)" |
| İleri tarih (takip, son tarih, vade, sonraki randevu) | `QuickDatePicker` | Yalnız tarih-saat kutusu, elle gün düğmeleri |
| Geçmiş ya da sabit tarih (doğum tarihi, tahsilat tarihi) | `Input type="date"` | — |
| Saat aralığı | `TimeRangeInput` + `timeRangeError` | Ayrı Açılış/Kapanış alanları, satır sonunda ayrı hata kutusu |
| Seyrek alanlar | `Disclosure` ("Diğer bilgiler") | Elle `<details>`, "Daha fazla göster" |
| Uzun ayar formunda kaydet | `SaveBar` | Sayfa sonunda kaybolan "Kaydet" |
| Hasta seçimi | `patient/PatientPicker` (`FormField as="div"` içinde) | Her ekranda ayrı `/api/patients?q=` araması |
| Doktor seçimi | `staff/DoctorSelect`; liste gerekiyorsa `lib/staff-roles` `selectDoctors` | `hideAsDoctor === false` gibi yerel kurallar |
| Aranarak bulunan tekli seçim (firma, iş türü) | `SearchSelect` (`className="ui-control"`) | 50 seçenekli açılır liste |
| Görsel yükleme (logo, fotoğraf) | `ImageUploadField` | Elle dosya kutusu, her ekranda başka düğme adı |

```tsx
<FormModal open={open} onClose={close} title="Tahsilat al" description={`${patient.fullName} · Kalan borç ₺4.500,00`} module="finance" onSubmit={save} submitting={saving} error={serverError} isDirty={dirty} dangerAction={editing ? { label: "Tahsilatı iptal et", icon: Ban, onClick: cancelPayment } : undefined}>…</FormModal>
<Modal open={open} onClose={close} title="Lab işi" size="lg" footer={<Button variant="secondary" onClick={close}>Kapat</Button>}>…</Modal>
<FormField label="Ad soyad" required htmlFor="hasta-ad" error={errors.name}><Input id="hasta-ad" value={name} onChange={(e) => setName(e.target.value)} /></FormField>
<FormField label="Hasta" as="div" required><PatientPicker value={patient} onChange={setPatient} locked={Boolean(patientIdFromUrl)} /></FormField>
<FormField label="Cep telefonu" htmlFor="tel" hint="Bu numarayla kayıtlı hasta var: Deniz Kaya" hintTone="warning"><Input id="tel" type="tel" … /></FormField>
<FormField label="Tutar" required htmlFor="t-tutar" error={tried ? moneyInputError(amount, { required: true, max: rest }) ?? undefined : undefined}><MoneyInput id="t-tutar" value={amount} onChange={setAmount} /></FormField>
<FormSection icon={Building2} title="Klinik bilgileri">…</FormSection>
<QuickDatePicker label="Sonraki arama" required min="today" value={nextDate} onChange={setNextDate} />
<TimeRangeInput label="Çalışma saati" required minuteStep={15} value={{ start: day.open, end: day.close }} onChange={({ start, end }) => updateDay({ open: start, close: end })} />
<Disclosure title="Diğer bilgiler" summary="Not, renk, ünite">…</Disclosure>
<SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={reset} />
<SearchSelect query={q} onQueryChange={setQ} options={labs.map((l) => ({ id: l.id, label: l.name }))} onSelect={(o) => setLabId(o.id)} placeholder="Laboratuvar adı yazın…" loading={loading} className="ui-control" />
<ImageUploadField label="Fotoğraf" shape="round" maxDimension={320} value={photoUrl} onChange={setPhotoUrl} placeholder={<Avatar name={fullName} size="lg" />} />
```

**`FormModal`**
- Tek birincil düğme ("Kaydet" ya da tek fiil: "Tahsil et", "Gönder") ve "Vazgeç" olur.
- Nadir ya da tehlikeli eylem `dangerAction` ile solda durur; onay `onClick` içinde
  `confirmDialog` ile alınır.
- Alan hatası FormField `error`'da, sunucu ya da genel hata `error` prop'unda gösterilir.
- `onSubmit` Promise döndürürse çift gönderim ve kayıt sürerken pencereyi kapatma
  engellenir.
- Kirli formda Esc, × ve "Vazgeç" önce "Değişiklikler kaybolsun mu?" diye sorar ("Forma
  dön" / "Kapat"); arka plan tıklaması kirli formu kapatmaz, uyarı gösterir. Temiz formda
  hepsi doğrudan kapatır. Kapatma onayı sayfada ikinci kez yazılmaz; kendi onayını soran
  pencere `confirmOnDirtyClose={false}` verir. Modal footer'ındaki elle yazılmış "Vazgeç"
  aynı korumayı `useModalClose()` ile alır.
- Formu başka amaçla gönderen ikinci düğme ("Kaydet ve randevu ver") `secondarySubmit`
  ile verilir; amaç `submitIntent(event)` ile okunur, yalnız basılan düğme yükleniyor
  görünür.
- Çip, ToggleChips, QuickDatePicker ve ChoiceCards değişiklikleri otomatik "kirli"
  sayılmaz; bunlar için `isDirty` verilir.
- Hatalı alan katlanmış "Diğer bilgiler" içindeyse bölüm açılır
  (`Disclosure open` / `onOpenChange`); hata gizli kalmaz.
- Pencere içine ikinci bir `<form>` yazılmaz.

**`FormField`**
- Tek kontrol için varsayılan biçim kullanılır; etiket kontrolü sarar.
- Birden çok kontrol ya da düğme içeren alanda (telefon + ülke kodu, PatientPicker)
  `as="div"` verilir; ana kontrol `htmlFor` ile işaretlenir.
- Kaydı engellemeyen uyarı `hintTone="warning"` ile, engelleyen durum `error` ile,
  doğrulanmış alan `success` ile gösterilir.

**Kendi etiketi olan bileşenler** FormField ile SARILMAZ: `ChoiceCards`, `ToggleChips`,
`QuickDatePicker`, `TimeRangeInput`, `Switch`, `Checkbox`, `DateRangeFilter`, `CopyField`,
`ImageUploadField`. Ad her zaman `label` ile verilir; görünürlüğü bileşene göre değişir:
- `labelHidden` yalnız Switch, CopyField, ChoiceCards, ToggleChips, QuickDatePicker ve
  TimeRangeInput'ta vardır; ad ekranda zaten yazıyorsa verilir.
- Checkbox etiketi her zaman görünür.
- DateRangeFilter `label`'ı isteğe bağlıdır (varsayılan "Dönem"; `select`'te yalnız ekran
  okuyucu adıdır, `chips`'te görünür).
- ImageUploadField adı varsayılan olarak yazmaz (grubun ekran okuyucu adıdır). Formda başka
  alanlarla birlikte duruyorsa `showLabel` verilir (FormField etiketiyle aynı biçim); ad
  bölüm başlığında zaten yazıyorsa (Section/FormSection "Logo") verilmez.

**`FormSection`**, Section görünümünde bir form bölümüdür (küçük çizgi ikon + başlık); SaveBar'lı
sayfa formunda kullanılır. Başlıklı salt okunur ya da liste içeriği `Section`'dır.

**`MoneyInput`**
- Değer state'te METİN olarak tutulur ("1250.50" ya da "").
- Hesap ve karşılaştırma `compareMoney`, doğrulama `moneyInputError` ile yapılır. Sunucudan
  gelen ya da hesaplanan değer `toMoneyValue(x) ?? ""` ile alınır; ham makine metni
  ("12.345" gibi 3 ondalıklı) `value`'ya verilmez, binlik sayılır.
- `moneyInputError` veritabanı sınırını (±₺99.999.999,99) her durumda uygular; `max`
  yalnız iş kuralı içindir (ör. kalan borç).
- Para olmayan sayılar (adet, yüzde, süre) için kullanılmaz.
- Eksi tutar yalnız fiyat farkı ve düzeltmede `allowNegative` ile açılır.
- Tablo hücresinde `size="sm"` ve `className="text-right"` verilir.

**Tarih ve saat**
- `QuickDatePicker` yalnız ileri tarih içindir. Geçmiş günleri kapatmak için `min="today"`
  verilir. Değer "YYYY-MM-DD"dir; saat gerekiyorsa ayrı alan kullanılır.
- `TimeRangeInput` değeri kaydetmeden önce `timeRangeError(range)` ile denetlenir. İş kuralı
  hatası `error` prop'uyla verilir. Gece yarısını aşan aralık desteklenmez.

**Diğer form bileşenleri**
- `SaveBar` yalnız sayfa düzeyindeki uzun ayar formunda kullanılır, Modal içinde
  kullanılmaz.
- `PatientPicker`, hasta dosyasından açılan formda `locked` verilerek kilitlenir.
- `ImageUploadField`: logo için `shape="square"` (küçültme yapılmaz); kişi fotoğrafı için
  `shape="round" maxDimension={320}`. Yazma yetkisi yoksa `readOnly`.

### 2.5 Seçim kontrolleri: hangisi ne zaman

| Durum | Kullan | Örnek |
| --- | --- | --- |
| Açık/kapalı AYAR, anında etkiler | `Switch` (ayar satırında `SettingsRow toggle`) | "Ödeme hatırlatmalarını otomatik gönder" |
| Formda "bunu da yap" seçimi, "Kaydet" ile gider | `Checkbox` | "Bilgilendirme mesajı gönder" |
| Birlikte seçilebilen kısa seçenekler (en fazla 10) | `ToggleChips` | Hatırlatma günleri, kanallar |
| Birbirini dışlayan 2–6 seçenek | `ChoiceCards` (`pills` kısa, `cards` açıklamalı) | Ödeme yöntemi, cinsiyet |
| Sayılı durum süzgeci | `ChoiceCards variant="pills"` + `count` + `labelHidden` | Tümü · Gönderildi · Gönderilemedi 4 |
| 7 ve daha fazla seçenek | `Select` | İl, ünite |
| Uzun ya da aranarak bulunan liste | `SearchSelect` / `PatientPicker` / `DoctorSelect`; çoklu seçimde `SearchableListbox` | Firma, hasta, görev atananlar |
| Tablo ya da matris hücresi | Ham `<input type="checkbox">` (yalnız orada) | İzin matrisi |

```tsx
<Switch checked={on} onChange={setOn} label="Ödeme hatırlatmalarını otomatik gönder" description="Vadeden 3 gün önce ve vade günü" />
<Checkbox checked={sendInfo} onChange={setSendInfo} label="Bilgilendirme mesajı gönder" description="Randevu kaydedilince hastaya gider." />
<ToggleChips label="Vadeden kaç gün önce hatırlatılsın" options={[1, 3, 7, 14].map((d) => ({ value: d, label: `${d} gün` }))} value={days} onChange={setDays} error={days.length === 0 ? "En az bir gün seçin." : undefined} />
<ChoiceCards label="Ödeme yöntemi" variant="pills" value={method} onChange={setMethod} options={[{ value: "NAKIT", label: "Nakit" }, { value: "KART", label: "Kredi kartı" }]} />
<ChoiceCards label="Gönderim durumu" labelHidden variant="pills" value={status} onChange={setStatus} options={[{ value: "all", label: "Tümü" }, { value: "failed", label: "Gönderilemedi", count: 4, countTone: "critical" }]} />
```

- Durumu yazan "Açık / Kapalı" düğmesi yok; anahtarın etiketi eylemi anlatır.
- ChoiceCards ve ToggleChips sayacı CountBadge kuralına uyar: 0 gösterilmez, 99'dan
  büyükse "99+" yazılır.
- "Tümü" sayısı pager'daki toplamı tekrar ediyorsa verilmez.
- Zorunlu seçimde `required` verilir; `error` gönderme denemesinden sonra gösterilir.

### 2.6 Durumlar

| İhtiyaç | Kullan | Kullanma |
| --- | --- | --- |
| Sayfa yükleniyor (`loading.tsx`, Suspense) | `PageSkeleton` (`body`: `table`, `cards`, `form`, `detail`, `calendar`; telefonda farklı görünüm açılıyorsa `mobileBody`) | `PanelLoading` (yeni kodda), elle gri kutular, `animate-pulse`, satır satır gecikme |
| Sayfanın bir parçası yükleniyor | `ListTable loading`, `ListRowSkeleton variant="row"`, `FormSkeleton framed={false}`, `Skeleton` | Spinner ile boş ekran |
| Boş liste | `EmptyState` (ListTable `empty*`) | Elle "Kayıt yok" metni |
| Yükleme hatası | `LoadErrorState` (ListTable `error`) | Boş liste gibi görünen hata |
| Tam sayfa durum | `StatusPage` (`kind`: `forbidden`, `not-found`, `error`, `moved`, `redirect`) | Gri dev "404", elle kartlı hata kutusu |

```tsx
export default function Loading() { return <PageSkeleton toolbar body="table" />; } // hasta/loading.tsx
<PageSkeleton tabs={6} body="detail" label="Hasta dosyası yükleniyor" />
{loading ? <ListRowSkeleton variant="row" leading="icon" rows={4} /> : <SettingsList>…</SettingsList>}
<EmptyState title="Açık lab işi yok" description="Yeni iş kaydedilince burada görünür." icon={LabEmptyIcon} illustrative /> // const LabEmptyIcon = createSceneIllustration("lab");
<LoadErrorState message="Hastalar yüklenemedi." onRetry={load} />
<StatusPage kind="forbidden" headingAs="h2" actions={<Button href="/anasayfa">Ana sayfaya dön</Button>} />
```

**İskelet**
- Sıra sayfayla aynıdır: başlık → sekmeler → araç çubuğu → özet → içerik.
- Gerçek PageHeader zaten çiziliyse `header={false}` verilir.
- Sayfada birincil eylem yoksa `headerAction={false}` verilir.
- `stats` yalnız sayfada StatStrip varsa verilir.

**Boş liste**
- Liste filtre yüzünden boşsa EmptyState eylemi "Filtreleri temizle" olur.

**`StatusPage`**
- Yalnız tam sayfa durumlar içindir.
- PageHeader altında `headingAs="h2"` verilir. Panel kabuğu dışında `fullScreen`
  kullanılır.
- `code` yalnız destek içindir (digest, 404).

### 2.7 Kullanılmayacak eski parçalar

| Eski | Yerine |
| --- | --- |
| `Premium` (`StatsCard`, `AlertCard`, `SectionHeader`, `ActionList`, `EntityRow`, `ModuleEmptyState`) | `StatStrip`, `Callout`, `Section`, `ListTable`, `EmptyState` |
| `ProfessionalDataTable` | `ListTable` |
| `PanelLoading` | `PageSkeleton` |
| `ErrorFallback` | `StatusPage kind="error"` |
| `CountUp` | Yok; sayılar sayarak gelmez (§6) |
| Sayfada `FormErrorBanner` | FormModal `error`; sayfa formunda `Callout tone="critical" role="alert"` |
| `inputErrorClass` | FormField `error` |
| `components/muhasebe/ExportMenu`, `components/work-lists/ExportMenu` | `ui/ExportMenu` |

### 2.8 Prop adı farkları

Aşağıdaki farklar API donduğu için olduğu gibi kalır; doğru kullanım şöyledir:

- **Ekran okuyucu adı:** `Tabs`'ta `ariaLabel` (camelCase) yazılır. ActionMenu ("…"
  tetikleyicisi) ve ExportMenu'de ad `label`'dır; `<ActionMenu aria-label=…>` tsc'de hata
  vermez ama yok sayılır ve düğme "Diğer işlemler" kalır. Kendi etiketi olan alanlarda
  `label` (gerekirse `labelHidden`) kullanılır. StatStrip, SettingsList, StepList,
  ProgressBar, SearchInput ve Switch'te `aria-label` kullanılır.
- **İkon:** `PageHeader icon` bir modül anahtarı dizgesidir (`"flask"`). `Section`,
  `SettingsRow`, `Button`, `EmptyState`, `Badge`, `Callout` ise `icon` olarak lucide
  bileşeni alır.
- **Eylem yuvası:** tek eylem alanların adı `action`'dır (Callout, EmptyState,
  SettingsGroup). Birden çok eylem alanların adı `actions`'tır (PageHeader, Section,
  ListTable, SettingsRow, StatusPage, Toolbar, BulkActionBar, StepList adımı).
- **Başlık türü:** `Modal` `title` ve `description` yalnız string alır. `Drawer`, `Section`
  ve `ListTable` ReactNode alır.
- **Hata türü:** `FormField`, `ChoiceCards`, `ToggleChips`, `QuickDatePicker` ve
  `TimeRangeInput` `error` olarak yalnız `string | undefined` alır; `null` verilmez
  (`moneyInputError(...) ?? undefined`). `FormModal`, `ListTable`, `DateRangeFilter` ve
  `ImageUploadField` `null` kabul eder.
- **`onChange` olay değil değer verir:**

  | Bileşen | `onChange` değeri |
  | --- | --- |
  | Switch, Checkbox | boolean |
  | SearchInput, MoneyInput, QuickDatePicker | string |
  | TimeRangeInput | `{ start, end }` |
  | ToggleChips | dizi |
  | ChoiceCards, Tabs | anahtar |
  | DoctorSelect | id ve kişi |
  | Input, Select, Textarea | olay (yalnız bunlar) |

- **Meşgul durumu:** `Button` ve `ExportMenu`'de `loading`, `FormModal`'da `submitting`,
  `SaveBar`'da `saving`.
- **Kirli durumu:** `Modal` ve `FormModal`'da `isDirty`, `SaveBar`'da `dirty`.
- **Başlık düzeyi:** `Section` ve `StatusPage`'de `headingAs`, `ListTable`'da `titleAs`.
- **Ton adları:**

  | Bileşen | Tonlar |
  | --- | --- |
  | Badge, Callout, CountBadge, StatStrip, StatusPage | `critical`, `warning`, `success`, `info`, `neutral` |
  | ProgressBar | `info` yerine `primary` |
  | IconButton | `primary`, `neutral`, `danger`, `ghost` (kenarlıksız) |
  | Money | `auto`, `positive`, `plain` |

- **Öğe eylemi:** ActionMenu ve ExportMenu öğesinde `onSelect`, StatStrip öğesinde
  `onClick`, ActiveFilter öğesinde `onRemove`.
- **`SearchSelect`:** `className` verilmezse ortak alan görünümü (`ui-control`) kullanılır.
  Arama hatasında `error` satırının altında seçenekler (ör. "+ Yeni hasta ekle") seçilebilir
  kalır; `onRetry` verilirse "Tekrar dene" çıkar.
- **`Modal` footer'ı:** iki kez çizilir (biri telefon, biri masaüstü için). Footer'a `id`'li
  öğe konmaz.
- **`FormSection`:** `icon` zorunludur.

### 2.9 Bilinen bileşen sorunları

Bu sorunlar önizlemede doğrulandı ve bileşen sahibine iletildi. Düzeltilince bu liste
silinir. O zamana kadar sayfada elle yama yazılmaz; aşağıdaki geçici kurala uyulur.

| Sorun | Geçici kural |
| --- | --- |
| `SearchSelect` boş sorguda da odaklanınca açılır. Pencere ilk alana odaklandığı için PatientPicker ilk alansa ipucu listesi alttaki alanın etiketini ve hata yazısını örter. (Boş listedeki ilk Esc artık pencereye ulaşır.) | Şimdilik kabul edilir; sayfada odak sırası değiştirilmez. |
| PatientPicker hatalıyken kutusu kırmızı kenar almaz; yalnız hata yazısı görünür. | FormField `error` yine verilir; yazı görünür. |

## 3. Sözcükler

**Ekran adları**
- Menü: Ana sayfa · Randevular · Hastalar · Aramalar ve görevler · Laboratuvar · İletişim ·
  Muhasebe · Hakedişim · Raporlar · Fiyat listesi · Stok · Satın alma · Personel · Ayarlar ·
  İşlem kayıtları.
- Aramalar ve görevler sekmeleri "Hasta aramaları" ve "Ekip görevleri"dir. "Yapılacak" sözcüğü kullanılmaz:
  ana sayfa listesi ve zil "Bekleyen işler", hasta dosyasındaki bekleyen tedaviler "Planlanan tedaviler".
- Diğer ekranlar: Profilim · Destek.
- Hastanın tüm bilgilerinin bulunduğu ekran **Hasta dosyası**dır.

**Kavramlar**
- Satın alma menüdeki addır; tek firmanın sayfası Tedarikçi'dir.
- Bekleme salonu, gelen hastadır.
- Talepler, online talep ve bekleme listesidir.
- Bekleyen işler, zil panelidir.
- Rol adları Yönetici ve Doktor'dur.
- Hastadan alınan para **Tahsilat**, tedarikçiye ya da personele yapılan **Ödeme**dir.
- Alacaklar ekranının alt bölümleri Hastalar ve Taksitler'dir.

**Düğmeler**
- Yeni kayıt açan düğme "Yeni …" diye başlar: Yeni hasta, Yeni randevu, Yeni görev,
  Yeni lab işi, Yeni taksit planı, Yeni özel fiyat.
- Formu kaydeden düğme **Kaydet**'tir.
- Pencereyi kapatan ikincil düğme **Vazgeç**'tir. "İptal" randevu ve iş durumu olarak
  kullanıldığı için pencere düğmesinde kullanılmaz; "Planı iptal et" gibi bir işin adı
  olabilir.
- Salt okunur pencereyi kapatan düğme **Kapat**'tır.
- Silme yerine arşivleme yapılıyorsa düğme **Arşivle** der ve çöp kutusu ikonu kullanmaz.
- Diğer sabit düğme adları: Yeniden dene · Dışa aktar · Seçimi kaldır · Filtreleri temizle.
- Katlanır bölüm "Diğer bilgiler"dir.

**Değer biçimleri**

| Değer | Nasıl yazılır |
| --- | --- |
| Boş değer | Tek uzun çizgi "—", soluk renkte. `DescriptionList`, `EmptyValue`, `Money` ve `DateText` bunu kendisi yazar. Çift tire, "null", "undefined", "0" yazılmaz. |
| Para | `Money` / `formatCurrency` ile "₺1.250,00". Giriş için `MoneyInput`. |
| Tarih | `DateText` / `formatDateText` (`ui/Money`); Türkiye saatiyle, sunucuda ve istemcide aynı çıkar. `lib/format` `formatDate` saat dilimi belirtmez; render'da kullanılmaz. |
| Telefon | `formatPhoneNumber` |
| Dönem | `formatRangeLabel` ile "1–10 Eki 2026" |

**Yazım**
- Cümle düzeni kullanılır: yalnız ilk harf büyüktür ("Ödeme hatırlatmaları"). Başlıkta
  Her Kelimesi Büyük yazılmaz.
- Açıklama tek kısa cümledir. Placeholder etiketin yerine geçmez.
- Anahtar etiketi eylemi anlatır ("Ödeme hatırlatmalarını otomatik gönder").
- Hata mesajı ne olduğunu ve ne yapılacağını söyler: "Kaydedilemedi. Bağlantınızı kontrol
  edip yeniden deneyin." "Hata!" ya da İngilizce sunucu mesajı gösterilmez. "Tekrar
  deneyin" / "Lütfen tekrar deneyin" değil, "Yeniden deneyin" yazılır.
- ExportMenu `onSelect` ve ImageUploadField `onChange` içinde fırlatılan hatanın mesajı
  kullanıcıya gösterilir; Türkçe yazın. Tarayıcının ağ hatası (İngilizce "Failed to fetch")
  gösterilmez, yerine bileşenin Türkçe yedek metni çıkar.
- Onay penceresinde başlık bir sorudur ("Plan iptal edilsin mi?"). Açıklama sonucu söyler.
  Birincil düğme fiildir ("Planı iptal et", "Arşivle"), ikincil düğme "Vazgeç"tir.

**Adres parametreleri**
- Sekme `?tab=` ile tutulur; eski parametreler kabul edilmeye devam eder.
- Dönem `?donem=` (+`from`, `to`) ile tutulur.
- Yeni kayıt formu `?yeni=1` ile açılır (§5).

## 4. Düğme, eylem ve kaydetme

### 4.1 Düğme kuralı

**Kaç birincil düğme**
- Bir görünümde (sayfa başlığı, pencere, bölüm) en fazla bir birincil (dolu renkli) düğme
  olur.
- Sayfanın birincil eylemi PageHeader'dadır; aynı eylem sekmede ya da listede ikinci kez
  konmaz.

**Hangi variant ne için**

| Variant | Ne için |
| --- | --- |
| `secondary` | İkincil eylem |
| `ghost` | Bölüm ve satır içindeki hafif eylem ("Tümünü gör", "Metin") |
| `danger` | Ana eylemin kendisi geri alınamıyorsa (onay penceresindeki "Sil") |
| `danger-ghost` | Nadir ya da tehlikeli ikincil eylem (Arşivle, İptal et, Pasife al). Pencerede solda durur (FormModal `dangerAction`). |

**Satır eylemleri** (§9 K3)
- Satırda en fazla BİR görünür eylem olur (ör. "Geldi", "Laboratuvardan geldi"):
  `Button size="sm" variant="secondary"` ya da çerçevesiz `IconButton size="sm"`.
- Kalan eylemler (düzenle, pasife al, sil, yazdır…) satır sonundaki çerçevesiz `ActionMenu`
  "…" içine girer; eylem kaldırılmaz, taşınır. Tehlikeli eylem menüde en sonda durur ve
  `danger` + `separatorBefore` alır.
- Satıra tıklayınca ayrıntı açılıyorsa ayrıca "Aç/Düzenle" düğmesi konmaz.
- Sayfa düzeyinde ikiden fazla ikincil eylem varsa `ActionMenu trigger="button"` kullanılır.

**Diğer düğme kuralları**
- `IconButton`'da `title` zorunludur (ekran okuyucu adı ve ipucu).
- Dikkat isteyen sayı Button `count` ile gösterilir ("Bekleyenler 3"). Listede zaten görünen
  satır sayısı tekrar edilmez.
- Geri alınamaz iş `confirmDialog` ile onaylanır (`danger: true`).
- Çift tıklamayı `Button loading` ya da `FormModal submitting` önler. İdempotency anahtarı
  korunur.

### 4.2 Kaydetme modelleri

Bir ekranda aynı veri için tek kaydetme modeli kullanılır.

| Model | Ne zaman | Bileşen | Geri bildirim |
| --- | --- | --- | --- |
| Anında | Tek açık/kapalı ayar; satırdaki durum değişikliği ("Geldi", "Teslim alındı") | `SettingsRow toggle`, `Switch`, satır düğmesi | Değer hemen değişir. Hata olursa değer geri alınır ve hata söylenir. Başarıda ek bildirim yok. |
| Pencere | Yeni kayıt, düzenleme, gerekçeli işlem | `FormModal` | Kaydedince pencere kapanır, liste yerinde güncellenir. Hata olursa pencere açık kalır, veri kaybolmaz. |
| Sayfa formu | Aynı anda düzenlenen çok alanlı ayarlar | `FormSection` + `SaveBar` | Değişiklik varken altta Vazgeç/Kaydet çıkar. Vazgeç son kaydedilen değerlere döner. |

- Anında kaydeden anahtarın yanına "Kaydet" düğmesi konmaz.
- SaveBar'lı formdaki anahtar anında kaydetmez; değişikliği SaveBar'a bağlanır.
- Ayar satırının ayrıntısı (metin, zamanlama) satırdan açılan FormModal'da kaydedilir.
- Toast yalnız sonucu ekranda görünmeyen işlerde gösterilir ("SMS gönderildi").
- Kayıt sürerken pencere kapanmaz. Kapanıp yeniden açılırsa yeni işlem anahtarı üretilir ve
  aynı tahsilat iki kez kaydedilebilir.

## 5. Derin bağlantı ve hasta bağlamı

- Birincil "Yeni …" eylemi olan her liste sayfası `?yeni=1` ile açıldığında kendi oluşturma
  formunu açar.
- Hasta bağlamı varsa `patientId` (ve varsa `patientName`) ile hasta önceden seçilir. Üst
  bardaki "Yeni" menüsü bu bağlantıları kullanır.
- Hasta dosyasından açılan her form (randevu, tahsilat, lab işi, reçete, görev, takip) hasta
  seçili açılır. Bu formlarda `PatientPicker locked` kullanılır.
- Sekme `?tab=`, dönem `?donem=` ile adreste durur. Varsayılan değer adrese yazılmaz.
  Sayfa yenilense, bağlantı paylaşılsa ya da geri tuşuna basılsa kullanıcı aynı yere döner.
- Taşınan sayfanın eski adresi en az bir sürüm boyunca yönlendirmeyle çalışır. Sorgu
  parametreleri korunur (`yeni`, `patientId`, `patientName`); eski sekme değerleri yeni alt
  bölüme eşlenir.

## 6. Görsel sadelik, durum tonları, mobil

### 6.1 Sadelik

**Hareket**
- Sürekli tekrar eden animasyon yok: yüzen ikon, parlama, nabız.
- Hover'da parlama ya da zıplama yok.
- Satır satır gecikmeli giriş animasyonu yok.
- Sayılar sayarak gelmez.
- Hareket azaltma tercihine uyulur.

**Süs**
- Gölge ve gradyan yalnız katmanı ayırmak için kullanılır. Kart, pencere ya da bölüm
  üstünde süs şeridi ve gradyan yok.
- Kart içinde kart yok.
- İkon yalnız anlam taşıyorsa konur. Büyük renkli ikon kutusu ve hero yok.

**Yazı ağırlığı**
- Sayfa başlığı ve önemli sayı kalındır.
- Gövde metni normal ya da yarı kalındır.
- Bölüm başlığı her yerde aynı ölçüdedir (text-sm, extrabold).

### 6.2 Durum tonları

| Ton | Anlam | Örnek |
| --- | --- | --- |
| `critical` (kırmızı) | Sorun: gecikmiş, başarısız, gelmedi, engelleyen hata | Gecikti, Gelmedi, Gönderilemedi, "SMS gönderimi kapalı" |
| `warning` (amber) | Bakılması gereken: bekleyen, azalan, dikkat | Bekliyor (hasta salonda), Onay bekliyor, Kredi azaldı |
| `success` (yeşil) | Tamamlandı, olumlu sonuç | Tamamlandı, Ödendi, Gönderildi, Teslim alındı |
| `info` (marka rengi) | Planlı ya da açık iş, bilgi, seçim | Planlandı, Açık, Sonuç bekleniyor, "Formda seçilir" |
| `neutral` (gri) | Kapanmış, pasif ya da önemsiz | İptal, Pasif, Taslak |

- Aynı durum her ekranda aynı ad ve aynı tonla gösterilir. Durum → etiket ve ton haritası
  tek dosyadadır (ör. `lib/appointment-status.ts`). İki ekranda ayrı yazılmış harita
  birleştirilir.
- Renk tek başına anlam taşımaz; yanında metin ya da ikon da olur.
- Kırmızı yalnız gerçek sorun içindir. `Money tone="auto"` (eksi tutar kırmızı) yalnız
  eksinin sorun anlamına geldiği değerde kullanılır: bakiye, kalan borç, net sonuç. İndirim,
  ödeme, iade gibi doğası gereği eksi satırlarda `tone="plain"` kullanılır; yön işaretle ya
  da Badge ile gösterilir.
- Tonlar Badge, Callout, CountBadge, StatStrip ve StatusPage'de aynı anlamdadır.

### 6.3 Mobil (390 px)

**Liste ve araç çubuğu**
- Toolbar filtreleri telefonda "Filtreler (n)" düğmesinin arkasında katlanır; liste aşağı
  itilmez.
- Her ListTable'a `mobileCard` verilir; aynı liste ikinci kez elle yazılmaz.
- Telefonda gerekmeyen dışa aktarma `className="hidden sm:inline-flex"` ile gizlenir.

**Dokunma ve form**
- Dokunma alanı en az 36 px'tir. Bunu bileşenler sağlar; sayfada `min-h` yaması
  yazılmaz. Button `sm` her yerde (pencere, çekmece, bağlantı) 36 px'tir; görünüşü küçük
  kalan kontrol (sm çip, sm sekme) dokunmatikte görünmez kenarla (`ui-touch-target`) 36 px'e
  genişler.

**Klavye, odak ve katmanlar** (ortak bileşenler sağlar; sayfada elle yazılmaz)
- Esc ve Tab yalnız en üstteki katmanda işlenir. Açık menü, liste ya da ipucu Esc'i kendisi
  kullanır; altındaki pencere kapanmaz. Onay penceresindeki Esc yalnız onayı kapatır; alttaki
  form açık kalır. Kirli formda Esc onay sorar (bkz. §2.4 FormModal).
- Arama kutusundaki Enter içinde bulunduğu formu göndermez (SearchableListbox).
- Açılır menü ve liste kapanınca odak açan düğmeye döner; Tab menüyü kapatıp sıradaki
  öğeye geçer, odak pencerenin arkasına kaçmaz.
- Katman sırası `:root` belirteçleridir: `--z-drawer` 280 < `--z-modal` 300 < `--z-menu` 320 <
  `--z-popover` (ülke kodu) 330 < `--z-hint` (sütun ipucu) 340 < `--z-confirm` 350 <
  `--z-toast` 360 < `--z-tooltip` 400. Ortak bileşenler `z-[var(--z-…)]` kullanır; sayfada
  yeni z-index katmanı açılmaz.
- İpucu balonu (Tooltip/IconButton) fareyle üzerine gelince ve klavye odağında açılır;
  dokunmatikte dokununca açılmaz. Kapalıyken yerleşime girmez, ekran kenarına taşmaz.
- Odak halkası tam marka rengidir (zemine karşı en az 3:1); soluk halka kullanılmaz.
- Pasif öğe nedenini görünür yazar (`disabledReason`): menü öğesinin ve kartın altında,
  çip grubunun altında tek satır. Yalnız `title` yetmez (dokunmatikte görünmez).
- Hata bildirimi (toast) 8 sn, diğerleri 3 sn kalır. Açıkça verilen süre korunur.
- Giriş yazısı telefonda 16 px'tir (iOS yakınlaştırmasın). Formlar telefonda tek sütundur
  (`sm:grid-cols-2`).

**Pencere ve yerleşim**
- Modal telefonda alttan açılır ve footer'ı yapışıktır; içerik footer'ın altından görünmez,
  odaklanan alan footer'ın altında kalmaz. Drawer `md` ve `lg` telefonda tam genişliktedir.
- Yatay taşma olmaz. Uzun metin `truncate` ya da `break-words` ile sarılır.
- Her ekran 1280 ve 390 genişlikte gözle kontrol edilir.

## 7. Dokunulmayacaklar

**İzin ve kurum sınırları**
- Yetki kontrolleri (`requireAuth`, `can(...)`) ve rol/izin matrisi değişmez.
- Kullanılamayan düğme ve bağlantı yetkiye göre gizlenir.
- Kurum ve şube filtresi (`institutionId`) her sorguda korunur.

**Para ve kayıt güvenliği**
- Finans ledger, idempotency ve transaction mantığı değişmez.
- Para `Prisma.Decimal` ya da metin olarak işlenir; JS `number` ile hesap yapılmaz.

**İletişim ve kişisel veri**
- Hastaya her mesaj yalnız `dispatchPatientMessage` üzerinden gider ve SMS izni denetlenir.
- KVKK maskeleme ve `PatientAccessLog` korunur.

**Mevcut davranış**
- "Kullanıcı geri bildirimi" yorumuyla gerekçelendirilmiş iş kuralları korunur.
- Başka ekranın kullandığı API yanıtından alan kaldırılmaz ve adı değiştirilmez; yalnız alan
  eklenir.
- Özellik kaldırılmaz; sadeleştirme doğru yere taşımaktır.
- Görsel düzenleme işlev doğrulamasının yerine geçmez.

## 8. Yeni ya da değişen ekran kontrol listesi

- [ ] **Dört rol:** Ekranı resepsiyon, doktor, yönetici ve muhasebeci gözüyle yürüdüm.
      Her öğe birinin işine yarıyor. Doktorun önüne finans, muhasebecinin önüne klinik
      ayrıntısı çıkmıyor.
- [ ] **İskelet:** Sıra PageHeader → Tabs → Toolbar → içerik. Ekranda tek birincil eylem
      var. Başlık tekrar etmiyor.
- [ ] **Tekrar yok:** Aynı bilgi, sayı ya da uyarı tek yerde. Listeyi tekrar eden sayaç ya
      da kart yok. Aynı forma tek giriş var.
- [ ] **Anlaşılır:** Etiketler §3 sözlüğünde. Kod adı, ham ISO tarih ya da teknik terim
      yok. Seyrek alanlar "Diğer bilgiler"de. API'nin kullanmadığı alan yok.
- [ ] **Veri girişi:**
  - Zorunlular üstte ve az. İlk alana odaklanıyor, Enter kaydediyor.
  - Akıllı varsayılan var: bugün, oturumdaki doktor, hasta bağlamı, son seçim.
  - Hatada veri kaybolmuyor. Çift tıklama çift kayıt üretmiyor.
- [ ] **Doğru kontrol:** §2.5'e göre seçildi. Tutar MoneyInput ile, ileri tarih
      QuickDatePicker ile, saat aralığı TimeRangeInput ile giriliyor. Uzun açılır liste yok.
- [ ] **Ortak bileşen:** Elle tablo, kart, uyarı kutusu, sekme, sayaç, menü ya da iskelet
      yok. Prop'lar §2.8'e göre yazıldı; §2.9'daki geçici kurallara uyuldu.
- [ ] **Durumlar:**
  - Yükleniyor görünümü gerçek düzende.
  - Boş durumda EmptyState var; filtre yüzünden boşsa "Filtreleri temizle" çıkıyor.
  - İlk hatada `error` ve Yeniden dene, yenileme hatasında `staleError` var.
  - Bilinmeyen sayı 0 ya da ₺0 görünmüyor.
- [ ] **Hız:**
  - Açılışta şelale yok; aynı istek iki kez gitmiyor.
  - Görünmeyen veri çekilmiyor. Arama debounce'lu. Sık yoklama yok.
  - Önizlemedeki API listesi temiz.
- [ ] **Kararlılık:**
  - Render sırasında `new Date()`, `Date.now()`, `toLocale*`, `localStorage` yok.
  - Veri gelince ekran zıplamıyor.
  - Pencere kapanınca liste ve filtreler yerinde kalıyor.
- [ ] **Mobil ve erişilebilirlik:**
  - 390 px'te yatay taşma yok. `mobileCard` var, filtreler katlanıyor.
  - IconButton'ların `title`'ı var. Odak görünüyor. Renk tek başına anlam taşımıyor.
  - 1280 ve 390 ekran görüntüleri gözle kontrol edildi.
- [ ] **Güvenlik ve doğrulama:**
  - §7 korundu: yetki, kurum ve şube filtresi, ledger, SMS izni. Özellik kaldırılmadı.
  - ESLint ve tsc temiz, ilgili regresyon testleri geçiyor.

## 9. Sadelik kuralları (2026-10 sadelik turu)

Ürün sahibinin geri bildirimi: "hâlâ çok karmaşık, iç içe veriler var, çok boğuk." Amaç aynı
bilgi ve eylemlerle daha ferah, okunaklı ekranlardır. Kurallar her sayfaya uygulanır; ortak
bileşenler bunların çoğunu kendiliğinden sağlar (aşağıdaki "Bileşen" sütunu). Sayfada elle
yama yazılmaz; eksik görülen bileşen isteği bildirilir.

| Kural | İçerik | Bileşen / kanca |
| --- | --- | --- |
| **K1 Tek çerçeve** | Bir bilgi bloğu en fazla TEK çerçevedir. Kart içinde kart ya da çerçeveli alan açılmaz; iç bölümler başlık + ince ayırıcıyla ayrılır. Liste sayfasında araç çubuğu ve tablo aynı karttadır. | ListTable `toolbar` yuvası; Toolbar `bare`; `SectionDivider` (Section içinde kenardan kenara çizgi); `.ui-surface` tek ince kenarlık, gölge neredeyse yok |
| **K2 Sekmeler düz** | Sayfa sekmeleri alt çizgili düz sekmedir (çerçeveli hap kutusu yok). Kart/pencere içi alt bölüm ve durum süzgeci küçük, çerçevesiz segment ya da çiptir; iki kat alt çizgili sekme görünmez. | `Tabs` (md alt çizgi, `size="sm"` segment); bilgi amaçlı sayaç düz rakam, eylem gerektiren sayaç rozet; `ChoiceCards variant="pills"` 32 px sakin çip |
| **K3 Satır eylemleri** | Tablo satırında çerçeveli ikon düğme yok. En fazla BİR görünür eylem; diğerleri satır sonundaki çerçevesiz "…" menüsündedir. Eylem kaldırılmaz, taşınır. Satıra tıklayınca ayrıntı açılıyorsa ayrıca "Aç/Düzenle" düğmesi gerekmez. | `ActionMenu` "…" çerçevesiz; satırda IconButton her ton çerçevesiz ve 32 px (`data-tone`); eylem sütunu içeriği kadar dar, başlığı görsel olarak gizli; telefonda `mobileCardActions` ile "…" kartın sağ üstünde |
| **K4 Hücre en fazla 2 satır** | Ana bilgi + kısa yardımcı satır. Rozetin söylediğini metin tekrar etmez; uzun teknik metin kısaltılır ya da ayrıntıya taşınır. Her satırda aynı olan yardımcı bilgi (cinsiyet, maskeli TC) yalnız gerektiğinde. | Sayfa düzeyi |
| **K5 Boş ve aynı değer gösterilmez** | "—", "Kullanılmadı", "Görüşülmedi", "0" gibi değerler boş bırakılır ya da sütun kalkar; istisna olan durum gösterilir ("8 randevu"). | Sayfa düzeyi |
| **K6 Özet sayılar tek şerit** | Ayrı ayrı kutular değil, tek çerçeve içinde ince ayırıcılı şerit; telefonda aynı çerçevede 2'li ızgara. Başka yerde görünen sayı tekrar etmez. | `StatStrip` (seçili süzgeç hücresi alttan marka çizgisi alır); `StatsSkeleton` aynı düzende |
| **K7 En fazla bir uyarı şeridi** | Platform ödeme uyarısı tam şerit olarak yalnız Ana sayfa ve Ayarlar'da; diğer sayfalarda üst barda küçük gösterge (tıklayınca aynı bilgi ve "Destek'e yaz"; telefonda zil penceresinde). Telefonda şerit tek satırdır, "Destek'e yaz" satır içindedir. Ödeme süresi dolup kayıt kapandıysa her sayfada TEK satır görünür (kaydetmeyi etkilediği için gizlenmez). Sayfa uyarıları kısa tek satırdır (başlık + tek cümle), eylemle. | `layout/billing-status-banner` (`BillingStatusBanner`, `BillingNoticeButton`, `BillingNoticeDetails`); `Callout inline` (eylem telefonda da aynı satırda) |
| **K8 Başlık sade** | Sayfa başlığı altındaki açıklama cümlesi kalkar; başlıkta yalnız gerçekten karar verdiren tek bilgi kalır. | `PageHeader` `description` yalnız gerekiyorsa |
| **K9 Yoğunluk ve ritim** | Tek satırlı tablo satırı ~48 px, iki satırlı ~52–56 px; hücre içi dikey boşluklar tutarlıdır. Telefonda kart satırında eylemler ayrı sıra oluşturmaz. | ListTable hücresi `h-12 py-2`; satırdaki ikon düğmeleri 32 px; `mobileCardActions` |
| **K10 Özellik kaybı yok** | Hiçbir eylem ya da bilgi silinmez; menüye, ayrıntı penceresine ya da `Disclosure`'a taşınır. Yetki kontrolleri, onaylar, API çağrıları ve idempotency aynen kalır. Test betiklerindeki erişilebilir adlar korunur ya da test beklentisi güncellenir. | — |

```tsx
// Liste sayfası: araç çubuğu + tablo TEK kart; satırda tek görünür eylem + çerçevesiz "…"
<ListTable
  toolbar={<Toolbar filters={…} filterCount={n} actions={<ExportMenu size="md" onExcel={exportExcel} />}><SearchInput … /></Toolbar>}
  columns={[…, { key: "islem", header: "İşlem", align: "right", render: (r) => <div className="flex justify-end gap-1"><Button size="sm" variant="secondary">Geldi</Button><ActionMenu label={`${r.name} — diğer işlemler`} items={menuItems(r)} /></div> }]}
  mobileCard={(r) => <RowCard row={r} />}            // "…" burada çizilmez
  mobileCardActions={(r) => <ActionMenu label={`${r.name} — diğer işlemler`} items={menuItems(r)} />}
  …
/>
// Liste dışında araç çubuğu: <Toolbar bare>…</Toolbar>
// Kart içi bölümler: <Section title="Tedavi ekle">…<SectionDivider />…</Section>
// Tek satırlık sayfa uyarısı: <Callout tone="warning" compact inline title="SMS krediniz bitti" action={<Button size="sm" variant="ghost" href="/sms?tab=ayarlar">Kredi al</Button>} />
```

**Notlar**
- Yeni prop'lar isteğe bağlıdır ve geriye uyumludur: ListTable `toolbar`,
  `mobileCardActions`; Toolbar `bare`; Callout `inline`; Section dosyasında `SectionDivider`.
  Var olan prop kaldırılmadı ya da adı değişmedi; ayrı kart olarak duran Toolbar eskisi gibi
  çalışır (yalnız gölgesi hafifledi).
- `IconButton` ve ActionMenu "…" tetikleyicisi `data-tone` taşır; liste satırındaki çerçevesiz
  görünüm globals.css "SADELİK TURU" bölümündedir. Sayfada `border`/`bg-white` yamasıyla
  satır ikonuna yeniden çerçeve verilmez.
