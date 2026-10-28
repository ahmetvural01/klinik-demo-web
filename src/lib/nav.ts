import type { ModuleKey } from "@/components/ui/ModuleIcon";

// Panelin bilgi mimarisinin TEK kaynağı: menü öğeleri (ad, adres, ikon,
// bölüm, rozet), sayfa adları (menü adı = h1 = tarayıcı sekmesi) ve hangi
// adresin hangi izinle açıldığı. Önceden bu bilgi altı ayrı dosyada elle
// tutuluyordu; menüde "Hasta Takip", izin ekranında "Hasta Takip Paneli",
// sekmede başka bir ad görünüyordu (bkz. denetim yerlesim-ia §2.6).
// Sol menü, üst bar, sayfa koruması (PanelRouteGuard) ve /yetkisiz buradan okur.

export type NavSectionKey = "gunluk" | "finans" | "stok" | "yonetim";

/** Menü rozetinin hangi sayıdan beslendiği (bkz. /api/panel-summary). */
export type NavBadgeKey = "onlineRequests" | "tasksDue" | "labAtLab" | "stockCritical" | "installmentsOverdue";

export type NavAccess = {
  can: (permission: string) => boolean;
  hasFeature: (feature: "whatsapp") => boolean;
};

export type NavItem = {
  key: string;
  href: string;
  /** Menü adı = sayfa başlığı = tarayıcı sekmesi (sözleşme §3). */
  label: string;
  icon: ModuleKey;
  section: NavSectionKey;
  /**
   * Menüde görünür mü: kullanıcı orada gerçekten bir iş yapabiliyorsa. İzin
   * kuralını DEĞİŞTİRMEZ — sayfanın kendisi ROUTE_REQUIREMENTS ile korunur;
   * burada yalnız "işe yaramayan öğe menüde durmasın" kararı verilir.
   */
  visible: (access: NavAccess) => boolean;
  badge?: NavBadgeKey;
  /** Bu öğeyi seçili gösteren detay sayfaları ve eski adresler. */
  activeFor?: readonly string[];
};

export const NAV_SECTION_LABELS: Record<NavSectionKey, string | null> = {
  gunluk: null,
  finans: "Finans",
  stok: "Stok",
  yonetim: "Yönetim",
};

/** Geniş ekranda menünün daraltılmış tercihi (layout sunucuda okur; açılışta zıplama olmasın). */
export const MENU_COLLAPSED_COOKIE = "klinik_menu_dar";

/** Bu sayıda ya da daha az öğe varsa menü bölüm başlığı olmadan düz liste çizilir. */
export const NAV_FLAT_LIMIT = 9;

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "anasayfa", href: "/anasayfa", label: "Ana sayfa", icon: "home", section: "gunluk", visible: (a) => a.can("dashboard:read"), activeFor: ["/dashboard"] },
  { key: "randevu", href: "/randevu", label: "Randevular", icon: "calendar", section: "gunluk", visible: (a) => a.can("appointments:read"), badge: "onlineRequests" },
  { key: "hasta", href: "/hasta", label: "Hastalar", icon: "users", section: "gunluk", visible: (a) => a.can("patients:read"), activeFor: ["/hasta-detay", "/recete", "/muayene"] },
  {
    key: "yapilacaklar",
    href: "/yapilacaklar",
    label: "Aramalar ve görevler",
    icon: "clipboard",
    section: "gunluk",
    visible: (a) => a.can("hastatracking:read") || a.can("clinictasks:read"),
    badge: "tasksDue",
    activeFor: ["/gorevler", "/hasta-takip"],
  },
  { key: "lab", href: "/lab", label: "Laboratuvar", icon: "flask", section: "gunluk", visible: (a) => a.can("lab:read"), badge: "labAtLab" },
  {
    key: "iletisim",
    href: "/sms",
    label: "İletişim",
    icon: "sms",
    section: "gunluk",
    // Yalnız whatsapp:read olan rol (varsayılan matriste doktor, muhasebe)
    // burada yalnız salt okunur otomatik mesaj listesini görüyordu.
    visible: (a) => a.can("sms:read") || a.can("sms:write") || a.can("sms:bulk") || (a.hasFeature("whatsapp") && a.can("whatsapp:write")),
  },
  { key: "muhasebe", href: "/muhasebe", label: "Muhasebe", icon: "finance", section: "finans", visible: (a) => a.can("finance:center"), badge: "installmentsOverdue", activeFor: ["/kasa", "/gider", "/taksit"] },
  // Muhasebe'ye erişen kişi hakedişi Muhasebe > Hakediş'te görür; ayrı öğe
  // yalnız kendi hakedişini gören (muhasebe yetkisi olmayan) doktor içindir.
  { key: "hakedis", href: "/finans", label: "Hakedişim", icon: "hakediş", section: "finans", visible: (a) => a.can("earnings:read") && !a.can("finance:center") },
  { key: "rapor", href: "/rapor", label: "Raporlar", icon: "rapor", section: "finans", visible: (a) => a.can("reports:read") },
  // Fiyat listesi normalde Ayarlar içindedir; ayar yetkisi olmayan ama fiyatla
  // çalışan rol (ör. muhasebe) menüden ulaşır. İkon Muhasebe'den ayrı.
  { key: "fiyat", href: "/fiyat", label: "Fiyat listesi", icon: "tedavi", section: "finans", visible: (a) => a.can("prices:read") && !a.can("settings:read") },
  { key: "stok", href: "/stok", label: "Stok", icon: "box", section: "stok", visible: (a) => a.can("stock:read"), badge: "stockCritical" },
  { key: "firma", href: "/firma", label: "Satın alma", icon: "firma", section: "stok", visible: (a) => a.can("finance:read"), activeFor: ["/firma-detay"] },
  // staff:read yalnız hekim/personel seçicileri içindir; salt okunur liste menüde
  // durmaz. /personel adresi staff:read ile açık kalır (ROUTE_REQUIREMENTS).
  {
    key: "personel",
    href: "/personel",
    label: "Personel",
    icon: "person",
    section: "yonetim",
    visible: (a) => a.can("staff:write") || a.can("staff:delete") || a.can("branches:assign"),
    activeFor: ["/personel-ekle"],
  },
  { key: "ayar", href: "/ayar", label: "Ayarlar", icon: "settings", section: "yonetim", visible: (a) => a.can("settings:read") },
  { key: "log", href: "/log", label: "İşlem kayıtları", icon: "log", section: "yonetim", visible: (a) => a.can("audit:read"), activeFor: ["/sistem-izleme"] },
];

/**
 * Sayfa koruması: adres → gereken izinlerden biri. Kural değişikliği DEĞİL —
 * izinler Süperadmin > Rol Yetkileri'nden yönetilir; bu tablo yalnız hangi
 * ekranın hangi izinle açıldığını söyler. Eski adresler (/gorevler,
 * /hasta-takip, /sistem-izleme, /personel-ekle) yönlendirme sayfası olarak
 * çalışmaya devam ettiği için eski kurallarıyla durur.
 */
export const ROUTE_REQUIREMENTS: ReadonlyArray<{ prefix: string; anyOf: readonly string[] }> = [
  { prefix: "/hasta-detay", anyOf: ["patients:read"] },
  { prefix: "/personel-ekle", anyOf: ["staff:write"] },
  { prefix: "/firma-detay", anyOf: ["finance:read"] },
  { prefix: "/anasayfa", anyOf: ["dashboard:read"] },
  { prefix: "/dashboard", anyOf: ["dashboard:read"] },
  { prefix: "/randevu", anyOf: ["appointments:read"] },
  { prefix: "/yapilacaklar", anyOf: ["hastatracking:read", "clinictasks:read"] },
  { prefix: "/hasta-takip", anyOf: ["hastatracking:read"] },
  { prefix: "/gorevler", anyOf: ["clinictasks:read"] },
  { prefix: "/hasta", anyOf: ["patients:read"] },
  { prefix: "/muayene", anyOf: ["examinations:read"] },
  { prefix: "/recete", anyOf: ["prescriptions:read"] },
  { prefix: "/lab", anyOf: ["lab:read"] },
  { prefix: "/muhasebe", anyOf: ["finance:center"] },
  { prefix: "/kasa", anyOf: ["payments:read"] },
  { prefix: "/taksit", anyOf: ["installments:read"] },
  { prefix: "/gider", anyOf: ["finance:read"] },
  { prefix: "/finans", anyOf: ["earnings:read"] },
  { prefix: "/rapor", anyOf: ["reports:read"] },
  { prefix: "/fiyat", anyOf: ["prices:read"] },
  { prefix: "/stok", anyOf: ["stock:read"] },
  { prefix: "/firma", anyOf: ["finance:read"] },
  { prefix: "/personel", anyOf: ["staff:read"] },
  { prefix: "/sms", anyOf: ["sms:read", "whatsapp:read"] },
  { prefix: "/sistem-izleme", anyOf: ["audit:read"] },
  { prefix: "/log", anyOf: ["audit:read"] },
  { prefix: "/ayar", anyOf: ["settings:read"] },
  { prefix: "/profil", anyOf: ["profile:read"] },
  { prefix: "/destek", anyOf: ["support:read"] },
];

export function findRouteRequirement(pathname: string) {
  if (pathname === "/yetkisiz" || pathname === "/") return null;
  return ROUTE_REQUIREMENTS.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)) || null;
}

/** Menüde olmayan ekranların adları (detay, hesap ve eski adresler). */
const EXTRA_TITLES: Record<string, string> = {
  "/dashboard": "Ana sayfa",
  "/hasta-detay": "Hasta dosyası",
  "/gorevler": "Ekip görevleri",
  "/hasta-takip": "Hasta aramaları",
  "/firma-detay": "Tedarikçi",
  "/personel-ekle": "Yeni personel",
  "/sistem-izleme": "İşlem kayıtları",
  "/recete": "Reçete",
  "/muayene": "Muayene",
  "/profil": "Profilim",
  "/destek": "Destek",
  "/yetkisiz": "Erişim yok",
};

export const ROUTE_TITLES: Record<string, string> = {
  ...Object.fromEntries(NAV_ITEMS.map((item) => [item.href, item.label])),
  ...EXTRA_TITLES,
};

export type NavGroup = { key: NavSectionKey; label: string | null; items: NavItem[] };

function routeAllowed(href: string, access: NavAccess) {
  const requirement = findRouteRequirement(href.split("?")[0]);
  return !requirement || requirement.anyOf.some((permission) => access.can(permission));
}

/**
 * Kullanıcının menüsü. Dokuz ve daha az öğede bölüm başlığı yok (düz liste);
 * daha uzun menüde tek öğeli bölüm başlıksız kalır. Hasta kaydına erişimi
 * olmayan, ana işi muhasebe olan kullanıcıda Finans bloğu Ana sayfa'nın hemen
 * altına gelir (denetim §4.3: ana iş menünün ortasında kalıyordu).
 */
export function buildNavGroups(access: NavAccess): NavGroup[] {
  const visible = NAV_ITEMS.filter((item) => routeAllowed(item.href, access) && item.visible(access));
  if (visible.length <= NAV_FLAT_LIMIT) {
    const financeFirst = !access.can("patients:read") && access.can("finance:center");
    const items = financeFirst
      ? [
          ...visible.filter((item) => item.key === "anasayfa"),
          ...visible.filter((item) => item.section === "finans"),
          ...visible.filter((item) => item.key !== "anasayfa" && item.section !== "finans"),
        ]
      : visible;
    return items.length > 0 ? [{ key: "gunluk", label: null, items }] : [];
  }
  const order: NavSectionKey[] = ["gunluk", "finans", "stok", "yonetim"];
  return order
    .map((key) => {
      const items = visible.filter((item) => item.section === key);
      return { key, label: items.length > 1 ? NAV_SECTION_LABELS[key] : null, items };
    })
    .filter((group) => group.items.length > 0);
}

/** Adres bu menü öğesine mi ait (detay sayfaları ve eski adresler dahil)? */
export function isNavItemActive(item: NavItem, pathname: string) {
  const matches = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (matches(item.href)) return true;
  return Boolean(item.activeFor?.some(matches));
}
