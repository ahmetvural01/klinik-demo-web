"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { THEME_PACKAGES, type ThemePackage } from "@/lib/theme-packages";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { clientMutation } from "@/lib/client-mutation";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";

/**
 * Sistem geneli tema. Uygulamak TÜM kliniklerin görünümünü değiştirdiği için
 * onay istenir; her kartta dolu birincil düğme yerine ikincil "Uygula".
 */
export default function TemaTab() {
  const [activeTheme, setActiveTheme] = useState<string>("klasik");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    fetch("/api/superadmin/theme", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.message || "Tema bilgisi yüklenemedi.");
        if (!data?.activeTheme) throw new Error("Tema bilgisi beklenmeyen biçimde döndü.");
        return data;
      })
      .then((data) => setActiveTheme(data.activeTheme))
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Tema bilgisi yüklenemedi."))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const activate = async (pkg: ThemePackage) => {
    if (pkg.id === activeTheme || applying) return;
    const ok = await confirmDialog({
      title: `"${pkg.name}" uygulansın mı?`,
      message: "Tüm kliniklerin ve tüm kullanıcıların renkleri ve yazı tipi değişir. Kullanıcılar sayfayı yenilediğinde yeni görünümü görür; istediğiniz zaman eski temaya dönebilirsiniz.",
      confirmText: "Herkese uygula",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    setApplying(pkg.id);
    try {
      await clientMutation(
        "/api/superadmin/theme",
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activeTheme: pkg.id }) },
        "Tema uygulanamadı.",
      );
      setActiveTheme(pkg.id);
      showToastSafe({ type: "success", message: `"${pkg.name}" uygulandı. Sayfayı yenileyen herkes yeni görünümü görür.`, icon: "settings" });
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Tema uygulanamadı." });
    } finally {
      setApplying(null);
    }
  };

  if (loadError) return <LoadErrorState message={loadError} onRetry={() => setReloadKey((value) => value + 1)} />;
  if (loading) return <div className="ui-surface"><ListRowSkeleton rows={3} /></div>;

  return (
    <section className="space-y-3">
      <p className="text-sm text-slate-500">Seçilen renk ve yazı tipi tüm kliniklerde geçerli olur.</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {THEME_PACKAGES.map((pkg) => {
          const isActive = pkg.id === activeTheme;
          const v = pkg.vars;
          return (
            <div key={pkg.id} className={`ui-surface overflow-hidden ${isActive ? "border-primary ring-2 ring-primary/20" : ""}`}>
              {/* Önizleme şeridi: temanın gerçek arka plan / yüzey / ana renk tonları */}
              <div className="flex h-16 items-end gap-2 p-3" style={{ background: `rgb(${v.bg})` }} aria-hidden="true">
                <div className="h-8 flex-1 rounded-lg" style={{ background: `rgb(${v.surface})`, border: `1px solid rgb(${v.border})` }} />
                <div className="h-8 w-8 shrink-0 rounded-lg" style={{ background: `rgb(${v.primary})` }} />
                <div className="h-8 w-8 shrink-0 rounded-lg" style={{ background: `rgb(${v.accent})` }} />
              </div>
              <div className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: pkg.fontSans }}>{pkg.name}</h3>
                  {isActive && <Badge tone="success" icon={CheckCircle2}>Kullanımda</Badge>}
                </div>
                <p className="text-xs leading-relaxed text-slate-500">{pkg.description}</p>
                {!isActive && (
                  <Button size="sm" variant="secondary" fullWidth disabled={applying !== null} loading={applying === pkg.id} onClick={() => void activate(pkg)}>
                    Bu temayı uygula
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
