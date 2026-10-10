"use client";

import { useId, type ComponentType, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui/Switch";

type IconComponent = ComponentType<{ className?: string }>;

/**
 * Kompakt ayar/otomasyon listesi. Her ayar TEK satırdır: ikon, ad, ne
 * yaptığının bir satırlık özeti, durum rozeti, eylem ve/veya açık-kapalı
 * anahtarı. Ayrıntı (metin, zamanlama, uzun seçenekler) satırdan açılan
 * pencerede düzenlenir. Önceden ayar ekranları her ayar için ayrı büyük
 * kart + açıklama paragrafı + metin önizlemesi gösteriyor, ekran gereksiz
 * uzuyordu (bkz. İletişim > Otomatik Mesajlar).
 *
 *   <SettingsList>
 *     <SettingsGroup label="Randevu">
 *       <SettingsRow icon={CalendarClock} title="Randevu hatırlatma"
 *         description="Randevudan 1 gün önce" status={<Badge>Özel metin</Badge>}
 *         actions={<Button size="sm" variant="ghost">Metin</Button>}
 *         toggle={{ checked, onChange, label: "Randevu hatırlatma gönderilsin" }} />
 *     </SettingsGroup>
 *   </SettingsList>
 */
export function SettingsList({ children, className = "", "aria-label": ariaLabel }: { children: ReactNode; className?: string; "aria-label"?: string }) {
  return (
    <div className={`ui-settings-list divide-y divide-slate-100 ${className}`} role="list" aria-label={ariaLabel}>
      {children}
    </div>
  );
}

/** Liste içinde küçük grup başlığı ("Randevu", "Ödeme"); satırları ayırır. */
export function SettingsGroup({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  // Grup listenin bir öğesidir ve kendi adlı alt listesini taşır: ekran okuyucu
  // "Randevu, liste, 3 öğe" duyar. Önceden başlık listenin içinde ama hiçbir
  // öğeye ait olmayan yetim metindi (role="presentation").
  const labelId = useId();
  return (
    <div role="listitem">
      <div className="flex items-center justify-between gap-2 bg-slate-50/70 px-4 py-1.5">
        <p id={labelId} className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
        {action}
      </div>
      <div role="list" aria-labelledby={labelId} className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

export type SettingsRowToggle = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Ekran okuyucu adı — eylemi anlatır ("Doğum günü mesajı otomatik gönderilsin"). */
  label: string;
  disabled?: boolean;
};

type SettingsRowProps = {
  icon?: IconComponent;
  title: ReactNode;
  /** Bir satırlık özet: NE ZAMAN / NASIL çalıştığı ("Vadeden 3 ve 7 gün önce · vade günü"). */
  description?: ReactNode;
  /** Ad yanında küçük rozet(ler) (Badge). */
  status?: ReactNode;
  /** Sağdaki eylem(ler) — genelde tek küçük düğme ("Metin", "Ayarla"). */
  actions?: ReactNode;
  toggle?: SettingsRowToggle;
  /**
   * Verilirse satırın tamamı tıklanabilir olur (ayrıntı penceresini açar) ve
   * sağda ok görünür. Satırdaki düğmeler/anahtar kendi işini yapar.
   */
  onOpen?: () => void;
  /** Satır pasif görünür (ör. kapalı kanal) — eylemler yine çalışabilir. */
  muted?: boolean;
  /**
   * Anahtarı olmayan satırda masaüstünde anahtar kadar boşluk bırakır: aynı
   * listedeki anahtarlı ve anahtarsız satırların düğmeleri aynı hizada durur.
   */
  reserveToggleSpace?: boolean;
  id?: string;
};

const INTERACTIVE = "button, a, input, select, textarea, label, [role='switch'], [role='button'], [role='menuitem']";

export function SettingsRow({ icon: Icon, title, description, status, actions, toggle, onOpen, muted = false, reserveToggleSpace = false, id }: SettingsRowProps) {
  const fromInteractive = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const hit = target.closest(INTERACTIVE);
    return Boolean(hit && hit !== event.currentTarget);
  };
  const clickable = Boolean(onOpen);
  // Yerleşim: masaüstünde [ikon | ad+özet | eylemler | anahtar] tek satır;
  // mobilde anahtar sağ üstte kalır, eylemler özetin altına iner (satır
  // gereksiz uzamaz, anahtar her zaman aynı yerde bulunur).
  return (
    <div
      id={id}
      role="listitem"
      className={`ui-settings-row group flex items-start gap-3 px-4 py-3 ${clickable ? "cursor-pointer hover:bg-slate-50/80" : ""} ${muted ? "opacity-70" : ""}`}
      onClick={clickable ? (event) => { if (!fromInteractive(event)) onOpen?.(); } : undefined}
    >
      {Icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/[0.07] text-primary" aria-hidden="true">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onOpen?.()}
                  className="!min-h-0 rounded-sm text-left text-sm font-semibold leading-5 text-slate-900 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {title}
                </button>
              ) : (
                <p className="text-sm font-semibold leading-5 text-slate-900">{title}</p>
              )}
              {status}
            </div>
            {description && <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>}
          </div>
          {actions && <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:mt-0 sm:shrink-0">{actions}</div>}
        </div>
        {toggle && (
          <div className="shrink-0 pt-0.5 sm:pt-0">
            <Switch
              checked={toggle.checked}
              onChange={toggle.onChange}
              disabled={toggle.disabled}
              label={toggle.label}
              aria-label={toggle.label}
              labelHidden
            />
          </div>
        )}
        {/* Anahtar genişliği (44px, Switch w-11); aradaki boşluk kapsayıcının gap'i. */}
        {!toggle && reserveToggleSpace && <span aria-hidden="true" className="hidden w-11 shrink-0 sm:block" />}
        {clickable && !actions && !toggle && <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-600 sm:mt-0" aria-hidden="true" />}
      </div>
    </div>
  );
}
