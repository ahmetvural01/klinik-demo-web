import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { getMetricsSnapshot } from "@/lib/metrics";

// Sayaçlar ve süreler süreç geneli, yani platform geneli tutulur (bütün
// kliniklerin istek sayıları, yavaş rotalar). Önceden audit:read ile her klinik
// yöneticisine açıktı; artık yalnız süperadmin okur (Sistem Ayarları › Teknik
// ölçümler).
export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  return NextResponse.json(getMetricsSnapshot());
}
