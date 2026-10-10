import { Role } from "@prisma/client";

export const MANAGEABLE_ROLES: Role[] = [
  "YONETICI",
  "DOKTOR",
  "ASISTAN",
  "BANKO",
  "MUHASEBE",
];

// Açıklamalar Süperadmin > Rol Yetkileri ekranında rol başlığının altında
// görünür; aşağıdaki varsayılan matrisle aynı şeyi söylemelidir.
export const ROLE_META: Record<string, { label: string; color: string; description: string }> = {
  YONETICI: { label: "Yönetici", color: "violet", description: "Klinik sahibi ya da yöneticisi — personel, ayarlar, finans, raporlar ve işlem kayıtları dahil her şey." },
  DOKTOR:   { label: "Doktor",   color: "blue",   description: "Diş hekimi — takvim, muayene ve tedavi kaydı, tedavi planı, reçete, laboratuvar, röntgen, onam ve kendi hakedişi. Tahsilat, Muhasebe ekranı, randevu iptali ve hasta telefonu/TC kapalı." },
  ASISTAN:  { label: "Asistan",  color: "teal",   description: "Hekim asistanı — randevu ve online talepler, hasta kaydı, hasta aramaları, hasta dosyasından tahsilat, röntgen/belge yükleme ve onam, laboratuvar işi, stok kullanımı. Tedavi kaydını ve reçeteyi hekim yazar; Muhasebe ekranı, tahsilat iptali ve taksit planı kapalı." },
  BANKO:    { label: "Banko",    color: "amber",  description: "Resepsiyon — hasta kaydı, randevu ve online talepler, hasta aramaları, tahsilat ve taksit planı, gün kasası, SMS/WhatsApp, onam ve belge, laboratuvar teslimi. Tedavi, reçete ve röntgen kayıtları, tahsilat iptali, gider ve hakediş kapalı." },
  MUHASEBE: { label: "Muhasebe", color: "emerald", description: "Muhasebe — tahsilat ve iptali, gider, tedarikçi ödemesi ve satın alma, alacak ve taksitler, hakediş, raporlar ve dışa aktarma. Hasta dosyası, randevu ve klinik (sağlık) bilgileri, fiyat değiştirme kapalı." },
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

// Grup adları panel menüsündeki adlarla aynıdır (src/lib/nav.ts); önceden
// izin ekranında "Hasta Takip Paneli", menüde "Hasta aramaları" yazıyordu.
export const PERMISSION_GROUPS: PermissionGroup[] = [
  // ── KLİNİK ──────────────────────────────────────────────────────────────
  { key: "appointments",   icon: "📅", category: "klinik",   label: "Randevular",               permissions: ["appointments:read", "appointments:write", "appointments:delete", "appointments:approve"] },
  { key: "patients",       icon: "🧑‍⚕️", category: "klinik",  label: "Hastalar",                 permissions: ["patients:read", "patients:write", "patients:delete", "patients:phone", "patients:merge"] },
  { key: "examinations",   icon: "🔬", category: "klinik",   label: "Muayene ve tedavi kaydı",  permissions: ["examinations:read", "examinations:write", "examinations:delete"] },
  { key: "treatment",      icon: "🦷", category: "klinik",   label: "Tedavi planları",          permissions: ["treatment:read", "treatment:write", "treatment:delete", "treatment:approve"] },
  { key: "prescriptions",  icon: "💊", category: "klinik",   label: "Reçete",                   permissions: ["prescriptions:read", "prescriptions:write", "prescriptions:print"] },
  { key: "lab",            icon: "🧪", category: "klinik",   label: "Laboratuvar",              permissions: ["lab:read", "lab:write", "lab:delete", "lab:complete"] },
  { key: "xray",           icon: "🩻", category: "klinik",   label: "Röntgen ve fotoğraf",      permissions: ["xray:read", "xray:write", "xray:delete"] },
  { key: "hastatracking",  icon: "📍", category: "klinik",   label: "Hasta aramaları",          permissions: ["hastatracking:read", "hastatracking:write"] },
  { key: "clinictasks",    icon: "✅", category: "klinik",   label: "Ekip görevleri",           permissions: ["clinictasks:read", "clinictasks:read-all", "clinictasks:write", "clinictasks:delete"] },
  { key: "documents",      icon: "📎", category: "klinik",   label: "Belgeler ve onam",         permissions: ["documents:read", "documents:write", "documents:delete"] },
  // ── FİNANS ──────────────────────────────────────────────────────────────
  { key: "payments",       icon: "💳", category: "finans",   label: "Tahsilat",                 permissions: ["payments:read", "payments:write", "payments:refund"] },
  { key: "installments",   icon: "🗓️", category: "finans",  label: "Taksitler",                permissions: ["installments:read", "installments:write", "installments:delete"] },
  { key: "finance",        icon: "📊", category: "finans",   label: "Muhasebe",                 permissions: ["finance:center", "finance:read", "finance:write", "finance:export"] },
  { key: "earnings",       icon: "🩺", category: "finans",   label: "Hakediş",                  permissions: ["earnings:read"] },
  { key: "stock",          icon: "📦", category: "finans",   label: "Stok",                     permissions: ["stock:read", "stock:write", "stock:delete"] },
  { key: "prices",         icon: "💰", category: "finans",   label: "Fiyat listesi",            permissions: ["prices:read", "prices:write"] },
  { key: "reports",        icon: "📈", category: "finans",   label: "Raporlar",                 permissions: ["reports:read", "reports:write", "reports:export"] },
  // ── YÖNETİM ─────────────────────────────────────────────────────────────
  { key: "staff",          icon: "👥", category: "yonetim",  label: "Personel",                 permissions: ["staff:read", "staff:write", "staff:delete", "staff:schedule"] },
  { key: "dashboard",      icon: "🏠", category: "yonetim",  label: "Ana sayfa",                permissions: ["dashboard:read", "dashboard:stats"] },
  { key: "audit",          icon: "🔍", category: "yonetim",  label: "İşlem kayıtları",          permissions: ["audit:read", "audit:export"] },
  { key: "branches",       icon: "🏥", category: "yonetim",  label: "Şube erişimi",             permissions: ["branches:assign"] },
  // ── İLETİŞİM ────────────────────────────────────────────────────────────
  { key: "sms",            icon: "📱", category: "iletisim", label: "İletişim (SMS)",           permissions: ["sms:read", "sms:write", "sms:bulk"] },
  { key: "whatsapp",       icon: "💚", category: "iletisim", label: "WhatsApp",                 permissions: ["whatsapp:read", "whatsapp:write"] },
  { key: "messages",       icon: "💬", category: "iletisim", label: "Ekip mesajları",           permissions: ["messages:read", "messages:write"] },
  { key: "announcements",  icon: "📢", category: "iletisim", label: "Duyurular",                permissions: ["announcements:read", "announcements:write"] },
  { key: "support",        icon: "🎧", category: "iletisim", label: "Destek",                   permissions: ["support:read", "support:write", "support:close"] },
  // ── SİSTEM ──────────────────────────────────────────────────────────────
  { key: "settings",       icon: "⚙️", category: "sistem",  label: "Ayarlar",                  permissions: ["settings:read", "settings:write"] },
  { key: "profile",        icon: "👤", category: "sistem",  label: "Profilim",                 permissions: ["profile:read", "profile:write", "profile:password"] },
];

export const ALL_PERMISSIONS = Array.from(
  new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions))
);

// Açıklamalar izinlerin KODDAKİ gerçek etkisini anlatır (hangi ekran/işlem
// açılıyor). Sağlık verisi (anamnez, tedavi, reçete, görüntü) gösteren okuma
// izinleri KVKK özel nitelikli veri olduğu için en az "orta" risktedir.
export const PERMISSION_DETAILS: Record<string, PermissionDetail> = {
  // ── ANA SAYFA ────────────────────────────────────────────────────────────
  "dashboard:read":         { code: "dashboard:read",         risk: "dusuk",   title: "Ana sayfa — Görüntüleme",                     description: "Ana sayfayı açar. Bölümler ayrıca kendi izniyle görünür: ör. bugünkü randevular randevu, bugünkü tahsilat Muhasebe ve tahsilat izniyle." },
  "dashboard:stats":        { code: "dashboard:stats",        risk: "orta",    title: "Ana sayfa — Kurum özeti ve son işlemler",     description: "Kurum geneli toplam sayıları (hasta, randevu, tedavi, personel) ve son 10 işlem kaydını okur. İşlem kaydı içerdiği için yönetici iznidir." },
  "branches:assign":        { code: "branches:assign",        risk: "yuksek",  title: "Şube erişimi — Personel yetkisi",             description: "Şube yöneticisi kendi şubesindeki personelin erişimini açıp kapatır ve rolünün izinlerini kişi bazında daraltır (rolün üstüne çıkamaz)." },
  // ── RANDEVU ──────────────────────────────────────────────────────────────
  "appointments:read":      { code: "appointments:read",      risk: "dusuk",   title: "Randevular — Görüntüleme",                    description: "Takvimi, randevu listesini, online talepleri ve bekleme listesini görür; hasta dosyasında Randevular sekmesini açar." },
  "appointments:write":     { code: "appointments:write",     risk: "orta",    title: "Randevular — Ekleme ve düzenleme",            description: "Randevu ekler, saatini veya doktorunu değiştirir, “Hasta geldi” ve “Tamamlandı” işaretler, bekleme listesini düzenler." },
  "appointments:delete":    { code: "appointments:delete",    risk: "yuksek",  title: "Randevular — İptal",                          description: "Randevuyu geçmişi korunarak iptal eder; bağlı hatırlatmalar durur." },
  "appointments:approve":   { code: "appointments:approve",   risk: "orta",    title: "Randevular — Online talep onayı",             description: "Online randevu taleplerini onaylar ya da reddeder; randevuyu iptal edebilir." },
  // ── HASTA ────────────────────────────────────────────────────────────────
  "patients:read":          { code: "patients:read",          risk: "orta",    title: "Hastalar — Görüntüleme",                      description: "Hasta listesini ve hasta dosyasını açar: kimlik bilgileri, anamnez (sağlık geçmişi) ve hasta notları dahil. Telefon ve TC kimlik no ayrıca “Telefon ve TC” iznini ister." },
  "patients:write":         { code: "patients:write",         risk: "orta",    title: "Hastalar — Kayıt ve düzenleme",               description: "Yeni hasta açar; kişisel bilgileri, anamnezi ve hasta notunu günceller; SMS izin bağlantısını yeniden gönderir." },
  "patients:delete":        { code: "patients:delete",        risk: "yuksek",  title: "Hastalar — Arşivleme",                        description: "Hasta kaydını klinik geçmişiyle birlikte aktif listelerden arşive alır ve arşivden geri açar." },
  "patients:phone":         { code: "patients:phone",         risk: "yuksek",  title: "Hastalar — Telefon ve TC görme",              description: "Hasta telefonunu ve TC kimlik numarasını maskesiz gösterir (hasta, randevu, arama ve alacak listeleri). İzin yoksa sunucu bu alanları “***” olarak döndürür." },
  "patients:merge":         { code: "patients:merge",         risk: "yuksek",  title: "Hastalar — Kayıt birleştirme",                description: "Mükerrer hasta kayıtlarını tek kayıtta birleştirir. Geri alınamaz. Şu an etkisiz: birleştirme işlemi henüz yok." },
  // ── MUAYENE ──────────────────────────────────────────────────────────────
  "examinations:read":      { code: "examinations:read",      risk: "orta",    title: "Muayene ve tedavi — Görüntüleme",             description: "Hastanın tedavi kalemlerini (diş, işlem, tutar, durum) ve klinik notlarını görür." },
  "examinations:write":     { code: "examinations:write",     risk: "orta",    title: "Muayene ve tedavi — Kayıt",                   description: "Tedavi kalemi ekler ve günceller; tutar hastanın borcuna yansır. Doğru fiyat için kliniğin fiyat listesini de okur." },
  "examinations:delete":    { code: "examinations:delete",    risk: "yuksek",  title: "Muayene ve tedavi — İptal",                   description: "Tedavi kaydını geçmişi ve denetim izi korunarak iptal eder." },
  // ── TEDAVİ PLANI ─────────────────────────────────────────────────────────
  "treatment:read":         { code: "treatment:read",         risk: "orta",    title: "Tedavi planları — Görüntüleme",               description: "Hastanın tedavi planını, diş bazlı adımları ve plan tutarını görür." },
  "treatment:write":        { code: "treatment:write",        risk: "orta",    title: "Tedavi planları — Oluşturma ve düzenleme",    description: "Tedavi planı oluşturur, plana adım ekler ve adımların durumunu günceller." },
  "treatment:delete":       { code: "treatment:delete",       risk: "yuksek",  title: "Tedavi planları — İptal",                     description: "Tamamlanmamış tedavi planını geçmişiyle birlikte iptal eder." },
  "treatment:approve":      { code: "treatment:approve",      risk: "yuksek",  title: "Tedavi planları — Yönetici onayı",            description: "Hazırlanan tedavi planını yönetici onayından geçirip hastaya sunar. Şu an etkisiz: plan onay adımı henüz hiçbir ekranda ve işlemde denetlenmiyor." },
  // ── REÇETE ───────────────────────────────────────────────────────────────
  "prescriptions:read":     { code: "prescriptions:read",     risk: "orta",    title: "Reçete — Görüntüleme",                        description: "Hastaya yazılan reçeteleri ve ilaçları görür." },
  "prescriptions:write":    { code: "prescriptions:write",    risk: "orta",    title: "Reçete — Yazma ve iptal",                     description: "Reçete yazar (ilaç, doz, not) ve yazılmış reçeteyi iptal eder." },
  "prescriptions:print":    { code: "prescriptions:print",    risk: "dusuk",   title: "Reçete — Yazdırma",                           description: "Yazılmış reçeteyi yazdırır ya da PDF olarak alır. Şu an ayrı denetlenmiyor: reçeteyi görebilen (Reçete — Görüntüleme) yazdırabilir." },
  // ── LABORATUVAR ───────────────────────────────────────────────────────────
  "lab:read":               { code: "lab:read",               risk: "orta",    title: "Laboratuvar — Görüntüleme",                   description: "Laboratuvar işlerini (hasta, diş, iş türü), gönderim/teslim adımlarını ve lab faturalarını görür." },
  "lab:write":              { code: "lab:write",              risk: "orta",    title: "Laboratuvar — İş, gönderim ve teslim",        description: "Lab işi açar ve düzenler, laboratuvara gönderir ve teslim alır, lab faturası girer (tedarikçiye borç kaydı oluşur)." },
  "lab:delete":             { code: "lab:delete",             risk: "yuksek",  title: "Laboratuvar — İş iptali",                     description: "Lab işini finansal ve operasyonel geçmişi korunarak iptal eder." },
  "lab:complete":           { code: "lab:complete",           risk: "orta",    title: "Laboratuvar — Hastaya takıldı",               description: "İşi “hastaya takıldı” olarak kapatır; takılmış iş için yeniden yapım başlatır." },
  // ── RÖNTGEN VE FOTOĞRAF ──────────────────────────────────────────────────
  "xray:read":              { code: "xray:read",              risk: "orta",    title: "Röntgen ve fotoğraf — Görüntüleme",           description: "Hastanın röntgen ve ağız içi fotoğraflarını görür ve indirir." },
  "xray:write":             { code: "xray:write",             risk: "orta",    title: "Röntgen ve fotoğraf — Yükleme",               description: "Röntgen ve fotoğraf yükler; diş numarası ve not ekler." },
  "xray:delete":            { code: "xray:delete",            risk: "yuksek",  title: "Röntgen ve fotoğraf — Arşivleme",             description: "Görüntüyü klinik geçmişi korunarak arşivler (ör. yanlış hastaya yüklenen)." },
  // ── HASTA ARAMALARI ──────────────────────────────────────────────────────
  "hastatracking:read":     { code: "hastatracking:read",     risk: "dusuk",   title: "Hasta aramaları — Görüntüleme",               description: "Aranacak ve geri dönülecek hastaların listesini ve görüşme geçmişini görür." },
  "hastatracking:write":    { code: "hastatracking:write",    risk: "orta",    title: "Hasta aramaları — Kayıt",                     description: "Arama kaydı açar, görüşme sonucunu ve sonraki arama tarihini yazar, kaydı kapatır; takip nedenleri listesine ekleme yapar." },
  // ── EKİP GÖREVLERİ ───────────────────────────────────────────────────────
  "clinictasks:read":       { code: "clinictasks:read",       risk: "dusuk",   title: "Ekip görevleri — Görüntüleme",                description: "Kendisine atanan ve kendi açtığı görevleri görür." },
  "clinictasks:read-all":   { code: "clinictasks:read-all",   risk: "orta",    title: "Ekip görevleri — Tümünü görme",               description: "Kliniğin bütün görevlerini, başkalarına atananlar dahil, görür ve yönetir." },
  "clinictasks:write":      { code: "clinictasks:write",      risk: "orta",    title: "Ekip görevleri — Oluşturma ve güncelleme",    description: "Görev açar ve atar, görevin durumunu değiştirir, tamamlar." },
  "clinictasks:delete":     { code: "clinictasks:delete",     risk: "orta",    title: "Ekip görevleri — İptal",                      description: "Görevi geçmişi korunarak iptal eder." },
  // ── BELGELER VE ONAM ─────────────────────────────────────────────────────
  "documents:read":         { code: "documents:read",         risk: "orta",    title: "Belgeler ve onam — Görüntüleme",              description: "Hasta belgelerini (röntgen ve fotoğraf hariç) ve imzalı onamları görür, indirir." },
  "documents:write":        { code: "documents:write",        risk: "orta",    title: "Belgeler ve onam — Yükleme ve onam",          description: "Hasta belgesi yükler ve onam formu imzalatır." },
  "documents:delete":       { code: "documents:delete",       risk: "yuksek",  title: "Belgeler ve onam — Arşivleme",                description: "Hasta belgesini dosya ve denetim geçmişi korunarak arşivler." },
  // ── TAHSİLAT ─────────────────────────────────────────────────────────────
  "payments:read":          { code: "payments:read",          risk: "orta",    title: "Tahsilat — Görüntüleme",                      description: "Kliniğin tahsilat kayıtlarını (gün kasası dahil) görür; hasta dosyasında Hesap sekmesini ve hasta bakiyesini açar." },
  "payments:write":         { code: "payments:write",         risk: "orta",    title: "Tahsilat — Alma ve düzeltme",                 description: "Hastadan tahsilat alır (nakit, kart, havale); tahsilatın yöntemini, açıklamasını ve POS bilgisini düzeltir, tutarını artırır." },
  "payments:refund":        { code: "payments:refund",        risk: "yuksek",  title: "Tahsilat — İptal / iade",                     description: "Alınmış tahsilatı iptal eder (iade). Tahsilatın tutarını düşürme, tarihini ve hekimini düzeltme de bu izinle yapılır. Kasa, taksit ve hakediş kayıtlarını etkiler." },
  // ── TAKSİTLER ────────────────────────────────────────────────────────────
  "installments:read":      { code: "installments:read",      risk: "orta",    title: "Taksitler — Görüntüleme",                     description: "Taksit planlarını, vadesi gelen ve geciken taksitleri görür; tahsilat hatırlatmaları dahil." },
  "installments:write":     { code: "installments:write",     risk: "orta",    title: "Taksitler — Plan ve taksit tahsilatı",        description: "Taksit planı kurar ve düzenler, vadesi gelen taksidi tahsil eder; tahsilat hatırlatmalarını kurar ve kapatır." },
  "installments:delete":    { code: "installments:delete",    risk: "yuksek",  title: "Taksitler — Plan iptali",                     description: "Taksit planını tahsilat geçmişi ve hatırlatma izleri korunarak iptal eder." },
  // ── MUHASEBE ─────────────────────────────────────────────────────────────
  "finance:center":         { code: "finance:center",         risk: "orta",    title: "Muhasebe — Sayfayı açma",                     description: "Muhasebe sayfasını ve menüsünü açar; kurum geneli kasa, gelir-gider defteri, tahsilat ve taksit listeleri bu izni ister. Sayfadaki bölümler ayrıca tahsilat, taksit ve finans izinlerine bağlıdır." },
  "finance:read":           { code: "finance:read",           risk: "orta",    title: "Muhasebe — Gelir, gider ve alacaklar",        description: "Giderleri, hasta alacaklarını, tedarikçi hesaplarını ve satın almaları, tüm hekimlerin hakediş özetini ve stok maliyetlerini görür." },
  "finance:write":          { code: "finance:write",          risk: "yuksek",  title: "Muhasebe — Gider ve tedarikçi kaydı",         description: "Gider ve gider türü, tedarikçi ve tedarikçi ödemesi kaydeder; stok yazma izniyle birlikte satın alma yapar." },
  "finance:export":         { code: "finance:export",         risk: "yuksek",  title: "Muhasebe — Dışa aktarma",                     description: "Muhasebe listelerini ve hakediş dökümlerini Excel/PDF olarak indirir. Hasta ve tutar bilgisi içerir." },
  // ── HAKEDİŞ ──────────────────────────────────────────────────────────────
  "earnings:read":          { code: "earnings:read",          risk: "orta",    title: "Hakediş — Döküm görüntüleme",                 description: "Hakediş dökümünü görür: doktor yalnız kendisininkini, diğer roller (ör. muhasebe) tüm hekimlerinkini." },
  // ── STOK ─────────────────────────────────────────────────────────────────
  "stock:read":             { code: "stock:read",             risk: "dusuk",   title: "Stok — Görüntüleme",                          description: "Ürünleri, stok miktarlarını ve kritik stok uyarılarını görür. Maliyet yalnız finans izniyle görünür." },
  "stock:write":            { code: "stock:write",            risk: "orta",    title: "Stok — Ürün ve hareket",                      description: "Ürün ekler ve düzenler, stok girişi ve kullanım (çıkış) kaydeder. Satın alma için ayrıca finans yazma izni gerekir." },
  "stock:delete":           { code: "stock:delete",           risk: "yuksek",  title: "Stok — Ürünü pasife alma",                    description: "Stok kartını hareket ve lot geçmişi korunarak pasife alır, gerekirse geri açar." },
  // ── FİYAT LİSTESİ ────────────────────────────────────────────────────────
  "prices:read":            { code: "prices:read",            risk: "dusuk",   title: "Fiyat listesi — Görüntüleme",                 description: "Kliniğin tedavi ve hizmet fiyatlarını görür." },
  "prices:write":           { code: "prices:write",           risk: "yuksek",  title: "Fiyat listesi — Düzenleme",                   description: "Fiyat ekler ve günceller; kliniğin fiyat listesini değiştirir." },
  // ── RAPORLAR ─────────────────────────────────────────────────────────────
  "reports:read":           { code: "reports:read",           risk: "orta",    title: "Raporlar — Görüntüleme",                      description: "Gelir-gider, alacak, hekim ve işlem raporlarını açar." },
  "reports:write":          { code: "reports:write",          risk: "orta",    title: "Raporlar — Özel rapor",                       description: "Özel rapor parametrelerini belirler ve özel rapor oluşturur. Şu an etkisiz: özel rapor özelliği henüz yok." },
  "reports:export":         { code: "reports:export",         risk: "yuksek",  title: "Raporlar — Dışa aktarma",                     description: "Raporları Excel, PDF veya CSV olarak indirir. Toplu hasta verisi içerebilir." },
  // ── PERSONEL ─────────────────────────────────────────────────────────────
  "staff:read":             { code: "staff:read",             risk: "orta",    title: "Personel — Liste",                            description: "Personel listesini, rollerini ve çalışma saatlerini görür. Randevu, lab ve reçete formlarındaki hekim seçimi de bu listeyi kullanır." },
  "staff:write":            { code: "staff:write",            risk: "yuksek",  title: "Personel — Ekleme ve düzenleme",              description: "Personel ekler, bilgilerini ve rolünü değiştirir." },
  "staff:delete":           { code: "staff:delete",           risk: "yuksek",  title: "Personel — Hesabı pasife alma",               description: "Personel hesabını işlem ve denetim geçmişi korunarak pasife alır." },
  "staff:schedule":         { code: "staff:schedule",         risk: "orta",    title: "Personel — Çalışma saatleri",                 description: "Personelin haftalık çalışma saatlerini ve vardiyasını düzenler. Şu an ayrı denetlenmiyor: çalışma saatlerini Personel — Ekleme ve düzenleme izni değiştirir." },
  // ── İŞLEM KAYITLARI ──────────────────────────────────────────────────────
  "audit:read":             { code: "audit:read",             risk: "orta",    title: "İşlem kayıtları — Görüntüleme",               description: "Kim, ne zaman, ne yaptı kayıtlarını, kayıt kontrolünü ve hasta dosyası erişim kaydını görür." },
  "audit:export":           { code: "audit:export",           risk: "yuksek",  title: "İşlem kayıtları — Dışa aktarma",              description: "İşlem kayıtlarını dışa aktarır; tüm kullanıcı hareketlerini içerir. Şu an etkisiz: klinik panelinde işlem kaydı dışa aktarma henüz yok." },
  // ── İLETİŞİM ─────────────────────────────────────────────────────────────
  "sms:read":               { code: "sms:read",               risk: "dusuk",   title: "İletişim — Gönderim geçmişi",                 description: "Gönderilen SMS ve iletileri, teslim durumlarını, hastaların SMS iznini ve kalan krediyi görür." },
  "sms:write":              { code: "sms:write",              risk: "orta",    title: "İletişim — Tek hastaya mesaj",                description: "Tek hastaya ya da seçili randevulara SMS/ileti gönderir, ileti şablonlarını düzenler. Hasta izni ve kredi kontrolü uygulanır." },
  "sms:bulk":               { code: "sms:bulk",               risk: "yuksek",  title: "İletişim — Toplu gönderim",                   description: "Hasta listesine ya da seçili gruba toplu ileti gönderir; kutlama günü otomatik gönderimlerini açıp kapatır. Hasta izinleri uygulanır." },
  "whatsapp:read":          { code: "whatsapp:read",          risk: "orta",    title: "WhatsApp — Görüşmeler",                       description: "Kliniğin WhatsApp yazışmalarını ve teslim durumlarını görür." },
  "whatsapp:write":         { code: "whatsapp:write",         risk: "orta",    title: "WhatsApp — Mesaj gönderme",                   description: "WhatsApp üzerinden hastaya yazar ve yanıt verir. Kliniğin WhatsApp bağlantısını yalnız Yönetici rolü kurar; WhatsApp’ı açık olmayan klinikte etkisi yoktur." },
  // ── EKİP MESAJLARI ───────────────────────────────────────────────────────
  "messages:read":          { code: "messages:read",          risk: "dusuk",   title: "Ekip mesajları — Okuma",                      description: "Ekip içi mesajları okur." },
  "messages:write":         { code: "messages:write",         risk: "dusuk",   title: "Ekip mesajları — Yazma",                      description: "Ekip içi mesaj yazar, kendi mesajını düzenler ve siler (başkasının mesajını yalnız yönetici)." },
  // ── DUYURULAR ────────────────────────────────────────────────────────────
  "announcements:read":     { code: "announcements:read",     risk: "dusuk",   title: "Duyurular — Görüntüleme",                     description: "Klinik ve sistem duyurularını görür." },
  "announcements:write":    { code: "announcements:write",    risk: "orta",    title: "Duyurular — Yayınlama",                       description: "Duyuru yayınlar, düzenler ve yayından kaldırır." },
  // ── DESTEK ───────────────────────────────────────────────────────────────
  "support:read":           { code: "support:read",           risk: "dusuk",   title: "Destek — Talepleri görme",                    description: "Kliniğin CepKlinik destek taleplerini ve yanıtlarını görür." },
  "support:write":          { code: "support:write",          risk: "orta",    title: "Destek — Talep açma",                         description: "Destek talebi açar; kliniğin taleplerini düzenler ve siler." },
  "support:close":          { code: "support:close",          risk: "orta",    title: "Destek — Talep kapatma",                      description: "Çözülen talepleri kapatır ve arşivler. Şu an etkisiz: talepleri CepKlinik destek ekibi kapatır." },
  // ── AYARLAR ──────────────────────────────────────────────────────────────
  "settings:read":          { code: "settings:read",          risk: "dusuk",   title: "Ayarlar — Görüntüleme",                       description: "Ayarlar sayfasını açar: klinik bilgileri, çalışma saatleri, tedavi türleri ve üniteler." },
  "settings:write":         { code: "settings:write",         risk: "yuksek",  title: "Ayarlar — Düzenleme",                         description: "Klinik bilgilerini, çalışma saatlerini, tedavi türlerini, üniteleri, POS cihazlarını ve otomatik mesaj ayarlarını değiştirir." },
  // ── PROFİLİM ─────────────────────────────────────────────────────────────
  "profile:read":           { code: "profile:read",           risk: "dusuk",   title: "Profilim — Görüntüleme",                      description: "Kendi profil bilgilerini görür." },
  "profile:write":          { code: "profile:write",          risk: "dusuk",   title: "Profilim — Bilgi güncelleme",                 description: "Kendi adını, telefonunu, fotoğrafını ve iletişim bilgilerini günceller. Şu an ayrı denetlenmiyor: Profilim sayfasını açabilen herkes kendi bilgisini güncelleyebilir." },
  "profile:password":       { code: "profile:password",       risk: "orta",    title: "Profilim — Şifre değiştirme",                 description: "Kendi hesap şifresini değiştirir. Şu an ayrı denetlenmiyor: her kullanıcı kendi şifresini değiştirebilir (güvenlik gereği)." },
};

/**
 * Önerilen varsayılan rol yetkileri (gerekçeler: docs/ROL-YETKILERI.md).
 *
 * Bu matris TÜM kliniklerde ortaktır ve her rolün TAVANIDIR: klinik yöneticisi
 * Personel > Şube erişimi'nden bir kişinin izinlerini daraltabilir, rolün
 * üstüne çıkamaz. Bu yüzden her rol, o işi yapan kişinin günlük işi için
 * gereken izinlerin tamamını alır; o işe ait olmayan izin (hekimde/asistanda
 * Muhasebe ekranı, muhasebede hasta dosyası, yönetici dışında ayar/personel/
 * işlem kayıtları/arşivleme) hiç verilmez. Telefon/TC görme (patients:phone)
 * hasta kaçırma ve KVKK riski nedeniyle yalnız hastayı arayan rollerde (banko,
 * asistan, muhasebe) açıktır; doktorda kapalıdır.
 *
 * Süperadmin > Rol Yetkileri'nden hiç düzenlenmemiş kurulumlarda bu liste
 * doğrudan geçerlidir; düzenlenmiş kurulumda "Varsayılana döndür" ile
 * uygulanır (bkz. src/lib/role-permission-store.ts).
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]> = {
  SUPERADMIN: ["*"],
  YONETICI: ["*"],
  // Diş hekimi: takvim (sonraki seansı verme, Geldi/Tamamlandı), hasta dosyası
  // ve anamnez, tedavi kaydı, tedavi planı, reçete, lab siparişi, röntgen,
  // onam, kontrol araması açma ve kendi hakedişi. Tahsilat/taksit, Muhasebe
  // ekranı, randevu iptali, toplu iletişim ve hasta telefonu/TC kapalı.
  DOKTOR: [
    "dashboard:read",
    "appointments:read", "appointments:write",
    "patients:read", "patients:write",
    "examinations:read", "examinations:write", "examinations:delete",
    "treatment:read", "treatment:write", "treatment:delete",
    "prescriptions:read", "prescriptions:write", "prescriptions:print",
    "lab:read", "lab:write", "lab:complete", "lab:delete",
    "xray:read", "xray:write", "xray:delete",
    "documents:read", "documents:write",
    "hastatracking:read", "hastatracking:write",
    "clinictasks:read", "clinictasks:write", "clinictasks:delete",
    "earnings:read",
    "prices:read",
    "stock:read",
    "staff:read",
    "messages:read", "messages:write",
    "announcements:read",
    "support:read", "support:write",
    "profile:read", "profile:write", "profile:password",
  ],
  // Hekim asistanı (küçük klinikte bankoya da bakar — plan §0.1): randevu ve
  // online talepler, hasta kaydı, hasta aramaları, hasta dosyasından tahsilat
  // (borcu görerek; ödeme açık taksitlere kendiliğinden işlenir), röntgen ve
  // belge yükleme, onam, lab işi, stok kullanımı, fiyat sorusu. Tedavi kaydı ve
  // reçeteyi hekim yazar (asistan okur ve yazdırır). Muhasebe ekranı, tahsilat
  // iptali, taksit planı kurma/iptali, SMS/WhatsApp kapalı.
  ASISTAN: [
    "dashboard:read",
    "appointments:read", "appointments:write", "appointments:delete", "appointments:approve",
    "patients:read", "patients:write", "patients:phone",
    "examinations:read",
    "treatment:read",
    "prescriptions:read", "prescriptions:print",
    "lab:read", "lab:write", "lab:complete",
    "xray:read", "xray:write",
    "documents:read", "documents:write",
    "hastatracking:read", "hastatracking:write",
    "clinictasks:read", "clinictasks:write", "clinictasks:delete",
    "payments:read", "payments:write",
    "installments:read",
    "prices:read",
    "stock:read", "stock:write",
    "staff:read",
    "messages:read", "messages:write",
    "announcements:read",
    "support:read", "support:write",
    "profile:read", "profile:write", "profile:password",
  ],
  // Resepsiyon: hasta bulma/kaydetme, randevu ve online talepler, hasta
  // aramaları, tahsilat ve gün kasası (Muhasebe ekranında yalnız tahsilatlar
  // ve taksitler), taksit planı, SMS/WhatsApp, KVKK onamı ve belge, lab
  // teslimi, fiyat sorusu, stok girişi/kullanımı. Tedavi/reçete/röntgen
  // içeriği, tahsilat iptali, taksit planı iptali, gider/hakediş ve toplu SMS kapalı.
  BANKO: [
    "dashboard:read",
    "appointments:read", "appointments:write", "appointments:delete", "appointments:approve",
    "patients:read", "patients:write", "patients:phone",
    "documents:read", "documents:write",
    "hastatracking:read", "hastatracking:write",
    "clinictasks:read", "clinictasks:write", "clinictasks:delete",
    "lab:read", "lab:write",
    "finance:center",
    "payments:read", "payments:write",
    "installments:read", "installments:write",
    "prices:read",
    "sms:read", "sms:write",
    "whatsapp:read", "whatsapp:write",
    "stock:read", "stock:write",
    "staff:read",
    "messages:read", "messages:write",
    "announcements:read",
    "support:read", "support:write",
    "profile:read", "profile:write", "profile:password",
  ],
  // Muhasebe: tahsilat (iptal dahil), gider ve tedarikçi ödemesi, satın alma,
  // alacak ve taksitler, hakediş hesabı ve ödemesi, raporlar ve dışa aktarma,
  // fiyat listesini görme. Hasta dosyası, randevu ve klinik kayıtlar kapalı;
  // borçluyu arayabilmek için telefon alacak/taksit listelerinde görünür.
  // Fiyat değiştirme ve stok kartını pasife alma yöneticidedir.
  MUHASEBE: [
    "dashboard:read",
    "finance:center", "finance:read", "finance:write", "finance:export",
    "payments:read", "payments:write", "payments:refund",
    "installments:read", "installments:write", "installments:delete",
    "earnings:read",
    "reports:read", "reports:write", "reports:export",
    "prices:read",
    "stock:read", "stock:write",
    "patients:phone",
    "staff:read",
    "clinictasks:read", "clinictasks:write", "clinictasks:delete",
    "messages:read", "messages:write",
    "announcements:read",
    "support:read", "support:write",
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

export type RolePermissionDiff = Partial<Record<Role, { added: string[]; removed: string[] }>>;

/**
 * İki yetki matrisi arasındaki fark, rol bazında ("*" tüm izinlere açılır).
 * `added`: `to`'da olup `from`'da olmayan; `removed`: tersi. Farkı olmayan rol
 * sonuçta yer almaz. Süperadmin ekranında "önerilen varsayılandan farklar"
 * ve geçiş betikleri için.
 */
export function diffRolePermissionMaps(
  from: Partial<Record<Role, readonly string[]>>,
  to: Partial<Record<Role, readonly string[]>>,
  roles: readonly Role[] = MANAGEABLE_ROLES,
): RolePermissionDiff {
  const expand = (list: readonly string[] | undefined) => new Set(list?.includes("*") ? ALL_PERMISSIONS : list ?? []);
  const result: RolePermissionDiff = {};
  for (const role of roles) {
    const before = expand(from[role]);
    const after = expand(to[role]);
    const added = ALL_PERMISSIONS.filter((permission) => after.has(permission) && !before.has(permission));
    const removed = ALL_PERMISSIONS.filter((permission) => before.has(permission) && !after.has(permission));
    if (added.length > 0 || removed.length > 0) result[role] = { added, removed };
  }
  return result;
}
