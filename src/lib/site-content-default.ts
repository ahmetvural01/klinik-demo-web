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
    "KlinikModern; hasta kayit, randevu planlama, tedavi takibi, odeme yonetimi, SMS/e-posta hatirlatma ve raporlama modullerini tek bir profesyonel vitrinde toplar.",
  primaryCtaLabel: "Klinik Girisi",
  primaryCtaUrl: "/klinik/giris",
  secondaryCtaLabel: "Paketleri Incele",
  secondaryCtaUrl: "#fiyatlar",
  promoTitle: "Program Demo ve Tanitim Talebi",
  promoDescription:
    "Kliniginize ozel senaryo uzerinden canli tanitim alarak modulleri gercek kullanim akisinda gorebilir, ekibinizle hizli gecis planlayabilirsiniz.",
  promoVideoUrl: "https://www.youtube.com/embed/aqz-KE-bpKQ",
  heroImageUrl: "https://images.unsplash.com/photo-1666214280557-f1b5022eb634?auto=format&fit=crop&w=1400&q=80",
  showAnimations: true,
  statsCards: [
    { title: "%99.9", description: "Sureklilik", color: "cyan" },
    { title: "7/24", description: "Bulut Erisim", color: "emerald" },
    { title: "Moduler", description: "Buyuyen Yapi", color: "indigo" },
  ],
  moduleCards: [
    { title: "Hasta ve Randevu Yonetimi", description: "Ajanda, doktor takvimi, renkli randevu akışı ve otomatik hatırlatma.", color: "cyan" },
    { title: "Tedavi ve Finans Takibi", description: "Muayene, işlem, ödeme, tahsilat ve cari raporlama.", color: "emerald" },
    { title: "Iletisim Otomasyonu", description: "SMS/e-posta şablonları, toplu bilgilendirme, fatura hatırlatma.", color: "indigo" },
  ],
  featureCards: [
    { title: "Hizli Kurulum", description: "Dakikalar içinde aktif kullanım", icon: "⚡" },
    { title: "Guvenli Altyapi", description: "JWT + HttpOnly cookie + audit kayıtları", icon: "🔒" },
    { title: "Esnek Moduller", description: "Kliniğinize göre aç/kapa modül yaklaşımı", icon: "🧩" },
    { title: "Destek ve Egitim", description: "Canlı destek, onboarding ve eğitim", icon: "🎯" },
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
      items: ["Cok sube ve merkezi yonetim", "Ozel entegrasyon destegi", "Kurumsal SLA"],
      color: "emerald",
    },
  ],
  galleryImages: [
    "https://www.w3schools.com/html/mov_bbb.mp4",
    "https://www.w3schools.com/html/movie.mp4",
    "https://images.unsplash.com/photo-1584982751601-97dcc096659c?auto=format&fit=crop&w=1400&q=80",
  ],
};
