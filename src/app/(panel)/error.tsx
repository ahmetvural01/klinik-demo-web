"use client";

import { useEffect, useMemo } from "react";
import { LifeBuoy, RefreshCw } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { Button } from "@/components/ui/Button";
import { StatusPage } from "@/components/ui/StatusPage";
import { buildNavGroups } from "@/lib/nav";

/**
 * Panel hata sınırı — yetkisiz/bulunamadı ekranlarıyla aynı görünüm
 * (StatusPage). Hata kodu (digest) ekranda yazar ve "Destek talebi aç" onu
 * talebe ekler: destek ekibi sunucu kaydında aynı hatayı bulabilir. Hasta
 * verisi eklenmez; yalnız kod.
 */
export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { can, hasFeature } = usePermissions();

  useEffect(() => {
    console.error(error);
  }, [error]);

  // Güvenli başlangıç noktası: menüdeki ilk izinli sayfa (Ana sayfa izni olmayan rol de çıkmaza düşmesin).
  const home = useMemo(() => buildNavGroups({ can, hasFeature }).flatMap((group) => group.items)[0] ?? null, [can, hasFeature]);
  const supportHref = `/destek?yeni=1${error.digest ? `&hata=${encodeURIComponent(error.digest)}` : ""}`;

  return (
    <StatusPage
      kind="error"
      title="Bu sayfa açılamadı"
      description="Beklenmeyen bir hata oluştu. Son işleminiz kaydedilmemiş olabilir; sayfayı yeniden deneyin. Sorun sürerse destek ekibine bildirin."
      code={error.digest}
      actions={(
        <>
          <Button icon={RefreshCw} onClick={reset}>Yeniden dene</Button>
          <Button variant="secondary" href={home?.href || "/profil"}>{home?.label || "Profilim"}</Button>
          {can("support:write") && <Button variant="ghost" icon={LifeBuoy} href={supportHref}>Destek talebi aç</Button>}
        </>
      )}
    />
  );
}
