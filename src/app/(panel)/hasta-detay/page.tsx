"use client";

import dynamic from "next/dynamic";

// Bu sayfa uygulamadaki en büyük tek bileşendi (~5000 satır) ve sunucu
// tarafında (SSR) her ziyarette senkron olarak render ediliyordu — bu da
// ~3 saniyelik sabit bir gecikmeye yol açıyordu (diğer sayfalar ~100-700ms).
// `ssr:false` bu maliyeti tamamen kaldırır: sunucu boş bir kabuk döner,
// asıl render tarayıcıda (tek seferde, SSR+hydration ikilemesi olmadan)
// gerçekleşir. İçerik hasta-detay-content.tsx'e taşındı çünkü next/dynamic
// aynı dosyadaki bir bileşeni değil, ayrı bir modülü tembel yükleyebilir.
const HastaDetayContent = dynamic(() => import("./hasta-detay-content"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-40">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  ),
});

export default function HastaDetayPage() {
  return <HastaDetayContent />;
}
