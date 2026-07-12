"use client";

import Papa from "papaparse";

type CsvValue = string | number | boolean | null | undefined;

export function downloadCsv(filename: string, rows: Record<string, CsvValue>[]) {
  const csv = Papa.unparse(rows, {
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
