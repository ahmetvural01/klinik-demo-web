"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { PatientFileSkeleton } from "./_components/PatientFileSkeleton";
import { prefetchPatientFile } from "./_components/patient-prefetch";

// Bu sayfa uygulamadaki en büyük bileşen ağacıdır; sunucu tarafında (SSR) her
// ziyarette senkron render edilmesi ~3 sn gecikme yaratıyordu. `ssr:false`
// ile sunucu boş bir kabuk döner, asıl render tarayıcıda yapılır. İçerik
// ayrı modüldedir çünkü next/dynamic yalnız ayrı bir modülü tembel yükler.
// Parça inerken gösterilen iskelet, içeriğin kendi yükleniyor görünümüyle
// (ve loading.tsx ile) aynıdır: açılışta zıplama olmaz.
const HastaDetayContent = dynamic(() => import("./hasta-detay-content"), {
  ssr: false,
  loading: () => <PatientFileSkeleton />,
});

export default function HastaDetayPage() {
  const id = useSearchParams().get("id") || "";
  const prefetchedRef = useRef("");
  // Hasta isteği sayfa parçası inerken başlar (şelale yok). Yalnız tarayıcıda
  // ve hasta değişince bir kez; sekme değişimi (?tab=) yeniden istek atmaz.
  // Yanıt içeriğin ilk yüklemesinde kullanılır (bkz. patient-prefetch.ts).
  if (typeof window !== "undefined" && id && prefetchedRef.current !== id) {
    prefetchedRef.current = id;
    prefetchPatientFile(id);
  }
  return <HastaDetayContent />;
}
