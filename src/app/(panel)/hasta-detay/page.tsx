"use client";

import dynamic from "next/dynamic";

// Bu sayfa uygulamadaki en büyük tek bileşendi (~5000 satır) ve sunucu
// tarafında (SSR) her ziyarette senkron olarak render ediliyordu — bu da
// ~3 saniyelik sabit bir gecikmeye yol açıyordu (diğer sayfalar ~100-700ms).
// `ssr:false` bu maliyeti tamamen kaldırır: sunucu boş bir kabuk döner,
// asıl render tarayıcıda (tek seferde, SSR+hydration ikilemesi olmadan)
// gerçekleşir. İçerik hasta-detay-content.tsx'e taşındı çünkü next/dynamic
// aynı dosyadaki bir bileşeni değil, ayrı bir modülü tembel yükleyebilir.
// JS parça indirilirken (ssr:false nedeniyle kısa ama görünür bir an) çıplak
// bir spinner yerine, hemen ardından gelecek gerçek içeriğin taslağıyla aynı
// dilde bir iskelet gösterilir — sayfa "boş an" hissi vermeden, dolacağı
// biçimin önizlemesiyle açılır (bkz. hasta-detay-content.tsx içindeki
// `if (loading)` iskeleti — burası onun bir öncüsüdür, aynı oranlarda).
const HastaDetayContent = dynamic(() => import("./hasta-detay-content"), {
  ssr: false,
  loading: () => (
    <section className="space-y-4 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="h-6 w-40 animate-pulse rounded bg-slate-100" />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="h-24 animate-pulse rounded-lg bg-slate-50" />
        <div className="h-24 animate-pulse rounded-lg bg-slate-50" style={{ animationDelay: "60ms" }} />
        <div className="h-24 animate-pulse rounded-lg bg-slate-50" style={{ animationDelay: "120ms" }} />
      </div>
      <div className="h-56 animate-pulse rounded-lg bg-slate-50" style={{ animationDelay: "180ms" }} />
    </section>
  ),
});

export default function HastaDetayPage() {
  return <HastaDetayContent />;
}
