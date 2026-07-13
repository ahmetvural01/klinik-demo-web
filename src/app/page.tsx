import Image from "next/image";
import Link from "next/link";
import { CalendarDays, CheckCircle2, ClipboardList, CreditCard, ShieldCheck, Stethoscope } from "lucide-react";
import { DemoRequestForm } from "@/components/marketing/DemoRequestForm";
import { getSiteContent } from "@/lib/site-content";

export const dynamic = "force-dynamic";

const FALLBACK_HERO =
  "https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&w=1800&q=85";

function text(value: string | undefined, fallback: string) {
  return String(value || fallback)
    .replace(/klinik\s*modern|klinikmodern/gi, "Klinik Yönetim Platformu")
    .trim();
}

const modules = [
  { title: "Hasta ve randevu", desc: "Hasta kartı, randevu akışı, takip ve görev kayıtları tek dosyada.", icon: CalendarDays },
  { title: "Tedavi ve laboratuvar", desc: "Diş şeması, tedavi planı, lab gönderimi, prova takibi ve fatura bağlantısı.", icon: Stethoscope },
  { title: "Finans ve tahsilat", desc: "Tahsilat, gider, firma ödemesi, hakediş ve alacak takibi aynı muhasebe düzeninde.", icon: CreditCard },
  { title: "Stok ve tedarik", desc: "Satın alma, stok girişi, tüketim, ortalama maliyet ve tedarikçi hareketleri.", icon: ClipboardList },
];

const assurances = [
  "Rol bazlı yetkilendirme",
  "Kurum verisine göre izole çalışma",
  "Denetim izi ve kontrollü işlem akışı",
  "Demo ortamında gerçek veriyle karışmayan test alanı",
];

export default async function RootPage() {
  const site = await getSiteContent();
  const heroTitle = text(site.heroTitle, "Diş klinikleri için uçtan uca yönetim platformu.");
  const heroDescription = text(
    site.heroDescription,
    "Hasta, randevu, tedavi, laboratuvar, stok, tedarikçi ve muhasebe süreçlerini tek panelde, kontrollü ve sade bir iş akışıyla yönetin.",
  );

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <header className="border-b border-slate-200 bg-white/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-3" aria-label="Ana sayfa">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white">
              KP
            </span>
            <span className="text-sm font-black tracking-tight">Klinik Yönetim Platformu</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
            <a href="#moduller" className="hover:text-slate-950">Modüller</a>
            <a href="#isleyis" className="hover:text-slate-950">İşleyiş</a>
            <a href="#demo" className="hover:text-slate-950">Demo Talebi</a>
          </nav>
          <Link
            href="/klinik/giris"
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
          >
            Klinik Girişi
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200">
        <Image
          src={site.heroImageUrl || FALLBACK_HERO}
          alt="Diş kliniği çalışma alanı"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-slate-950/72" />
        <div className="relative mx-auto grid min-h-[620px] max-w-7xl items-center gap-10 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="max-w-3xl text-white">
            <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-100">
              {text(site.heroBadge, "Diş hekimliği klinikleri için")}
            </span>
            <h1 className="mt-5 max-w-4xl text-4xl font-black leading-tight tracking-tight md:text-6xl">
              {heroTitle}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-200 md:text-lg">
              {heroDescription}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#demo"
                className="rounded-lg bg-white px-5 py-3 text-sm font-black text-slate-950 hover:bg-slate-100"
              >
                Demo Talep Et
              </a>
              <Link
                href="/klinik/giris"
                className="rounded-lg border border-white/25 px-5 py-3 text-sm font-black text-white hover:bg-white/10"
              >
                Mevcut Kullanıcı Girişi
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-white/95 p-5 shadow-2xl">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">Operasyon Özeti</p>
                  <h2 className="mt-1 text-xl font-black">Tek panel, net süreç</h2>
                </div>
                <ShieldCheck className="h-7 w-7 text-emerald-600" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {["Randevu", "Tedavi", "Tahsilat", "Laboratuvar"].map((item, index) => (
                  <div key={item} className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs font-bold text-slate-500">0{index + 1}</p>
                    <p className="mt-1 font-black">{item}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
                Hasta, hekim, lab, stok, firma ve muhasebe kayıtları bağlantılı ilerler.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="moduller" className="mx-auto max-w-7xl px-5 py-16">
        <div className="max-w-2xl">
          <p className="text-xs font-black uppercase tracking-wide text-cyan-700">Modüller</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight">Klinik iş akışına göre tasarlanmış yapı</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Gereksiz vitrin ekranları yerine günlük kullanımda ihtiyaç duyulan hasta, tedavi, finans ve tedarik akışları öne çıkarılır.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <article key={module.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <Icon className="h-6 w-6 text-cyan-700" />
                <h3 className="mt-4 font-black">{module.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{module.desc}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="isleyis" className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Kontrollü işleyiş</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Kullanıcı hatasını azaltan akış</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Klinik personeli işlemi nereden yapacağını aramak zorunda kalmaz. Her kayıt ilgili hasta, hekim, firma ve finans hareketine bağlanır.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {assurances.map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-emerald-600" />
                <p className="text-sm font-semibold text-slate-700">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" className="mx-auto grid max-w-7xl gap-8 px-5 py-16 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-cyan-700">Demo Talebi</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight">
            {text(site.promoTitle, "Canlı demo erişimi oluşturun")}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {text(
              site.promoDescription,
              "Demo hesabınız süreli ve izole şekilde oluşturulur. Hasta, randevu, tedavi, ödeme, lab, stok ve firma akışlarını örnek verilerle test edebilirsiniz.",
            )}
          </p>
        </div>
        <DemoRequestForm />
      </section>
    </main>
  );
}
