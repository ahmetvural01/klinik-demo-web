import Link from "next/link";
import Image from "next/image";
import { getSiteContent, DEFAULT_SITE_CONTENT } from "@/lib/site-content";
import { DemoRequestForm } from "@/components/marketing/DemoRequestForm";

export const dynamic = "force-dynamic";

function isVideoUrl(url: string) {
  const l = url.toLowerCase();
  return l.endsWith(".mp4") || l.endsWith(".webm") || l.endsWith(".ogg");
}

const TESTIMONIALS = [
  { name: "Dr. Ayşe Kaya", role: "Diş Hekimi, İstanbul", text: "Randevu yönetimi artık çok daha hızlı. Hastalarım SMS hatırlatmalarına bayılıyor, gelmeyen hasta sayısı yarıya düştü.", avatar: "AK" },
  { name: "Dr. Mehmet Demir", role: "Klinik Sahibi, Ankara", text: "Ödeme takibi ve cari raporlama ile ayın sonunda saat süren işlemler artık 5 dakika. Muhteşem bir sistem.", avatar: "MD" },
  { name: "Dr. Zeynep Arslan", role: "Genel Diş Kliniği, İzmir", text: "Çok sube yönetiminde merkezi kontrol harika. Her şube için ayrı kullanıcı ve yetki kurulumu mükemmel çalışıyor.", avatar: "ZA" },
];

const PROCESS_STEPS = [
  { num: "01", title: "Kayıt ve Kurulum", desc: "10 dakikada kliniğinizi sisteme tanıtın, personelinizi ekleyin, modüllerinizi seçin." },
  { num: "02", title: "Veri Aktarımı", desc: "Mevcut hasta kayıtlarınızı içe aktarın. Geçiş ekibimiz bu süreçte yanınızdadır." },
  { num: "03", title: "Aktif Kullanım", desc: "İlk gün itibariyle randevu almaya, hasta takibine ve raporlamaya başlayın." },
];

const MODULE_ICONS: Record<string, string> = {
  cyan: "🦷",
  emerald: "💳",
  indigo: "📣",
  slate: "📊",
};

export default async function RootPage() {
  const site = await getSiteContent();
  const allMedia = site.galleryImages.filter(Boolean);
  const heroVideo = allMedia.find(isVideoUrl) ?? null;
  const galleryVideos = allMedia.filter(isVideoUrl).slice(0, 6);
  const galleryImages = allMedia.filter((x) => !isVideoUrl(x)).slice(0, 6);
  const mediaItems = allMedia.slice(0, 6);
  const anim = site.showAnimations;

  return (
    <main className="min-h-screen bg-white text-slate-900 antialiased">

      {/* ─── STICKY NAVBAR ─── */}
      <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-600">
              <span className="text-xs font-black text-white">K</span>
            </div>
            <span className="text-base font-black tracking-tight text-slate-900">KlinikModern</span>
          </div>
          <div className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#ozellikler" className="hover:text-cyan-600 transition-colors">Özellikler</a>
            <a href="#moduller" className="hover:text-cyan-600 transition-colors">Modüller</a>
            <a href="#fiyatlar" className="hover:text-cyan-600 transition-colors">Fiyatlar</a>
            <a href="#demo" className="hover:text-cyan-600 transition-colors">Demo</a>
          </div>
          <Link
            href="/klinik/giris"
            className="rounded-xl bg-cyan-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-cyan-700"
          >
            Klinik Girişi →
          </Link>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative flex min-h-[92vh] items-center overflow-hidden pb-0 text-white">
        {/* === VIDEO / IMAGE BACKGROUND === */}
        {heroVideo ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={heroVideo}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : site.heroImageUrl ? (
          <Image src={site.heroImageUrl} alt="KlinikModern" fill className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <Image
            src="https://images.unsplash.com/photo-1629904853716-f0bc54eea481?auto=format&fit=crop&w=1920&q=80"
            alt=""
            fill
            className="absolute inset-0 h-full w-full object-cover"
            aria-hidden="true"
          />
        )}
        {/* Overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-900/80 to-slate-900/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
        {/* Glow blobs */}
        <div className={`absolute -left-20 top-1/3 h-[600px] w-[600px] rounded-full bg-cyan-600/20 blur-[150px] ${anim ? "animate-pulse" : ""}`} />
        <div className={`absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-emerald-500/15 blur-[120px] ${anim ? "animate-pulse" : ""}`} />

        <div className="relative z-10 mx-auto w-full max-w-7xl px-5 py-20 md:py-28">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            {/* LEFT */}
            <div className="pb-16 pt-4 md:pb-20">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-1.5 text-xs font-semibold text-cyan-300">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                {site.heroBadge}
              </span>

              <h2 className="mt-6 text-4xl font-black leading-[1.1] tracking-tight md:text-5xl lg:text-6xl">
                {site.heroTitle}
              </h2>

              <p className="mt-6 max-w-lg text-base leading-relaxed text-slate-300 md:text-lg">
                {site.heroDescription}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={site.primaryCtaUrl || "/klinik/giris"}
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-cyan-500/25 transition hover:bg-cyan-400"
                >
                  {site.primaryCtaLabel}
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                </Link>
                <a
                  href={site.secondaryCtaUrl || "#fiyatlar"}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-7 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
                >
                  {site.secondaryCtaLabel}
                </a>
              </div>

              {/* Trust badges */}
              <div className="mt-10 flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Ücretsiz kurulum desteği</span>
                <span className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> 14 gün demo</span>
                <span className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Sözleşmesiz başla</span>
              </div>
            </div>

            {/* RIGHT — Floating mockup */}
            <div className="relative hidden lg:block">
              <div className={`relative z-10 translate-y-6 rounded-2xl border border-white/10 bg-slate-800/60 p-1 shadow-2xl backdrop-blur-xl ${anim ? "transition-transform duration-700 hover:-translate-y-1" : ""}`}>
                {/* Fake browser chrome */}
                <div className="flex items-center gap-1.5 rounded-t-xl border-b border-white/10 bg-slate-900/80 px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                  <div className="ml-4 flex-1 rounded-full bg-slate-700/60 px-3 py-0.5 text-[10px] text-slate-400">
                    app.klinikmodern.com
                  </div>
                </div>
                {/* Mock dashboard */}
                <div className="rounded-b-xl bg-slate-50 p-4">
                  {/* Top stat row */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[
                      { label: "Bugün Randevu", val: "24", color: "bg-cyan-500" },
                      { label: "Bekleyen Ödeme", val: "₺8.4k", color: "bg-emerald-500" },
                      { label: "Aktif Hasta", val: "1,204", color: "bg-violet-500" },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl bg-white p-3 shadow-sm">
                        <div className={`mb-1 h-1 w-6 rounded-full ${s.color}`} />
                        <p className="text-lg font-black text-slate-900">{s.val}</p>
                        <p className="text-[10px] text-slate-500">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  {/* Fake appointment list */}
                  <div className="rounded-xl bg-white p-3 shadow-sm">
                    <p className="mb-2 text-[11px] font-bold text-slate-700">Günün Randevuları</p>
                    {[
                      { name: "Ahmet Y.", time: "09:00", color: "bg-cyan-400" },
                      { name: "Fatma K.", time: "10:30", color: "bg-emerald-400" },
                      { name: "Mehmet S.", time: "11:15", color: "bg-violet-400" },
                      { name: "Ayşe T.", time: "13:00", color: "bg-amber-400" },
                    ].map((r) => (
                      <div key={r.time} className="flex items-center gap-2 border-t border-slate-100 py-1.5 first:border-0">
                        <span className={`h-2 w-2 rounded-full ${r.color}`} />
                        <span className="text-xs font-medium text-slate-700 flex-1">{r.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{r.time}</span>
                      </div>
                    ))}
                  </div>
                  {/* Mini chart bars */}
                  <div className="mt-2 rounded-xl bg-white p-3 shadow-sm">
                    <p className="mb-2 text-[11px] font-bold text-slate-700">Haftalık Gelir</p>
                    <div className="flex items-end gap-1 h-10">
                      {[40, 65, 45, 80, 60, 90, 55].map((h, i) => (
                        <div key={i} style={{ height: `${h}%` }} className={`flex-1 rounded-sm ${i === 5 ? "bg-cyan-500" : "bg-slate-200"}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {/* Floating badges around the mockup */}
              <div className="absolute -left-8 top-1/3 rounded-2xl border border-white/15 bg-slate-800/80 p-3 text-center shadow-xl backdrop-blur">
                <p className="text-lg font-black text-white">%99.9</p>
                <p className="text-[10px] text-slate-400">Uptime</p>
              </div>
              <div className="absolute -right-6 bottom-1/4 rounded-2xl border border-white/15 bg-slate-800/80 p-3 text-center shadow-xl backdrop-blur">
                <p className="text-lg font-black text-emerald-400">7/24</p>
                <p className="text-[10px] text-slate-400">Bulut Erişim</p>
              </div>
            </div>
          </div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <svg viewBox="0 0 1440 72" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
            <path d="M0 72L1440 72L1440 0C1200 56 960 72 720 56C480 40 240 0 0 40L0 72Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* ─── STATS BAR ─── */}
      <section className="border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {site.statsCards.map((card, idx) => (
              <div key={`stat-${idx}`} className="flex items-center gap-3">
                <div className="h-10 w-10 flex-none rounded-xl bg-cyan-50 flex items-center justify-center">
                  <span className="text-lg">
                    {idx === 0 ? "🔒" : idx === 1 ? "☁️" : idx === 2 ? "🧩" : "⚡"}
                  </span>
                </div>
                <div>
                  <p className="text-lg font-black text-slate-900">{card.title}</p>
                  <p className="text-xs text-slate-500">{card.description}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 flex-none rounded-xl bg-emerald-50 flex items-center justify-center">
                <span className="text-lg">🏆</span>
              </div>
              <div>
                <p className="text-lg font-black text-slate-900">500+</p>
                <p className="text-xs text-slate-500">Memnun Klinik</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="ozellikler" className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <span className="inline-block rounded-full bg-cyan-50 px-4 py-1 text-xs font-bold text-cyan-700 mb-3">NEDEN KLINIKMODERN</span>
            <h3 className="text-3xl font-black md:text-4xl">Kliniklerin tercih ettiği platform</h3>
            <p className="mt-4 text-slate-500">Kurulumdan eğitime, tüm süreç tek ekip tarafından yönetilir. Siz hastayla ilgilenin, gerisini biz halledelim.</p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {site.featureCards.map((item, idx) => (
              <div
                key={`feat-${idx}`}
                className={`group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-sm ${anim ? "transition-all duration-300 hover:-translate-y-1 hover:border-cyan-200 hover:shadow-md" : ""}`}
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-50 to-cyan-100 text-2xl">
                  {item.icon || "⭐"}
                </div>
                <h4 className="text-lg font-black text-slate-900">{item.title}</h4>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.description}</p>
                <div className="absolute bottom-0 left-0 h-0.5 w-0 bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-300 group-hover:w-full" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SİSTEM ÖNİZLEME (özellik showcase) ─── */}
      <section className="overflow-hidden bg-slate-950 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <span className="mb-3 inline-block rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold text-cyan-400">PLATFORM ÖZELLİKLERİ</span>
            <h2 className="text-3xl font-black text-white md:text-4xl">Eksiksiz klinik yönetimi</h2>
            <p className="mt-3 text-sm text-slate-400">Randevudan raporlamaya, hasta takibinden ödeme yönetimine — hepsi tek panelde.</p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">

            {/* Panel 1 — Randevu Takvimi */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Randevu Takvimi</span>
                <span className={`h-2 w-2 rounded-full bg-emerald-400 ${anim ? "animate-pulse" : ""}`} />
              </div>
              {/* Saat satırları — anonim */}
              {[
                { time: "09:00", type: "Muayene", color: "bg-cyan-500", w: "w-24" },
                { time: "10:30", type: "Kontrol", color: "bg-emerald-500", w: "w-20" },
                { time: "11:00", type: "Tedavi", color: "bg-violet-500", w: "w-28" },
                { time: "14:00", type: "Muayene", color: "bg-cyan-500", w: "w-24" },
                { time: "15:30", type: "Çekim", color: "bg-amber-500", w: "w-16" },
              ].map((item, i) => (
                <div
                  key={i}
                  className={`mb-2 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 ${anim ? "transition-all duration-300 hover:bg-white/10" : ""} ${i === 1 ? "border border-emerald-500/30 bg-emerald-500/5" : ""}`}
                >
                  <span className="min-w-[40px] text-xs font-bold text-slate-400">{item.time}</span>
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${item.color}`} />
                  {/* İsim yerine anonim blok */}
                  <div className="h-2.5 flex-1 rounded-full bg-white/10" />
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">{item.type}</span>
                </div>
              ))}
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                <span className="text-[11px] text-slate-500">Günlük görünüm</span>
                <span className="text-[11px] font-bold text-cyan-400">Haftalık takvim →</span>
              </div>
            </div>

            {/* Panel 2 — Hasta Yönetimi */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Hasta Yönetimi</span>
                <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-400">Aktif</span>
              </div>
              {/* Hasta listesi — anonim bloklar */}
              {[
                { color: "from-cyan-500 to-cyan-700", dot: "bg-cyan-400" },
                { color: "from-emerald-500 to-emerald-700", dot: "bg-emerald-400" },
                { color: "from-violet-500 to-violet-700", dot: "bg-violet-400" },
              ].map((row, i) => (
                <div key={i} className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${row.color}`}>
                    <span className="h-3 w-3 rounded-full bg-white/40" />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-24 rounded-full bg-white/15" />
                    <div className="h-2 w-16 rounded-full bg-white/8" />
                  </div>
                  <span className={`h-2 w-2 rounded-full ${row.dot}`} />
                </div>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  { label: "Tedavi Geçmişi", accent: "bg-cyan-500/10 text-cyan-400" },
                  { label: "Randevu Al", accent: "bg-white/5 text-slate-400" },
                  { label: "Ödeme Takibi", accent: "bg-emerald-500/10 text-emerald-400" },
                  { label: "SMS Gönder", accent: "bg-violet-500/10 text-violet-400" },
                ].map((btn, i) => (
                  <div key={i} className={`rounded-xl py-2 text-center text-[11px] font-bold ${btn.accent}`}>{btn.label}</div>
                ))}
              </div>
            </div>

            {/* Panel 3 — Raporlama */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Raporlama & Analiz</span>
                <span className="text-xs font-bold text-emerald-400">↑ Büyüme</span>
              </div>
              {/* Bar grafik — anonim */}
              <div className="mb-5 flex items-end gap-1.5 h-20">
                {[30, 45, 38, 55, 48, 65, 52, 72, 60, 80, 70, 88].map((h, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-sm ${i === 11 ? "bg-cyan-500" : i >= 9 ? "bg-cyan-500/50" : "bg-white/12"}`}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <p className="mb-4 text-xs text-slate-500">Son 12 aylık performans grafiği</p>
              {/* Kategori çubukları */}
              {[
                { label: "Muayene & Kontrol", pct: 42, color: "bg-cyan-500" },
                { label: "Tedavi & Operasyon", pct: 36, color: "bg-emerald-500" },
                { label: "Diğer Hizmetler", pct: 22, color: "bg-violet-500" },
              ].map((row, i) => (
                <div key={i} className="mb-2.5">
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className="text-slate-400">{row.label}</span>
                    <span className="font-semibold text-slate-300">%{row.pct}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className={`h-1.5 rounded-full ${row.color}`} style={{ width: `${row.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Galeri videoları varsa onları da göster */}
          {galleryVideos.length > 0 && (
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {galleryVideos.map((v, idx) => (
                <div key={`vid-${idx}`} className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900 ${anim ? "transition-transform duration-300 hover:-translate-y-1 hover:border-cyan-500/40" : ""}`}>
                  <video className="h-56 w-full object-cover opacity-90 transition-opacity duration-300 group-hover:opacity-100" src={v} autoPlay muted loop playsInline />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent" />
                  <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full bg-red-500 ${anim ? "animate-pulse" : ""}`} />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">Sistem Önizlemesi</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── MODULES ─── */}
      <section id="moduller" className="bg-slate-900 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <span className="inline-block rounded-full bg-white/10 px-4 py-1 text-xs font-bold text-cyan-400 mb-3">MODÜLLER</span>
            <h3 className="text-3xl font-black text-white md:text-4xl">Her klinik ihtiyacı karşılandı</h3>
            <p className="mt-4 text-slate-400">Tüm klinik süreçlerini tek bir çatı altında yönetin. İhtiyacınıza göre modül ekleyin veya çıkarın.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {site.moduleCards.map((card, idx) => (
              <div
                key={`mod-${idx}`}
                className={`group rounded-2xl border border-white/10 bg-white/5 p-6 ${anim ? "transition-all duration-300 hover:bg-white/10 hover:border-cyan-500/40" : ""}`}
              >
                <div className="mb-4 text-3xl">{MODULE_ICONS[card.color || ""] || "🔧"}</div>
                <h4 className="text-lg font-black text-white">{card.title}</h4>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{card.description}</p>
                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-cyan-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  Daha fazla bilgi <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <span className="inline-block rounded-full bg-emerald-50 px-4 py-1 text-xs font-bold text-emerald-700 mb-3">NASIL ÇALIŞIR</span>
            <h3 className="text-3xl font-black md:text-4xl">3 adımda hazır</h3>
            <p className="mt-4 text-slate-500">Aynı gün kullanmaya başlayın. Uzun kurulum süreçleri yok, teknik bilgi gerekmez.</p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {PROCESS_STEPS.map((step, idx) => (
              <div key={step.num} className="relative text-center">
                {idx < PROCESS_STEPS.length - 1 && (
                  <div className="absolute left-1/2 top-8 hidden h-0.5 w-full bg-gradient-to-r from-cyan-200 to-slate-200 md:block" style={{ zIndex: 0 }} />
                )}
                <div className="relative inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-700 text-xl font-black text-white shadow-lg shadow-cyan-200 mb-5" style={{ zIndex: 1 }}>
                  {step.num}
                </div>
                <h4 className="text-lg font-black text-slate-900">{step.title}</h4>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── MEDIA GALLERY ─── */}
      {mediaItems.length > 0 && (
        <section className="bg-slate-50 py-20">
          <div className="mx-auto max-w-7xl px-5">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <span className="inline-block rounded-full bg-cyan-50 px-4 py-1 text-xs font-bold text-cyan-700 mb-3">ÜRÜN GALERİSİ</span>
              <h3 className="text-3xl font-black">Yazılımdan ekran görüntüleri</h3>
              <p className="mt-3 text-slate-500">KlinikModern arayüzünden gerçek kullanım akışı görüntüleri.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {mediaItems.map((item, idx) => (
                <div key={`media-${idx}`} className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${anim ? "transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg" : ""}`}>
                  {isVideoUrl(item) ? (
                    <video className="h-56 w-full object-cover" src={item} autoPlay muted loop playsInline controls />
                  ) : (
                    <div className="relative h-56 w-full">
                      <Image src={item} alt={`KlinikModern ekran ${idx + 1}`} fill className="object-cover" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── PRICING ─── */}
      <section id="fiyatlar" className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <span className="inline-block rounded-full bg-violet-50 px-4 py-1 text-xs font-bold text-violet-700 mb-3">FİYATLAR</span>
            <h3 className="text-3xl font-black md:text-4xl">Kliniğinize uygun paket</h3>
            <p className="mt-4 text-slate-500">İhtiyacınıza göre paket seçin, modüler olarak genişletin. Sözleşmesiz, istediğiniz zaman değiştirin.</p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {site.pricingCards.map((card, idx) => {
              const isHighlighted = !!card.badge;
              return (
                <article
                  key={`price-${idx}`}
                  className={`relative flex flex-col rounded-3xl border p-8 ${
                    isHighlighted
                      ? "border-cyan-500 bg-gradient-to-b from-cyan-600 to-cyan-700 text-white shadow-2xl shadow-cyan-200 scale-[1.02]"
                      : "border-slate-200 bg-white shadow-sm"
                  } ${anim ? "transition-transform duration-300 hover:-translate-y-1" : ""}`}
                >
                  {card.badge && (
                    <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-1.5 text-xs font-bold text-white whitespace-nowrap shadow-md">
                      ⭐ {card.badge}
                    </span>
                  )}

                  <p className={`text-sm font-bold tracking-wider uppercase ${isHighlighted ? "text-cyan-100" : "text-slate-500"}`}>{card.title}</p>

                  <div className="mt-4 flex items-end gap-1">
                    <span className={`text-5xl font-black leading-none ${isHighlighted ? "text-white" : "text-slate-900"}`}>{card.price}</span>
                    {card.period && (
                      <span className={`mb-1 text-sm ${isHighlighted ? "text-cyan-200" : "text-slate-400"}`}>{card.period}</span>
                    )}
                  </div>

                  <ul className="mt-6 flex-1 space-y-3">
                    {(card.items || []).map((item, ii) => (
                      <li key={`pi-${ii}`} className={`flex items-start gap-2.5 text-sm ${isHighlighted ? "text-cyan-50" : "text-slate-600"}`}>
                        <svg className={`mt-0.5 h-4 w-4 flex-none ${isHighlighted ? "text-cyan-200" : "text-cyan-500"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {item}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/klinik/giris"
                    className={`mt-8 block rounded-xl py-3 text-center text-sm font-bold transition ${
                      isHighlighted
                        ? "bg-white text-cyan-700 hover:bg-cyan-50 shadow-md"
                        : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Hemen Başla
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section className="bg-slate-900 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <span className="inline-block rounded-full bg-white/10 px-4 py-1 text-xs font-bold text-emerald-400 mb-3">MÜŞTERİ YORUMLARI</span>
            <h3 className="text-3xl font-black text-white md:text-4xl">Kliniklerin bize güvenmesinin nedeni</h3>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className={`rounded-2xl border border-white/10 bg-white/5 p-6 ${anim ? "transition-all hover:bg-white/10 duration-300" : ""}`}>
                <div className="flex gap-1 text-amber-400 text-sm mb-4">{"★★★★★"}</div>
                <p className="text-sm leading-relaxed text-slate-300">&ldquo;{t.text}&rdquo;</p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-cyan-700 text-xs font-bold text-white">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{t.name}</p>
                    <p className="text-xs text-slate-400">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DEMO / VIDEO CTA ─── */}
      <section id="demo" className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-600 via-cyan-700 to-slate-800 p-10 text-white md:p-16">
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
              <div>
                <span className="inline-block rounded-full bg-white/15 px-4 py-1 text-xs font-bold text-cyan-100 mb-4">CANLI DEMO</span>
                <h3 className="text-3xl font-black md:text-4xl">{site.promoTitle}</h3>
                <p className="mt-4 max-w-lg text-base leading-relaxed text-cyan-100">{site.promoDescription}</p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href={site.primaryCtaUrl || "/klinik/giris"}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-cyan-700 shadow-lg transition hover:bg-cyan-50"
                  >
                    {site.primaryCtaLabel}
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                  </Link>
                  <a
                    href={site.secondaryCtaUrl || "#fiyatlar"}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/15"
                  >
                    {site.secondaryCtaLabel}
                  </a>
                </div>
              </div>

              <DemoRequestForm />
            </div>

            {site.galleryImages.length > 0 && (
              <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
                {site.galleryImages.slice(0, 3).map((img, idx) => (
                  isVideoUrl(img) ? (
                    <video key={`gv-${idx}`} src={img} className="h-44 w-full rounded-xl border border-white/20 object-cover" autoPlay muted loop playsInline controls />
                  ) : (
                    <div key={`gi-${idx}`} className="relative h-44 w-full rounded-xl border border-white/20 overflow-hidden">
                      <Image src={img} alt={`Ekran ${idx + 1}`} fill className="object-cover" />
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-slate-200 bg-slate-900 py-12 text-slate-400">
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-600">
                  <span className="text-xs font-black text-white">K</span>
                </div>
                <span className="text-base font-black text-white">KlinikModern</span>
              </div>
              <p className="text-sm leading-relaxed text-slate-400">Diş hekimliği klinikleri için geliştirilmiş, bulut tabanlı yönetim platformu.</p>
            </div>
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Ürün</p>
              <ul className="space-y-2 text-sm">
                <li><a href="#ozellikler" className="hover:text-white transition-colors">Özellikler</a></li>
                <li><a href="#moduller" className="hover:text-white transition-colors">Modüller</a></li>
                <li><a href="#fiyatlar" className="hover:text-white transition-colors">Fiyatlar</a></li>
                <li><a href="#demo" className="hover:text-white transition-colors">Demo</a></li>
              </ul>
            </div>
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Çözümler</p>
              <ul className="space-y-2 text-sm">
                <li><span>Tekli Klinik</span></li>
                <li><span>Çok Şubeli</span></li>
                <li><span>Kurumsal</span></li>
              </ul>
            </div>
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Destek</p>
              <ul className="space-y-2 text-sm">
                <li><span>Eğitim & Onboarding</span></li>
                <li><span>Teknik Destek</span></li>
                <li><span>Veri Aktarımı</span></li>
              </ul>
              <div className="mt-5">
                <Link href="/klinik/giris" className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500 transition">
                  Klinik Girişi →
                </Link>
              </div>
            </div>
          </div>
          <div className="mt-10 border-t border-slate-800 pt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <span>© 2026 KlinikModern. Tüm hakları saklıdır.</span>
            <span className="text-slate-700">Güvenli · Hızlı · Güvenilir</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
