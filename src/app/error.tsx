"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/ui/ErrorFallback";

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

  return <ErrorFallback reset={reset} />;
}
