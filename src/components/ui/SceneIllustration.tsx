/**
 * Boş durum / bağlam illüstrasyonları — unDraw'dan (undraw.co, ticari kullanım
 * ücretsiz, atıf gerektirmez, bkz. docs/VISUAL-ASSET-LICENSES.md) indirilip
 * marka rengine (`#0d7d6f`) yeniden boyanmış SVG sahneler. Modül simgesinden
 * (ModuleIcon) farklı olarak geniş, sahne-tipi illüstrasyonlardır — her
 * modülün kendi görsel karakterini taşıması için kullanılır.
 */
const SCENE_SRC = {
  hasta: "/illustrations/hasta-empty.svg",
  randevu: "/illustrations/randevu-empty.svg",
  muhasebe: "/illustrations/muhasebe-empty.svg",
  sms: "/illustrations/sms-empty.svg",
  whatsapp: "/illustrations/whatsapp-empty.svg",
  rapor: "/illustrations/rapor-empty.svg",
  search: "/illustrations/search-empty.svg",
  lab: "/illustrations/lab-empty.svg",
  stok: "/illustrations/stok-empty.svg",
  success: "/illustrations/success-scene.svg",
  permissionDenied: "/illustrations/permission-denied.svg",
  networkError: "/illustrations/network-error.svg",
  noData: "/illustrations/no-data.svg",
  firma: "/illustrations/firma-empty.svg",
  gorevler: "/illustrations/gorevler-empty.svg",
  personel: "/illustrations/personel-empty.svg",
  tedavi: "/illustrations/tedavi-empty.svg",
} as const;

export type SceneKey = keyof typeof SCENE_SRC;

export function createSceneIllustration(scene: SceneKey, width = 200) {
  const src = SCENE_SRC[scene];
  return function SceneIllustrationIcon({ className }: { className?: string }) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" width={width} draggable={false} className={className} />
    );
  };
}
