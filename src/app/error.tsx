"use client";

import { useEffect } from "react";

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Bir hata oluştu</h2>
        <p className="text-gray-500 mb-6">{error.message || "Beklenmeyen bir hata meydana geldi."}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-strong transition"
        >
          Tekrar Dene
        </button>
      </div>
    </div>
  );
}
