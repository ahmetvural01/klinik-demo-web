import type { ReactNode } from "react";

type TooltipProps = {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "right";
  className?: string;
};

const POSITION = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
};

export function Tooltip({ label, children, side = "top", className = "" }: TooltipProps) {
  return (
    <span className={`ui-tooltip-trigger relative inline-flex ${className}`}>
      {children}
      <span role="tooltip" className={`ui-tooltip ${POSITION[side]}`}>
        {label}
      </span>
    </span>
  );
}
