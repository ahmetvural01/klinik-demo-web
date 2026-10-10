// GET /api/dashboard/today?ozet=1 yanıtı — ana sayfanın "Yapılacaklar" listesi
// ve başlıktaki sayıların TEK kaynağı. Yalnız tür tanımı (çalışma zamanı kodu
// yok): istemci bileşenleri sunucu modülünü paketlemeden içe aktarabilsin.
//
// Her bölüm yalnız kullanıcının ilgili izni varsa gelir; izni olmayan bölüm
// yanıtta HİÇ yoktur (0 değil). Hesaplanamayan bölüm `failed` içinde adıyla
// döner — ekran bilinmeyen sayıyı "0" olarak göstermez.

export type HomeSummarySection =
  | "appointments"
  | "followUps"
  | "tasks"
  | "lab"
  | "installments"
  | "messaging"
  | "collections"
  | "versions";

export type HomeSummary = {
  /** Türkiye takvimine göre bugün, "YYYY-MM-DD". */
  date: string;
  viewer: {
    id: string;
    /** Sistem sahibinin kliniğe görünmez girişi: ekip mesajı/duyuru yazılamaz. */
    ghost: boolean;
    /**
     * Doktor görünümü: Yapılacaklar'da yalnız kendi görevleri ve lab işleri
     * (online talep, açık kalan randevu ve hasta aramaları ön büronun işidir;
     * Randevular sayfasında ve menü rozetinde görünmeye devam eder).
     */
    doctor: boolean;
  };
  /** appointments:read — Randevular sayfasının sayaçlarıyla aynı tanım. */
  appointments?: {
    /** Onay bekleyen online randevu talepleri. */
    onlineRequests: number;
    /** Bekleme listesindeki (BEKLIYOR/ARANDI) hastalar. */
    waitlist: number;
    /** Önceki günlerden durumu işaretlenmemiş randevular. */
    openPast: number;
    openPastLookbackDays: number;
    /** Yarın (iptal hariç) tüm randevular / oturumdaki kullanıcının randevuları. */
    tomorrow: number;
    tomorrowMine: number;
  };
  /**
   * hastatracking:read (doktor görünümünde yok) — Yapılacaklar > Hasta aramaları
   * ile aynı model: dueToday = "Bugün aranacak" (günü gelmiş, geçmiş ya da
   * tarihsiz açık aramalar), overdue = bunlardan günü geçmiş olanlar.
   */
  followUps?: { dueToday: number; overdue: number };
  /** clinictasks:read — bana atanmış, açık ve hatırlatma/son tarihi gelmiş görevler (üst bar zili ile aynı tanım). */
  tasks?: { due: number; overdue: number };
  /** lab:write — Laboratuvar sayfasının "Klinikte" ve geciken iş sayıları; doktorda yalnız kendi işleri. */
  lab?: { clinic: number; late: number; mine: boolean };
  /** installments:read + finance:center — Muhasebe > Taksitler ile aynı tanım; tutarlar metin ("7450.00"). */
  installments?: { overdueCount: number; overdueAmount: string; weekCount: number; weekAmount: string };
  /** sms:read — İletişim > Gönderim geçmişi "Gönderilemedi" ile aynı tanım (son 7 gün). */
  messaging?: { failed7d: number };
  /** payments:read + finance:center — bugünkü hasta tahsilatı (Kasa ile aynı tanım), metin ("8450.00"). */
  collectionsToday?: string;
  /** Ekip mesajları / duyurular değiştiyse ekran yalnız o listeyi yeniden ister. */
  versions?: { messages?: string; announcements?: string };
  failed: HomeSummarySection[];
};
