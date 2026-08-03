import type { ComponentType } from "react";

/**
 * Modül vurgu renkleri KASITLI OLARAK Tailwind'in indigo/violet/cyan/teal
 * gibi renk adlarını KULLANMAZ — bkz. tailwind.config.ts: bu isimler kurum
 * temasına (primary/accent) bağlanmış durumda, farklı kiracılarda hepsi aynı
 * 1-2 renge indirgenir. Modül ayrımı görsel bir bilgi mimarisi aracıdır,
 * marka rengi değildir — bu yüzden burada SABİT, temadan bağımsız RGB
 * değerleri kullanılır (bkz. globals.css `.ui-icon-frame[data-accent=...]`).
 */
export type IconAccent =
  | "indigo" | "cyan" | "violet" | "purple" | "fuchsia"
  | "emerald" | "amber" | "orange" | "blueviolet" | "teal" | "rose" | "neutral";

type IconFrameProps = {
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  size?: "sm" | "md" | "lg";
  accent?: IconAccent;
  className?: string;
};

const FRAME_SIZE = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
  lg: "h-10 w-10",
};

const ICON_SIZE = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-[18px] w-[18px]",
};

export function IconFrame({
  icon: Icon,
  active = false,
  size = "md",
  accent,
  className = "",
}: IconFrameProps) {
  return (
    <span
      className={`ui-icon-frame ${FRAME_SIZE[size]} ${className}`}
      data-active={active ? "true" : "false"}
      data-accent={accent && accent !== "neutral" ? accent : undefined}
      aria-hidden="true"
    >
      <Icon className={ICON_SIZE[size]} />
    </span>
  );
}
