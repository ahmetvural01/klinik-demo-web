"use client";

import { Button } from "@/components/ui/Button";

// FDI diş numaraları — hastanın karşısından bakış (sağ üst çeyrek solda).
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const UPPER = [...UPPER_RIGHT, ...UPPER_LEFT];
const LOWER = [...LOWER_RIGHT, ...LOWER_LEFT];

export function parseTeeth(value?: string | null): number[] {
  return (value || "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((num) => Number.isInteger(num) && num > 0);
}

export function formatTeeth(nums: number[]) {
  return [...nums].sort((a, b) => a - b).join(", ");
}

/**
 * Laboratuvar işi için diş seçimi (FDI). Tek dokunuşla diş, "Üst çene /
 * Alt çene / Tüm ağız" ile toplu seçim. Dar ekranda her çene iki satıra
 * bölünür; yatay kaydırma gerekmez.
 */
export function LabToothPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = parseTeeth(value);
  const setSelected = (nums: number[]) => onChange(formatTeeth(Array.from(new Set(nums))));
  const toggle = (num: number) => setSelected(selected.includes(num) ? selected.filter((n) => n !== num) : [...selected, num]);
  const toggleGroup = (group: number[]) => {
    const allSelected = group.every((n) => selected.includes(n));
    setSelected(allSelected ? selected.filter((n) => !group.includes(n)) : [...selected, ...group]);
  };

  const tooth = (num: number) => {
    const active = selected.includes(num);
    return (
      <button
        key={num}
        type="button"
        onClick={() => toggle(num)}
        aria-pressed={active}
        aria-label={`Diş ${num}`}
        className={`flex h-8 min-w-0 items-center justify-center rounded-md border text-xs font-semibold tabular-nums transition-colors ${
          active
            ? "border-primary bg-primary text-white"
            : "border-slate-200 bg-white text-slate-600 hover:border-primary/40 hover:bg-primary/5"
        }`}
      >
        {num}
      </button>
    );
  };

  const jaw = (label: string, right: number[], left: number[]) => (
    <div>
      <p className="mb-1 text-xs font-semibold text-slate-500">{label}</p>
      <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
        <div className="grid grid-cols-8 gap-1">{right.map(tooth)}</div>
        <div className="grid grid-cols-8 gap-1">{left.map(tooth)}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-wrap gap-1.5">
        {[
          { label: "Üst çene", group: UPPER },
          { label: "Alt çene", group: LOWER },
          { label: "Tüm ağız", group: [...UPPER, ...LOWER] },
        ].map(({ label, group }) => (
          <Button
            key={label}
            size="sm"
            variant={group.every((n) => selected.includes(n)) ? "primary" : "secondary"}
            onClick={() => toggleGroup(group)}
          >
            {label}
          </Button>
        ))}
        {selected.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Seçimi temizle
          </Button>
        )}
      </div>
      {jaw("Üst çene", UPPER_RIGHT, UPPER_LEFT)}
      {jaw("Alt çene", LOWER_RIGHT, LOWER_LEFT)}
      <p className="text-xs text-slate-500" aria-live="polite">
        {selected.length > 0 ? (
          <>
            <span className="font-semibold text-slate-700">{selected.length} diş seçili:</span> {formatTeeth(selected)}
          </>
        ) : (
          "Diş seçmek zorunlu değil; plak/protez gibi işlerde boş bırakabilirsiniz."
        )}
      </p>
    </div>
  );
}
