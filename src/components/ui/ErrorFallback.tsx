"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconFrame } from "@/components/ui/IconFrame";

type ErrorFallbackProps = {
  reset: () => void;
  critical?: boolean;
  contained?: boolean;
};

export function ErrorFallback({ reset, critical = false, contained = false }: ErrorFallbackProps) {
  return (
    <div className={`flex items-center justify-center bg-slate-50 px-5 ${contained ? "min-h-[60vh]" : "min-h-screen"}`}>
      <div role="alert" className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 text-center shadow-sm">
        <IconFrame icon={AlertTriangle} size="lg" accent="amber" className="mx-auto mb-4" />
        <h1 className="text-xl font-extrabold text-slate-900">
          {critical ? "Uygulama açılamadı" : "Bu alan yüklenemedi"}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
          İşleminiz kaydedilmediyse değişiklik yapmadan önce sayfayı yeniden deneyin. Sorun sürerse sistem yöneticinizle iletişime geçin.
        </p>
        <div className="mt-5 flex justify-center">
          <Button icon={RefreshCw} onClick={reset}>Yeniden Dene</Button>
        </div>
      </div>
    </div>
  );
}
