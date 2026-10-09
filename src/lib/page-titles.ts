// Sayfa adlarının tek listesi: sol menü adı = sayfa başlığı (h1) = tarayıcı
// sekmesi başlığı. Sekmede sayfa adı yazmadığı için birden çok sekme açan
// personel hangi sekmenin hangi ekran olduğunu ayırt edemiyordu.
export const PAGE_TITLES: Record<string, string> = {
  "/anasayfa": "Anasayfa",
  "/randevu": "Randevular",
  "/hasta": "Hastalar",
  "/hasta-detay": "Hasta dosyası",
  "/gorevler": "Görevler",
  "/hasta-takip": "Hasta Takip",
  "/lab": "Laboratuvar",
  "/sms": "İletişim",
  "/muhasebe": "Muhasebe",
  "/finans": "Hakedişim",
  "/rapor": "Raporlar",
  "/fiyat": "Fiyat Listesi",
  "/stok": "Stok",
  "/firma": "Satın Alma",
  "/firma-detay": "Tedarikçi",
  "/personel": "Personel",
  "/personel-ekle": "Yeni personel",
  "/ayar": "Ayarlar",
  "/log": "İşlem Kayıtları",
  "/sistem-izleme": "Sistem Durumu",
  "/tedavi-plani": "Tedavi Planları",
  "/recete": "Reçete",
  "/profil": "Profilim",
  "/destek": "Destek",
  "/yetkisiz": "Erişim yok",
};

export function pageTitleFor(pathname: string | null | undefined): string {
  return (pathname && PAGE_TITLES[pathname]) || "";
}
