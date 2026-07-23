import { Role } from "@prisma/client";

export const MANAGEABLE_ROLES: Role[] = [
  "YONETICI",
  "DOKTOR",
  "ASISTAN",
  "BANKO",
  "MUHASEBE",
];

export const ROLE_META: Record<string, { label: string; color: string; description: string }> = {
  YONETICI:  { label: "Yönetici",  color: "violet", description: "Klinik yöneticisi — finans dahil tüm modüllere tam erişim." },
  DOKTOR:    { label: "Doktor",    color: "blue",   description: "Muayene, tedavi ve hasta yönetiminde tam yetki; finans kısıtlı." },
  ASISTAN:   { label: "Asistan",   color: "teal",   description: "Randevu ve hasta kaydı odaklı; klinik not girebilir, finans göremez." },
  BANKO:     { label: "Banko",     color: "amber",  description: "Ön büro personeli — randevu, hasta iletişimi, takip ve tahsilat odaklı erişim." },
  MUHASEBE:  { label: "Muhasebe",  color: "emerald","description": "Finans, muhasebe ve raporlar; hasta klinik verilerine erişim yok." },
};

export type PermissionGroup = {
  key: string;
  label: string;
  icon: string;
  category: "klinik" | "finans" | "yonetim" | "iletisim" | "sistem";
  permissions: string[];
};

export type PermissionDetail = {
  code: string;
  title: string;
  description: string;
  risk: "yuksek" | "orta" | "dusuk";
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  // ── KLİNİK ──────────────────────────────────────────────────────────────
  { key: "appointments",   icon: "📅", category: "klinik",   label: "Randevu Yönetimi",        permissions: ["appointments:read", "appointments:write", "appointments:delete", "appointments:approve"] },
  { key: "patients",       icon: "🧑‍⚕️", category: "klinik",  label: "Hasta Kaydı",             permissions: ["patients:read", "patients:write", "patients:delete", "patients:phone", "patients:merge"] },
  { key: "examinations",   icon: "🔬", category: "klinik",   label: "Muayene",                 permissions: ["examinations:read", "examinations:write", "examinations:delete"] },
  { key: "treatment",      icon: "🦷", category: "klinik",   label: "Tedavi Planı",            permissions: ["treatment:read", "treatment:write", "treatment:delete", "treatment:approve"] },
  { key: "prescriptions",  icon: "💊", category: "klinik",   label: "Reçete",                  permissions: ["prescriptions:read", "prescriptions:write", "prescriptions:print"] },
  { key: "lab",            icon: "🧪", category: "klinik",   label: "Laboratuvar",             permissions: ["lab:read", "lab:write", "lab:delete", "lab:complete"] },
  { key: "xray",           icon: "🩻", category: "klinik",   label: "Görüntüleme / Röntgen",   permissions: ["xray:read", "xray:write", "xray:delete"] },
  { key: "hastatracking",  icon: "📍", category: "klinik",   label: "Hasta Takip Paneli",      permissions: ["hastatracking:read", "hastatracking:write"] },
  { key: "documents",      icon: "📎", category: "klinik",   label: "Hasta Belgeleri",         permissions: ["documents:read", "documents:write", "documents:delete"] },
  // ── FİNANS ──────────────────────────────────────────────────────────────
  { key: "payments",       icon: "💳", category: "finans",   label: "Ödeme ve Tahsilat",       permissions: ["payments:read", "payments:write", "payments:refund"] },
  { key: "installments",   icon: "🗓️", category: "finans",  label: "Taksit Planı",            permissions: ["installments:read", "installments:write", "installments:delete"] },
  { key: "finance",        icon: "📊", category: "finans",   label: "Finans / Muhasebe",       permissions: ["finance:read", "finance:write", "finance:export"] },
  { key: "stock",          icon: "📦", category: "finans",   label: "Stok ve Malzeme",         permissions: ["stock:read", "stock:write", "stock:delete"] },
  { key: "prices",         icon: "💰", category: "finans",   label: "Fiyat Listesi",           permissions: ["prices:read", "prices:write"] },
  { key: "reports",        icon: "📈", category: "finans",   label: "Raporlar ve İstatistik",  permissions: ["reports:read", "reports:write", "reports:export"] },
  // ── YÖNETİM ─────────────────────────────────────────────────────────────
  { key: "staff",          icon: "👥", category: "yonetim",  label: "Personel Yönetimi",       permissions: ["staff:read", "staff:write", "staff:delete", "staff:schedule"] },
  { key: "dashboard",      icon: "🏠", category: "yonetim",  label: "Ana Panel",               permissions: ["dashboard:read", "dashboard:stats"] },
  { key: "audit",          icon: "🔍", category: "yonetim",  label: "Denetim Günlüğü",         permissions: ["audit:read", "audit:export"] },
  // ── İLETİŞİM ────────────────────────────────────────────────────────────
  { key: "sms",            icon: "📱", category: "iletisim", label: "SMS Gönderimi",           permissions: ["sms:read", "sms:write", "sms:bulk"] },
  { key: "messages",       icon: "💬", category: "iletisim", label: "Dahili Mesajlar",         permissions: ["messages:read", "messages:write"] },
  { key: "announcements",  icon: "📢", category: "iletisim", label: "Duyurular",               permissions: ["announcements:read", "announcements:write"] },
  { key: "support",        icon: "🎧", category: "iletisim", label: "Destek Talepleri",        permissions: ["support:read", "support:write", "support:close"] },
  // ── SİSTEM ──────────────────────────────────────────────────────────────
  { key: "settings",       icon: "⚙️", category: "sistem",  label: "Sistem Ayarları",         permissions: ["settings:read", "settings:write"] },
  { key: "profile",        icon: "👤", category: "sistem",  label: "Kişisel Profil",          permissions: ["profile:read", "profile:write", "profile:password"] },
];

export const ALL_PERMISSIONS = Array.from(
  new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions))
);

export const PERMISSION_DETAILS: Record<string, PermissionDetail> = {
  // ── ANA PANEL ────────────────────────────────────────────────────────────
  "dashboard:read":         { code: "dashboard:read",         risk: "dusuk",   title: "Ana Panel — Görüntüleme",                     description: "Günlük özet metrikleri, randevu sayısı, kasa durumu ve genel klinik istatistiklerini görebilir." },
  "dashboard:stats":        { code: "dashboard:stats",        risk: "dusuk",   title: "Ana Panel — İleri İstatistikler",              description: "Gelir-gider grafikleri, doktor performansı ve klinik trend analizlerini görebilir." },
  // ── RANDEVU ──────────────────────────────────────────────────────────────
  "appointments:read":      { code: "appointments:read",      risk: "dusuk",   title: "Randevu — Listeleme ve Görüntüleme",          description: "Randevu takvimini açabilir, günlük/haftalık randevu listesini görebilir, randevu detaylarını inceleyebilir." },
  "appointments:write":     { code: "appointments:write",     risk: "orta",    title: "Randevu — Oluşturma ve Düzenleme",            description: "Yeni randevu ekleyebilir, mevcut randevunun tarih/saat/doktor bilgisini değiştirebilir, randevuyu tamamlandı olarak işaretleyebilir." },
  "appointments:delete":    { code: "appointments:delete",    risk: "yuksek",  title: "Randevu — Silme",                             description: "Randevu kaydını kalıcı olarak silebilir. Dikkat: silinen randevular geri alınamaz." },
  "appointments:approve":   { code: "appointments:approve",   risk: "orta",    title: "Randevu — Onaylama / İptal",                  description: "Bekleyen randevuları onaylayabilir veya iptal edebilir; hasta bilgilendirme SMS'i tetikleyebilir." },
  // ── HASTA ────────────────────────────────────────────────────────────────
  "patients:read":          { code: "patients:read",          risk: "dusuk",   title: "Hasta — Kart Görüntüleme",                   description: "Hasta listesini açabilir, hasta kartını görebilir. Telefon numarası bu yetkiyle gizlidir." },
  "patients:write":         { code: "patients:write",         risk: "orta",    title: "Hasta — Kayıt Oluşturma ve Düzenleme",       description: "Yeni hasta ekleyebilir, ad/soyad/doğum tarihi/adres gibi bilgileri güncelleyebilir." },
  "patients:delete":        { code: "patients:delete",        risk: "yuksek",  title: "Hasta — Silme",                              description: "Hasta kaydını sistemden kalıcı olarak silebilir. Bu işlem KVKK kapsamında loglanır." },
  "patients:phone":         { code: "patients:phone",         risk: "yuksek",  title: "Hasta — Telefon Numarası Görüntüleme",        description: "Hasta telefon numarasını açık biçimde görebilir. Bu yetki olmadan numara *** ile gizlenir. KVKK uyumu için dikkatli kullanın." },
  "patients:merge":         { code: "patients:merge",         risk: "yuksek",  title: "Hasta — Kayıt Birleştirme",                  description: "Mükerrer hasta kayıtlarını tek kayıtta birleştirebilir. Geri alınamaz bir işlemdir." },
  // ── MUAYENE ──────────────────────────────────────────────────────────────
  "examinations:read":      { code: "examinations:read",      risk: "dusuk",   title: "Muayene — Kayıt Görüntüleme",                description: "Hastanın muayene geçmişini, klinik notları ve bulguları görebilir." },
  "examinations:write":     { code: "examinations:write",     risk: "orta",    title: "Muayene — Kayıt Oluşturma ve Düzenleme",     description: "Yeni muayene kaydı açabilir, klinik not girebilir, tanı ve tedavi notlarını güncelleyebilir." },
  "examinations:delete":    { code: "examinations:delete",    risk: "yuksek",  title: "Muayene — Kayıt Silme",                      description: "Muayene kaydını kalıcı olarak silebilir. Klinik kayıtların bütünlüğü açısından bu yetki kritiktir." },
  // ── TEDAVİ PLANI ─────────────────────────────────────────────────────────
  "treatment:read":         { code: "treatment:read",         risk: "dusuk",   title: "Tedavi Planı — Görüntüleme",                 description: "Hastanın tedavi planını, diş/bölge bazlı işlemleri ve tedavi ilerlemesini görebilir." },
  "treatment:write":        { code: "treatment:write",        risk: "orta",    title: "Tedavi Planı — Oluşturma ve Düzenleme",      description: "Yeni tedavi planı oluşturabilir, plana işlem ekleyebilir, işlem durumunu günceller ve planı sonlandırabilir." },
  "treatment:delete":       { code: "treatment:delete",       risk: "yuksek",  title: "Tedavi Planı — Silme",                       description: "Tedavi planı kaydını kalıcı olarak silebilir." },
  "treatment:approve":      { code: "treatment:approve",      risk: "yuksek",  title: "Tedavi Planı — Onaylama",                    description: "Hazırlanan tedavi planını yönetici onayından geçirebilir ve hastaya sunabilir." },
  // ── REÇETE ───────────────────────────────────────────────────────────────
  "prescriptions:read":     { code: "prescriptions:read",     risk: "dusuk",   title: "Reçete — Görüntüleme",                       description: "Hastaya yazılmış reçete geçmişini ve ilaç listesini görebilir." },
  "prescriptions:write":    { code: "prescriptions:write",    risk: "orta",    title: "Reçete — Yazma ve Düzenleme",                description: "Yeni reçete oluşturabilir, ilaç ve doz bilgisi girebilir." },
  "prescriptions:print":    { code: "prescriptions:print",    risk: "dusuk",   title: "Reçete — Yazdırma",                          description: "Oluşturulan reçeteleri PDF olarak indirebilir veya yazıcıya gönderebilir." },
  // ── LABORATUVAR ───────────────────────────────────────────────────────────
  "lab:read":               { code: "lab:read",               risk: "dusuk",   title: "Laboratuvar — Sipariş Görüntüleme",          description: "Lab siparişlerini, gönderi durumlarını ve sonuçları görebilir." },
  "lab:write":              { code: "lab:write",              risk: "orta",    title: "Laboratuvar — Sipariş Oluşturma",            description: "Yeni lab siparişi oluşturabilir, sipariş bilgisi düzenleyebilir." },
  "lab:delete":             { code: "lab:delete",             risk: "yuksek",  title: "Laboratuvar — Sipariş Silme",                description: "Lab siparişini sistemden kalıcı olarak silebilir." },
  "lab:complete":           { code: "lab:complete",           risk: "orta",    title: "Laboratuvar — Teslim Alma / Tamamlama",      description: "Lab siparişini tamamlandı olarak işaretleyebilir, sonuç notları girebilir." },
  // ── GÖRÜNTÜLEME / RÖNTGEN ─────────────────────────────────────────────────
  "xray:read":              { code: "xray:read",              risk: "dusuk",   title: "Görüntüleme — İnceleme",                     description: "Röntgen ve diğer görüntüleme dosyalarını görüntüleyebilir." },
  "xray:write":             { code: "xray:write",             risk: "orta",    title: "Görüntüleme — Yükleme ve Düzenleme",         description: "Röntgen ve görüntüleme dosyası yükleyebilir, etiketleyebilir ve notlayabilir." },
  "xray:delete":            { code: "xray:delete",            risk: "yuksek",  title: "Görüntüleme — Silme",                        description: "Görüntüleme dosyasını kalıcı olarak silebilir. Bu işlem geri alınamaz." },
  // ── HASTA TAKİP ───────────────────────────────────────────────────────────
  "hastatracking:read":     { code: "hastatracking:read",     risk: "dusuk",   title: "Hasta Takip — Görüntüleme",                  description: "Gelmeyen, ulaşılamayan ve geri arama listesindeki hastaları takip edebilir." },
  "hastatracking:write":    { code: "hastatracking:write",    risk: "orta",    title: "Hasta Takip — Güncelleme",                   description: "Hasta takip durumunu değiştirebilir, arama notu ekleyebilir, takip kaydını tamamlayabilir." },
  // ── BELGELER ─────────────────────────────────────────────────────────────
  "documents:read":         { code: "documents:read",         risk: "dusuk",   title: "Hasta Belgeleri — Görüntüleme",              description: "Hasta dosyalarını, yüklü belgeleri ve görüntüleri indirebilir veya görebilir." },
  "documents:write":        { code: "documents:write",        risk: "orta",    title: "Hasta Belgeleri — Yükleme ve Düzenleme",     description: "Hasta için belge, dosya veya görüntü yükleyebilir; mevcut belgeler üzerinde düzenleme yapabilir." },
  "documents:delete":       { code: "documents:delete",       risk: "yuksek",  title: "Hasta Belgeleri — Silme",                    description: "Hasta belgesini kalıcı olarak silebilir. KVKK kapsamında loglanır." },
  // ── ÖDEME ────────────────────────────────────────────────────────────────
  "payments:read":          { code: "payments:read",          risk: "dusuk",   title: "Ödeme — Geçmiş ve Detay Görüntüleme",       description: "Kasa hareketlerini, tahsilat geçmişini ve ödeme yöntemlerini görebilir." },
  "payments:write":         { code: "payments:write",         risk: "orta",    title: "Ödeme — Tahsilat Alma ve Düzenleme",         description: "Nakit, kart veya diğer yöntemlerle tahsilat alabilir, ödeme kaydı ekleyebilir ve düzeltme yapabilir." },
  "payments:refund":        { code: "payments:refund",        risk: "yuksek",  title: "Ödeme — İade İşlemi",                        description: "Alınan ödemeyi iade edebilir. Bu işlem muhasebe kayıtlarını etkiler; dikkatli kullanılmalıdır." },
  // ── TAKSİT ───────────────────────────────────────────────────────────────
  "installments:read":      { code: "installments:read",      risk: "dusuk",   title: "Taksit Planı — Görüntüleme",                 description: "Hastanın taksit planını, ödeme takvimini ve gecikme durumlarını görebilir." },
  "installments:write":     { code: "installments:write",     risk: "orta",    title: "Taksit Planı — Oluşturma ve Düzenleme",      description: "Yeni taksit planı kurabilir, taksit tutarlarını ve tarihlerini düzenleyebilir, tahsilat yapar." },
  "installments:delete":    { code: "installments:delete",    risk: "yuksek",  title: "Taksit Planı — Silme",                       description: "Taksit planını sistemden tamamen kaldırabilir." },
  // ── FİNANS ───────────────────────────────────────────────────────────────
  "finance:read":           { code: "finance:read",           risk: "orta",    title: "Finans — Gelir/Gider Görüntüleme",           description: "Muhasebe özetini, gelir-gider cetvelini, cari hesapları ve finansal raporları görebilir." },
  "finance:write":          { code: "finance:write",          risk: "yuksek",  title: "Finans — Muhasebe Kaydı Düzenleme",          description: "Gider kaydı ekleyebilir, cari hesap hareketi girebilir ve muhasebe düzenlemesi yapabilir." },
  "finance:export":         { code: "finance:export",         risk: "yuksek",  title: "Finans — Dışa Aktarma",                      description: "Finansal verileri Excel/PDF olarak dışa aktarabilir. Hassas veri içerir." },
  // ── STOK ─────────────────────────────────────────────────────────────────
  "stock:read":             { code: "stock:read",             risk: "dusuk",   title: "Stok — Envanter Görüntüleme",                description: "Malzeme ve ürün stok durumunu, kritik stok uyarılarını görebilir." },
  "stock:write":            { code: "stock:write",            risk: "orta",    title: "Stok — Giriş/Çıkış İşlemleri",              description: "Stok girişi yapabilir, malzeme çıkışı kaydedebilir, yeni ürün ekleyebilir ve stok miktarını günceller." },
  "stock:delete":           { code: "stock:delete",           risk: "yuksek",  title: "Stok — Ürün Silme",                          description: "Stok kaydını kalıcı olarak silebilir." },
  // ── FİYAT ────────────────────────────────────────────────────────────────
  "prices:read":            { code: "prices:read",            risk: "dusuk",   title: "Fiyat Listesi — Görüntüleme",                description: "Tedavi ve hizmet fiyatlarını, kampanya ve iskonto bilgilerini görebilir." },
  "prices:write":           { code: "prices:write",           risk: "yuksek",  title: "Fiyat Listesi — Düzenleme",                  description: "Hizmet fiyatı ekleyebilir, güncelleyebilir; fiyat politikasında değişiklik yapabilir." },
  // ── RAPORLAR ─────────────────────────────────────────────────────────────
  "reports:read":           { code: "reports:read",           risk: "orta",    title: "Raporlar — Görüntüleme",                     description: "Klinik performans, hasta ve finansal raporları açıp inceleyebilir." },
  "reports:write":          { code: "reports:write",          risk: "orta",    title: "Raporlar — Özel Rapor Oluşturma",            description: "Özel rapor parametrelerini belirleyebilir ve özel rapor oluşturabilir." },
  "reports:export":         { code: "reports:export",         risk: "yuksek",  title: "Raporlar — Dışa Aktarma",                    description: "Raporları Excel, PDF veya CSV formatında dışarı aktarabilir. Toplu hasta verisi içerebilir." },
  // ── PERSONEL ─────────────────────────────────────────────────────────────
  "staff:read":             { code: "staff:read",             risk: "dusuk",   title: "Personel — Liste ve Bilgi Görüntüleme",      description: "Çalışan listesini, görev atamalarını ve personel profillerini görebilir." },
  "staff:write":            { code: "staff:write",            risk: "yuksek",  title: "Personel — Ekleme ve Düzenleme",             description: "Yeni personel ekleyebilir, bilgilerini güncelleyebilir, rol atayabilir veya hesabı pasife alabilir." },
  "staff:delete":           { code: "staff:delete",           risk: "yuksek",  title: "Personel — Hesap Silme",                     description: "Personel hesabını kalıcı olarak silebilir. Bu işlem geri alınamaz." },
  "staff:schedule":         { code: "staff:schedule",         risk: "orta",    title: "Personel — Vardiya / Çalışma Saati Ayarı",   description: "Personelin haftalık çalışma saatlerini ve vardiya planını düzenleyebilir." },
  // ── DENETİM ──────────────────────────────────────────────────────────────
  "audit:read":             { code: "audit:read",             risk: "orta",    title: "Denetim Günlüğü — Görüntüleme",              description: "Sistemde yapılan tüm işlemlerin kayıtlarını (kim, ne zaman, ne yaptı) görebilir." },
  "audit:export":           { code: "audit:export",           risk: "yuksek",  title: "Denetim Günlüğü — Dışa Aktarma",             description: "Denetim kayıtlarını dışarı aktarabilir. Tüm kullanıcı aktivitelerini içerir." },
  // ── SMS ──────────────────────────────────────────────────────────────────
  "sms:read":               { code: "sms:read",               risk: "dusuk",   title: "SMS — Geçmiş Görüntüleme",                   description: "Gönderilen SMS'leri, iletim durumlarını ve SMS bakiyesini görebilir." },
  "sms:write":              { code: "sms:write",              risk: "orta",    title: "SMS — Gönderme",                             description: "Tek bir hastaya veya gruba SMS gönderebilir, otomatik SMS kuralları oluşturabilir." },
  "sms:bulk":               { code: "sms:bulk",               risk: "yuksek",  title: "SMS — Toplu Gönderim",                       description: "Tüm hasta listesine veya seçili gruba toplu SMS gönderebilir. SMS bakiyesini tüketir; dikkatli kullanın." },
  // ── MESAJLAR ─────────────────────────────────────────────────────────────
  "messages:read":          { code: "messages:read",          risk: "dusuk",   title: "Dahili Mesajlar — Okuma",                    description: "Ekip içi dahili mesajları ve bildirimleri okuyabilir." },
  "messages:write":         { code: "messages:write",         risk: "dusuk",   title: "Dahili Mesajlar — Gönderme",                 description: "Ekip içi mesaj gönderebilir, mesaja yanıt verebilir." },
  // ── DUYURULAR ────────────────────────────────────────────────────────────
  "announcements:read":     { code: "announcements:read",     risk: "dusuk",   title: "Duyurular — Görüntüleme",                    description: "Klinik ve sistem duyurularını görebilir." },
  "announcements:write":    { code: "announcements:write",    risk: "orta",    title: "Duyurular — Oluşturma ve Yayınlama",         description: "Yeni duyuru oluşturabilir, mevcut duyuruyu düzenleyebilir veya yayından kaldırabilir." },
  // ── DESTEK ───────────────────────────────────────────────────────────────
  "support:read":           { code: "support:read",           risk: "dusuk",   title: "Destek Talepleri — Görüntüleme",             description: "Açık ve kapalı destek taleplerini listeleyebilir, talep detaylarını inceleyebilir." },
  "support:write":          { code: "support:write",          risk: "orta",    title: "Destek Talepleri — Yanıtlama",               description: "Destek talebi oluşturabilir, yanıtlayabilir ve durumunu değiştirebilir." },
  "support:close":          { code: "support:close",          risk: "orta",    title: "Destek Talepleri — Kapatma",                 description: "Çözümlenen talepleri kapatabilir ve arşivleyebilir." },
  // ── SİSTEM AYARLARI ──────────────────────────────────────────────────────
  "settings:read":          { code: "settings:read",          risk: "dusuk",   title: "Sistem Ayarları — Görüntüleme",              description: "Klinik bilgileri, çalışma saatleri ve uygulama yapılandırmasını görebilir." },
  "settings:write":         { code: "settings:write",         risk: "yuksek",  title: "Sistem Ayarları — Düzenleme",                description: "Klinik bilgisini, çalışma saatlerini, entegrasyon ayarlarını ve sistem konfigürasyonunu değiştirebilir." },
  // ── PROFİL ───────────────────────────────────────────────────────────────
  "profile:read":           { code: "profile:read",           risk: "dusuk",   title: "Profil — Görüntüleme",                       description: "Kendi profil bilgilerini görebilir." },
  "profile:write":          { code: "profile:write",          risk: "dusuk",   title: "Profil — Bilgi Güncelleme",                  description: "Kendi ad, telefon, fotoğraf ve iletişim bilgilerini güncelleyebilir." },
  "profile:password":       { code: "profile:password",       risk: "orta",    title: "Profil — Şifre Değiştirme",                  description: "Kendi hesap şifresini değiştirebilir." },
};

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]> = {
  SUPERADMIN: ["*"],
  YONETICI: ["*"],
  DOKTOR: [
    "dashboard:read", "dashboard:stats",
    "appointments:read", "appointments:write", "appointments:approve",
    "patients:read", "patients:phone",
    "examinations:read", "examinations:write",
    "treatment:read", "treatment:write", "treatment:approve",
    "prescriptions:read", "prescriptions:write", "prescriptions:print",
    "lab:read", "lab:write", "lab:complete",
    "xray:read", "xray:write",
    "payments:read", "payments:write",
    "installments:read", "installments:write",
    "hastatracking:read", "hastatracking:write",
    "documents:read", "documents:write",
    "stock:read", "stock:write", "stock:delete",
    "announcements:read",
    "messages:read", "messages:write",
    "support:read",
    "profile:read", "profile:write", "profile:password",
    "staff:read",
  ],
  ASISTAN: [
    "dashboard:read",
    "appointments:read", "appointments:write", "appointments:approve",
    "patients:read", "patients:write",
    "examinations:read",
    "treatment:read",
    "prescriptions:read", "prescriptions:write",
    "lab:read", "lab:write",
    "xray:read",
    "payments:read", "payments:write",
    "installments:read", "installments:write",
    "hastatracking:read", "hastatracking:write",
    "documents:read", "documents:write",
    "stock:read", "stock:write", "stock:delete",
    "announcements:read",
    "messages:read", "messages:write",
    "support:read", "support:write",
    "profile:read", "profile:write", "profile:password",
    "staff:read", "staff:write", "staff:delete",
  ],
  BANKO: [
    "dashboard:read",
    "appointments:read", "appointments:write",
    "patients:read", "patients:write",
    "prescriptions:read", "prescriptions:write",
    "lab:read", "lab:write",
    "payments:read", "payments:write",
    "installments:read", "installments:write",
    "hastatracking:read", "hastatracking:write",
    "sms:read", "sms:write",
    "stock:read", "stock:write", "stock:delete",
    "announcements:read",
    "messages:read", "messages:write",
    "support:read", "support:write",
    "profile:read", "profile:write", "profile:password",
    "staff:read", "staff:write", "staff:delete",
  ],
  MUHASEBE: [
    "dashboard:read", "dashboard:stats",
    "finance:read", "finance:write", "finance:export",
    "reports:read", "reports:write", "reports:export",
    "prices:read", "prices:write",
    "payments:read",
    "installments:read", "installments:write",
    "stock:read", "stock:write", "stock:delete",
    "lab:read",
    "appointments:read",
    "announcements:read",
    "messages:read",
    "support:read",
    "profile:read", "profile:write", "profile:password",
  ],
};

export function normalizeRolePermissionMap(input: unknown): Record<Role, string[]> {
  const next: Record<Role, string[]> = { ...DEFAULT_ROLE_PERMISSIONS };
  if (!input || typeof input !== "object") return next;

  const source = input as Partial<Record<Role, unknown>>;
  for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS) as Role[]) {
    const raw = source[role];
    if (!Array.isArray(raw)) continue;

    const uniq = Array.from(new Set(raw.filter((p): p is string => typeof p === "string")));
    if (role === "SUPERADMIN") {
      next[role] = ["*"];
      continue;
    }

    if (role === "YONETICI") {
      if (uniq.includes("*")) {
        next[role] = ["*"];
      } else {
        next[role] = uniq.filter((p) => ALL_PERMISSIONS.includes(p));
      }
      continue;
    }

    next[role] = uniq.filter((p) => ALL_PERMISSIONS.includes(p));
  }

  return next;
}
