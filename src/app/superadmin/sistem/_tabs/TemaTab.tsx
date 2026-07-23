"use client";

import { useEffect, useState } from "react";
import { THEME_PACKAGES, type ThemePackage } from "@/lib/theme-packages";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { showToastSafe } from "@/lib/toast-client";

export default function TemaTab() {
  const [activeTheme, setActiveTheme] = useState<string>("klasik");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/superadmin/theme")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.activeTheme) setActiveTheme(d.activeTheme); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
        showToastSafe({ title: "Uygulandı", message: `"${pkg.name}" sistem geneli aktif tema oldu. Sayfayı yenileyen herkes yeni görünümü görecek.`, type: "success" });
      } else {
        showToastSafe({ title: "Hata", message: "Tema uygulanamadı", type: "error" });
      }
    } catch {
      showToastSafe({ title: "Hata", message: "Bağlantı hatası", type: "error" });
    } finally {
      setApplying(null);
    }
  };

  return (
    <section className="space-y-4">
      <p className="text-xs text-slate-500">Tüm klinikler ve tüm kullanıcılar için tek, sistem geneli renk ve yazı tipi kimliği. Seçilen tema sayfa yenilendiğinde herkeste görünür.</p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {THEME_PACKAGES.map((pkg) => {
            const isActive = pkg.id === activeTheme;
            const v = pkg.vars;
            return (
              <div
                key={pkg.id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${isActive ? "border-primary ring-2 ring-primary/20" : "border-slate-100 hover:border-slate-200"}`}
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
                    <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: pkg.fontSans }}>{pkg.name}</h3>
                    {isActive && <Badge tone="success">AKTİF</Badge>}
                  </div>
                  <p className="text-xs leading-relaxed text-slate-500">{pkg.description}</p>
                  <p className="truncate text-xs text-slate-400" style={{ fontFamily: pkg.fontSans }}>
                    Aa Bb Cc — {pkg.fontSans.split(",")[0].replace(/'/g, "")}
                  </p>
                  <Button
                    size="sm"
                    variant={isActive ? "secondary" : "primary"}
                    disabled={isActive || applying !== null}
                    loading={applying === pkg.id}
                    onClick={() => void activate(pkg)}
                    className="w-full"
                  >
                    {isActive ? "Şu an aktif" : "Bu Temayı Aktif Et"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
