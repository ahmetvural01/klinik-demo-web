"use client";

import { useEffect } from "react";

export default function PanelError({
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
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-center p-8">
        <h2 className="text-xl font-bold text-gray-800 mb-2">Bir hata oluştu</h2>
        <p className="text-gray-500 mb-6 text-sm">{error.message || "Beklenmeyen bir hata meydana geldi."}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
        >
          Tekrar Dene
        </button>
      </div>
    </div>
  );
}
