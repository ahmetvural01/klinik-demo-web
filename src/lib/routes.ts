// Modüller arası bağlantıların TEK kaynağı. Önceden her ekran bağlantıyı elle
// yazıyordu; bazıları hasta/randevu bağlamını taşımıyordu (ör. Hasta Takip'ten
// "Randevuya Git" hastayı forma taşımıyor, kullanıcı aynı hastayı tekrar
// arıyordu). Yeni bir bağlantı gerekiyorsa buraya eklenir; var olanlar
// kaldırılmaz (başka ekranlar kullanıyor).

type Query = Record<string, string | number | null | undefined>;

function withQuery(path: string, query: Query, hash = "") {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return `${text ? `${path}?${text}` : path}${hash}`;
}

type PatientContext = { patientId?: string; patientName?: string };

/**
 * Girişten sonra dönülecek adres (middleware oturum bitince `?next=` ile
 * taşır). Açık yönlendirme koruması: yalnız site içi panel yolu kabul edilir;
 * `//` ve `/\` (başka siteye gider), API, giriş ve platform yolları reddedilir.
 */
export function safeLoginNextPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2000) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  for (let index = 0; index < raw.length; index += 1) {
    if (raw.charCodeAt(index) < 32) return null;
  }
  const path = raw.split(/[?#]/, 1)[0].toLowerCase();
  const blocked = ["/api", "/klinik", "/giris", "/superadmin"];
  if (blocked.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return null;
  return raw;
}

export const routes = {
  /** Hasta dosyası; isteğe bağlı sekme (bilgi, randevular, tedavi, odeme, lab, belgeler...). */
  patient: (patientId: string, tab?: string) => withQuery("/hasta-detay", { id: patientId, tab }),
  /** Hasta listesi; isteğe bağlı arama metni. */
  patients: (q?: string) => withQuery("/hasta", { q }),
  /**
   * Yeni randevu formu. Hasta verilirse form o hasta seçili açılır (ad
   * verilmezse randevu ekranı adı kendisi yükler); tarih "YYYY-AA-GG".
   */
  newAppointment: (options: { patientId?: string; patientName?: string; date?: string; doctorId?: string } = {}) =>
    withQuery("/randevu", { yeni: 1, patientId: options.patientId, patientName: options.patientName, date: options.date, doctorId: options.doctorId }),
  /** Takvimde belirli bir randevuyu göster (gün görünümü, randevu vurgulu). */
  appointment: (appointmentId: string, date?: string) => withQuery("/randevu", { focusAppointmentId: appointmentId, date, view: "GUN" }),
  /** Randevular > Talepler penceresi (onay bekleyen online randevu talepleri). */
  bookingRequests: () => withQuery("/randevu", { talepler: "online" }),
  /** Yeni lab işi formu; hasta verilirse seçili açılır. */
  newLabOrder: (patientId?: string) => withQuery("/lab", { yeni: 1, patientId }),
  /** Laboratuvar listesi; isteğe bağlı sekme ("laboratuvarda", "klinikte"…). */
  labList: (tab?: string) => withQuery("/lab", { tab }),
  /** Aramalar ve görevler: "arama" = Hasta aramaları, "gorev" = Ekip görevleri. */
  todos: (tab?: "arama" | "gorev", query: Query = {}) => withQuery("/yapilacaklar", { tab, ...query }),
  /** Yeni görev formu (Aramalar ve görevler > Ekip görevleri); hasta verilirse seçili açılır. */
  newTask: (options: PatientContext = {}) => withQuery("/yapilacaklar", { tab: "gorev", yeni: 1, patientId: options.patientId, patientName: options.patientName }),
  /** Yeni hasta araması (Aramalar ve görevler > Hasta aramaları); hasta verilirse seçili açılır. */
  newFollowUp: (options: PatientContext = {}) => withQuery("/yapilacaklar", { tab: "arama", yeni: 1, patientId: options.patientId, patientName: options.patientName }),
  /** Tahsilat (gelir) formu; hasta verilirse seçili açılır (ad da verilmeli, form adı gösterir). */
  newCollection: (options: PatientContext = {}) =>
    withQuery("/muhasebe", { islem: "gelir", patientId: options.patientId, patientName: options.patientName }),
  /** Gider / ödeme formu. */
  newExpense: () => withQuery("/muhasebe", { islem: "gider" }),
  /** Muhasebe > Alacaklar > Taksitler, yalnız vadesi geçmiş taksitler. */
  overdueInstallments: () => withQuery("/muhasebe", { tab: "alacaklar", gorunum: "taksitler", durum: "GECIKTI" }),
  /**
   * Stok listesi; isteğe bağlı sekme ("kritik", "siparis", "skt", "arsiv").
   * Sözlük §3.3: yeni bağlantılar `?tab=` kullanır (eski `?durum=` de çalışır,
   * ama sayfa açılınca adresi bir kez daha yeniden yazar).
   */
  stockList: (tab?: string) => withQuery("/stok", { tab }),
  /** Ana sayfadaki ekip mesajları bölümü. */
  /** Yeni personel penceresi (Personel sayfasında). */
  newStaff: () => withQuery("/personel", { yeni: 1 }),
  /** İşlem kayıtları > Kayıt kontrolü (eski Sistem Durumu). */
} as const;
