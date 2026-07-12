"use client";

import { useEffect, useState } from "react";
import { THEME_PACKAGES, type ThemePackage } from "@/lib/theme-packages";

export default function TemaPage() {
  const [activeTheme, setActiveTheme] = useState<string>("klasik");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/superadmin/theme")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.activeTheme) setActiveTheme(d.activeTheme); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  const activate = async (pkg: ThemePackage) => {
    if (pkg.id === activeTheme || applying) return;
    setApplying(pkg.id);
    try {
      const res = await fetch("/api/superadmin/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeTheme: pkg.id }),
      });
      if (res.ok) {
        setActiveTheme(pkg.id);
        showToast("success", `"${pkg.name}" sistem geneli aktif tema oldu. Sayfayı yenileyen herkes yeni görünümü görecek.`);
      } else {
        showToast("error", "Tema uygulanamadı");
      }
    } catch {
      showToast("error", "Bağlantı hatası");
    } finally {
      setApplying(null);
    }
  };

  return (
    <section className="space-y-5">
      {toast && (
        <div className={`fixed right-5 top-5 z-[100] max-w-sm rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${toast.type === "success" ? "bg-emerald-500" : "bg-red-500"}`}>
          {toast.text}
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="text-3xl">🎨</span>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Sistem Teması</h2>
          <p className="text-sm text-gray-500">Tüm klinikler ve tüm kullanıcılar için tek, sistem geneli renk ve yazı tipi kimliği. Seçilen tema sayfa yenilendiğinde herkeste görünür.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {THEME_PACKAGES.map((pkg) => {
            const isActive = pkg.id === activeTheme;
            const v = pkg.vars;
            return (
              <div
                key={pkg.id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${isActive ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-100 hover:border-gray-200"}`}
              >
                {/* Canlı önizleme şeridi: temanın gerçek arka plan/nötr/primary tonları */}
                <div
                  className="flex h-20 items-end gap-2 p-3"
                  style={{ background: `rgb(${v.bg})` }}
                >
                  <div className="h-9 flex-1 rounded-lg" style={{ background: `rgb(${v.surface})`, border: `1px solid rgb(${v.border})` }} />
                  <div className="h-9 w-9 shrink-0 rounded-lg" style={{ background: `rgb(${v.primary})` }} />
                  <div className="h-9 w-9 shrink-0 rounded-lg" style={{ background: `rgb(${v.accent})` }} />
                  <div className="h-9 w-6 shrink-0 rounded-lg" style={{ background: `rgb(${v.slate["400"]})` }} />
                </div>

                <div className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-gray-900" style={{ fontFamily: pkg.fontSans }}>{pkg.name}</h3>
                    {isActive && <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold text-blue-700">AKTİF</span>}
                  </div>
                  <p className="text-xs leading-relaxed text-gray-500">{pkg.description}</p>
                  <p className="truncate text-xs text-gray-400" style={{ fontFamily: pkg.fontSans }}>
                    Aa Bb Cc — {pkg.fontSans.split(",")[0].replace(/'/g, "")}
                  </p>
                  <button
                    onClick={() => activate(pkg)}
                    disabled={isActive || applying !== null}
                    className={`mt-2 w-full rounded-lg px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed ${
                      isActive
                        ? "bg-blue-50 text-blue-400"
                        : "text-white hover:opacity-90 disabled:opacity-60"
                    }`}
                    style={isActive ? undefined : { background: `rgb(${v.primary})` }}
                  >
                    {isActive ? "Şu an aktif" : applying === pkg.id ? "Uygulanıyor…" : "Bu Temayı Aktif Et"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
