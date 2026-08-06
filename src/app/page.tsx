"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  Lock,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";
import { DemoRequestForm } from "@/components/marketing/DemoRequestForm";
import { ModuleCard } from "@/components/marketing/ModuleCard";
import { LaptopFrame, PhoneFrame } from "@/components/marketing/DeviceFrames";
import {
  CalendarScreen,
  DashboardScreen,
  FinanceScreen,
  LabScreen,
  MessagingScreen,
  MobileScreen,
  PatientScreen,
  StockScreen,
} from "@/components/marketing/ScreenMockups";

const HERO_IMAGE = "/clinic-workspace-hero.jpg";

const NAV_ITEMS = [
  { id: "urun", label: "Ürün" },
  { id: "moduller", label: "Modüller" },
  { id: "isleyis", label: "İşleyiş" },
  { id: "fiyatlandirma", label: "Fiyatlandırma" },
  { id: "sss", label: "SSS" },
  { id: "demo", label: "Demo Talebi" },
] as const;

type TabId = (typeof NAV_ITEMS)[number]["id"];
const TAB_IDS = NAV_ITEMS.map((item) => item.id);

const domainTags = [
  "Randevu", "Hasta Yönetimi", "Muayene", "Tedavi Planı", "Diş Şeması", "Reçete",
  "Laboratuvar", "Muhasebe", "Taksit", "Stok", "Firma / Tedarikçi",
  "SMS / WhatsApp", "Görev Takibi", "Raporlama", "Personel ve Yetki",
];

const roles = [
  { title: "Yönetici", desc: "Kliniğin tüm modüllerine erişir; finans, personel ve yetki yönetimini yürütür." },
  { title: "Doktor", desc: "Kendi hasta ve randevularını, muayene ile tedavi planlarını yönetir." },
  { title: "Asistan / Banko", desc: "Randevu, hasta kaydı ve günlük operasyonel işlemleri yürütür." },
  { title: "Muhasebe", desc: "Tahsilat, gider ve raporlama ekranlarına odaklı, sınırlı erişimle çalışır." },
];

const architecturePoints = [
  { icon: Building2, title: "Kurum bazlı izolasyon", desc: "Her klinığın verisi diğerlerinden tamamen ayrı tutulur." },
  { icon: ShieldCheck, title: "Rol bazlı erişim", desc: "Her personel yalnızca görevine uygun ekranları görür." },
  { icon: CheckCircle2, title: "Uçtan uca denetim izi", desc: "Kim, ne zaman, hangi kaydı değiştirdi — geriye dönük izlenebilir." },
  { icon: Lock, title: "Şifreli veri saklama", desc: "KVKK kapsamındaki hassas alanlar şifreli tutulur." },
];

const modules = [
  {
    key: "randevu", title: "Randevu Yönetimi", icon: "calendar", size: "large" as const, badge: "En çok kullanılan",
    benefit: "Doktor ve tedavi alanına göre çakışmasız randevu planlayın, boşlukları azaltın.",
    features: ["Çoklu doktor / tedavi alanı takvimi", "Bekleme listesi ve online randevu talepleri", "Otomatik SMS/WhatsApp hatırlatma"],
    Screen: CalendarScreen,
  },
  {
    key: "hasta", title: "Hasta Yönetimi", icon: "users", size: "large" as const,
    benefit: "Hasta geçmişi, iletişim bilgileri ve klinik notları tek dosyada birleşir.",
    features: ["Arşiv ve KVKK onam kayıtları", "Belge ve rontgen yönetimi", "Hasta bazlı iletişim tercihleri"],
    Screen: PatientScreen,
  },
  {
    key: "muhasebe", title: "Muhasebe", icon: "finance", size: "large" as const,
    benefit: "Tahsilat, gider ve firma ödemelerini tek muhasebe defterinde görün.",
    features: ["Tahsilat ve gider kaydı", "Hekim hakediş hesaplama", "Alacak ve vade takibi"],
    Screen: FinanceScreen,
  },
  {
    key: "lab", title: "Laboratuvar", icon: "flask", size: "large" as const,
    benefit: "Laboratuvara giden işleri, prova ve teslim sürecini uçtan uca izleyin.",
    features: ["Firma bazlı sipariş takibi", "Prova/gönderim durumu", "Laboratuvar faturasının otomatik işlenmesi"],
    Screen: LabScreen,
  },
  {
    key: "hasta-detay", title: "Hasta Detay", icon: "person", size: "medium" as const,
    benefit: "Tek hastanın tüm geçmişi — tedavi, ödeme, belge — tek ekranda.",
    features: ["Tedavi ve ödeme geçmişi", "Diş şeması görünümü"],
  },
  {
    key: "muayene", title: "Muayene", icon: "clipboard", size: "medium" as const,
    benefit: "Muayene bulgularını ve tanıları hızlıca kaydedin.",
    features: ["Diş bazlı bulgu kaydı", "Tedavi planına bağlantı"],
  },
  {
    key: "tedavi-plani", title: "Tedavi Planı", icon: "tedavi", size: "medium" as const,
    benefit: "Adım adım tedavi sürecini planlayın ve ilerlemesini takip edin.",
    features: ["Diş şeması üzerinde planlama", "Adım bazlı durum takibi"],
  },
  {
    key: "recete", title: "Reçete", icon: "clipboard", size: "medium" as const,
    benefit: "Reçeteleri hasta dosyasına bağlı şekilde düzenleyin ve yazdırın.",
    features: ["Hızlı reçete şablonları", "Hasta geçmişiyle ilişkili kayıt"],
  },
  {
    key: "taksit", title: "Taksit", icon: "hakedis", size: "medium" as const,
    benefit: "Tedavi tutarlarını taksitlendirin, vadesi gelenleri otomatik izleyin.",
    features: ["Taksit planı oluşturma", "Gecikme takibi ve hatırlatma"],
  },
  {
    key: "stok", title: "Stok", icon: "box", size: "large" as const,
    benefit: "Sarf malzeme tüketimini otomatik düşürün, kritik seviye uyarılarıyla eksik kalmayın.",
    features: ["Otomatik tüketim düşümü", "Kritik stok bildirimleri", "Tedarikçi bazlı satın alma geçmişi"],
    Screen: StockScreen,
  },
  {
    key: "firma", title: "Firma ve Tedarikçi", icon: "firma", size: "medium" as const,
    benefit: "Tedarikçi ve laboratuvar firmalarınızın cari hesabını tutun.",
    features: ["Satın alma ve ödeme kaydı", "Firma bazlı ekstre"],
  },
  {
    key: "sms", title: "SMS / WhatsApp", icon: "sms", size: "large" as const,
    benefit: "Randevu ve ödeme hatırlatmalarını izin bazlı SMS/WhatsApp ile otomatik gönderin.",
    features: ["Onay (opt-in) temelli gönderim", "Klinik bazlı WhatsApp hattı", "Şablon ve zamanlama yönetimi"],
    Screen: MessagingScreen,
  },
  {
    key: "gorev", title: "Görev Merkezi", icon: "clipboard", size: "medium" as const,
    benefit: "Personel görevlerini atayın, tamamlanmasını takip edin.",
    features: ["Görev atama ve önceliklendirme", "Durum bazlı takip"],
  },
  {
    key: "personel", title: "Personel", icon: "users", size: "medium" as const,
    benefit: "Personel bilgilerini ve çalışma programlarını tek yerden yönetin.",
    features: ["Çalışma saatleri ve izinler", "Doktor hakediş yüzdeleri"],
  },
  {
    key: "raporlar", title: "Raporlar", icon: "rapor", size: "medium" as const,
    benefit: "Klinik performansını finansal ve operasyonel raporlarla ölçün.",
    features: ["Gelir/gider özetleri", "Hekim performans raporu"],
  },
  {
    key: "rol-yetki", title: "Rol ve Yetki", icon: "settings", size: "small" as const,
    benefit: "Her rolün hangi ekrana erişeceğini ince ayarla belirleyin.",
  },
  {
    key: "sistem-izleme", title: "Sistem İzleme", icon: "log", size: "small" as const,
    benefit: "Tüm kritik işlemler denetim kaydına otomatik düşer.",
  },
] as const;

const workflowStages = [
  {
    stage: "01", id: "hasta-randevu", title: "Hasta ve Randevu", icon: "calendar",
    desc: "Hasta kaydı oluşturulur, onay alınır ve uygun doktora randevu planlanır.",
    subs: ["Hasta kaydı", "KVKK / onam", "Doktor seçimi", "Randevu planlama", "Otomatik hatırlatma"],
    Screen: CalendarScreen,
  },
  {
    stage: "02", id: "muayene-tedavi", title: "Muayene ve Tedavi", icon: "tedavi",
    desc: "Muayene bulguları kaydedilir, diş şeması üzerinden tedavi planı oluşturulur.",
    subs: ["Muayene kaydı", "Diş şeması", "Tedavi planı", "Reçete", "Belge yönetimi"],
    Screen: PatientScreen,
  },
  {
    stage: "03", id: "operasyon-finans", title: "Operasyon ve Finans", icon: "finance",
    desc: "Tedavi laboratuvara yönlendirilir, kullanılan malzeme stoktan düşer, tahsilat işlenir.",
    subs: ["Laboratuvar süreci", "Stok hareketleri", "Tahsilat", "Taksit", "Firma / tedarikçi"],
    Screen: FinanceScreen,
  },
  {
    stage: "04", id: "iletisim-yonetim", title: "İletişim ve Yönetim", icon: "sms",
    desc: "Hasta bilgilendirilir, görevler atanır ve yönetim tüm süreci raporlar üzerinden izler.",
    subs: ["SMS / WhatsApp", "Görev takibi", "Raporlama", "Personel ve yetki", "Yönetim izleme"],
    Screen: MessagingScreen,
  },
] as const;

const pricingFactors = [
  { title: "Dahil olan modüller", desc: "Yalnızca ihtiyaç duyduğunuz modüller (randevu, muhasebe, laboratuvar, stok vb.) teklife dahil edilir." },
  { title: "Kullanıcı ve şube yapısı", desc: "Personel sayısı ve tek/çoklu şube yapınıza göre lisanslama ölçeklenir." },
  { title: "SMS / WhatsApp kullanımı", desc: "Mesajlaşma hacmi kliniğe göre değiştiğinden ayrı ve şeffaf şekilde ücretlendirilir." },
  { title: "Veri aktarımı", desc: "Mevcut Excel veya başka bir yazılımdan veri aktarımı kurulum teklifine dahil edilebilir." },
  { title: "Kurulum ve eğitim", desc: "Personel eğitimi ve ilk kurulum desteği teklifin bir parçasıdır." },
  { title: "Destek ve güncellemeler", desc: "Sürüm güncellemeleri ve teknik destek paket kapsamında yürütülür." },
  { title: "Yedekleme", desc: "Düzenli otomatik yedekleme politikası tüm kurumlar için standarttır." },
  { title: "Demo süreci", desc: "Teklif öncesi ihtiyacınıza uygun, ücretsiz ve süreli bir demo ile sistemi test edersiniz." },
];

const faqs = [
  { q: "Kurulum gerekiyor mu?", a: "Hayır. Sistem tarayıcı üzerinden çalışır; ek bir yazılım kurulumu gerekmez. İhtiyaç halinde veri aktarımı ve kullanıcı eğitimi için destek sağlanır." },
  { q: "Bulut tabanlı mı?", a: "Evet. Sistem bulut altyapısında çalışır; yerel sunucu veya bakım gerektirmez, düzenli olarak yedeklenir." },
  { q: "Veriler güvende mi?", a: "Evet. Hassas hasta bilgileri şifreli saklanır, her kurumun verisi diğerlerinden tamamen izole tutulur." },
  { q: "KVKK uyumu nasıl sağlanıyor?", a: "Hasta onam kayıtları dijital olarak alınır, hassas alanlar şifrelenir ve her hasta kaydı görüntülemesi erişim kaydı olarak loglanır." },
  { q: "Çoklu şube kullanılabilir mi?", a: "Evet. Birden fazla şube desteklenir; şube ve kullanıcı düzeyinde ayrı yetkilendirme yapılabilir." },
  { q: "Kullanıcı ve rol sınırı var mı?", a: "Kullanıcı sayısı klinik büyüklüğüne göre ölçeklenir; her kullanıcıya rol bazlı (Yönetici, Doktor, Asistan, Muhasebe) yetki tanımlanır." },
  { q: "Mevcut veriler taşınabilir mi?", a: "Evet. Excel/CSV veya başka bir yazılımdan hasta, randevu ve stok verileri için aktarım desteği sağlanır." },
  { q: "SMS/WhatsApp nasıl çalışır?", a: "SMS/WhatsApp yalnızca hastanın izniyle gönderilir; WhatsApp için kliniğe özel bir hat bağlantısı kurulur." },
  { q: "Mobilde kullanılabilir mi?", a: "Evet. Panel, telefon ve tablet tarayıcılarında da tam uyumlu şekilde çalışır." },
  { q: "Yedekleme nasıl yapılır?", a: "Düzenli otomatik yedekleme politikaları uygulanır; kritik veriler güvenli ortamlarda saklanır." },
  { q: "Destek nasıl sağlanır?", a: "Kurulum, veri aktarımı ve günlük kullanım sorularında destek ekibiyle iletişime geçilebilir; detaylar teklifte belirtilir." },
  { q: "Demo süreci nasıl işler?", a: "Demo formunu doldurduğunuzda kısa bir ihtiyaç görüşmesinin ardından size özel, izole bir demo hesabı hazırlanır." },
  { q: "Güncellemeler dahil mi?", a: "Evet. Sürekli özellik güncellemeleri ve güvenlik yamaları pakete dahildir, ayrı ücretlendirilmez." },
  { q: "Klinik personeli için eğitim veriliyor mu?", a: "Evet. Kurulum sürecinde personelinize sistemin kullanımına yönelik eğitim ve destek verilir." },
];

const demoSteps = [
  { step: "1", title: "Talep gönderilir", desc: "Demo formunu doldurursunuz." },
  { step: "2", title: "İhtiyaç görüşmesi", desc: "Kısa bir görüşmeyle klinik yapınız anlaşılır." },
  { step: "3", title: "Demo hazırlanır", desc: "Klinik yapınıza uygun izole bir demo hesabı oluşturulur." },
  { step: "4", title: "Canlı gösterim", desc: "Ürün, kendi senaryolarınızla birlikte gösterilir." },
  { step: "5", title: "Teklif paylaşılır", desc: "İhtiyacınıza özel fiyat teklifi sunulur." },
] as const;

function useTab() {
  const [activeTab, setActiveTab] = useState<TabId>("urun");

  useEffect(() => {
    const readTab = () => {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab");
      return (TAB_IDS as readonly string[]).includes(t || "") ? (t as TabId) : "urun";
    };
    setActiveTab(readTab());
    const onPop = () => setActiveTab(readTab());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const switchTab = (id: TabId) => {
    setActiveTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.pushState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return { activeTab, switchTab };
}

export default function RootPage() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { activeTab, switchTab } = useTab();

  const go = (id: TabId) => {
    setMobileNavOpen(false);
    switchTab(id);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link href="/" onClick={() => go("urun")} className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7d6f] focus-visible:ring-offset-2 rounded-md" aria-label="Ana sayfa">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0d7d6f] to-[#0a5b57] text-sm font-black text-white shadow-sm">
              KM
            </span>
            <span className="text-sm font-black tracking-tight">KlinikModern</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 lg:flex">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={`rounded-md px-1 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7d6f] focus-visible:ring-offset-2 ${activeTab === item.id ? "text-[#0d7d6f]" : "hover:text-[#0d7d6f]"}`}
                aria-current={activeTab === item.id ? "page" : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/klinik/giris"
              className="hidden rounded-lg bg-[#0d7d6f] px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#0a655a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7d6f] focus-visible:ring-offset-2 lg:inline-flex"
            >
              Klinik Girişi
            </Link>
            <button
              type="button"
              aria-label={mobileNavOpen ? "Menüyü kapat" : "Menüyü aç"}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((v) => !v)}
              className="inline-flex items-center justify-center rounded-md p-2 text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7d6f] lg:hidden"
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileNavOpen && (
          <div className="border-t border-slate-200 bg-white lg:hidden">
            <div className="mx-auto max-w-3xl px-5 py-4">
              <div className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => go(item.id)}
                    className={`rounded-md px-2 py-2.5 text-left ${activeTab === item.id ? "bg-slate-50 text-[#0d7d6f]" : ""}`}
                  >
                    {item.label}
                  </button>
                ))}
                <Link href="/klinik/giris" className="mt-2 inline-flex justify-center rounded-md bg-[#0d7d6f] px-3 py-2.5 text-sm font-bold text-white">
                  Klinik Girişi
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ============================== ÜRÜN ============================== */}
      {activeTab === "urun" && (
        <>
          {/* HERO — ürün odaklı: sol metin/CTA, sağ gerçek panel + mobil cihaz maketi */}
          <section className="relative overflow-hidden bg-gradient-to-br from-[#08201c] via-[#0a2b26] to-[#0d3a33]">
            <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#14b8a6]/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-[#14b8a6]/10 blur-3xl" />
            <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-14 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:py-20">
              <div className="max-w-xl text-white">
                <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-teal-100">
                  Diş hekimliği klinikleri için kurumsal yönetim yazılımı
                </span>
                <h1 className="mt-5 text-4xl font-black leading-[1.1] tracking-tight md:text-5xl">
                  Kliniğinizin tüm işleyişi, tek profesyonel panelde.
                </h1>
                <p className="mt-4 text-base leading-7 text-slate-300">
                  Randevudan tahsilata, tedaviden laboratuvar takibine kadar tüm klinik süreçlerini rol bazlı yetkilerle tek sistemden yönetin.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => go("demo")}
                    className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-black text-[#0a2b26] shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#08201c]"
                  >
                    Demo Talep Et
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <Link
                    href="/klinik/giris"
                    className="rounded-lg border border-white/25 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#08201c]"
                  >
                    Mevcut Kullanıcı Girişi
                  </Link>
                </div>
              </div>

              <div className="relative flex items-end justify-center gap-0 pl-10 pt-10 sm:pl-14 sm:pt-14">
                <LaptopFrame className="max-w-lg">
                  <DashboardScreen />
                </LaptopFrame>
                {/* Telefon, laptop içeriğinin üstüne binmeden yalnızca kenarını paylaşır. */}
                <div className="-ml-9 hidden w-28 flex-none sm:block">
                  <PhoneFrame>
                    <MobileScreen />
                  </PhoneFrame>
                </div>
                {/* Diş hekimliği bağlamını hatırlatan görsel — hâkim öge değil, ürünü tanıtan bir aksan. */}
                <div className="absolute -left-2 -top-2 h-20 w-20 overflow-hidden rounded-2xl border-4 border-white/90 shadow-xl sm:h-28 sm:w-28">
                  <Image src={HERO_IMAGE} alt="Diş hekimliği muayenesi" fill unoptimized className="object-cover" />
                </div>
              </div>
            </div>
          </section>

          {/* Kısa güven şeridi — sitede yalnızca bu tek yerde */}
          <section className="border-b border-slate-200 bg-white">
            <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-5 py-6 lg:grid-cols-4">
              {architecturePoints.map((item) => (
                <div key={item.title} className="flex items-center gap-2.5 text-sm font-semibold text-slate-600">
                  <item.icon className="h-4 w-4 flex-none text-[#0d7d6f]" />
                  {item.title}
                </div>
              ))}
            </div>
          </section>

          {/* Sistemin kapsadığı alanlar — etiket bulutu, kart tekrarı yok */}
          <section className="mx-auto max-w-7xl px-5 py-16">
            <div className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-wide text-[#0d7d6f]">Kapsam</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">Kayıt defteri değil, uçtan uca bir yönetim sistemi</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Bir randevudan tedaviye, tedaviden faturaya, faturadan tahsilata giden akışın tamamı aynı sistemde birbirine bağlıdır.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {domainTags.map((tag) => (
                <span key={tag} className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-600">
                  {tag}
                </span>
              ))}
            </div>
          </section>

          {/* Rol bazlı kullanım */}
          <section className="border-y border-slate-200 bg-white">
            <div className="mx-auto max-w-7xl px-5 py-16">
              <div className="max-w-2xl">
                <p className="text-xs font-black uppercase tracking-wide text-[#0d7d6f]">Rol Bazlı Kullanım</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight">Her personel yalnızca kendi işini görür</h2>
              </div>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {roles.map((role) => (
                  <div key={role.title} className="rounded-xl border border-slate-200 bg-slate-50/60 p-5">
                    <h3 className="text-sm font-black text-slate-900">{role.title}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-600">{role.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Veri güvenliği + çoklu şube — iki blok yan yana */}
          <section className="mx-auto max-w-7xl px-5 py-16">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-7">
                <Lock className="h-6 w-6 text-[#0d7d6f]" />
                <h3 className="mt-4 text-lg font-black text-slate-900">Veri güvenliği ve KVKK</h3>
                <p className="mt-2.5 text-sm leading-6 text-slate-600">
                  Hasta sağlık bilgileri gibi hassas alanlar şifreli saklanır, her kayıt görüntülemesi erişim kaydı olarak loglanır ve hasta onamları dijital olarak takip edilir.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-7">
                <Building2 className="h-6 w-6 text-[#0d7d6f]" />
                <h3 className="mt-4 text-lg font-black text-slate-900">Çoklu klinik / şube yapısı</h3>
                <p className="mt-2.5 text-sm leading-6 text-slate-600">
                  Tek şubeden çok şubeli klinik zincirlerine kadar ölçeklenir; her şube kendi verisiyle, yönetim ise tüm şubelerin genel görünümüyle çalışır.
                </p>
              </div>
            </div>
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={() => go("demo")}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0d7d6f] px-5 py-3 text-sm font-black text-white shadow-sm transition-colors hover:bg-[#0a655a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7d6f] focus-visible:ring-offset-2"
              >
                Demo Talep Et
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        </>
      )}

      {/* ============================== MODÜLLER ============================== */}
      {activeTab === "moduller" && (
        <section className="mx-auto max-w-7xl px-5 py-16">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-wide text-[#0d7d6f]">Modüller</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Klinik iş akışına göre tasarlanmış yapı</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Her modül belirli bir klinik ihtiyacını çözer. Yoğun kullanılan modüller gerçek ekranıyla, destek modülleri ise kısa ve öz kartlarla gösterilir.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((module) => (
              <ModuleCard
                key={module.key}
                title={module.title}
                benefit={module.benefit}
                features={"features" in module ? [...module.features] : []}
                badge={"badge" in module ? module.badge : undefined}
                icon={module.icon}
                size={module.size}
                Screen={"Screen" in module ? module.Screen : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {/* ============================== İŞLEYİŞ ============================== */}
      {activeTab === "isleyis" && (
        <section className="bg-white">
          <div className="mx-auto max-w-7xl px-5 py-16">
            <div className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-wide text-[#0d7d6f]">İşleyiş</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">Bir hastanın sistemdeki yolculuğu</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Klinik personeli bir sonraki adımı aramaz — her kayıt otomatik olarak sıradaki aşamaya bağlanır.
              </p>
            </div>

            <div className="relative mt-12">
              {/* Masaüstü: yatay akış çizgisi */}
              <div aria-hidden className="absolute left-0 right-0 top-9 hidden h-0.5 bg-slate-200 lg:block" />
              <ol className="relative grid gap-10 lg:grid-cols-4 lg:gap-6">
                {workflowStages.map((stage) => (
                  <li key={stage.id} className="relative">
                    <div className="flex items-center gap-3 lg:flex-col lg:items-start lg:gap-0">
                      <span className="relative z-10 flex h-[72px] w-[72px] flex-none items-center justify-center rounded-2xl border-4 border-[#0d7d6f] bg-white shadow-lg shadow-[#0d7d6f]/15">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/icons/modules/${stage.icon}.svg`} alt="" width={34} height={34} />
                      </span>
                      <div className="lg:mt-4">
                        <span className="text-xs font-black text-slate-300">AŞAMA {stage.stage}</span>
                        <h3 className="text-base font-black text-slate-900">{stage.title}</h3>
                      </div>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-slate-600">{stage.desc}</p>

                    <ul className="mt-4 space-y-1.5">
                      {stage.subs.map((sub) => (
                        <li key={sub} className="flex items-start gap-2 text-xs font-semibold text-slate-700">
                          <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-[#0d7d6f]/60" />
                          {sub}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-5 hidden overflow-hidden rounded-xl border border-slate-200 shadow-sm sm:block">
                      <div className="scale-[0.62] origin-top-left w-[161%]">
                        <stage.Screen />
                      </div>
                    </div>

                    {/* Mobil: dikey bağlantı çizgisi */}
                    {stage.stage !== "04" && (
                      <span aria-hidden className="absolute -bottom-6 left-9 h-6 w-0.5 bg-slate-200 lg:hidden" />
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      )}

      {/* ============================== FİYATLANDIRMA ============================== */}
      {activeTab === "fiyatlandirma" && (
        <section className="bg-white">
          <div className="mx-auto max-w-7xl px-5 py-16">
            <div className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-wide text-[#0d7d6f]">Fiyatlandırma</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">Sabit liste fiyatı yerine size özel teklif</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Tek şubeli bir klinik ile çok şubeli bir klinik zincirinin ihtiyacı aynı değildir — bu yüzden sabit bir fiyat listesi yerine,
                aşağıdaki kalemlere göre hazırlanan bir teklif sunuyoruz.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {pricingFactors.map((item) => (
                <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50/60 p-5">
                  <CheckCircle2 className="h-5 w-5 text-[#0d7d6f]" />
                  <h3 className="mt-3 text-sm font-black text-slate-900">{item.title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-slate-600">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/60 p-7">
              <h3 className="text-sm font-black text-slate-900">Küçük klinik mi, çok şubeli yapı mı?</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Tek şubeli bir klinik yalnızca ihtiyaç duyduğu modüllerle sade bir kurulum alır. Çok şubeli yapılarda ise şubeler arası
                raporlama, merkezi stok/tedarik yönetimi ve şube bazlı yetkilendirme teklife eklenir — ödediğiniz, gerçekten kullandığınız kapsamdır.
              </p>
            </div>

            <button
              type="button"
              onClick={() => go("demo")}
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#0d7d6f] px-5 py-3 text-sm font-black text-white shadow-sm transition-colors hover:bg-[#0a655a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7d6f] focus-visible:ring-offset-2"
            >
              Size özel teklif için demo talep edin
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {/* ============================== SSS ============================== */}
      {activeTab === "sss" && (
        <section className="bg-slate-50">
          <div className="mx-auto max-w-3xl px-5 py-16">
            <div className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-wide text-[#0d7d6f]">Sık Sorulan Sorular</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">Merak edilenler</h2>
            </div>
            <div className="mt-8 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {faqs.map((item) => (
                <details key={item.q} className="group p-5 open:bg-slate-50/60">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-black text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7d6f] focus-visible:ring-offset-2 rounded-md">
                    {item.q}
                    <ChevronDown className="h-4 w-4 flex-none text-slate-400 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============================== DEMO TALEBİ ============================== */}
      {activeTab === "demo" && (
        <section className="bg-white">
          <div className="mx-auto max-w-7xl px-5 py-16">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-[#0d7d6f]">Demo Talebi</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight">Size özel canlı demo talep edin</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Demo hesabınız süreli ve izole şekilde oluşturulur; kendi klinik senaryolarınızla test edebilirsiniz.
                </p>

                <ol className="mt-7 space-y-4">
                  {demoSteps.map((step) => (
                    <li key={step.step} className="flex items-start gap-3">
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#0d7d6f]/10 text-xs font-black text-[#0d7d6f]">
                        {step.step}
                      </span>
                      <div>
                        <p className="text-sm font-black text-slate-900">{step.title}</p>
                        <p className="text-xs leading-5 text-slate-600">{step.desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="mt-7 grid gap-2.5 sm:grid-cols-2">
                  {[
                    "Dönüş süresi: 1–2 iş günü",
                    "Kurulum gerektirmez",
                    "Satış baskısı yoktur",
                    "Demo verileri izoledir",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <CheckCircle2 className="h-4 w-4 flex-none text-[#0d7d6f]" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <DemoRequestForm />
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#0d7d6f] to-[#0a5b57] text-xs font-black text-white">
                KM
              </span>
              <span className="text-sm font-black tracking-tight text-slate-800">KlinikModern</span>
            </div>
            <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold text-slate-500">
              {NAV_ITEMS.map((item) => (
                <button key={item.id} type="button" onClick={() => go(item.id)} className="hover:text-[#0d7d6f]">
                  {item.label}
                </button>
              ))}
              <Link href="/klinik/giris" className="hover:text-[#0d7d6f]">Klinik Girişi</Link>
            </nav>
          </div>
          <div className="mt-6 flex flex-col gap-2 border-t border-slate-100 pt-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} KlinikModern. Tüm hakları saklıdır.</p>
            <p>Diş hekimliği klinikleri için KVKK kapsamında geliştirilmiş kurumsal yönetim yazılımı.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
