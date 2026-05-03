"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";

type Props = { user: { fullName: string; role: string } };

const roleLabel: Record<string, string> = {
  YONETICI:   "Yönetici",
  DOKTOR:     "Diş Hekimi",
  ASISTAN:    "Asistan",
  BANKO:      "Banko Görevlisi",
  MUHASEBE:   "Muhasebe",
  SUPERADMIN: "Süper Admin",
};

const roleBg: Record<string, string> = {
  YONETICI:   "bg-violet-100 text-violet-700",
  DOKTOR:     "bg-cyan-100 text-cyan-700",
  ASISTAN:    "bg-emerald-100 text-emerald-700",
  BANKO:      "bg-amber-100 text-amber-700",
  MUHASEBE:   "bg-blue-100 text-blue-700",
  SUPERADMIN: "bg-red-100 text-red-700",
};

const PAGE_TITLES: Record<string, string> = {
  "/anasayfa":      "Anasayfa",
  "/muhasebe":      "Muhasebe Merkezi",
  "/randevu":       "Randevular",
  "/hasta":         "Hastalar",
  "/hasta-ekle":    "Yeni Hasta Kaydı",
  "/hasta-takip":   "Hasta Takip Paneli",
  "/hasta-detay":   "Hasta Detayı",
  "/tedavi-plani":  "Tedavi Planları",
  "/lab":           "Laboratuvar Takibi",
  "/recete":        "Reçete Görüntüleme",
  "/muayene":       "Muayene",
  "/kasa":          "Kasa / Banka",
  "/finans":        "Doktor Hakedişim",
  "/taksit":        "Taksit Takibi",
  "/gider":         "Giderler",
  "/rapor":         "Raporlar",
  "/firma":         "Tedarikçiler",
  "/stok":          "Stok Yönetimi",
  "/personel":      "Personeller",
  "/personel-ekle": "Yeni Personel",
  "/fiyat":         "Fiyat Listesi",
  "/sms":           "SMS Modülü",
  "/ayar":          "Sistem Ayarları",
  "/log":           "İşlem Kayıtları",
  "/profil":        "Profilim",
  "/destek":        "Destek",
  "/dashboard":     "Dashboard",
};

type AlertCounts = { taksit: number; stok: number; lab: number };

function Clock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const fmt = () =>
      setTime(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
    fmt();
    const t = setInterval(fmt, 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums text-sm font-semibold text-slate-700">{time}</span>;
}

export function Topbar({ user }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [alerts, setAlerts] = useState<AlertCounts>({ taksit: 0, stok: 0, lab: 0 });
  const [showAlerts, setShowAlerts] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const today = new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });

  // Sayfa başlığı
  const pageTitle = PAGE_TITLES[pathname ?? ""] ?? "";

  useEffect(() => {
    async function loadAlerts() {
      try {
        const [tRes, sRes, lRes] = await Promise.allSettled([
          fetch("/api/taksit-plani?status=GECIKTI"),
          fetch("/api/stock"),
          fetch("/api/lab-orders?status=BEKLIYOR"),
        ]);
        const tData = tRes.status === "fulfilled" && tRes.value.ok ? await tRes.value.json() : null;
        const sData = sRes.status === "fulfilled" && sRes.value.ok ? await sRes.value.json() : null;
        const lData = lRes.status === "fulfilled" && lRes.value.ok ? await lRes.value.json() : null;

        const overdueCount = Array.isArray(tData)
          ? tData.reduce((sum: number, plan: any) =>
              sum + (plan.taksitler || []).filter((t: any) => t.status === "GECIKTI").length, 0)
          : 0;
        const lowStock = Array.isArray(sData) ? sData.filter((i: any) => i.quantity < i.minQuantity).length : 0;
        const labCount = Array.isArray(lData) ? lData.length : 0;
        setAlerts({ taksit: overdueCount, stok: lowStock, lab: labCount });
      } catch {}
    }
    loadAlerts();
  }, []);

  // Dışarı tıklanınca kapat
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (alertRef.current && !alertRef.current.contains(e.target as Node)) {
        setShowAlerts(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/hasta?q=${encodeURIComponent(q.trim())}`);
  };

  const totalAlerts = alerts.taksit + alerts.stok + alerts.lab;
  const displayName = user.fullName || "Kullanıcı";
  const initials = displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 shadow-sm">
      {/* Sol: Sayfa başlığı veya arama */}
      <div className="flex flex-1 items-center gap-4">
        {pageTitle && (
          <span className="hidden text-sm font-semibold text-slate-700 md:block">{pageTitle}</span>
        )}
        <form onSubmit={search} className="flex max-w-sm flex-1 items-center gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hasta adı veya TC ile ara…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700">Ara</button>
        </form>
      </div>

      {/* Sağ taraf */}
      <div className="flex items-center gap-3">
        {/* Hızlı Erişim */}
        <div className="hidden items-center gap-2 md:flex">
          <a href="/randevu" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100">
            + Randevu
          </a>
          <a href="/hasta-ekle" className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100">
            + Hasta
          </a>
        </div>

        <span className="h-5 w-px bg-slate-200" />

        {/* Tarih & Saat */}
        <div className="hidden items-center gap-2 text-xs text-slate-400 md:flex">
          <span className="text-slate-500">{today}</span>
          <span className="h-3.5 w-px bg-slate-200" />
          <Clock />
        </div>

        <span className="h-5 w-px bg-slate-200" />

        {/* Alarm zili */}
        <div className="relative" ref={alertRef}>
          <button
            onClick={() => setShowAlerts(v => !v)}
            className="relative flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 transition"
            title="Uyarılar"
          >
            <svg className="h-5 w-5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {totalAlerts > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {totalAlerts > 9 ? "9+" : totalAlerts}
              </span>
            )}
          </button>
          {/* Dropdown */}
          {showAlerts && (
            <div className="absolute right-0 top-10 z-50 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-bold text-slate-800">Sistem Uyarıları</p>
              </div>
              <div className="divide-y divide-slate-50 py-1">
                {alerts.taksit > 0 ? (
                  <a href="/taksit" onClick={() => setShowAlerts(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                      <svg className="h-4 w-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{alerts.taksit} Gecikmiş Taksit</p>
                      <p className="text-xs text-slate-500">Taksit takibine git</p>
                    </div>
                  </a>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                      <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </span>
                    <p className="text-sm text-slate-600">Gecikmiş taksit yok</p>
                  </div>
                )}
                {alerts.stok > 0 ? (
                  <a href="/stok" onClick={() => setShowAlerts(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                      <svg className="h-4 w-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{alerts.stok} Kritik Stok Kalemi</p>
                      <p className="text-xs text-slate-500">Stok yönetimine git</p>
                    </div>
                  </a>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                      <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </span>
                    <p className="text-sm text-slate-600">Stok seviyesi normal</p>
                  </div>
                )}
                {alerts.lab > 0 ? (
                  <a href="/lab" onClick={() => setShowAlerts(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                      <svg className="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11m0 0H5m4 0h10m0-11v11m0 0h-4"/>
                      </svg>
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{alerts.lab} Bekleyen Lab Siparişi</p>
                      <p className="text-xs text-slate-500">Laboratuvar sayfasına git</p>
                    </div>
                  </a>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                      <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </span>
                    <p className="text-sm text-slate-600">Bekleyen lab siparişi yok</p>
                  </div>
                )}
              </div>
              {totalAlerts === 0 && (
                <div className="border-t border-slate-100 px-4 py-3 text-center">
                  <p className="text-xs text-slate-400">Tüm sistemler normal çalışıyor</p>
                </div>
              )}
            </div>
          )}
        </div>

        <span className="h-5 w-px bg-slate-200" />

        {/* Kullanıcı */}
        <div className="flex items-center gap-2.5">
          <div className="hidden text-right md:block">
            <p className="text-sm font-semibold leading-tight text-slate-800">{displayName}</p>
            <span className={"inline-block rounded-full px-2 py-0.5 text-[10px] font-bold " + (roleBg[user.role] ?? "bg-slate-100 text-slate-600")}>
              {roleLabel[user.role] ?? user.role}
            </span>
          </div>
          <a href="/profil" className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white ring-2 ring-blue-200 transition hover:bg-blue-700" title="Profilim">
            {initials}
          </a>
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
        </div>
      </div>
    </header>
  );
}
