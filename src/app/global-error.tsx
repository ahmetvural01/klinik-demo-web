"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/ui/ErrorFallback";

export default function GlobalError({
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
    <html lang="tr">
      <body>
        <ErrorFallback reset={reset} critical />
      </body>
    </html>
  );
}
