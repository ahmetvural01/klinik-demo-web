import type { ComponentType, ReactNode } from "react";

type SectionProps = {
  /** Bölüm başlığı (kısa: "Randevu mesajları", "Ödeme geçmişi"). */
  title?: ReactNode;
  /** Başlık altında TEK satır açıklama — gerekmedikçe verme. */
  description?: ReactNode;
  /** Başlığın solunda küçük çizgi ikon (lucide). */
  icon?: ComponentType<{ className?: string }>;
  /** Başlığın hemen yanında küçük rozet (Badge: kapsam, durum) — başlık metnine gömülmez. */
  badge?: ReactNode;
  /** Başlık satırının sağı: bölüme ait ikincil eylemler ("Tümünü gör", "Ekle"). */
  actions?: ReactNode;
  /** Bölümün altında ayrı şerit (ör. toplam satırı, "Daha fazla göster"). */
  footer?: ReactNode;
  children: ReactNode;
  /**
   * "md": iç boşluklu içerik (form, metin). "none": kenara dayalı içerik —
   * tablo, satır listesi (SettingsList, ListTable) — başlık altında çizgi olur.
   */
  padding?: "md" | "none";
  headingAs?: "h2" | "h3";
  id?: string;
  className?: string;
};

/**
 * Başlıklı içerik yüzeyi — sayfalardaki elle yazılmış
 * `rounded-2xl border bg-white p-5 shadow-sm` kartlarının yerine geçer.
 * Başlık ölçüsü uygulama genelinde aynıdır (text-sm, extrabold); kart
 * içinde büyük ikon kutusu, gradyan şerit veya ikinci açıklama paragrafı yok.
 */
export function Section({ title, description, icon: Icon, badge, actions, footer, children, padding = "md", headingAs = "h2", id, className = "" }: SectionProps) {
  const Heading = headingAs;
  const hasHeader = Boolean(title || actions);
  return (
    <section id={id} className={`ui-section ui-surface ${id ? "scroll-mt-4" : ""} ${className}`}>
      {hasHeader && (
        <div className={`flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-3.5 ${padding === "none" ? "border-b border-slate-100 pb-3" : "pb-1"}`}>
          <div className="min-w-0">
            {title && (
              <Heading className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                <span className="min-w-0">{title}</span>
                {badge && <span className="inline-flex shrink-0 items-center text-xs font-semibold">{badge}</span>}
              </Heading>
            )}
            {description && <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>}
          </div>
          {/* sm:-my-2: 36px düğme 20px başlık satırına taşmadan oturur; yan yana duran eylemli ve eylemsiz bölümlerin içeriği aynı hizadan başlar. */}
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:-my-2">{actions}</div>}
        </div>
      )}
      <div className={padding === "none" ? "" : hasHeader ? "px-4 pb-4 pt-2" : "p-4"}>{children}</div>
      {footer && <div className="border-t border-slate-100 px-4 py-2.5">{footer}</div>}
    </section>
  );
}
