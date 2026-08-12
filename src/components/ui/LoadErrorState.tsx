import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

type LoadErrorStateProps = {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
};

export function LoadErrorState({ message, onRetry, compact = false }: LoadErrorStateProps) {
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 text-red-800 ${compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </span>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>
          Yeniden Dene
        </Button>
      )}
    </div>
  );
}
