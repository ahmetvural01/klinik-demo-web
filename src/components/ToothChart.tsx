"use client";

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
  saglikli: "Saglikli",
  cukur: "Curuk",
  dolgu: "Dolgu",
  cekilen: "Cekilen",
  kaplik: "Kaplik",
  kanal: "Kanal",
  eksik: "Eksik",
};

export const TOOTH_STATUS_BADGE: Record<ToothStatus, string> = {
  saglikli: "bg-white border-gray-300 text-gray-700",
  cukur: "bg-red-100 border-red-400 text-red-700",
  dolgu: "bg-yellow-100 border-yellow-400 text-yellow-700",
  cekilen: "bg-gray-200 border-gray-400 text-gray-600",
  kaplik: "bg-blue-100 border-blue-400 text-blue-700",
  kanal: "bg-purple-100 border-purple-400 text-purple-700",
  eksik: "bg-slate-100 border-slate-300 text-slate-500",
};

const STATUS_FILL: Record<string, string> = {
  saglikli: "#fef9ee",
  cukur: "#fee2e2",
  dolgu: "#fef9c3",
  cekilen: "#f3f4f6",
  kaplik: "#dbeafe",
  kanal: "#f3e8ff",
  eksik: "#f1f5f9",
};

const STATUS_STROKE: Record<string, string> = {
  saglikli: "#b48a53",
  cukur: "#dc2626",
  dolgu: "#ca8a04",
  cekilen: "#6b7280",
  kaplik: "#2563eb",
  kanal: "#9333ea",
  eksik: "#64748b",
};

function SimpleToothIcon({
  status,
  sel,
  upper,
}: {
  status?: string;
  sel?: boolean;
  upper?: boolean;
}) {
  const fill = sel ? "#1e40af" : (STATUS_FILL[status ?? "saglikli"] ?? "#fef9ee");
  const stroke = sel ? "#1e3a8a" : (STATUS_STROKE[status ?? "saglikli"] ?? "#b48a53");

  if (upper) {
    return (
      <svg viewBox="0 0 32 56" fill="none" width="100%" height="100%">
        <rect x="2" y="2" width="28" height="36" rx="7" fill={fill} stroke={stroke} strokeWidth="1.5" />
        <rect x="9" y="36" width="4" height="16" rx="2" fill={fill} stroke={stroke} strokeWidth="1" />
        <rect x="19" y="36" width="4" height="14" rx="2" fill={fill} stroke={stroke} strokeWidth="1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 56" fill="none" width="100%" height="100%">
      <rect x="9" y="2" width="4" height="16" rx="2" fill={fill} stroke={stroke} strokeWidth="1" />
      <rect x="19" y="2" width="4" height="14" rx="2" fill={fill} stroke={stroke} strokeWidth="1" />
      <rect x="2" y="16" width="28" height="36" rx="7" fill={fill} stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

function isUpper(num: string): boolean {
  const q = Math.floor(parseInt(num, 10) / 10);
  return q === 1 || q === 2 || q === 5 || q === 6;
}

export function ToothButton({
  num,
  selected,
  onClick,
}: {
  num: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={"Dis " + num}
      className={
        "flex flex-col items-center gap-0.5 rounded px-1 py-0.5 transition-all " +
        (selected
          ? "bg-blue-100 ring-2 ring-blue-500"
          : "hover:bg-slate-100")
      }
    >
      <div style={{ width: 28, height: 44 }}>
        <SimpleToothIcon upper={isUpper(num)} sel={selected} />
      </div>
      <span
        className={
          "text-[10px] font-semibold " +
          (selected ? "text-blue-700" : "text-slate-500")
        }
      >
        {num}
      </span>
    </button>
  );
}

function StatusToothButton({
  num,
  status,
  onClick,
}: {
  num: string;
  status: ToothStatus;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={"Dis " + num + " - " + TOOTH_STATUS_LABELS[status]}
      className="flex flex-col items-center gap-0.5 rounded px-1 py-0.5 transition-all hover:ring-2 hover:ring-blue-400/40 hover:bg-slate-50"
    >
      <div style={{ width: 28, height: 44 }}>
        <SimpleToothIcon upper={isUpper(num)} status={status} />
      </div>
      <span className="text-[10px] font-semibold text-slate-500">{num}</span>
    </button>
  );
}

const UPPER_ADULT = ["18","17","16","15","14","13","12","11","21","22","23","24","25","26","27","28"];
const LOWER_ADULT = ["48","47","46","45","44","43","42","41","31","32","33","34","35","36","37","38"];
const UPPER_CHILD = ["55","54","53","52","51","61","62","63","64","65"];
const LOWER_CHILD = ["85","84","83","82","81","71","72","73","74","75"];

type TeethMapProps = {
  toothMap: Record<string, ToothStatus>;
  onToggle?: (num: string) => void;
  editable?: boolean;
};

export function TeethMap({ toothMap, onToggle, editable = true }: TeethMapProps) {
  const [tabType, setTabType] = React.useState<"adult" | "child">("adult");

  const upper = tabType === "adult" ? UPPER_ADULT : UPPER_CHILD;
  const lower = tabType === "adult" ? LOWER_ADULT : LOWER_CHILD;

  const handleClick = (num: string) => {
    if (editable && onToggle) onToggle(num);
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 overflow-x-auto">
      <div className="flex gap-2 mb-4 border-b border-slate-200 pb-2">
        <button
          onClick={() => setTabType("adult")}
          className={`px-3 py-1.5 text-sm font-semibold rounded-md transition ${
            tabType === "adult"
              ? "bg-blue-600 text-white"
              : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          Yetiskin Disleri
        </button>
        <button
          onClick={() => setTabType("child")}
          className={`px-3 py-1.5 text-sm font-semibold rounded-md transition ${
            tabType === "child"
              ? "bg-blue-600 text-white"
              : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          Cocuk Disleri
        </button>
      </div>

      <div className="flex justify-center gap-0.5 mb-1">
        {upper.map((n) => (
          <StatusToothButton
            key={n}
            num={n}
            status={toothMap[n] ?? "saglikli"}
            onClick={() => handleClick(n)}
          />
        ))}
      </div>

      <div className="border-t-2 border-dashed border-slate-200 my-2" />

      <div className="flex justify-center gap-0.5 mt-1">
        {lower.map((n) => (
          <StatusToothButton
            key={n}
            num={n}
            status={toothMap[n] ?? "saglikli"}
            onClick={() => handleClick(n)}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        {(Object.keys(TOOTH_STATUS_LABELS) as ToothStatus[]).map((s) => (
          <span
            key={s}
            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${TOOTH_STATUS_BADGE[s]}`}
          >
            {TOOTH_STATUS_LABELS[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
