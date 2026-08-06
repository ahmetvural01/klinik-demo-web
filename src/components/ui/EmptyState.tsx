import { Inbox } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { IconFrame, type IconAccent } from "@/components/ui/IconFrame";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  /** İlgili modülün vurgu rengi — verilmezse nötr gri kalır (bkz. IconFrame).
   * `illustrative` true iken kullanılmaz (görsel kendi rengini taşır). */
  accent?: IconAccent;
  /** Modül görseli (Fluent Emoji, bkz. ModuleIcon.tsx) kendi zengin rengini
   * taşıyan bir illüstrasyondur — pastel `IconFrame` kutusuna sarmalanmadan,
   * büyük ve doğrudan gösterilir. Basit tek-renk (Lucide vb.) ikonlar için
   * bu prop verilmez, eski kutulu görünüm korunur. */
  illustrative?: boolean;
  action?: ReactNode;
  compact?: boolean;
};

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  accent,
  illustrative = false,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={`ui-empty-state flex flex-col items-center justify-center px-5 text-center ${compact ? "py-8" : "py-12"}`}>
      {illustrative ? (
        <Icon className="ui-empty-illustration mb-3" />
      ) : (
        <IconFrame icon={Icon} size="lg" accent={accent} className={accent ? "mb-3" : "mb-3 text-slate-400"} />
      )}
      <p className="text-sm font-extrabold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
