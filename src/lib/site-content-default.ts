export type SiteCard = {
  title: string;
  description?: string;
  price?: string;
  period?: string;
  badge?: string;
  icon?: string;
  items?: string[];
  color?: string;
};

export type SiteContentPayload = {
  heroBadge: string;
  heroTitle: string;
  heroDescription: string;
  primaryCtaLabel: string;
  primaryCtaUrl: string;
  secondaryCtaLabel: string;
  secondaryCtaUrl: string;
  promoTitle: string;
  promoDescription: string;
  promoVideoUrl: string;
  heroImageUrl: string;
  showAnimations: boolean;
  featureCards: SiteCard[];
  pricingCards: SiteCard[];
  statsCards: SiteCard[];
  moduleCards: SiteCard[];
  galleryImages: string[];
};

export const DEFAULT_SITE_CONTENT: SiteContentPayload = {
  heroBadge: "Dis Hekimi Klinikleri Icin Uretildi",
  heroTitle: "Randevudan tahsilata, tum klinik operasyonu tek merkezden yonetin.",
  heroDescription:
    "Hasta kayit, randevu planlama, tedavi takibi, odeme yonetimi, SMS/e-posta hatirlatma ve raporlama modullerini tek bir profesyonel panelde toplayin.",
  primaryCtaLabel: "Klinik Girisi",
  primaryCtaUrl: "/klinik/giris",
  secondaryCtaLabel: "Paketleri Incele",
  secondaryCtaUrl: "#fiyatlar",
  promoTitle: "Program Demo ve Tanitim Talebi",
  promoDescription:
    "Kliniginize ozel senaryo uzerinden canli tanitim alarak modulleri gercek kullanim akisinda gorebilir, ekibinizle hizli gecis planlayabilirsiniz.",
  promoVideoUrl: "",
  heroImageUrl: "https://images.unsplash.com/photo-1666214280557-f1b5022eb634?auto=format&fit=crop&w=1400&q=80",
  showAnimations: false,
  statsCards: [
    { title: "Tek Panel", description: "Operasyon Yonetimi", color: "cyan" },
    { title: "Yetkili", description: "Rol Bazli Erisim", color: "emerald" },
    { title: "Moduler", description: "Klinige Gore Yapi", color: "indigo" },
  ],
  moduleCards: [
    { title: "Hasta ve Randevu Yonetimi", description: "Ajanda, doktor takvimi, renkli randevu akışı ve otomatik hatırlatma.", color: "cyan" },
    { title: "Tedavi ve Finans Takibi", description: "Muayene, işlem, ödeme, tahsilat ve cari raporlama.", color: "emerald" },
    { title: "Iletisim Otomasyonu", description: "SMS/e-posta şablonları, toplu bilgilendirme, fatura hatırlatma.", color: "indigo" },
  ],
  featureCards: [
    { title: "Kurulum ve Geçiş", description: "Klinik yapısına uygun başlangıç planı", icon: "01" },
    { title: "Yetkili Erişim", description: "Rol bazlı panel kullanımı ve denetim izi", icon: "02" },
    { title: "Esnek Modüller", description: "İhtiyaca göre açılıp kapanabilen yapı", icon: "03" },
    { title: "Destek ve Eğitim", description: "Ekip kullanımına yönelik süreç desteği", icon: "04" },
  ],
  pricingCards: [
    {
      title: "TEMEL",
      price: "₺1.990",
      period: "/ay",
      items: ["Hasta ve randevu yönetimi", "Temel ödeme takibi", "Standart destek"],
      color: "slate",
    },
    {
      title: "PROFESYONEL",
      badge: "EN COK TERCIH EDILEN",
      price: "₺3.490",
      period: "/ay",
      items: ["Tum temel paket ozellikleri", "SMS/e-posta otomasyonları", "Gelişmiş raporlar", "Öncelikli destek"],
      color: "cyan",
    },
    {
      title: "KURUMSAL",
      price: "Ozel Teklif",
      period: "coklu klinik icin",
      items: ["Çok şube ve merkezi yönetim", "Özel entegrasyon desteği", "Kurumsal SLA"],
      color: "emerald",
    },
  ],
  galleryImages: [],
};
