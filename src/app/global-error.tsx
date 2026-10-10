"use client";

import "./globals.css";
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusPage } from "@/components/ui/StatusPage";

/**
 * Kök düzen çöktüğünde gösterilir; kök düzenin stilleri gelmeyebileceği için
 * globals.css burada da yüklenir. reset() bu durumda çoğu zaman toparlamaz:
 * birincil eylem sayfayı baştan yüklemektir.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="tr">
      <body>
        <StatusPage
          kind="error"
          tone="critical"
          fullScreen
          title="Uygulama açılamadı"
          description="Sayfayı yenileyin. Sorun sürerse biraz sonra yeniden deneyin."
          code={error.digest}
          actions={<Button icon={RefreshCw} onClick={() => window.location.reload()}>Sayfayı yenile</Button>}
        />
      </body>
    </html>
  );
}
