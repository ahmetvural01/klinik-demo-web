import { Inbox } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { IconFrame } from "@/components/ui/IconFrame";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  action?: ReactNode;
  compact?: boolean;
};

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-5 text-center ${compact ? "py-8" : "py-12"}`}>
      <IconFrame icon={Icon} size="lg" className="mb-3 text-slate-400" />
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
