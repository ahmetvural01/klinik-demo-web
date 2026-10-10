"use client";

import Image from "next/image";
import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

export type ToothStatus =
  | "saglikli"
  | "cukur"
  | "dolgu"
  | "cekilen"
  | "kaplik"
  | "kanal"
  | "eksik";

export const TOOTH_STATUS_LABELS: Record<ToothStatus, string> = {
  saglikli: "Sağlıklı",
  cukur: "Çürük",
  dolgu: "Dolgu",
  cekilen: "Çekilen",
  kaplik: "Kaplama",
  kanal: "Kanal",
  eksik: "Eksik",
};

const STATUS_STYLE: Record<ToothStatus, { ring: string; dot: string; overlay: string }> = {
  saglikli: { ring: "border-transparent", dot: "bg-slate-300", overlay: "" },
  cukur: { ring: "border-red-500 bg-red-50/50", dot: "bg-red-600", overlay: "bg-red-100/60" },
  dolgu: { ring: "border-blue-500 bg-blue-50/50", dot: "bg-blue-600", overlay: "bg-blue-100/60" },
  cekilen: { ring: "border-gray-500 bg-gray-100/70", dot: "bg-gray-600", overlay: "bg-gray-200/70" },
  kaplik: { ring: "border-amber-500 bg-amber-50/60", dot: "bg-amber-600", overlay: "bg-amber-100/70" },
  kanal: { ring: "border-fuchsia-500 bg-fuchsia-50/60", dot: "bg-fuchsia-600", overlay: "bg-fuchsia-100/60" },
  eksik: { ring: "border-slate-400 bg-slate-100/80", dot: "bg-slate-500", overlay: "bg-white/60" },
};

/**
 * Dişin hasta dosyasındaki kaydı: yapılacak tedavisi (muayene listesi) ya da
 * yapılmış tedavisi var. Şemada küçük bir işaret olarak görünür; hekim hangi
 * dişte iş olduğunu listeyi okumadan görür.
 */
export type ToothMarker = "pending" | "done";

const MARKER_STYLE: Record<ToothMarker, { dot: string; label: string }> = {
  pending: { dot: "bg-amber-500", label: "Yapılacak tedavi var" },
  done: { dot: "bg-emerald-600", label: "Tedavi yapıldı" },
};

type Dentition = "adult" | "child";

type OdontogramSelectorProps = {
  selected?: string[];
  onToggle?: (num: string) => void;
  toothMap?: Record<string, ToothStatus>;
  /** Diş başına tedavi işareti (yapılacak / yapıldı). */
  markers?: Record<string, ToothMarker>;
  dentition?: Dentition;
  editable?: boolean;
  /** Şemanın altında işaret ve seçim açıklaması. */
  showLegend?: boolean;
  /** Açıklama satırının sağında ek kontrol (ör. "Süt dişleri" anahtarı). */
  legendExtra?: ReactNode;
  /**
   * true (varsayılan): şema TEK ince çerçeve içinde (pencere/form içinde tek
   * başına durduğunda). false: çerçevesiz — şema zaten bir kartın içindeyse
   * (hasta dosyası › Tedavi ekle) kart içinde kart olmasın.
   */
  frame?: boolean;
  heightClassName?: string;
  className?: string;
};

const ADULT_UPPER = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const ADULT_LOWER = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
const CHILD_UPPER = ["55", "54", "53", "52", "51", "61", "62", "63", "64", "65"];
const CHILD_LOWER = ["85", "84", "83", "82", "81", "71", "72", "73", "74", "75"];

function assetPath(num: string) {
  return `/tooth-assets/${num}.png`;
}

function isSelected(num: string, selected: string[], toothMap: Record<string, ToothStatus>) {
  return selected.includes(num) || Boolean(toothMap[num] && toothMap[num] !== "saglikli");
}

function ToothAssetButton({
  num,
  selected,
  status,
  marker,
  editable,
  numberPosition,
  tabStop,
  onClick,
  onFocus,
}: {
  num: string;
  selected: boolean;
  status: ToothStatus;
  marker?: ToothMarker;
  editable: boolean;
  numberPosition: "top" | "bottom";
  /** Şemanın tek Tab durağı bu diş mi (gezici odak). */
  tabStop: boolean;
  onClick: () => void;
  onFocus: () => void;
}) {
  const style = STATUS_STYLE[status] || STATUS_STYLE.saglikli;
  // Seçili diş tema renginde çerçevelenir; durum rengi (çürük, dolgu...) varsa o kullanılır.
  const activeClass = selected
    ? status === "saglikli" ? "border-primary bg-primary/[0.06]" : style.ring
    : "border-transparent hover:border-slate-200 hover:bg-slate-50/80";
  const number = (
    <span className={`text-sm leading-none ${selected ? "font-black text-slate-950" : "font-semibold text-slate-500 group-hover:text-slate-900"}`}>
      {num}
    </span>
  );
  const description = [
    status !== "saglikli" ? TOOTH_STATUS_LABELS[status] : "",
    marker ? MARKER_STYLE[marker].label : "",
  ].filter(Boolean).join(", ");

  return (
    <button
      type="button"
      data-tooth={num}
      tabIndex={tabStop ? 0 : -1}
      onClick={onClick}
      onFocus={onFocus}
      disabled={!editable}
      aria-pressed={editable ? selected : undefined}
      aria-label={`Diş ${num}${description ? ` (${description})` : ""}`}
      title={`Diş ${num}${description ? ` — ${description}` : ""}`}
      className={`group relative flex min-w-0 flex-col items-center justify-center rounded-md border px-0.5 py-1 transition !min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-default ${activeClass}`}
    >
      {numberPosition === "top" && <span className="mb-1">{number}</span>}
      <span className="relative flex aspect-[7/10] w-full max-w-[72px] items-center justify-center">
        <Image
          src={assetPath(num)}
          alt=""
          aria-hidden="true"
          width={70}
          height={100}
          unoptimized
          className={`h-full max-h-[96px] w-auto object-contain transition ${selected ? "scale-105" : "group-hover:scale-105"} ${status === "eksik" ? "opacity-40 grayscale" : ""}`}
          draggable={false}
          priority={false}
        />
        {selected && status !== "saglikli" && <span className={`pointer-events-none absolute inset-1 rounded-md ${style.overlay}`} />}
        {status === "cekilen" && <span className="pointer-events-none absolute left-2 right-2 top-1/2 h-0.5 -rotate-12 rounded bg-gray-700/70" />}
        {selected && status !== "saglikli" && <span className={`absolute right-1 top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${style.dot}`} />}
        {marker && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute ${numberPosition === "top" ? "bottom-0" : "top-0"} left-1/2 h-2 w-2 -translate-x-1/2 rounded-full ring-2 ring-white ${MARKER_STYLE[marker].dot}`}
          />
        )}
      </span>
      {numberPosition === "bottom" && <span className="mt-1">{number}</span>}
    </button>
  );
}

function ToothRow({
  teeth,
  selected,
  toothMap,
  markers,
  editable,
  onToggle,
  numberPosition,
  tabStop,
  onToothFocus,
}: {
  teeth: string[];
  selected: string[];
  toothMap: Record<string, ToothStatus>;
  markers: Record<string, ToothMarker>;
  editable: boolean;
  onToggle?: (num: string) => void;
  numberPosition: "top" | "bottom";
  tabStop: string;
  onToothFocus: (num: string) => void;
}) {
  // Telefonda yarım çene bir satır (18–11 / 21–28): 16 diş tek satıra
  // sığmıyor, 21–28 ve 31–38 yatay kaydırmanın arkasında kalıyordu. Geniş
  // ekranda çene tek satırdır.
  const columns = { "--tooth-cols": teeth.length, "--tooth-cols-half": Math.ceil(teeth.length / 2) } as CSSProperties;
  return (
    <div
      className="grid w-full min-w-0 items-center justify-center gap-x-1 gap-y-2 [grid-template-columns:repeat(var(--tooth-cols-half),minmax(0,1fr))] sm:gap-2 sm:[grid-template-columns:repeat(var(--tooth-cols),minmax(0,1fr))]"
      style={columns}
    >
      {teeth.map((num) => {
        const status = toothMap[num] || "saglikli";
        return (
          <ToothAssetButton
            key={num}
            num={num}
            selected={isSelected(num, selected, toothMap)}
            status={status}
            marker={markers[num]}
            editable={editable}
            numberPosition={numberPosition}
            tabStop={num === tabStop}
            onClick={() => onToggle?.(num)}
            onFocus={() => onToothFocus(num)}
          />
        );
      })}
    </div>
  );
}

/**
 * Diş şeması (FDI numaralı). Telefonda her çene iki satırdır (yarım çene
 * başına bir satır, diş başına ~32 px dokunma alanı); önceden 16 dişlik sıra
 * yatay kayıyor, 21–28 ve 31–38 kaydırma ipucu olmadan ekran dışında kalıyordu.
 *
 * Klavye: şema tek Tab durağıdır (gezici odak). Sol/sağ ok aynı çenede, yukarı/
 * aşağı ok karşı çenedeki aynı sıradaki dişe, Home/End çenenin başına/sonuna
 * gider; Boşluk/Enter seçer. Önceden her diş ayrı duraktı (formu geçmek için
 * 26–32 kez Tab).
 */
export function OdontogramSelector({
  selected = [],
  onToggle,
  toothMap = {},
  markers = {},
  dentition = "adult",
  editable = true,
  showLegend = false,
  legendExtra,
  frame = true,
  heightClassName = "",
  className = "",
}: OdontogramSelectorProps) {
  const upper = dentition === "adult" ? ADULT_UPPER : CHILD_UPPER;
  const lower = dentition === "adult" ? ADULT_LOWER : CHILD_LOWER;
  const chartRef = useRef<HTMLDivElement>(null);
  const [focusedTooth, setFocusedTooth] = useState<string | null>(null);
  // Tab durağı: son odaklanan diş; yoksa ilk seçili diş; o da yoksa çenenin ilk dişi.
  const allTeeth = [...upper, ...lower];
  const tabStop = (focusedTooth && allTeeth.includes(focusedTooth) ? focusedTooth : null)
    ?? allTeeth.find((num) => isSelected(num, selected, toothMap))
    ?? upper[0];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = (event.target as HTMLElement).closest<HTMLElement>("[data-tooth]")?.dataset.tooth;
    if (!current) return;
    const row = upper.includes(current) ? upper : lower;
    const other = row === upper ? lower : upper;
    const index = row.indexOf(current);
    let next: string | undefined;
    if (event.key === "ArrowRight") next = row[Math.min(row.length - 1, index + 1)];
    else if (event.key === "ArrowLeft") next = row[Math.max(0, index - 1)];
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // Üst çenede aşağı ok alt çeneye, alt çenede yukarı ok üst çeneye geçer.
      const toOther = (event.key === "ArrowDown") === (row === upper);
      next = toOther ? other[Math.min(other.length - 1, index)] : current;
    } else if (event.key === "Home") next = row[0];
    else if (event.key === "End") next = row[row.length - 1];
    if (!next) return;
    event.preventDefault();
    if (next === current) return;
    setFocusedTooth(next);
    chartRef.current?.querySelector<HTMLButtonElement>(`[data-tooth="${next}"]`)?.focus();
  };

  // Tek çerçeve: önceden çerçeve › çerçeve (iki kat kenarlık) içinde çiziliyordu;
  // kart içinde üç kat kutu oluşuyordu. Çeneler arasında yalnız ince çizgi.
  return (
    <div className={`min-w-0 ${frame ? "rounded-lg border border-slate-200 bg-white p-2 sm:p-3" : ""} ${className}`}>
      <div className={`min-w-0 overflow-x-auto ${heightClassName}`}>
        <div
          ref={chartRef}
          role="group"
          aria-label="Diş şeması"
          onKeyDown={onKeyDown}
          className={`mx-auto flex w-full min-w-0 flex-col gap-3 sm:gap-4 ${frame ? "px-1 py-1 sm:px-3 sm:py-2" : "py-1"}`}
        >
          <ToothRow teeth={upper} selected={selected} toothMap={toothMap} markers={markers} editable={editable} onToggle={onToggle} numberPosition="top" tabStop={tabStop} onToothFocus={setFocusedTooth} />
          <div aria-hidden="true" className="border-t border-dashed border-slate-200" />
          <ToothRow teeth={lower} selected={selected} toothMap={toothMap} markers={markers} editable={editable} onToggle={onToggle} numberPosition="bottom" tabStop={tabStop} onToothFocus={setFocusedTooth} />
        </div>
      </div>
      {(showLegend || legendExtra) && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
          {showLegend && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Şema açıklaması">
              <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded border-2 border-primary bg-primary/[0.06]" />Seçili</li>
              <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${MARKER_STYLE.pending.dot}`} />Yapılacak tedavi</li>
              <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${MARKER_STYLE.done.dot}`} />Yapılan tedavi</li>
            </ul>
          )}
          {legendExtra && <div className="ml-auto">{legendExtra}</div>}
        </div>
      )}
    </div>
  );
}
