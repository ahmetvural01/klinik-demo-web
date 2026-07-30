import type { ComponentType } from "react";

type IconFrameProps = {
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  size?: "sm" | "md" | "lg";
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
  className = "",
}: IconFrameProps) {
  return (
    <span
      className={`ui-icon-frame ${FRAME_SIZE[size]} ${className}`}
      data-active={active ? "true" : "false"}
      aria-hidden="true"
    >
      <Icon className={ICON_SIZE[size]} />
    </span>
  );
}
