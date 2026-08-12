"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  Database,
  FileText,
  HeartPulse,
  Layers3,
  LockKeyhole,
  Menu,
  MessageSquareText,
  MonitorSmartphone,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UsersRound,
  X,
} from "lucide-react";
import { DemoRequestForm } from "@/components/marketing/DemoRequestForm";
import { KlinikCepMark } from "@/components/brand/KlinikCepMark";
import { BRAND_NAME, BRAND_PRODUCT_LABEL } from "@/lib/brand";
import { LaptopFrame, PhoneFrame } from "@/components/marketing/DeviceFrames";
import {
  CalendarScreen,
  DashboardScreen,
  FinanceScreen,
  MessagingScreen,
  MobileScreen,
  PatientScreen,
} from "@/components/marketing/ScreenMockups";
import styles from "./marketing.module.css";

const NAV_ITEMS = [
  { id: "urun", label: "Ürün" },
  { id: "moduller", label: "Modüller" },
  { id: "isleyis", label: "İşleyiş" },
  { id: "fiyatlandirma", label: "Fiyatlandırma" },
  { id: "sss", label: "SSS" },
  { id: "demo", label: "Demo" },
] as const;

type TabId = (typeof NAV_ITEMS)[number]["id"];
const TAB_IDS = NAV_ITEMS.map((item) => item.id);

const assurances = [
  { icon: Building2, title: "Kurum bazlı veri ayrımı", text: "Her klinik yalnızca kendi kayıtlarıyla çalışır." },
  { icon: ShieldCheck, title: "Rol bazlı görünüm", text: "Personel sadece yetkili olduğu alanları görür." },
  { icon: LockKeyhole, title: "Hassas alan koruması", text: "Kritik hasta alanları korumalı biçimde işlenir." },
  { icon: ClipboardCheck, title: "İşlem geçmişi", text: "Kritik değişiklikler denetim kaydına alınır." },
] as const;

const roleItems = [
  { icon: Layers3, title: "Yönetici", text: "Operasyon, ekip ve yetki düzenini kurum düzeyinde yönetir.", color: "bg-cyan-50 text-cyan-700" },
  { icon: Stethoscope, title: "Doktor", text: "Hasta, randevu, muayene ve kendi hakediş akışına odaklanır.", color: "bg-emerald-50 text-emerald-700" },
  { icon: UsersRound, title: "Asistan / Banko", text: "Günlük hasta ve randevu operasyonunu hızlıca yürütür.", color: "bg-blue-50 text-blue-700" },
  { icon: CreditCard, title: "Muhasebe", text: "Tahsilat ve finans ekranlarında tanımlanan kapsamla çalışır.", color: "bg-rose-50 text-rose-700" },
] as const;

type Showcase = {
  eyebrow: string;
  title: string;
  text: string;
  icon: ComponentType<{ className?: string }>;
  points: string[];
  related: string[];
  Screen: ComponentType;
  image: string;
  imageAlt: string;
  tone: "teal" | "blue" | "coral" | "amber";
};

const moduleShowcases: Showcase[] = [
  {
    eyebrow: "Planlama",
    title: "Randevu ve hasta akışı",
    text: "Günün programını, hasta dosyasını ve klinik iletişimini birbirinden koparmadan yönetin.",
    icon: CalendarDays,
    points: ["Süre bazlı tek parça randevu görünümü", "Aynı saat için paralel randevu desteği", "Bekleme listesi ve online talepler"],
    related: ["Hasta kartı", "Muayene", "Tedavi planı", "Reçete"],
    Screen: CalendarScreen,
    image: "/marketing/module-planning.webp",
    imageAlt: "Modern diş kliniğinde günlük randevu planını yöneten klinik koordinatörü",
    tone: "teal",
  },
  {
    eyebrow: "Klinik Kayıt",
    title: "Tek hastada bütün geçmiş",
    text: "Tedavi, belge, ödeme ve klinik notlarını hasta dosyasında tutarlı bir zaman çizgisinde birleştirin.",
    icon: HeartPulse,
    points: ["Hasta geçmişi ve klinik notlar", "Belge ve onam kayıtları", "Hasta bazlı görev ve takip"],
    related: ["Diş şeması", "Belgeler", "Paketler", "Hasta takibi"],
    Screen: PatientScreen,
    image: "/marketing/module-clinical.webp",
    imageAlt: "Dijital diş şeması üzerinden tedavi planını inceleyen diş hekimi",
    tone: "blue",
  },
  {
    eyebrow: "Finans ve Operasyon",
    title: "Tahsilattan laboratuvara bağlı süreç",
    text: "Ödeme, taksit, laboratuvar ve tedarik hareketlerini ayrı listeler yerine ilişkili kayıtlarla izleyin.",
    icon: CreditCard,
    points: ["Tahsilat, gider ve taksit takibi", "Doktor hakediş görünümü", "Laboratuvar ve firma hareketleri"],
    related: ["Muhasebe", "Taksit", "Laboratuvar", "Tedarikçi"],
    Screen: FinanceScreen,
    image: "/marketing/module-operations.webp",
    imageAlt: "Laboratuvar vakaları ve klinik stoklarını dijital ekrandan yöneten personel",
    tone: "coral",
  },
  {
    eyebrow: "İletişim ve Kontrol",
    title: "Doğru kişiye, doğru zamanda bilgi",
    text: "Hatırlatma ve bilgilendirme süreçlerini izinler, görevler ve operasyon verileriyle birlikte yönetin.",
    icon: MessageSquareText,
    points: ["SMS şablonları ve toplu gönderim", "Klinik WhatsApp mesaj akışı", "Görev, stok ve sistem uyarıları"],
    related: ["SMS", "WhatsApp", "Görevler", "Raporlar"],
    Screen: MessagingScreen,
    image: "/marketing/module-communication.webp",
    imageAlt: "Hasta iletişimi ve ekip görevlerini dijital cihazlardan takip eden klinik koordinatörü",
    tone: "amber",
  },
];

const workflow = [
  {
    no: "01",
    title: "Karşılama ve planlama",
    text: "Hasta kaydı açılır, uygun doktor ve saat seçilerek randevu planlanır.",
    details: ["Hasta kaydı", "Randevu", "Bekleme listesi"],
    icon: CalendarDays,
    Screen: CalendarScreen,
  },
  {
    no: "02",
    title: "Muayene ve tedavi",
    text: "Klinik bulgular kaydedilir; tedavi planı, reçete ve belgeler aynı dosyada ilerler.",
    details: ["Muayene", "Diş şeması", "Tedavi planı"],
    icon: Stethoscope,
    Screen: PatientScreen,
  },
  {
    no: "03",
    title: "Operasyon ve tahsilat",
    text: "Laboratuvar ve stok hareketleri izlenirken tahsilat veya taksit planı kayda alınır.",
    details: ["Laboratuvar", "Stok", "Muhasebe"],
    icon: PackageCheck,
    Screen: FinanceScreen,
  },
  {
    no: "04",
    title: "Takip ve iletişim",
    text: "Ekip görevleri, hasta takipleri ve izinli mesajlaşma süreçleri tek merkezden sürdürülür.",
    details: ["Görevler", "Hasta takibi", "Mesajlaşma"],
    icon: MessageSquareText,
    Screen: MessagingScreen,
  },
] as const;

const quoteFactors = [
  {
    icon: Layers3,
    title: "Kullanılacak kapsam",
    text: "Klinik işleyişiniz için gerekli modüller ve kullanıcı rolleri birlikte belirlenir.",
  },
  {
    icon: UsersRound,
    title: "Ekip büyüklüğü",
    text: "Aktif kullanıcı sayısı ve yetki yapısı teklif kapsamını şekillendirir.",
  },
  {
    icon: MessageSquareText,
    title: "İletişim kullanımı",
    text: "SMS ve WhatsApp ihtiyaçları, kullanım biçimine göre ayrıca netleştirilir.",
  },
] as const;

const faqs = [
  { q: "Demo hesabı ne zaman açılır?", a: "Form başarıyla gönderildiğinde izole demo kurumu ve giriş bilgileri aynı ekranda hemen oluşturulur." },
  { q: "Bilgisayara kurulum gerekiyor mu?", a: `Hayır. ${BRAND_NAME} güncel bir web tarayıcısı üzerinden kullanılır; ayrı bir masaüstü kurulumu gerekmez.` },
  { q: "Demo verileri gerçek klinik verileriyle karışır mı?", a: "Hayır. Her demo ayrı bir kurum kaydıyla oluşturulur ve diğer kurumların verilerinden ayrılır." },
  { q: "Personel bazında ekranlar sınırlandırılabilir mi?", a: "Evet. Rol ve izin yapısı sayesinde kullanıcı yalnızca kendisine açılan modül ve işlemleri görür." },
  { q: "Telefon ve tablette kullanılabilir mi?", a: "Evet. Arayüz farklı ekran ölçülerine uyum sağlayacak şekilde hazırlanmıştır." },
  { q: "SMS ve WhatsApp özellikleri nasıl çalışır?", a: "Mesajlaşma özellikleri kurumun sağlayıcı ayarları, mesaj kredisi ve hasta iletişim tercihleriyle birlikte çalışır." },
  { q: "Mevcut kayıtlarım sisteme aktarılabilir mi?", a: "Aktarım kapsamı, mevcut dosya biçimi ve veri kalitesi incelendikten sonra teklif aşamasında netleştirilir." },
  { q: "Fiyat neden ekranda sabit değil?", a: "Kullanıcı sayısı, gerekli modüller ve mesajlaşma kullanımı klinikten kliniğe değişir. Bu nedenle kullanılmayacak alanları fiyatlandırmak yerine kapsam bazlı teklif hazırlanır." },
] as const;

function useTab() {
  const [activeTab, setActiveTab] = useState<TabId>("urun");

  useEffect(() => {
    const readTab = () => {
      const value = new URLSearchParams(window.location.search).get("tab");
      return (TAB_IDS as readonly string[]).includes(value || "") ? (value as TabId) : "urun";
    };
    setActiveTab(readTab());
    const onPopState = () => setActiveTab(readTab());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const switchTab = (tab: TabId) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === "urun") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return { activeTab, switchTab };
}

function Brand() {
  return (
    <span className="flex items-center gap-3">
      <span className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-[#087f73] text-white shadow-[0_8px_24px_rgba(8,127,115,.24)]">
        <KlinikCepMark className="h-6 w-6" />
        <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-[#ff8f70]" fill="currentColor" />
      </span>
      <span>
        <span className="block text-[15px] font-black leading-none text-slate-950">{BRAND_NAME}</span>
        <span className="mt-1 block text-[10px] font-bold uppercase text-slate-400">{BRAND_PRODUCT_LABEL}</span>
      </span>
    </span>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`${styles.primaryButton} group inline-flex items-center justify-center gap-2 rounded-lg bg-[#087f73] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(8,127,115,.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087f73] focus-visible:ring-offset-2`}>
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </button>
  );
}

function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <span className="text-xs font-black uppercase text-[#087f73]">{eyebrow}</span>
      <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">{title}</h1>
      <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">{text}</p>
    </div>
  );
}

function ProductWindow({ Screen, label }: { Screen: ComponentType; label: string }) {
  return (
    <div className={`${styles.productWindow} overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,.13)]`}>
      <div className="flex h-9 items-center gap-1.5 border-b border-slate-200 bg-slate-900 px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff7f72]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#ffc85c]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#5fd4a7]" />
        <span className="ml-3 text-[10px] font-bold text-slate-400">{label}</span>
      </div>
      <Screen />
    </div>
  );
}

function ModuleVisual({ image, imageAlt, Screen, label }: { image: string; imageAlt: string; Screen: ComponentType; label: string }) {
  return (
    <div className="pb-2">
      <div className="group relative aspect-[16/7] overflow-hidden rounded-lg bg-slate-100">
        <Image src={image} alt={imageAlt} fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.035]" />
        <div className="absolute inset-x-0 bottom-0 flex items-end bg-gradient-to-t from-slate-950/70 to-transparent px-4 pb-4 pt-12">
          <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase text-white"><Sparkles className={`${styles.sparkle} h-3.5 w-3.5 text-[#ffb39e]`} /> Gerçek kullanım bağlamı</span>
        </div>
      </div>
      <div className="relative z-10 mx-3 -mt-5 sm:mx-6 sm:-mt-8">
        <ProductWindow Screen={Screen} label={label} />
      </div>
    </div>
  );
}

function Footer({ go }: { go: (tab: TabId) => void }) {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-5 py-10">
        <div className="flex flex-col gap-7 md:flex-row md:items-center md:justify-between">
          <Brand />
          <nav className="flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-slate-500" aria-label="Alt menü">
            {NAV_ITEMS.map((item) => <button key={item.id} type="button" onClick={() => go(item.id)} className="transition-colors hover:text-[#087f73]">{item.label}</button>)}
            <Link href="/klinik/giris" className="transition-colors hover:text-[#087f73]">Klinik Girişi</Link>
          </nav>
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-slate-100 pt-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {BRAND_NAME}. Tüm hakları saklıdır.</p>
          <p>Diş klinikleri için kurum ve rol bazlı yönetim yazılımı.</p>
        </div>
      </div>
    </footer>
  );
}

export default function RootPage() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { activeTab, switchTab } = useTab();
  const go = (tab: TabId) => {
    setMobileNavOpen(false);
    switchTab(tab);
  };

  return (
    <main className="min-h-screen bg-[#f7faf9] text-slate-950">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5">
          <Link href="/" onClick={(event) => { event.preventDefault(); go("urun"); }} aria-label={`${BRAND_NAME} ana sayfa`} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087f73] focus-visible:ring-offset-2">
            <Brand />
          </Link>
          <nav className="hidden h-full items-center gap-7 lg:flex" aria-label="Tanıtım menüsü">
            {NAV_ITEMS.map((item) => (
              <button key={item.id} type="button" onClick={() => go(item.id)} aria-current={activeTab === item.id ? "page" : undefined} className={`${styles.navItem} relative h-full text-sm font-bold transition-colors ${activeTab === item.id ? "text-[#087f73]" : "text-slate-600 hover:text-slate-950"}`}>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => go("demo")} className="hidden rounded-lg px-3 py-2 text-sm font-black text-[#087f73] transition-colors hover:bg-emerald-50 sm:inline-flex">Ücretsiz Demo</button>
            <Link href="/klinik/giris" className="hidden rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-[#087f73] sm:inline-flex">Klinik Girişi</Link>
            <button type="button" aria-label={mobileNavOpen ? "Menüyü kapat" : "Menüyü aç"} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 lg:hidden">
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileNavOpen && (
          <div className="border-t border-slate-100 bg-white px-5 py-4 shadow-xl lg:hidden">
            <div className="mx-auto grid max-w-3xl gap-1">
              {NAV_ITEMS.map((item) => <button key={item.id} type="button" onClick={() => go(item.id)} className={`rounded-lg px-3 py-3 text-left text-sm font-bold ${activeTab === item.id ? "bg-emerald-50 text-[#087f73]" : "text-slate-700"}`}>{item.label}</button>)}
              <Link href="/klinik/giris" className="mt-2 rounded-lg bg-slate-950 px-3 py-3 text-center text-sm font-black text-white">Klinik Girişi</Link>
            </div>
          </div>
        )}
      </header>

      {activeTab === "urun" && (
        <>
          <section className={`${styles.hero} relative isolate flex min-h-[620px] items-end overflow-hidden`}>
            <Image src="/klinikcep-hero.webp" alt={`${BRAND_NAME} kullanılan modern bir diş kliniği`} fill priority sizes="100vw" className="object-cover object-[62%_center]" />
            <div className={styles.heroShade} />
            <div className="relative mx-auto w-full max-w-7xl px-5 pb-14 pt-24 sm:pb-16 lg:pb-20">
              <div className="max-w-2xl text-white">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/20 px-3 py-1.5 text-xs font-black backdrop-blur-md">
                  <Sparkles className={`${styles.sparkle} h-4 w-4 text-[#ffb39e]`} />
                  Diş klinikleri için bütünleşik yönetim
                </span>
                <h1 className="mt-5 text-5xl font-black leading-none sm:text-6xl">{BRAND_NAME}</h1>
                <p className="mt-4 max-w-xl text-xl font-bold leading-8 text-white sm:text-2xl">Kliniğinizin her günü, tek bir güvenilir akışta.</p>
                <p className="mt-4 max-w-xl text-sm leading-7 text-white/85 sm:text-base">Randevudan hasta takibine, tedaviden tahsilata kadar ekibinizin ihtiyaç duyduğu kayıtlar aynı sistemde birlikte çalışır.</p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <PrimaryButton onClick={() => go("demo")}>Ücretsiz demo oluştur</PrimaryButton>
                  <button type="button" onClick={() => go("moduller")} className="inline-flex items-center gap-2 rounded-lg border border-white/35 bg-white/10 px-5 py-3 text-sm font-black text-white backdrop-blur-md transition-colors hover:bg-white/20">Ürünü keşfet <ChevronDown className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          </section>

          <section className="border-b border-slate-200 bg-white">
            <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-slate-100 lg:grid-cols-4">
              {assurances.map((item) => (
                <div key={item.title} className={`${styles.iconGroup} group bg-white px-5 py-6`}>
                  <item.icon className="h-5 w-5 text-[#087f73] transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-3" />
                  <p className="mt-3 text-sm font-black text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden bg-[#eef6f4] py-16 sm:py-20">
            <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-[.72fr_1.28fr]">
              <div>
                <span className="text-xs font-black uppercase text-[#087f73]">Gerçek ürün deneyimi</span>
                <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">Günün tamamı, daha ilk bakışta anlaşılır.</h2>
                <p className="mt-4 text-sm leading-7 text-slate-600">Randevular, bekleyen işler ve operasyon uyarıları tek bir çalışma yüzeyinde birleşir. Ekip ekranlar arasında bilgi aramak yerine bir sonraki işe odaklanır.</p>
                <ul className="mt-6 space-y-3">
                  {["Günlük program ve bekleyen işlemler", "Rolüne göre sadeleşen çalışma alanı", "Hızlı hasta, randevu ve görev erişimi"].map((item) => <li key={item} className="flex items-center gap-3 text-sm font-bold text-slate-700"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#087f73] shadow-sm"><Check className="h-3.5 w-3.5" /></span>{item}</li>)}
                </ul>
              </div>
              <div className="relative pb-5 pl-3 sm:pl-10">
                <LaptopFrame><DashboardScreen /></LaptopFrame>
                <div className={`${styles.phoneFloat} absolute -bottom-2 right-0 hidden w-28 sm:block lg:-right-5`}><PhoneFrame><MobileScreen /></PhoneFrame></div>
              </div>
            </div>
          </section>

          <section className="bg-white py-16 sm:py-20">
            <div className="mx-auto max-w-7xl px-5">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                <div className="max-w-2xl">
                  <span className="text-xs font-black uppercase text-[#087f73]">Doğru kişiye doğru görünüm</span>
                  <h2 className="mt-3 text-3xl font-black leading-tight">Yetki karmaşası olmadan birlikte çalışın.</h2>
                </div>
                <p className="max-w-md text-sm leading-6 text-slate-600">Görme ve düzenleme izinleri birbirinden ayrılır; kullanılmayan veya yetkisiz alanlar personelin ekranını kalabalıklaştırmaz.</p>
              </div>
              <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {roleItems.map((role) => <article key={role.title} className={`${styles.roleCard} group border-t-2 border-slate-200 bg-[#f8faf9] p-5 transition-all hover:-translate-y-1 hover:border-[#087f73]`}><span className={`flex h-11 w-11 items-center justify-center rounded-lg ${role.color}`}><role.icon className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" /></span><h3 className="mt-4 text-base font-black">{role.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{role.text}</p></article>)}
              </div>
              <div className="mt-10 flex justify-center"><PrimaryButton onClick={() => go("demo")}>Kendi kliniğinizle deneyin</PrimaryButton></div>
            </div>
          </section>
        </>
      )}

      {activeTab === "moduller" && (
        <section className="bg-white">
          <div className="border-b border-slate-200 bg-[#eef6f4] px-5 py-14 sm:py-16">
            <PageIntro eyebrow="Modüller" title="Ayrı araçlar değil, birbirine bağlı klinik akışı" text="Her modül kendi işini çözer; asıl değer, hasta ve işlem bağlamının modüller arasında kaybolmamasıdır." />
          </div>
          <div className="mx-auto max-w-7xl px-5 py-10 sm:py-16">
            <div className="divide-y divide-slate-200">
              {moduleShowcases.map((item, index) => (
                <article key={item.title} className={`grid items-center gap-10 py-12 first:pt-0 last:pb-0 lg:grid-cols-2 ${index % 2 ? "" : ""}`}>
                  <div className={index % 2 ? "lg:order-2" : ""}>
                    <span className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${item.tone === "teal" ? "bg-emerald-50 text-emerald-700" : item.tone === "blue" ? "bg-blue-50 text-blue-700" : item.tone === "coral" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}><item.icon className={`${styles.moduleIcon} h-6 w-6`} /></span>
                    <p className="mt-5 text-xs font-black uppercase text-[#087f73]">{item.eyebrow}</p>
                    <h2 className="mt-2 text-2xl font-black sm:text-3xl">{item.title}</h2>
                    <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">{item.text}</p>
                    <ul className="mt-5 space-y-2.5">{item.points.map((point) => <li key={point} className="flex items-start gap-3 text-sm font-bold text-slate-700"><Check className="mt-0.5 h-4 w-4 flex-none text-[#087f73]" />{point}</li>)}</ul>
                    <div className="mt-6 flex flex-wrap gap-2">{item.related.map((label) => <span key={label} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600">{label}</span>)}</div>
                  </div>
                  <div className={index % 2 ? "lg:order-1" : ""}><ModuleVisual image={item.image} imageAlt={item.imageAlt} Screen={item.Screen} label={`${BRAND_NAME} / ${item.eyebrow}`} /></div>
                </article>
              ))}
            </div>
            <div className="mt-16 flex flex-col items-center border-t border-slate-200 pt-10 text-center"><p className="text-sm font-bold text-slate-600">Stok, laboratuvar ve yönetim ekranlarını kendi verilerinizden bağımsız bir ortamda inceleyin.</p><div className="mt-5"><PrimaryButton onClick={() => go("demo")}>Tüm modülleri demoda gör</PrimaryButton></div></div>
          </div>
        </section>
      )}

      {activeTab === "isleyis" && (
        <section className="bg-white">
          <div className="border-b border-slate-200 bg-[#fff7f3] px-5 py-14 sm:py-16">
            <PageIntro eyebrow="İşleyiş" title="Hasta kaydından takibe, bağlam hiç kopmaz" text={`${BRAND_NAME} her adımı kendi ekranında yönetirken hasta, doktor ve işlem ilişkisini korur.`} />
          </div>
          <div className="mx-auto max-w-7xl px-5 py-10 sm:py-16">
            <ol className="relative space-y-8 before:absolute before:bottom-10 before:left-[27px] before:top-10 before:w-px before:bg-slate-200 sm:before:left-[35px]">
              {workflow.map((step, index) => (
                <li key={step.no} className="relative grid gap-6 pl-16 sm:pl-24 lg:grid-cols-[.68fr_1.32fr] lg:items-center">
                  <span className={`${styles.stepNumber} absolute left-0 top-0 z-10 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-[#087f73] text-xs font-black text-white shadow-lg sm:h-[72px] sm:w-[72px]`}>{step.no}</span>
                  <div className="py-3">
                    <step.icon className="h-6 w-6 text-[#ff7f61]" />
                    <h2 className="mt-4 text-2xl font-black">{step.title}</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{step.text}</p>
                    <div className="mt-5 flex flex-wrap gap-2">{step.details.map((detail) => <span key={detail} className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600">{detail}</span>)}</div>
                  </div>
                  <div className={index % 2 ? "lg:ml-8" : ""}><ProductWindow Screen={step.Screen} label={`Adım ${step.no} / ${step.title}`} /></div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {activeTab === "fiyatlandirma" && (
        <section className="bg-white">
          <div className="border-b border-slate-200 bg-[#eef6f4] px-5 py-14 sm:py-16"><PageIntro eyebrow="Fiyatlandırma" title="Kullanmadığınız kapsam için ödeme yapmayın" text="Sabit ve belirsiz bir paket yerine, kliniğinizin kullanıcı ve modül ihtiyacını netleştirerek kapsam bazlı teklif hazırlıyoruz." /></div>
          <div className="mx-auto max-w-7xl px-5 py-14 sm:py-20">
            <div className="grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 lg:grid-cols-3">
              {quoteFactors.map((factor, index) => <article key={factor.title} className="group bg-white p-7"><div className="flex items-center justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-[#087f73]"><factor.icon className="h-5 w-5 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3" /></span><span className="text-xs font-black text-slate-300">0{index + 1}</span></div><h2 className="mt-5 text-lg font-black">{factor.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{factor.text}</p></article>)}
            </div>
            <div className="mt-12 grid overflow-hidden rounded-lg bg-slate-950 lg:grid-cols-[1fr_.72fr]">
              <div className="p-8 text-white sm:p-10">
                <span className="text-xs font-black uppercase text-[#69d7c5]">Tekliften önce deneyin</span>
                <h2 className="mt-3 text-3xl font-black">Kapsamı konuşmadan önce ürünü kullanın.</h2>
                <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">Demo formu tamamlandığında size özel, ayrı bir demo kurumu anında oluşur. Ekranları kendi senaryonuzla inceleyebilir, ardından yalnızca ihtiyaç duyduğunuz kapsamı belirleyebilirsiniz.</p>
                <div className="mt-7"><PrimaryButton onClick={() => go("demo")}>Demo hesabı oluştur</PrimaryButton></div>
              </div>
              <div className="grid grid-cols-2 gap-px bg-white/10 p-px">
                {[{ icon: MonitorSmartphone, label: "Tarayıcıdan kullanım" }, { icon: ShieldCheck, label: "İzole demo verisi" }, { icon: Database, label: "Kapsam değerlendirmesi" }, { icon: FileText, label: "Net teklif içeriği" }].map((item) => <div key={item.label} className="flex min-h-32 flex-col justify-between bg-slate-900 p-5 text-white"><item.icon className="h-5 w-5 text-[#ff9b7d]" /><span className="text-sm font-black">{item.label}</span></div>)}
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === "sss" && (
        <section className="bg-white">
          <div className="border-b border-slate-200 bg-[#f3f6fb] px-5 py-14 sm:py-16"><PageIntro eyebrow="Sık Sorulan Sorular" title="Karar vermeden önce bilmeniz gerekenler" text="Demo, kullanım ve kapsam hakkında en çok sorulan sorulara kısa ve doğrudan yanıtlar." /></div>
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:py-20 lg:grid-cols-[.52fr_1fr]">
            <aside className="lg:sticky lg:top-28 lg:self-start">
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50 text-[#087f73]"><MessageSquareText className={`${styles.moduleIcon} h-6 w-6`} /></span>
              <h2 className="mt-5 text-2xl font-black">Yanıtını bulamadınız mı?</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">Demo notuna görmek istediğiniz senaryoyu yazın; hesabınız oluştuğunda ilgili ekranları doğrudan deneyin.</p>
              <div className="mt-6"><PrimaryButton onClick={() => go("demo")}>Demoyu aç</PrimaryButton></div>
            </aside>
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {faqs.map((item, index) => <details key={item.q} className="group py-1"><summary className="flex cursor-pointer list-none items-center gap-5 py-5 text-left"><span className="text-xs font-black text-slate-300">{String(index + 1).padStart(2, "0")}</span><span className="flex-1 text-sm font-black text-slate-900 sm:text-base">{item.q}</span><ChevronDown className="h-5 w-5 flex-none text-slate-400 transition-transform duration-300 group-open:rotate-180" /></summary><p className="pb-6 pl-10 pr-10 text-sm leading-7 text-slate-600">{item.a}</p></details>)}
            </div>
          </div>
        </section>
      )}

      {activeTab === "demo" && (
        <section className="relative overflow-hidden bg-[#eef6f4]">
          <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#087f73_0%,#55c5b5_48%,#ff8f70_100%)]" />
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:py-16 lg:grid-cols-[.78fr_1.22fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <span className="inline-flex items-center gap-2 text-xs font-black uppercase text-[#087f73]"><Sparkles className={`${styles.sparkle} h-4 w-4`} /> Ücretsiz demo</span>
              <h1 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">Formu tamamlayın, kliniğiniz için demo hemen açılsın.</h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">Demo hesabı gerçek müşteri verilerinden ayrı oluşturulur. Formdan sonra kurum adı, kullanıcı numarası ve şifreniz aynı ekranda gösterilir.</p>
              <ol className="mt-8 space-y-5">
                {[{ no: "1", title: "Klinik bilgilerinizi girin", text: "Kapsamı anlamamıza yardımcı olacak kısa formu tamamlayın." }, { no: "2", title: "Erişim anında oluşturulsun", text: "Size özel demo kurumu ve geçici giriş bilgileri hazırlansın." }, { no: "3", title: "Ürünü kendi hızınızda inceleyin", text: "Randevu, hasta, finans ve diğer ekranları doğrudan deneyin." }].map((step) => <li key={step.no} className="flex gap-4"><span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-sm font-black text-[#087f73] shadow-sm">{step.no}</span><div><p className="text-sm font-black text-slate-900">{step.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{step.text}</p></div></li>)}
              </ol>
              <div className="mt-8 flex flex-wrap gap-2">{["Kurulum gerekmez", "Ayrı demo kurumu", "Anında giriş bilgisi"].map((item) => <span key={item} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm"><Check className="h-3.5 w-3.5 text-[#087f73]" />{item}</span>)}</div>
            </div>
            <DemoRequestForm />
          </div>
        </section>
      )}

      <Footer go={go} />
    </main>
  );
}
