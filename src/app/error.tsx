"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusPage } from "@/components/ui/StatusPage";

/**
 * Kök hata sınırı: tanıtım, giriş, SMS izni ve randevu talebi sayfalarını
 * kapsar (panelin kendi hata ekranı var). Hastaya/aday müşteriye "sistem
 * yöneticinize başvurun" denmez; hata kodu destekle eşleştirme içindir.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      kind="error"
      fullScreen
      title="Sayfa açılamadı"
      description="Biraz sonra yeniden deneyin."
      code={error.digest}
      actions={(
        <>
          <Button icon={RefreshCw} onClick={reset}>Yeniden dene</Button>
          <Button variant="secondary" href="/">Ana sayfa</Button>
        </>
      )}
    />
  );
}
