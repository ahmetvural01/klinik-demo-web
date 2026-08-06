import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconFrame, type IconAccent } from "@/components/ui/IconFrame";
import { ModuleIcon, createModuleEmptyIcon, type ModuleKey } from "@/components/ui/ModuleIcon";

type IconComponent = ComponentType<{ className?: string }>;

const TONE_CLASS = {
  neutral: "border-slate-200 bg-white text-slate-700",
  info: "border-primary/20 bg-primary/5 text-primary",
  success: "border-emerald-200 bg-emerald-50/80 text-emerald-700",
  warning: "border-amber-200 bg-amber-50/80 text-amber-700",
  critical: "border-red-200 bg-red-50/80 text-red-700",
  purple: "border-violet-200 bg-violet-50/80 text-violet-700",
} as const;

const BADGE_TONE: Record<keyof typeof TONE_CLASS, BadgeTone> = {
  neutral: "neutral",
  info: "info",
  success: "success",
  warning: "warning",
  critical: "critical",
  purple: "info",
};

const ACCENT: Record<keyof typeof TONE_CLASS, IconAccent> = {
  neutral: "neutral",
  info: "teal",
  success: "emerald",
  warning: "amber",
  critical: "rose",
  purple: "violet",
};

export type PremiumTone = keyof typeof TONE_CLASS;

export function SectionHeader({
  icon,
  module,
  title,
  description,
  action,
}: {
  icon?: IconComponent;
  module?: ModuleKey;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        {module ? <ModuleIcon module={module} size="sm" /> : icon ? <IconFrame icon={icon} size="md" active /> : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-extrabold text-slate-900">{title}</h2>
          {description && <p className="truncate text-xs font-medium text-slate-500">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StatsCard({
  icon,
  module,
  label,
  value,
  description,
  tone = "neutral",
  href,
  badge,
}: {
  icon?: IconComponent;
  module?: ModuleKey;
  label: ReactNode;
  value: ReactNode;
  description?: ReactNode;
  tone?: PremiumTone;
  href?: string;
  badge?: ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-extrabold uppercase tracking-[0.13em] text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-black leading-none text-slate-900 tabular-nums">{value}</p>
        </div>
        {module ? <ModuleIcon module={module} size="md" /> : icon ? <IconFrame icon={icon} accent={ACCENT[tone]} size="md" active /> : null}
      </div>
      {(description || badge) && (
        <div className="mt-3 flex items-center justify-between gap-2">
          {description && <p className="min-w-0 truncate text-xs font-medium text-slate-500">{description}</p>}
          {badge && <Badge tone={BADGE_TONE[tone]}>{badge}</Badge>}
        </div>
      )}
    </>
  );

  const className = `ui-premium-card ui-pressable block rounded-lg border p-4 shadow-sm ${TONE_CLASS[tone]} ${href ? "cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2" : ""}`;
  return href ? <Link href={href} className={className}>{body}</Link> : <div className={className}>{body}</div>;
}

export function AlertCard({
  icon,
  module,
  title,
  description,
  tone = "info",
  href,
  badge,
  severity,
}: {
  icon?: IconComponent;
  module?: ModuleKey;
  title: ReactNode;
  description?: ReactNode;
  tone?: PremiumTone;
  href?: string;
  badge?: ReactNode;
  severity?: ReactNode;
}) {
  const content = (
    <>
      {module ? <ModuleIcon module={module} size="md" className="mt-0.5" /> : icon ? <IconFrame icon={icon} accent={ACCENT[tone]} size="md" active className="mt-0.5" /> : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-xs font-extrabold leading-5 text-slate-800">{title}</p>
          {badge && <Badge tone={BADGE_TONE[tone]} solid>{badge}</Badge>}
        </div>
        {description && <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-4 text-slate-600">{description}</p>}
        {severity && <Badge tone={BADGE_TONE[tone]} className="mt-2">{severity}</Badge>}
      </div>
      {href && <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />}
    </>
  );
  const className = `ui-premium-card ui-pressable group flex min-h-[72px] items-start gap-3 rounded-lg border p-3 shadow-sm ${TONE_CLASS[tone]}`;
  return href ? <Link href={href} className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2`}>{content}</Link> : <div className={className}>{content}</div>;
}

export function ActionList({
  title,
  description,
  children,
  count,
  module,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  count?: ReactNode;
  module?: ModuleKey;
}) {
  return (
    <div className="ui-surface overflow-hidden">
      <SectionHeader
        module={module}
        title={title}
        description={description}
        action={count !== undefined ? <Badge tone="neutral" solid>{count}</Badge> : undefined}
      />
      <div className="space-y-2.5 p-3">{children}</div>
    </div>
  );
}

export function EntityRow({
  icon,
  module,
  title,
  meta,
  description,
  tone = "neutral",
  href,
  badge,
  actions,
}: {
  icon?: IconComponent;
  module?: ModuleKey;
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  tone?: PremiumTone;
  href?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  const content = (
    <>
      {module ? <ModuleIcon module={module} size="sm" className="mt-0.5" /> : icon ? <IconFrame icon={icon} accent={ACCENT[tone]} size="sm" active className="mt-0.5" /> : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-sm font-extrabold text-slate-900">{title}</p>
          {badge && <Badge tone={BADGE_TONE[tone]}>{badge}</Badge>}
        </div>
        {meta && <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{meta}</p>}
        {description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{description}</p>}
      </div>
      {actions || (href ? <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" /> : null)}
    </>
  );
  const className = `ui-premium-row group flex items-start gap-3 rounded-lg border px-3 py-2.5 shadow-sm ${TONE_CLASS[tone]}`;
  return href ? <Link href={href} className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2`}>{content}</Link> : <div className={className}>{content}</div>;
}

export function ModuleEmptyState({
  module,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  module: ModuleKey;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  const Icon = createModuleEmptyIcon(module);
  const action = actionLabel
    ? actionHref
      ? <Button href={actionHref} size="sm">{actionLabel}</Button>
      : <Button onClick={onAction} size="sm">{actionLabel}</Button>
    : undefined;
  return <EmptyState icon={Icon} illustrative title={title} description={description} action={action} />;
}
