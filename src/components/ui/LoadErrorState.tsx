import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

type LoadErrorStateProps = {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
};

/**
 * Yükleme hatası: "… yüklenemedi" + "Yeniden dene". Görünüm sayfa formu
 * hatası (Callout critical) ve pencere hatası (FormErrorBanner) ile TEK
 * kırmızı kutu dilidir; önceden üç ayrı ikon, renk ve boşlukla çiziliyordu.
 */
export function LoadErrorState({ message, onRetry, compact = false }: LoadErrorStateProps) {
  return (
    <Callout
      tone="critical"
      role="alert"
      compact={compact}
      action={onRetry && (
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>
          Yeniden dene
        </Button>
      )}
    >
      {message}
    </Callout>
  );
}
