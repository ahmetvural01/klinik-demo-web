import { LogOut } from "lucide-react";
import type { IconAccent } from "@/components/ui/IconFrame";

/**
 * Klinik Modül Görsel Sistemi — hazır React ikon paketleri (Lucide → Tabler
 * → Phosphor → IconPark) tek tek denendi ve hepsi aynı sonuca vardı: ince
 * çizgi/iki-renk geometrik semboller, küçük "pastel kare" kutu içinde,
 * "standart yönetim paneli" hissi. Bunun yerine gerçek, profesyonel
 * tasarımcılar tarafından hazırlanmış, çok renkli/dolgun/illüstratif SVG
 * varlıklar kullanılıyor: Microsoft **Fluent Emoji** "Flat" stili (MIT
 * lisans, ticari kullanım serbest, attribution gerekmiyor — bkz.
 * https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE).
 * Dosyalar `public/icons/modules/*.svg` altında statik olarak barındırılıyor
 * (build sırasında indirilmiyor — repo'ya gerçek varlık olarak eklendi).
 *
 * Bu ikonlar kendi sabit renk paletini taşır (currentColor tabanlı değil) —
 * bu YÖNTEM: modül ayrımı artık yapay bir "accent tile" rengiyle değil,
 * ikonun kendi gerçek illüstrasyon renkleriyle sağlanıyor. Bu yüzden
 * `.ui-icon-frame` pastel kutu sarmalayıcısı KULLANILMIYOR — ikon menü
 * satırında doğrudan görünür, yalnızca hover/aktif durumda çok hafif bir
 * yüzey ipucu vardır (bkz. globals.css `.module-icon`).
 */
export type ModuleKey =
  | "home" | "calendar" | "users" | "clipboard" | "follow" | "sms"
  | "flask" | "finance" | "rapor" | "box" | "person" | "settings"
  | "logout" | "profile" | "support" | "log" | "firma" | "hakediş" | "chart"
  | "tedavi" | "institutions";

const MODULE_ICON_SRC: Partial<Record<ModuleKey, string>> = {
  home: "/icons/modules/home.svg",
  calendar: "/icons/modules/calendar.svg",
  users: "/icons/modules/users.svg",
  clipboard: "/icons/modules/clipboard.svg",
  follow: "/icons/modules/follow.svg",
  sms: "/icons/modules/sms.svg",
  flask: "/icons/modules/flask.svg",
  finance: "/icons/modules/finance.svg",
  rapor: "/icons/modules/rapor.svg",
  box: "/icons/modules/box.svg",
  person: "/icons/modules/person.svg",
  settings: "/icons/modules/settings.svg",
  profile: "/icons/modules/profile.svg",
  support: "/icons/modules/support.svg",
  log: "/icons/modules/log.svg",
  firma: "/icons/modules/firma.svg",
  hakediş: "/icons/modules/hakedis.svg",
  chart: "/icons/modules/chart.svg",
  tedavi: "/icons/modules/tedavi.svg",
  institutions: "/icons/modules/superadmin-institutions.svg",
};

const FRAME_SIZE = { sm: 24, md: 29, lg: 36 };

type ModuleIconProps = {
  module: ModuleKey;
  active?: boolean;
  size?: "sm" | "md" | "lg";
  /** Artık kullanılmıyor (ikonlar kendi sabit renklerini taşır) — yalnızca
   * eski çağrı yerleriyle tip uyumluluğu için tutuluyor. */
  accentOverride?: IconAccent;
  className?: string;
};

export function ModuleIcon({ module, active = false, size = "md", className = "" }: ModuleIconProps) {
  const px = FRAME_SIZE[size];

  if (module === "logout") {
    return (
      <span className={`module-icon ${className}`} data-active={active ? "true" : "false"} aria-hidden="true">
        <LogOut style={{ width: px * 0.62, height: px * 0.62 }} strokeWidth={2} />
      </span>
    );
  }

  const src = MODULE_ICON_SRC[module];
  return (
    <span className={`module-icon ${className}`} data-active={active ? "true" : "false"} aria-hidden="true">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={px} height={px} draggable={false} className="module-icon-img" />
      )}
    </span>
  );
}

/**
 * Aynı modül görselini (sidebar/topbar ile birebir aynı SVG dosyası)
 * `EmptyState`/`IconFrame`'in `icon` sözleşmesiyle (`{ className }` alan
 * bileşen) kullanmak için üretici — empty-state'ler daha büyük ve
 * illüstratif görünsün diye 56px'de render eder.
 */
export function createModuleEmptyIcon(module: ModuleKey) {
  const src = MODULE_ICON_SRC[module];
  return function ModuleEmptyIcon({ className }: { className?: string }) {
    if (!src) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" width={56} height={56} className={className} draggable={false} />
    );
  };
}
