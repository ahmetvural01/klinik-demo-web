"use client";

import Script from "next/script";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { adsenseScriptSrc, shouldShowPanelAd, type PanelAdSettings } from "@/lib/panel-ads";

/**
 * Klinik paneli reklam alanları (Google AdSense). İki yer:
 * - "content": her sayfanın içeriğinin en altında, tüm ekran genişliklerinde
 *   (yatay, alçak reklam).
 * - "sidebar": masaüstünde sol menünün altında; menü açıkken ve ekran yeterince
 *   uzunken. Telefon menüsünde yok (sık açılıp kapanır, yanlış dokunmaya açık).
 * Gösterim kuralı tek yerde: shouldShowPanelAd (src/lib/panel-ads.ts). Ayar,
 * panel kabuğunda sunucuda okunup PanelAdsProvider ile gelir (ayrı istek yok).
 * Google reklam vermezse (data-ad-status="unfilled") alan tümüyle kaybolur;
 * "Reklam" etiketi ve boşluk yalnız alan dolunca görünür. Alan reklam
 * yüklenmeden gizlenmez (AdSense genişliği ölçer). Sayfa değişince alan
 * yeniden kurulup yeni reklam ister (kullanıcı eylemi); zamanlayıcıyla
 * yenileme YOK (AdSense kuralı).
 */

const PanelAdsContext = createContext<PanelAdSettings | null>(null);

export function PanelAdsProvider({ settings, children }: { settings: PanelAdSettings | null; children: ReactNode }) {
  return <PanelAdsContext.Provider value={settings}>{children}</PanelAdsContext.Provider>;
}

type Placement = "sidebar" | "content";

// Kısa dizüstü ekranında menü öğeleri aşağı itilip kaydırma artmasın.
const SIDEBAR_AD_MEDIA = "(min-width: 1024px) and (min-height: 800px)";

type AdQueue = unknown[] & { requestNonPersonalizedAds?: number };

declare global {
  interface Window {
    adsbygoogle?: AdQueue;
  }
}

export function PanelAdSlot({ placement }: { placement: Placement }) {
  const settings = useContext(PanelAdsContext);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // null: sunucu ve ilk çizim — alan yalnız tarayıcıda kurulur (hidrasyon farkı olmaz).
  const [browser, setBrowser] = useState<{ referrer: string; fits: boolean } | null>(null);

  useEffect(() => {
    setBrowser({
      referrer: document.referrer,
      fits: placement !== "sidebar" || window.matchMedia(SIDEBAR_AD_MEDIA).matches,
    });
  }, [placement]);

  if (!settings || !browser?.fits) return null;
  const visible = shouldShowPanelAd({
    ...settings,
    pathname,
    search: searchParams?.toString() ?? "",
    referrer: browser.referrer,
  });
  if (!visible) return null;
  // Adres değişince yeni alan, yeni reklam isteği.
  return <AdUnit key={pathname} placement={placement} publisherId={settings.publisherId} slotId={settings.slotId} />;
}

function AdUnit({ placement, publisherId, slotId }: { placement: Placement; publisherId: string; slotId: string }) {
  const insRef = useRef<HTMLModElement>(null);
  const requested = useRef(false);
  // AdSense istek bitince <ins>'e data-ad-status yazar: "filled" (reklam geldi),
  // "unfilled" (gelmedi, alan gizlenir) ya da "unfill-optimized" (boş alanı
  // AdSense kendisi doldurdu; gizlenmez). Yüklenene kadar null.
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const ins = insRef.current;
    if (!ins) return;
    const observer = new MutationObserver(() => setStatus(ins.getAttribute("data-ad-status")));
    observer.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });
    // Geliştirmede efekt iki kez çalışır; aynı alan için ikinci istek gönderilmez.
    if (!requested.current) {
      requested.current = true;
      try {
        const queue: AdQueue = (window.adsbygoogle = window.adsbygoogle || []);
        // Kişiselleştirilmemiş reklam: sağlık ürünü (KVKK ve Google'ın hassas kategori kuralı).
        queue.requestNonPersonalizedAds = 1;
        queue.push({});
      } catch {
        // Reklam engelleyici ya da AdSense hatası: alan boş kalır, sayfa etkilenmez.
      }
    }
    return () => observer.disconnect();
  }, []);

  const sidebar = placement === "sidebar";
  const shown = status !== null && status !== "unfilled";
  return (
    <div
      data-ad-placement={placement}
      className={[
        "print:hidden",
        status === "unfilled" ? "hidden" : "",
        sidebar ? "shrink-0 px-2" : "mx-auto w-full max-w-[970px]",
        // Boşluk, ayırıcı çizgi ve etiket yalnız alan dolunca (önceden yer kaplamaz).
        shown ? (sidebar ? "border-t border-slate-100 pb-3 pt-2" : "mt-6 border-t border-slate-200/70 pt-2") : "",
      ].filter(Boolean).join(" ")}
    >
      {shown && <p className="mb-1 text-center text-[11px] font-medium leading-4 text-slate-400">Reklam</p>}
      <Script id="adsbygoogle-js" src={adsenseScriptSrc(publisherId)} strategy="afterInteractive" crossOrigin="anonymous" />
      <ins
        ref={insRef}
        // Google'ın önerdiği kural: boş kalan birim gizlenir (JS durumundan bağımsız yedek).
        className="adsbygoogle [&[data-ad-status=unfilled]]:!hidden"
        style={{ display: "block" }}
        data-ad-client={publisherId}
        data-ad-slot={slotId}
        // Küçük alan: menüde kare/dikdörtgen, içerik altında yatay (ör. 728×90, telefonda 320×100).
        data-ad-format={sidebar ? "rectangle" : "horizontal"}
        data-full-width-responsive={sidebar ? undefined : "true"}
      />
    </div>
  );
}
