import Image from "next/image";
import Link from "next/link";
import type { ComponentType } from "react";
import {
  Building2,
  Check,
  ClipboardCheck,
  CreditCard,
  Layers3,
  LockKeyhole,
  ShieldCheck,
  Stethoscope,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { DemoRequestForm } from "@/components/marketing/DemoRequestForm";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { DEMO_DAYS } from "@/components/marketing/demo-constants";
import { CalendarScreen, FinanceScreen, MessagingScreen, PatientScreen } from "@/components/marketing/ScreenMockups";
import { BRAND_NAME } from "@/lib/brand";
import styles from "./marketing.module.css";

/*
 * Tanıtım — TEK kaydırmalı sayfa (sunucu bileşeni; istemcide yalnız üst
 * çubuk ve demo formu çalışır). Önceden altı ayrı "sekme" vardı: Özellikler ve
 * İşleyiş aynı dört maketi aynı sırayla gösteriyordu, fiyat gerekçesi ve
 * "demo verisi ayrı tutulur" mesajı defalarca tekrarlanıyordu, sürekli
 * animasyonlar vardı. Eski ?tab= bağlantıları ilgili bölüme kayar.
 */

const assurances = [
  { icon: Building2, title: "Kurum bazlı veri ayrımı", text: "Her klinik yalnız kendi kayıtlarıyla çalışır." },
  { icon: ShieldCheck, title: "Rol bazlı görünüm", text: "Personel yalnız yetkili olduğu alanları görür." },
  { icon: LockKeyhole, title: "Hassas alan koruması", text: "Hassas hasta alanları korumalı biçimde saklanır." },
  { icon: ClipboardCheck, title: "İşlem geçmişi", text: "Önemli değişiklikler kayıt altına alınır." },
] as const;

const dayFlow: Array<{ title: string; text: string; points: string[]; Screen: ComponentType }> = [
  {
    title: "Karşılama ve randevu",
    text: "Hasta kaydı açılır, uygun doktor ve saat seçilerek randevu verilir.",
    points: ["Süre bazlı randevu takvimi", "Aynı saate paralel randevu", "Bekleme listesi ve online randevu talepleri"],
    Screen: CalendarScreen,
  },
  {
    title: "Muayene ve tedavi",
    text: "Bulgular, tedavi planı, reçete ve belgeler aynı hasta dosyasında ilerler.",
    points: ["Diş şeması ve tedavi geçmişi", "Belge ve onam kayıtları", "Hastaya bağlı görev ve takip"],
    Screen: PatientScreen,
  },
  {
    title: "Tahsilat ve operasyon",
    text: "Tahsilat, taksit, laboratuvar ve tedarik hareketleri ilgili hasta ve doktorla birlikte izlenir.",
    points: ["Tahsilat, gider ve taksit takibi", "Doktor hakediş görünümü", "Laboratuvar ve tedarikçi hareketleri"],
    Screen: FinanceScreen,
  },
  {
    title: "Hatırlatma ve takip",
    text: "Randevu hatırlatmaları ve bilgilendirmeler hastanın iletişim iznine göre gönderilir.",
    points: ["SMS şablonları ve toplu gönderim", "Kliniğe özel WhatsApp hattı", "Ekip görevleri ve hasta aramaları"],
    Screen: MessagingScreen,
  },
];

const roles = [
  { icon: Layers3, title: "Yönetici", text: "Günün durumu, ekip, ayarlar ve raporlar." },
  { icon: Stethoscope, title: "Doktor", text: "Kendi randevuları, hasta dosyası, tedavi ve hakedişi." },
  { icon: UsersRound, title: "Asistan / Banko", text: "Hasta kaydı, randevu, karşılama ve tahsilat." },
  { icon: CreditCard, title: "Muhasebe", text: "Tahsilat, gider, alacak ve taksitler." },
] as const;

const faqs = [
  { q: "Demo hesabı ne zaman açılır?", a: "Form gönderildiğinde ayrı bir demo kliniği ve giriş bilgileri aynı ekranda hemen oluşur." },
  { q: "Bilgisayara kurulum gerekiyor mu?", a: `Hayır. ${BRAND_NAME} güncel bir web tarayıcısından kullanılır.` },
  { q: "Demo verileri gerçek klinik verileriyle karışır mı?", a: "Hayır. Her demo ayrı bir kurum olarak açılır ve diğer kurumların verilerinden ayrıdır." },
  { q: "Personelin gördüğü ekranlar sınırlandırılabilir mi?", a: "Evet. Her kullanıcı yalnız rolüne açılan modül ve işlemleri görür." },
  { q: "Telefon ve tablette kullanılabilir mi?", a: "Evet. Ekranlar telefon, tablet ve bilgisayara uyum sağlar." },
  { q: "SMS ve WhatsApp nasıl çalışır?", a: "Mesajlar kliniğin sağlayıcı ayarı, SMS kredisi ve hastanın iletişim iznine göre gönderilir." },
  { q: "Mevcut kayıtlarım aktarılabilir mi?", a: "Aktarım kapsamı, mevcut dosya biçimi ve veri kalitesi incelendikten sonra teklifte netleşir." },
] as const;

function ProductWindow({ Screen }: { Screen: ComponentType }) {
  // Temsili ekran: içindeki uydurma adlar ekran okuyucuda içerik gibi okunmasın.
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-lg border border-slate-200 bg-slate-900 shadow-lg">
      <Screen />
    </div>
  );
}

function SectionHeading({ id, title, text }: { id?: string; title: string; text?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 id={id} className="font-display text-2xl font-extrabold text-slate-900 sm:text-3xl">{title}</h2>
      {text && <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">{text}</p>}
    </div>
  );
}

export default function RootPage() {
  return (
    <div className="min-h-dvh bg-[rgb(var(--app-bg))] text-slate-900">
      <MarketingHeader />
      <main>
        <section className={`${styles.hero} relative isolate flex items-end overflow-hidden`}>
          <Image src="/cepklinik-hero.webp" alt="" fill priority sizes="100vw" className="object-cover object-[62%_center]" />
          <div className={styles.heroShade} />
          <div className="relative mx-auto w-full max-w-6xl px-4 pb-12 pt-20 sm:px-6 sm:pb-16">
            <div className="max-w-xl text-white">
              <h1 className="font-display text-4xl font-extrabold leading-tight sm:text-5xl">Kliniğinizin günlük işleri, tek yerde.</h1>
              <p className="mt-4 text-base leading-7 text-white/90">Randevu, hasta dosyası, tahsilat ve hatırlatmalar aynı sistemde; her çalışan yalnız kendi işini görür.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button href="#demo">Ücretsiz demo</Button>
                <Button variant="secondary" href="#ozellikler">Özellikleri gör</Button>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Güvenlik" className="border-b border-slate-200 bg-white">
          <ul className="mx-auto grid max-w-6xl grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
            {assurances.map((item) => (
              <li key={item.title} className="flex gap-3 bg-white px-4 py-5 sm:px-6">
                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-slate-900">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section id="ozellikler" aria-labelledby="ozellikler-baslik" className="scroll-mt-16 py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading id="ozellikler-baslik" title="Klinikte bir gün" text="Hasta kapıdan girdiği andan takibe kadar her adım aynı kayıtta ilerler." />
            <ol className="mt-10 space-y-12 sm:space-y-16">
              {dayFlow.map((step, index) => (
                <li key={step.title} className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
                  <div className={index % 2 ? "lg:order-2" : ""}>
                    <p className="text-xs font-bold tabular-nums text-primary">0{index + 1}</p>
                    <h3 className="mt-1 font-display text-xl font-extrabold text-slate-900 sm:text-2xl">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p>
                    <ul className="mt-4 space-y-2">
                      {step.points.map((point) => (
                        <li key={point} className="flex items-start gap-2.5 text-sm font-medium text-slate-700">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {/* Telefonda maket gizli: metin yeterli, sayfa kısalır. */}
                  <div className={`hidden sm:block ${index % 2 ? "lg:order-1" : ""}`}>
                    <ProductWindow Screen={step.Screen} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="roller-baslik" className="border-y border-slate-200 bg-white py-14 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading id="roller-baslik" title="Kim ne görür" />
            <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {roles.map((role) => (
                <li key={role.title} className="rounded-lg border border-slate-200 p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true"><role.icon className="h-5 w-5" /></span>
                  <h3 className="mt-3 text-base font-bold text-slate-900">{role.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{role.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="fiyatlandirma" aria-labelledby="fiyat-baslik" className="scroll-mt-16 py-14 sm:py-16">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              id="fiyat-baslik"
              title="Fiyatlandırma"
              text="Fiyat kliniğinize göre hazırlanır: aktif kullanıcı sayısı, kullanılacak modüller ve SMS/WhatsApp kullanımı birlikte değerlendirilir. Önce demoyu deneyin, teklifi kapsam netleşince alın."
            />
            <Button href="#demo" className="self-start lg:self-auto">Ücretsiz demo</Button>
          </div>
        </section>

        <section id="sss" aria-labelledby="sss-baslik" className="scroll-mt-16 border-y border-slate-200 bg-white py-14 sm:py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <SectionHeading id="sss-baslik" title="Sık sorulanlar" />
            <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
              {faqs.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-sm font-bold text-slate-900 sm:text-base">
                    {item.q}
                    <span aria-hidden="true" className="text-lg font-normal text-slate-400 group-open:rotate-45">+</span>
                  </summary>
                  <p className="pb-4 text-sm leading-6 text-slate-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="demo" aria-labelledby="demo-baslik" className="scroll-mt-16 py-14 sm:py-16">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
            <SectionHeading
              id="demo-baslik"
              title="Ücretsiz demo"
              text={`${DEMO_DAYS} gün geçerli, gerçek kayıtlarınızdan ayrı bir demo kliniği hemen açılır; yönetici, doktor ve banko hesaplarıyla deneyebilirsiniz.`}
            />
            <DemoRequestForm />
          </div>
        </section>
      </main>

      <footer className="bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <BrandLockup />
          <nav aria-label="Alt menü" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-slate-600">
            <a href="#ozellikler" className="hover:text-slate-900">Özellikler</a>
            <a href="#fiyatlandirma" className="hover:text-slate-900">Fiyatlandırma</a>
            <a href="#sss" className="hover:text-slate-900">Sık sorulanlar</a>
            <Link href="/klinik/giris" className="hover:text-slate-900">Klinik girişi</Link>
          </nav>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-slate-500 sm:px-6">© {new Date().getFullYear()} {BRAND_NAME}. Tüm hakları saklıdır.</p>
      </footer>
    </div>
  );
}
