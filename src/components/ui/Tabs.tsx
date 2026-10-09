"use client";

import { useCallback, useEffect, useId, useMemo, useRef, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type TabItem<K extends string = string> = {
  key: K;
  label: string;
  /** Sekme adının yanında küçük sayaç (ör. geciken iş sayısı). 0/undefined gösterilmez. */
  count?: number;
  /** Sayacın rengi: "critical" geciken/acil işler için, "neutral" bilgi amaçlı. */
  countTone?: "neutral" | "critical" | "warning";
  disabled?: boolean;
};

type TabsProps<K extends string> = {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Ekran okuyucu için sekme grubunun adı (ör. "Hasta dosyası bölümleri"). */
  ariaLabel: string;
  className?: string;
  /** "sm": modal/kart içi alt sekmeler için daha küçük ölçü. */
  size?: "sm" | "md";
  /** Sekme panellerinin id öneki — verilirse aria-controls bağlanır. */
  panelIdPrefix?: string;
};

const COUNT_TONE: Record<NonNullable<TabItem["countTone"]>, string> = {
  neutral: "bg-slate-200 text-slate-700",
  critical: "bg-red-600 text-white",
  warning: "bg-amber-500 text-white",
};

/**
 * Uygulama genelinde TEK sekme çubuğu. Önceden her sayfa (Muhasebe, Ayarlar,
 * İletişim, Raporlar, Hasta dosyası...) sekmelerini farklı renk/şekil/boyutla
 * elle yazıyordu; kullanıcı her ekranda "bu bir sekme mi, düğme mi" diye
 * yeniden öğrenmek zorunda kalıyordu. Görünüm: gri zemin üzerinde seçili
 * sekme beyaz ve marka renginde. Sol/sağ ok, Home/End tuşlarıyla gezilir.
 */
export function Tabs<K extends string>({ items, value, onChange, ariaLabel, className = "", size = "md", panelIdPrefix }: TabsProps<K>) {
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const enabled = useMemo(() => items.filter((item) => !item.disabled), [items]);

  // Dar ekranda sekme çubuğu yatay kayar; seçili sekme her zaman görünür
  // alanda kalsın ki kullanıcı hangi bölümde olduğunu görsün.
  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !selected || list.scrollWidth <= list.clientWidth) return;
    const target = selected.offsetLeft - (list.clientWidth - selected.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [value]);

  const focusTab = (key: K) => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-key="${CSS.escape(key)}"]`);
    el?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = enabled.findIndex((item) => item.key === value);
    let next: TabItem<K> | undefined;
    if (event.key === "ArrowRight") next = enabled[(index + 1) % enabled.length];
    else if (event.key === "ArrowLeft") next = enabled[(index - 1 + enabled.length) % enabled.length];
    else if (event.key === "Home") next = enabled[0];
    else if (event.key === "End") next = enabled[enabled.length - 1];
    if (!next) return;
    event.preventDefault();
    onChange(next.key);
    focusTab(next.key);
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`ui-tabs ${size === "sm" ? "ui-tabs-sm" : ""} ${className}`}
    >
      {items.map((item) => {
        const selected = item.key === value;
        return (
          <button
            key={item.key}
            id={`${baseId}-${item.key}`}
            data-tab-key={item.key}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelIdPrefix ? `${panelIdPrefix}-${item.key}` : undefined}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.key)}
            className="ui-tab"
          >
            <span className="truncate">{item.label}</span>
            {item.count ? (
              <span className={`ui-tab-count ${COUNT_TONE[item.countTone || "neutral"]}`}>
                {item.count > 99 ? "99+" : item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Seçili sekmeyi adres çubuğunda (?tab=...) tutar: sayfa yenilense, bağlantı
 * paylaşılsa ya da geri tuşuna basılsa da kullanıcı aynı sekmeye döner.
 * Geçersiz/izinsiz bir değer gelirse `fallback` kullanılır.
 */
export function useTabParam<K extends string>(allowed: readonly K[], fallback: K, param = "tab"): [K, (key: K) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get(param);
  const current = raw && (allowed as readonly string[]).includes(raw) ? (raw as K) : fallback;

  const setTab = useCallback((key: K) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(param, key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [param, pathname, router, searchParams]);

  return [current, setTab];
}
