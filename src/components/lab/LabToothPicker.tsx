"use client";

import { useState } from "react";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { OdontogramSelector } from "@/components/ToothChart";

type Dentition = "adult" | "child";

// FDI diş numaraları — ortak diş şemasıyla (ToothChart) aynı sıra.
const ADULT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const ADULT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const CHILD_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const CHILD_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

const DENTITION_OPTIONS: { value: Dentition; label: string }[] = [
  { value: "adult", label: "Daimi dişler" },
  { value: "child", label: "Süt dişleri" },
];

export function parseTeeth(value?: string | null): number[] {
  return (value || "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((num) => Number.isInteger(num) && num > 0);
}

export function formatTeeth(nums: number[]) {
  return [...nums].sort((a, b) => a - b).join(", ");
}

/** Süt dişi FDI çeyrekleri 5–8 (51–85). */
const isPrimaryTooth = (num: number) => num >= 51 && num <= 85;

const PILL = "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const PILL_ON = "border-primary bg-primary/10 text-primary";
const PILL_OFF = "border-slate-200 bg-white text-slate-600 hover:border-slate-300";

/**
 * Laboratuvar işi için diş seçimi. Hasta dosyasındaki tedavi ekranıyla AYNI
 * ortak diş şemasını (OdontogramSelector) kullanır; önceden lab'e özel bir
 * numara ızgarası vardı ve süt dişi seçilemiyordu. "Üst çene / Alt çene /
 * Tüm ağız" görünen şemadaki dişleri topluca seçer. Şema değiştirmek seçimi
 * silmez (karma dişlenmede iki şemadan diş seçilebilir); özet hepsini yazar.
 */
export function LabToothPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = parseTeeth(value);
  // Kayıtlı iş yalnız süt dişi içeriyorsa şema süt dişleriyle açılır.
  const [dentition, setDentition] = useState<Dentition>(() => (selected.length > 0 && selected.every(isPrimaryTooth) ? "child" : "adult"));
  const upper = dentition === "adult" ? ADULT_UPPER : CHILD_UPPER;
  const lower = dentition === "adult" ? ADULT_LOWER : CHILD_LOWER;
  const all = [...upper, ...lower];

  const setSelected = (nums: number[]) => onChange(formatTeeth(Array.from(new Set(nums))));
  const toggle = (num: number) => setSelected(selected.includes(num) ? selected.filter((n) => n !== num) : [...selected, num]);
  const allIn = (group: number[]) => group.every((n) => selected.includes(n));
  const toggleGroup = (group: number[]) => setSelected(allIn(group) ? selected.filter((n) => !group.includes(n)) : [...selected, ...group]);

  const groupButton = (label: string, group: number[]) => (
    <button type="button" aria-pressed={allIn(group)} onClick={() => toggleGroup(group)} className={`${PILL} ${allIn(group) ? PILL_ON : PILL_OFF}`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <ChoiceCards
          label="Diş şeması"
          labelHidden
          variant="pills"
          options={DENTITION_OPTIONS}
          value={dentition}
          onChange={setDentition}
        />
        <div role="group" aria-label="Toplu seçim" className="flex flex-wrap gap-1.5 sm:ml-auto">
          {groupButton("Üst çene", upper)}
          {groupButton("Alt çene", lower)}
          {groupButton("Tüm ağız", all)}
        </div>
      </div>
      <OdontogramSelector
        selected={selected.map(String)}
        dentition={dentition}
        onToggle={(num) => toggle(Number(num))}
      />
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-slate-500" aria-live="polite">
          {selected.length > 0 ? <><span className="font-semibold text-slate-700">{selected.length} diş:</span> {formatTeeth(selected)}</> : "Diş seçilmedi"}
        </p>
        {selected.length > 0 && (
          <button type="button" onClick={() => setSelected([])} className={`${PILL} ml-auto border-transparent bg-transparent text-slate-500 hover:text-slate-800`}>
            Seçimi temizle
          </button>
        )}
      </div>
    </div>
  );
}
