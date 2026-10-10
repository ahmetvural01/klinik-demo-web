"use client";

import { useCallback, useEffect, useId, useMemo, useRef, type KeyboardEvent } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CountBadge, type CountBadgeTone } from "@/components/ui/CountBadge";

export type TabItem<K extends string = string> = {
  key: K;
  label: string;
  /**
   * Telefonda (<640px) görünen kısa ad ("Gönderim geçmişi" → "Geçmiş"). CSS ile
   * seçilir: ilk karede uzun ad görünüp sonra kısalmaz. Ekran okuyucu her
   * genişlikte tam adı (`label`) duyar.
   */
  shortLabel?: string;
  /**
   * Sekme adının yanında işaret: "unsaved" = sekmede kaydedilmemiş değişiklik
   * var (küçük nokta; ekran okuyucu "kaydedilmemiş değişiklik" duyar).
   */
  marker?: "unsaved";
  /** Sekme adının yanında küçük sayaç (ör. geciken iş sayısı). 0/undefined gösterilmez. */
  count?: number;
  /** Sayacın rengi: "critical" geciken/acil işler için, "neutral" bilgi amaçlı (bkz. CountBadge). */
  countTone?: CountBadgeTone;
  /** Sayacın neyi saydığı ("gecikmiş takip") — ekran okuyucu "3 gecikmiş takip" duyar. */
  countLabel?: string;
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
  // Tek Tab durağı seçili sekmedir; değer listede yoksa ya da pasifse ilk
  // etkin sekme durak olur — yoksa sekme çubuğuna klavyeyle hiç ulaşılamıyordu.
  const tabStop = enabled.some((item) => item.key === value) ? value : enabled[0]?.key;

  // Dar ekranda sekme çubuğu yatay kayar; seçili sekme her zaman görünür
  // alanda kalsın ki kullanıcı hangi bölümde olduğunu görsün.
  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !selected || list.scrollWidth <= list.clientWidth) return;
    const target = selected.offsetLeft - (list.clientWidth - selected.offsetWidth) / 2;
    // Hareket azaltma tercihine uy (CSS scroll-behavior JS'teki smooth'u durdurmaz).
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ left: Math.max(0, target), behavior: reduceMotion ? "auto" : "smooth" });
  }, [value]);

  const focusTab = (key: K) => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-key="${CSS.escape(key)}"]`);
    el?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = enabled.findIndex((item) => item.key === value);
    let next: TabItem<K> | undefined;
    if (event.key === "ArrowRight") next = enabled[(index + 1) % enabled.length];
    else if (event.key === "ArrowLeft") next = enabled[index === -1 ? enabled.length - 1 : (index - 1 + enabled.length) % enabled.length];
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
            tabIndex={item.key === tabStop ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.key)}
            // ui-touch-target: sm sekme görünüşte 32px; dokunmatikte dokunma alanı 36px'e genişler.
            className="ui-tab ui-touch-target"
          >
            {item.shortLabel ? (
              <>
                <span className="truncate sm:hidden" aria-hidden="true">{item.shortLabel}</span>
                <span className="truncate max-sm:sr-only">{item.label}</span>
              </>
            ) : (
              <span className="truncate">{item.label}</span>
            )}
            {item.marker === "unsaved" && (
              <>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                <span className="sr-only">(kaydedilmemiş değişiklik)</span>
              </>
            )}
            {/* Sekme sayacı ortak CountBadge'dir; `ui-tab-count` eski CSS kancası olarak kalır. */}
            <CountBadge count={item.count} tone={item.countTone || "neutral"} label={item.countLabel} className="ui-tab-count" />
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get(param);
  const current = raw && (allowed as readonly string[]).includes(raw) ? (raw as K) : fallback;

  const setTab = useCallback((key: K) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(param, key);
    // router.replace her sekme tıklamasında sunucuya bir tur atıyor, sekme
    // ancak yanıt gelince değişiyordu (canlıda ~200 ms+). Yerel geçmiş API'si
    // Next (14.1+) tarafından useSearchParams ile eşitlenir: sekme anında
    // değişir, adres çubuğu/geri tuşu davranışı aynı kalır.
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }, [param, pathname, searchParams]);

  return [current, setTab];
}
