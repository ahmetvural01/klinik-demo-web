"use client";

import Image from "next/image";
import React from "react";

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

export const TOOTH_STATUS_BADGE: Record<ToothStatus, string> = {
  saglikli: "bg-white border-gray-300 text-gray-700",
  cukur: "bg-red-100 border-red-400 text-red-700",
  dolgu: "bg-blue-100 border-blue-400 text-blue-700",
  cekilen: "bg-gray-200 border-gray-400 text-gray-600",
  kaplik: "bg-amber-100 border-amber-400 text-amber-700",
  kanal: "bg-fuchsia-100 border-fuchsia-400 text-fuchsia-700",
  eksik: "bg-slate-100 border-slate-300 text-slate-500",
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

type Dentition = "adult" | "child";

type OdontogramSelectorProps = {
  selected?: string[];
  onToggle?: (num: string) => void;
  toothMap?: Record<string, ToothStatus>;
  dentition?: Dentition;
  editable?: boolean;
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
  editable,
  numberPosition,
  onClick,
}: {
  num: string;
  selected: boolean;
  status: ToothStatus;
  editable: boolean;
  numberPosition: "top" | "bottom";
  onClick: () => void;
}) {
  const style = STATUS_STYLE[status] || STATUS_STYLE.saglikli;
  const activeClass = selected ? style.ring : "border-transparent hover:border-slate-200 hover:bg-slate-50/80";
  const number = (
    <span className={`text-sm leading-none ${selected ? "font-black text-slate-950" : "font-semibold text-slate-500 group-hover:text-slate-900"}`}>
      {num}
    </span>
  );

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!editable}
      title={`Diş ${num}${status !== "saglikli" ? ` - ${TOOTH_STATUS_LABELS[status]}` : ""}`}
      className={`group relative flex min-w-0 flex-col items-center justify-center rounded-md border px-0.5 py-1 transition focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-default ${activeClass}`}
    >
      {numberPosition === "top" && <span className="mb-1">{number}</span>}
      <span className="relative flex aspect-[7/10] w-full max-w-[72px] items-center justify-center">
        <Image
          src={assetPath(num)}
          alt={`Diş ${num}`}
          width={70}
          height={100}
          className={`h-full max-h-[96px] w-auto object-contain transition ${selected ? "scale-105" : "group-hover:scale-105"} ${status === "eksik" ? "opacity-40 grayscale" : ""}`}
          draggable={false}
          priority={false}
        />
        {selected && <span className={`pointer-events-none absolute inset-1 rounded-md ${style.overlay}`} />}
        {status === "cekilen" && <span className="pointer-events-none absolute left-2 right-2 top-1/2 h-0.5 -rotate-12 rounded bg-gray-700/70" />}
        {selected && <span className={`absolute right-1 top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${style.dot}`} />}
      </span>
      {numberPosition === "bottom" && <span className="mt-1">{number}</span>}
    </button>
  );
}

function ToothRow({
  teeth,
  selected,
  toothMap,
  editable,
  onToggle,
  numberPosition,
}: {
  teeth: string[];
  selected: string[];
  toothMap: Record<string, ToothStatus>;
  editable: boolean;
  onToggle?: (num: string) => void;
  numberPosition: "top" | "bottom";
}) {
  return (
    <div
      className="grid w-full min-w-0 items-center justify-center gap-1 sm:gap-2"
      style={{ gridTemplateColumns: `repeat(${teeth.length}, minmax(0, 1fr))` }}
    >
      {teeth.map((num) => {
        const status = toothMap[num] || "saglikli";
        return (
          <ToothAssetButton
            key={num}
            num={num}
            selected={isSelected(num, selected, toothMap)}
            status={status}
            editable={editable}
            numberPosition={numberPosition}
            onClick={() => onToggle?.(num)}
          />
        );
      })}
    </div>
  );
}

export function OdontogramSelector({
  selected = [],
  onToggle,
  toothMap = {},
  dentition = "adult",
  editable = true,
  heightClassName = "",
  className = "",
}: OdontogramSelectorProps) {
  const upper = dentition === "adult" ? ADULT_UPPER : CHILD_UPPER;
  const lower = dentition === "adult" ? ADULT_LOWER : CHILD_LOWER;

  return (
    <div className={`min-w-0 rounded-lg border border-slate-200 bg-white p-3 ${className}`}>
      <div className={`min-w-0 overflow-hidden rounded-sm border border-slate-300 bg-white px-3 py-4 sm:px-5 ${heightClassName}`}>
        <div className="mx-auto flex w-full min-w-0 flex-col gap-4">
          <ToothRow teeth={upper} selected={selected} toothMap={toothMap} editable={editable} onToggle={onToggle} numberPosition="top" />
          <ToothRow teeth={lower} selected={selected} toothMap={toothMap} editable={editable} onToggle={onToggle} numberPosition="bottom" />
        </div>
      </div>
    </div>
  );
}

type TeethMapProps = {
  toothMap: Record<string, ToothStatus>;
  onToggle?: (num: string) => void;
  editable?: boolean;
};

export function TeethMap({ toothMap, onToggle, editable = true }: TeethMapProps) {
  const [tabType, setTabType] = React.useState<Dentition>("adult");

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4 flex gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setTabType("adult")}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
            tabType === "adult" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          Yetişkin Dişleri
        </button>
        <button
          type="button"
          onClick={() => setTabType("child")}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
            tabType === "child" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          Çocuk Dişleri
        </button>
      </div>

      <OdontogramSelector
        toothMap={toothMap}
        onToggle={onToggle}
        dentition={tabType}
        editable={editable}
        className="border-0 p-0"
      />

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        {(Object.keys(TOOTH_STATUS_LABELS) as ToothStatus[]).map((status) => (
          <span
            key={status}
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${TOOTH_STATUS_BADGE[status]}`}
          >
            <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[status].dot}`} />
            {TOOTH_STATUS_LABELS[status]}
          </span>
        ))}
      </div>
    </div>
  );
}
