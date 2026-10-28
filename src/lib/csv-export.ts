"use client";

import Papa from "papaparse";

type CsvValue = string | number | boolean | null | undefined;

/**
 * Excel'de formül gibi çalışabilecek metinleri (=, +, @, sekme, satır başı ve
 * sayı olmayan "-" ile başlayan) başına ' koyarak düz metne çevirir; hasta adı
 * ya da not "=..." ile başlarsa dosya açılınca hesaplanmasın. "-980,00" gibi
 * negatif tutarlar sayı olarak kalır.
 */
function neutralizeFormula(value: CsvValue): CsvValue {
  if (typeof value !== "string" || value.length === 0) return value;
  const first = value[0];
  if (first === "=" || first === "+" || first === "@" || first === "\t" || first === "\r") return `'${value}`;
  if (first === "-" && !/^-[\d.,]+$/.test(value)) return `'${value}`;
  return value;
}

export function downloadCsv(filename: string, rows: Record<string, CsvValue>[]) {
  const safeRows = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, neutralizeFormula(value)])));
  const csv = Papa.unparse(safeRows, {
    delimiter: ";",
    quotes: false,
    skipEmptyLines: true,
  });
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
