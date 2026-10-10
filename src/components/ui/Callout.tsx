import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export type CalloutTone = "info" | "success" | "warning" | "critical" | "neutral";

type IconComponent = ComponentType<{ className?: string }>;

const TONE_CLASS: Record<CalloutTone, string> = {
  info: "border-primary/20 bg-primary/[0.05] text-slate-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-red-200 bg-red-50 text-red-900",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
};

const ICON_CLASS: Record<CalloutTone, string> = {
  info: "text-primary",
  success: "text-emerald-600",
  warning: "text-amber-600",
  critical: "text-red-600",
  neutral: "text-slate-500",
};

const DEFAULT_ICON: Record<CalloutTone, IconComponent> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  critical: XCircle,
  neutral: Info,
};

type CalloutProps = {
  tone?: CalloutTone;
  /** Kısa, kalın ilk cümle (ör. "SMS gönderimi kapalı"). */
  title?: ReactNode;
  /** Açıklama — bir iki cümleyi geçmesin. */
  children?: ReactNode;
  /** Varsayılan ikon tona göre seçilir; `null` ikonsuz gösterir. */
  icon?: IconComponent | null;
  /** Sağda tek eylem (ör. küçük ikincil düğme: "Ayarlara git"). */
  action?: ReactNode;
  compact?: boolean;
  /**
   * Tek satırlık şerit (sadelik K7): eylem telefonda da metnin yanında, aynı
   * satırda kalır (varsayılan: telefonda metnin altına iner). Kısa başlık +
   * metin içi bağlantı gibi küçük eylemle kullanın.
   */
  inline?: boolean;
  /**
   * Ekran okuyucu davranışı: kullanıcı eylemine yanıt olarak beliren ACİL hata
   * için "alert"; kalıcı durum bilgisi için "status" (varsayılan); salt bilgi
   * notu için "note".
   */
  role?: "status" | "alert" | "note";
  className?: string;
  id?: string;
};

/**
 * Sayfa/form içi uyarı ve bilgi kutusu — TEK görünüm. Önceden her ekran
 * kendi `rounded-lg border border-red-200 bg-red-50 px-4 py-2.5` kutusunu
 * farklı boşluk, kalınlık ve ikonla yazıyordu; kullanıcı aynı önemdeki
 * uyarıyı her sayfada farklı görüyordu. Tonlar Badge ile aynı dildedir.
 * Kullanım: <Callout tone="warning" title="Kredi azaldı">Kredi bitince SMS gitmez.</Callout>
 */
export function Callout({ tone = "info", title, children, icon, action, compact = false, inline = false, role = "status", className = "", id }: CalloutProps) {
  const Icon = icon === null ? null : icon || DEFAULT_ICON[tone];
  const layout = inline ? "flex-row items-center justify-between" : "flex-col sm:flex-row sm:items-center sm:justify-between";
  return (
    <div
      id={id}
      role={role}
      className={`ui-callout flex gap-2 rounded-[var(--radius-surface)] border ${layout} ${compact ? "px-3 py-2 text-xs" : "px-3.5 py-2.5 text-sm"} ${TONE_CLASS[tone]} ${className}`}
    >
      <div className={`flex min-w-0 gap-2.5 ${inline ? "items-center" : "items-start"}`}>
        {Icon && <Icon className={`${inline ? "" : "mt-0.5"} shrink-0 ${compact ? "h-3.5 w-3.5" : "h-4 w-4"} ${ICON_CLASS[tone]}`} aria-hidden="true" />}
        <div className="min-w-0 leading-5">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>}
        </div>
      </div>
      {action && <div className={`flex shrink-0 items-center gap-2 ${inline ? "" : "pl-6 sm:pl-0"}`}>{action}</div>}
    </div>
  );
}
