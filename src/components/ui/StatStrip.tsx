"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type StatTone = "neutral" | "info" | "success" | "warning" | "critical";

export type StatItem = {
  key: string;
  label: string;
  value: ReactNode;
  /** Değerin altında kısa not ("3 tanesi gecikmiş"). */
  hint?: ReactNode;
  tone?: StatTone;
  /** Tıklanınca gidilecek yer ya da uygulanacak filtre. */
  href?: string;
  onClick?: () => void;
  /** Filtre olarak kullanılıyorsa seçili durumu. */
  active?: boolean;
};

const VALUE_TONE: Record<StatTone, string> = {
  neutral: "text-slate-900",
  info: "text-primary",
  success: "text-emerald-700",
  warning: "text-amber-700",
  critical: "text-red-700",
};

const COLUMNS: Record<2 | 3 | 4 | 5, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
};

// Telefonda iki sütun: tek sayıda hücrede son hücre tam genişlik olur (3 hücre
// 2+1 dizilip sağda boşluk bırakıyordu; taksit ve plan özetinde denge bozuluyordu).
const ODD_LAST_FULL = "max-sm:[&>*:last-child:nth-child(odd)]:col-span-2";

/**
 * Özet sayaç şeridi — sözleşme §1: yalnız kullanıcının karar vermesini
 * sağlayan ve listede zaten görünmeyen sayılar için. Her sayfa kendi
 * renkli/gradyanlı KPI kartını yazmak yerine bunu kullanır. Tıklanabilir
 * sayaç (filtre/bağlantı) `href` ya da `onClick` alır; `active` seçili
 * filtreyi gösterir.
 *
 * Görünüm (sadelik K6): ayrı ayrı kutular değil, TEK çerçeve içinde ince
 * ayırıcılı şerit; telefonda aynı çerçeve içinde 2'li ızgara. Ayırıcılar
 * globals.css `.ui-stat-strip-item` gölgesidir (sarma ve boş hücrede de doğru).
 */
export function StatStrip({ items, columns, loading = false, className = "", "aria-label": ariaLabel }: {
  items: StatItem[];
  columns?: 2 | 3 | 4 | 5;
  /** Değerler henüz bilinmiyorsa iskelet gösterilir — bilinmeyen değer asla "0"/"₺0" görünmez. */
  loading?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const count = columns || (Math.min(Math.max(items.length, 2), 5) as 2 | 3 | 4 | 5);
  return (
    <div className={`ui-stat-strip ui-surface grid overflow-hidden ${COLUMNS[count]} ${ODD_LAST_FULL} ${className}`} aria-label={ariaLabel} aria-busy={loading || undefined} role={ariaLabel ? "group" : undefined}>
      {items.map((item) => {
        const tone = item.tone || "neutral";
        const body = (
          <>
            <span className="block truncate text-xs font-semibold text-slate-500">{item.label}</span>
            {loading ? (
              <span className="ui-skeleton-shimmer mt-1.5 block h-6 w-16 rounded bg-slate-100" aria-hidden="true" />
            ) : (
              <span className={`mt-0.5 block text-lg font-bold tabular-nums leading-tight ${VALUE_TONE[tone]}`}>{item.value}</span>
            )}
            {/* Yüklenirken ipucu da iskelettir: değer bilinmezken "0 fatura" gibi bir not görünmesin. */}
            {item.hint && (loading
              ? <span className="ui-skeleton-shimmer mt-1.5 block h-3 w-20 max-w-full rounded bg-slate-100" aria-hidden="true" />
              : <span className="mt-0.5 block truncate text-xs font-normal text-slate-500">{item.hint}</span>)}
          </>
        );
        const base = "ui-stat-strip-item min-w-0 px-4 py-3 text-left";
        // Odak halkası içe çizilir: komşu hücrenin ayırıcısını ve çerçeveyi örtmez, kırpılmaz.
        const interactive = "transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary";
        const active = item.active ? "true" : undefined;
        if (item.href) {
          return <Link key={item.key} href={item.href} data-active={active} className={`${base} ${interactive} block`}>{body}</Link>;
        }
        if (item.onClick) {
          // <button> içeriğini dikeyde ortalar; flex-col + justify-start ile etiket
          // div/a hücreleriyle aynı hizada başlar (hint'li hücre yanında kaymaz).
          return (
            <button key={item.key} type="button" onClick={item.onClick} aria-pressed={item.active ?? undefined} data-active={active} className={`${base} ${interactive} flex flex-col justify-start`}>
              {body}
            </button>
          );
        }
        return <div key={item.key} data-active={active} className={`${base} block`}>{body}</div>;
      })}
    </div>
  );
}
