"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  CheckCircle2,
  ShieldCheck,
  Lock,
  Building2,
  ArrowRight,
  Bell,
  Search,
  Infinity as InfinityIcon,
  Timer,
  ChevronDown,
} from "lucide-react";
import { DemoRequestForm } from "@/components/marketing/DemoRequestForm";

const HERO_IMAGE = "/clinic-workspace-hero.jpg";

const modules = [
  { title: "Hasta ve randevu yönetimi", desc: "Hasta kartı, randevu akışı, takip ve görev kayıtları tek dosyada.", icon: "calendar" },
  { title: "Tedavi ve laboratuvar takibi", desc: "Diş şeması, tedavi planı, laboratuvar gönderimi, prova takibi ve fatura bağlantısı.", icon: "tedavi" },
  { title: "Finans ve tahsilat yönetimi", desc: "Tahsilat, gider, tedarikçi ödemesi, hekim hakedişi ve alacak takibi aynı muhasebe düzeninde.", icon: "finance" },
  { title: "Stok ve tedarik yönetimi", desc: "Satın alma, stok girişi, tüketim, ortalama maliyet ve tedarikçi hareketleri.", icon: "box" },
] as const;

const trustPoints = [
  { icon: Building2, text: "Kurum bazlı veri izolasyonu" },
  { icon: ShieldCheck, text: "Rol ve yetki bazlı erişim kontrolü" },
  { icon: CheckCircle2, text: "Uçtan uca denetim izi" },
  { icon: Lock, text: "KVKK kapsamında şifreli veri saklama" },
];

const workflowSteps = [
  { step: "1", icon: "calendar", title: "Hasta kaydı ve randevu", desc: "Hasta dosyası açılır, randevu ilgili doktor ve tedavi alanına planlanır." },
  { step: "2", icon: "tedavi", title: "Muayene ve tedavi planı", desc: "Diş şeması üzerinden tedavi planlanır, gerekirse laboratuvara iş gönderilir." },
  { step: "3", icon: "finance", title: "Fatura ve tahsilat", desc: "Tedavi tutarı otomatik olarak hasta hesabına işlenir, tahsilat kaydedilir." },
  { step: "4", icon: "chart", title: "Raporlama ve denetim", desc: "Tüm işlemler kim, ne zaman yaptı bilgisiyle raporlanabilir ve izlenebilir." },
] as const;

const heroBadges = [
  { icon: ShieldCheck, text: "KVKK uyumlu altyapı" },
  { icon: InfinityIcon, text: "Sınırsız modül erişimi" },
  { icon: Timer, text: "Hızlı demo dönüşü" },
];

const faqs = [
  {
    q: "Demo hesabı ne kadar süre geçerli?",
    a: "Demo talebi onaylandıktan sonra size özel, izole bir kurum hesabı açılır ve sınırlı bir süre için (talep formunda belirtilen geçerlilik tarihine kadar) örnek verilerle serbestçe kullanılabilir.",
  },
  {
    q: "Verilerimiz nasıl korunuyor?",
    a: "Her kurumun verisi diğer kurumlardan tamamen izole tutulur. Hassas hasta bilgileri (sağlık geçmişi, belgeler) şifreli saklanır ve her hasta kaydı görüntülemesi KVKK gereği erişim kaydı olarak loglanır.",
  },
  {
    q: "Mevcut hasta/kayıt verilerimizi sisteme aktarabilir miyiz?",
    a: "Evet. Kurulum sürecinde mevcut Excel veya başka bir yazılımdan gelen hasta, randevu ve stok verileriniz için aktarım desteği sağlanır.",
  },
  {
    q: "Kaç kullanıcı veya şube ile çalışabiliriz?",
    a: "Kullanıcı ve şube sayısı kurumunuzun büyüklüğüne göre esnek şekilde tanımlanır; her personel için rol bazlı (Yönetici, Doktor, Asistan, Muhasebe) ayrı yetki tanımlanır.",
  },
  {
    q: "Fiyatlandırma nasıl belirleniyor?",
    a: "Fiyatlandırma; klinik büyüklüğü, şube sayısı ve kullanılacak modüllere göre size özel hazırlanır. Demo talebi sonrasında ihtiyacınıza uygun bir teklif sunulur.",
  },
];

export default function RootPage() {
  const [activeTab, setActiveTab] = useState<'urun' | 'isleyis' | 'fiyat' | 'demo' | 'moduller' | 'all'>('urun');

  const isVisible = (key: string) => activeTab === 'all' || activeTab === key;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-3" aria-label="Ana sayfa">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0d7d6f] to-[#0a5b57] text-sm font-black text-white shadow-sm">
              KM
            </span>
            <span className="text-sm font-black tracking-tight">KlinikModern</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 lg:flex">
            <a href="#moduller" className="transition-colors hover:text-[#0d7d6f]">Modüller</a>
            <a href="#urun" className="transition-colors hover:text-[#0d7d6f]">Ürün</a>
            <a href="#isleyis" className="transition-colors hover:text-[#0d7d6f]">İşleyiş</a>
            <a href="#fiyatlandirma" className="transition-colors hover:text-[#0d7d6f]">Fiyatlandırma</a>
            <a href="#sss" className="transition-colors hover:text-[#0d7d6f]">SSS</a>
            <a href="#demo" className="transition-colors hover:text-[#0d7d6f]">Demo Talebi</a>
          </nav>
          <Link
            href="/klinik/giris"
            className="rounded-lg bg-[#0d7d6f] px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#0a655a]"
          >
            Klinik Girişi
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-slate-950">
        <Image
          src={HERO_IMAGE}
          alt="Diş hekimliği muayenesi"
          fill
          priority
          unoptimized
          className="object-cover opacity-50"
        />
        <div className="relative mx-auto flex min-h-[min(72vh,650px)] max-w-7xl items-center px-5 py-14">
          <div className="max-w-3xl text-white">
            <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-100">
              Diş hekimliği klinikleri için kurumsal yönetim yazılımı
            </span>
            <h1 className="mt-5 max-w-4xl text-4xl font-black leading-tight md:text-6xl">
              Kliniğinizin tüm işleyişi, tek profesyonel panelde.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-200 md:text-lg">
              Hasta, randevu, tedavi, laboratuvar, stok, tedarikçi ve muhasebe süreçlerini tek panelde, rol bazlı yetkilerle ve tam denetim izi ile yönetin.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {heroBadges.map((badge) => (
                <span key={badge.text} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-slate-100">
                  <badge.icon className="h-3.5 w-3.5 text-teal-300" />
                  {badge.text}
                </span>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => setActiveTab('demo')}
                className="marketing-cta inline-flex items-center gap-2 rounded-lg bg-[#0d7d6f] px-5 py-3 text-sm font-black text-white shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5 hover:bg-[#0a655a]"
              >
                Demo Talep Et
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                href="/klinik/giris"
                className="rounded-lg border border-white/25 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-white/10"
              >
                Mevcut Kullanıcı Girişi
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* TAB BAR */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-3">
          <div className="flex flex-wrap items-center gap-3">
            {[
              { key: 'urun', label: 'Ürün' },
              { key: 'isleyis', label: 'İşleyiş' },
              { key: 'fiyat', label: 'Fiyatlandırma' },
              { key: 'demo', label: 'Demo' },
              { key: 'moduller', label: 'Modüller' },
              { key: 'all', label: 'Tümü' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key as any)}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${activeTab === t.key ? 'bg-[#0d7d6f] text-white' : 'bg-white text-slate-700 border border-slate-100'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST STRIP — tek yerde, tekrar etmeden */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-5 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {trustPoints.map((item) => (
            <div key={item.text} className="flex items-center gap-2.5 text-sm font-semibold text-slate-600">
              <item.icon className="h-4 w-4 flex-none text-[#0d7d6f]" />
              {item.text}
            </div>
          ))}
        </div>
      </section>

      {/* MODULES */}
      {isVisible('moduller') && (
        <section id="moduller" className="mx-auto max-w-7xl px-5 py-16">
        <div className="max-w-2xl">
          <p className="text-xs font-black uppercase tracking-wide text-[#0d7d6f]">Modüller</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight">Klinik iş akışına göre tasarlanmış yapı</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Gereksiz vitrin ekranları yerine günlük kullanımda ihtiyaç duyulan hasta, tedavi, finans ve tedarik akışları öne çıkarılır.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {modules.map((module) => (
            <article
              key={module.title}
              className="group rounded-xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-[#0d7d6f]/30 hover:shadow-lg hover:shadow-slate-200/60"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/icons/modules/${module.icon}.svg`} alt="" width={26} height={26} />
              </span>
              <h3 className="mt-4 font-black">{module.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{module.desc}</p>
            </article>
          ))}
        </div>
        </section>
      )}

      {/* PRODUCT PREVIEW / URUN */}
      {isVisible('urun') && (
        <section id="urun" className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-5 py-16">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-wide text-[#0d7d6f]">Ürün</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Kayıt defteri değil, gerçek bir yönetim sistemi</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Her ekran birbirine bağlıdır: bir randevudan tedaviye, tedaviden faturaya, faturadan tahsilata giden akış tek panelde izlenir.
            </p>
          </div>

          {/* Gerçek panel tasarımıyla birebir aynı renk/gradyan dilini kullanan
              bir arayüz maketi — ürünün kendisinden bir önizleme, dizüstü
              bilgisayar çerçevesi içinde. */}
          <div className="relative mx-auto mt-10 mb-14 w-full max-w-3xl">
            <div className="rounded-t-2xl rounded-b-md border border-slate-300 bg-slate-800 p-2 shadow-2xl shadow-slate-300/60 sm:p-2.5">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
            <div className="flex items-center gap-1.5 border-b border-white/10 bg-slate-950/60 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
              <span className="ml-3 flex-1 truncate rounded-md bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-400">
                klinikmodern.app/anasayfa
              </span>
            </div>
            <div className="bg-slate-50 p-4">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="flex items-center gap-2 text-slate-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/modules/home.svg" alt="" width={20} height={20} />
                  <span className="text-xs font-black">Anasayfa</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <Search className="h-3.5 w-3.5" />
                  <Bell className="h-3.5 w-3.5" />
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0d7d6f] text-[9px] font-black text-white">KY</span>
                </div>
              </div>

              <div
                className="mt-3 rounded-xl p-4 text-white shadow-sm"
                style={{ background: "linear-gradient(120deg, rgb(7 64 57), rgb(13 125 111) 55%, rgb(56 189 168))" }}
              >
                <p className="text-[10px] font-black uppercase tracking-wider text-white/80">Klinik Yönetim Paneli</p>
                <p className="mt-1 text-base font-black">Günlük görünüm</p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "Bugünkü Randevu", value: "18", tone: "from-sky-50 to-white text-sky-700" },
                  { label: "İşlem Bekleyen", value: "5", tone: "from-amber-50 to-white text-amber-700" },
                  { label: "Bugün Ciro", value: "₺24.600", tone: "from-emerald-50 to-white text-emerald-700" },
                  { label: "Açık Uyarı", value: "1", tone: "from-rose-50 to-white text-rose-600" },
                ].map((tile) => (
                  <div key={tile.label} className={`rounded-lg border border-slate-200 bg-gradient-to-br p-2.5 ${tile.tone}`}>
                    <p className="text-[8px] font-black uppercase tracking-wide opacity-70">{tile.label}</p>
                    <p className="mt-1 text-sm font-black">{tile.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-black text-slate-800">Randevu Takvimi</p>
                  <span className="text-[9px] font-bold text-slate-400">Bugün</span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {[
                    { time: "09:30", name: "A. Yılmaz", type: "Kontrol", tone: "bg-sky-100 text-sky-700" },
                    { time: "10:15", name: "M. Kaya", type: "Dolgu", tone: "bg-teal-100 text-teal-700" },
                    { time: "11:00", name: "E. Demir", type: "İmplant", tone: "bg-orange-100 text-orange-700" },
                  ].map((row) => (
                    <div key={row.time} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                      <span className="w-10 flex-none text-[9px] font-black text-slate-500">{row.time}</span>
                      <span className="flex-1 truncate text-[10px] font-bold text-slate-700">{row.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${row.tone}`}>{row.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </div>
            </div>
            {/* Dizüstü bilgisayar tabanı */}
            <div className="mx-auto h-3 w-[92%] rounded-b-xl bg-slate-700" />
            <div className="mx-auto h-1.5 w-3/5 rounded-b-md bg-slate-800/70" />

            {/* Uygulamadan gerçek bir bildirim örneği */}
            <div className="absolute -bottom-6 right-2 hidden w-64 items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-xl sm:flex">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#0d7d6f]/10 text-[#0d7d6f]">
                <Bell className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-black text-slate-900">Yeni Randevu</p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">A. Yılmaz, yarın 10:00 için randevu oluşturdu.</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <div className="flex items-center gap-2 text-slate-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/modules/finance.svg" alt="" width={18} height={18} />
                  <span className="text-xs font-black">Muhasebe Merkezi</span>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">Canlı</span>
              </div>
              <div className="p-4">
                <div className="flex gap-2 text-[11px] font-bold">
                  <span className="rounded-md bg-[#0d7d6f] px-3 py-1.5 text-white">Muhasebe Defteri</span>
                  <span className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-600">Alacaklar</span>
                  <span className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-600">Hakediş</span>
                </div>
                <div className="mt-3 space-y-1.5">
                  {[
                    { name: "A. Yılmaz — Kanal Tedavisi", amount: "+ ₺4.500", tone: "text-emerald-600" },
                    { name: "Medikal Sarf Deposu — Fatura Ödemesi", amount: "− ₺3.000", tone: "text-rose-600" },
                    { name: "M. Kaya — İmplant Ön Ödeme", amount: "+ ₺12.000", tone: "text-emerald-600" },
                  ].map((row) => (
                    <div key={row.name} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs">
                      <span className="font-semibold text-slate-700">{row.name}</span>
                      <span className={`font-black ${row.tone}`}>{row.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <div className="flex items-center gap-2 text-slate-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/modules/box.svg" alt="" width={18} height={18} />
                  <span className="text-xs font-black">Stok Takibi</span>
                </div>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">1 kritik seviye</span>
              </div>
              <div className="p-4 space-y-1.5">
                {[
                  { name: "Nitril Eldiven M", qty: "12 kutu", tone: "bg-emerald-100 text-emerald-700" },
                  { name: "Artikain Anestezi Ampul", qty: "6 adet", tone: "bg-rose-100 text-rose-700" },
                  { name: "Kompozit Refil A2", qty: "24 adet", tone: "bg-emerald-100 text-emerald-700" },
                  { name: "Ölçü Silikonu Putty", qty: "9 takım", tone: "bg-emerald-100 text-emerald-700" },
                ].map((row) => (
                  <div key={row.name} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs">
                    <span className="font-semibold text-slate-700">{row.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${row.tone}`}>{row.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        </section>
      )}

      {/* ISLEYIS — trust bültenini tekrarlamayan, süreç akışı */}
      {isVisible('isleyis') && (
        <section id="isleyis" className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-wide text-[#0d7d6f]">İşleyiş</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Bir hastanın sistemdeki yolculuğu</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Klinik personeli işlemi nereden yapacağını aramak zorunda kalmaz; her kayıt bir sonraki adıma otomatik bağlanır.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workflowSteps.map((item) => (
              <div key={item.step} className="relative rounded-xl border border-slate-200 bg-slate-50/60 p-5">
                <span className="text-xs font-black text-slate-300">{item.step.padStart(2, "0")}</span>
                <span className="mt-2 flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/icons/modules/${item.icon}.svg`} alt="" width={24} height={24} />
                </span>
                <h3 className="mt-3 text-sm font-black text-slate-900">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
        </section>
      )}

      {/* FIYATLANDIRMA */}
      {isVisible('fiyat') && (
        <section id="fiyatlandirma" className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-wide text-[#0d7d6f]">Fiyatlandırma</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Kliniğinize özel paket</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Fiyatlandırma; klinik büyüklüğü, şube sayısı ve kullanılacak modüllere göre belirlenir. Sabit bir liste fiyatı yerine ihtiyacınıza göre hazırlanmış bir teklif sunulur.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { title: "Klinik büyüklüğü", desc: "Tek şube veya çoklu şube yapınıza göre ölçeklenir." },
              { title: "Kullanılan modüller", desc: "Yalnızca ihtiyaç duyduğunuz modüller için ödeme yaparsınız." },
              { title: "Kurulum ve destek", desc: "Veri aktarımı ve personel eğitimi teklife dahil edilir." },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50/60 p-5">
                <CheckCircle2 className="h-5 w-5 text-[#0d7d6f]" />
                <h3 className="mt-3 text-sm font-black text-slate-900">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
          <a
            href="#demo"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#0d7d6f] px-5 py-3 text-sm font-black text-white shadow-sm transition-colors hover:bg-[#0a655a]"
          >
            Size özel teklif için demo talep edin
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
        </section>
      )}

      {/* SSS */}
      {isVisible('all') && (
        <section id="sss" className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-3xl px-5 py-16">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-wide text-[#0d7d6f]">Sık Sorulan Sorular</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Merak edilenler</h2>
          </div>
          <div className="mt-8 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {faqs.map((item) => (
              <details key={item.q} className="group p-5 open:bg-slate-50/60">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-black text-slate-900">
                  {item.q}
                  <ChevronDown className="h-4 w-4 flex-none text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-6 text-slate-600">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
        </section>
      )}

      {/* DEMO */}
      {isVisible('demo') && (
        <section id="demo" className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#0d7d6f]">Demo Talebi</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">
              Canlı demo erişimi oluşturun
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Demo hesabınız süreli ve izole şekilde oluşturulur. Hasta, randevu, tedavi, ödeme, laboratuvar, stok ve tedarikçi akışlarını örnek verilerle test edebilirsiniz.
            </p>
          </div>
          <DemoRequestForm />
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
              <a href="#moduller" className="hover:text-[#0d7d6f]">Modüller</a>
              <a href="#urun" className="hover:text-[#0d7d6f]">Ürün</a>
              <a href="#isleyis" className="hover:text-[#0d7d6f]">İşleyiş</a>
              <a href="#fiyatlandirma" className="hover:text-[#0d7d6f]">Fiyatlandırma</a>
              <a href="#sss" className="hover:text-[#0d7d6f]">SSS</a>
              <a href="#demo" className="hover:text-[#0d7d6f]">Demo Talebi</a>
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
