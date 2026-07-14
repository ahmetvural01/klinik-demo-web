"use client";

import type { ConsistencyIssue } from "@/lib/data-consistency";

// Raporlar ve Sistem İzleme sayfaları aynı ConsistencyIssue.severity değerini
// gösteriyor — renk paleti tek yerden tanımlanır ki iki ekran farklı renklerle
// birbirinden sapmasın.
export const CONSISTENCY_SEVERITY_STYLE: Record<
  ConsistencyIssue["severity"],
  { badge: string; dot: string; label: string }
> = {
  critical: { badge: "bg-red-50 border-red-200 text-red-700", dot: "bg-red-500", label: "Kritik" },
  warning: { badge: "bg-amber-50 border-amber-200 text-amber-700", dot: "bg-amber-500", label: "Uyarı" },
  info: { badge: "bg-slate-50 border-slate-200 text-slate-600", dot: "bg-slate-400", label: "Bilgi" },
};
