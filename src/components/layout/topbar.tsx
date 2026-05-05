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
type MessageLite = { id: string; userId: string; createdAt: string };

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
  const baseTitleRef = useRef<string>("KlinikModern");
  const [q, setQ] = useState("");
  const [searchResults, setSearchResults] = useState<{id: string; fullName: string; tcNo: string; phone: string}[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const getEffectiveRole = () => sessionStorage.getItem("dev-preview-role") || user.role;
  const [effectiveRole, setEffectiveRole] = useState(user.role);
  useEffect(() => {
    setEffectiveRole(getEffectiveRole());
    const onStorage = () => setEffectiveRole(getEffectiveRole());
    window.addEventListener("storage", onStorage);
    // sidebar aynı pencerede sessionStorage'ı değiştirdiğinde storage event fırlamaz,
    // bu yüzden custom event de dinle
    window.addEventListener("preview-role-change", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("preview-role-change", onStorage);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.role]);
  const hidePhone = effectiveRole === "DOKTOR" || effectiveRole === "ASISTAN";
  const [alerts, setAlerts] = useState<AlertCounts>({ taksit: 0, stok: 0, lab: 0 });
  const [showAlerts, setShowAlerts] = useState(false);
  const [messageUnread, setMessageUnread] = useState(0);
  const [currentUserId, setCurrentUserId] = useState("");
  const alertRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const today = new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });

  // Sayfa başlığı
  const pageTitle = PAGE_TITLES[pathname ?? ""] ?? "";

  useEffect(() => {
    if (typeof document !== "undefined") {
      baseTitleRef.current = document.title || "KlinikModern";
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCurrentUserId(d?.id || ""))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const updateUnread = async () => {
      try {
        const res = await fetch("/api/messages");
        if (!res.ok) return;
        const list = (await res.json()) as MessageLite[];
        const lastSeenRaw = localStorage.getItem("clinic-messages-last-seen") || "";
        const lastSeen = lastSeenRaw ? new Date(lastSeenRaw).getTime() : 0;

        const unread = Array.isArray(list)
          ? list.filter((m) => new Date(m.createdAt).getTime() > lastSeen && m.userId !== currentUserId).length
          : 0;

        setMessageUnread(unread);
        localStorage.setItem("clinic-unread-messages", String(unread));
        window.dispatchEvent(new Event("clinic-unread-messages-change"));
      } catch {}
    };

    updateUnread();
    timer = setInterval(updateUnread, 20000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [currentUserId]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = baseTitleRef.current || "KlinikModern";
    document.title = messageUnread > 0 ? `(${messageUnread}) ${base}` : base;
  }, [messageUnread]);

  // Rol bazlı bildirim yetki haritası
  // taksit: finans yetkisi olan roller (YONETICI, MUHASEBE, BANKO)
  // stok:   stok yetkisi olan roller (YONETICI, MUHASEBE)
  // lab:    lab yetkisi olan roller (YONETICI, DOKTOR, ASISTAN)
  const canSeeTaksit = ["YONETICI", "SUPERADMIN", "MUHASEBE", "BANKO"].includes(effectiveRole);
  const canSeeStok   = ["YONETICI", "SUPERADMIN", "MUHASEBE"].includes(effectiveRole);
  const canSeeLab    = ["YONETICI", "SUPERADMIN", "DOKTOR", "ASISTAN"].includes(effectiveRole);

  useEffect(() => {
    async function loadAlerts() {
      try {
        const fetches = await Promise.allSettled([
          canSeeTaksit ? fetch("/api/taksit-plani?status=GECIKTI") : Promise.resolve(null),
          canSeeStok   ? fetch("/api/stock")                       : Promise.resolve(null),
          canSeeLab    ? fetch("/api/lab-orders?status=BEKLIYOR")  : Promise.resolve(null),
        ]);
        const tData = canSeeTaksit && fetches[0].status === "fulfilled" && fetches[0].value?.ok ? await fetches[0].value.json() : null;
        const sData = canSeeStok   && fetches[1].status === "fulfilled" && fetches[1].value?.ok ? await fetches[1].value.json() : null;
        const lData = canSeeLab    && fetches[2].status === "fulfilled" && fetches[2].value?.ok ? await fetches[2].value.json() : null;

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
  // effectiveRole değişince bildirimleri yeniden yükle
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRole]);

  // Dışarı tıklanınca kapat
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (alertRef.current && !alertRef.current.contains(e.target as Node)) {
        setShowAlerts(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
        setQ("");
        setSearchResults([]);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Debounced search
  useEffect(() => {
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    // Her aramada güncel rolü oku
    setEffectiveRole(getEffectiveRole());
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients?q=${encodeURIComponent(q)}&take=8`);
        if (res.ok) {
          const json = await res.json();
          const patients = Array.isArray(json) ? json : (json?.patients ?? []);
          setSearchResults(patients.slice(0, 8));
        }
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const [selectedResultIdx, setSelectedResultIdx] = useState(-1);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setShowSearchDropdown(false);
      setQ("");
      setSearchResults([]);
      setSelectedResultIdx(-1);
      return;
    }

    if (!showSearchDropdown || searchResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedResultIdx(idx => Math.min(idx + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedResultIdx(idx => Math.max(idx - 1, -1));
    } else if (e.key === "Enter" && selectedResultIdx >= 0) {
      e.preventDefault();
      window.location.href = `/hasta-detay?id=${searchResults[selectedResultIdx].id}`;
    }
  };

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
        <div className="relative flex max-w-sm flex-1">
          <form onSubmit={search} className="w-full">
            <div ref={searchRef} className="relative flex items-center gap-2 rounded-lg border-2 border-blue-200 bg-blue-50 px-3 py-1.5 shadow-sm">
              <svg className="h-4 w-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setShowSearchDropdown(true); setSelectedResultIdx(-1); }}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => { setShowSearchDropdown(true); setSelectedResultIdx(-1); }}
                placeholder="İsim, TC veya telefon ile hasta ara…"
                aria-label="Hasta ara - ad, TC no veya telefon ile"
                aria-expanded={showSearchDropdown}
                aria-autocomplete="list"
                className="flex-1 border-none bg-transparent text-sm font-medium outline-none placeholder-blue-400"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => { setQ(""); setSearchResults([]); setShowSearchDropdown(false); }}
                  className="text-blue-400 hover:text-blue-600"
                >
                  ✕
                </button>
              )}
              {searchResults.length > 0 && showSearchDropdown && (
                <div className="absolute top-full left-0 right-0 z-50 mt-2 rounded-lg border border-blue-200 bg-white shadow-xl" role="listbox">
                  <div className="flex items-center justify-between border-b border-blue-100 px-4 py-2 text-xs font-bold text-blue-600">
                    <span>{searchResults.length} sonuç</span>
                  </div>
                  {searchResults.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={selectedResultIdx === idx}
                      onMouseEnter={() => setSelectedResultIdx(idx)}
                      onClick={() => {
                        window.location.href = `/hasta-detay?id=${p.id}`;
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                        selectedResultIdx === idx ? "bg-blue-100" : "hover:bg-blue-50"
                      } ${idx < searchResults.length - 1 ? "border-b border-blue-50" : ""}`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                        {p.fullName.split(" ").map(w => w[0]).slice(0, 1).join("")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{p.fullName}</p>
                        <p className="text-xs text-slate-500 truncate">{p.tcNo}{!hidePhone ? ` · ${p.phone}` : ""}</p>
                      </div>
                      <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  ))}
                </div>
              )}
              {showSearchDropdown && q.length >= 2 && searchResults.length === 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-2 rounded-lg border border-blue-200 bg-white px-4 py-3 text-center text-sm text-slate-500 shadow-lg">
                  <div className="inline-flex items-center gap-2">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Hastalar aranıyor…
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>
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
                {/* Taksit bildirimi — sadece yetkili roller */}
                {canSeeTaksit && (alerts.taksit > 0 ? (
                  <a href="/muhasebe?tab=taksit" onClick={() => setShowAlerts(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition">
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
                ))}
                {/* Stok bildirimi — sadece yetkili roller */}
                {canSeeStok && (alerts.stok > 0 ? (
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
                ))}
                {/* Lab bildirimi — sadece yetkili roller */}
                {canSeeLab && (alerts.lab > 0 ? (
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
                ))}
                {/* Hiçbir bildirim grubu yoksa */}
                {!canSeeTaksit && !canSeeStok && !canSeeLab && (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-slate-400">Bu rol için sistem uyarısı bulunmuyor</p>
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
