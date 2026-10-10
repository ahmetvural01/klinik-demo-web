import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { evaluateSystemAlerts } from "@/lib/system-alerts";

// Alarmlar platform geneli ölçümlerden üretilir; yalnız süperadmin okur
// (bkz. ../metrics/route.ts).
export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  return NextResponse.json({
    alerts: evaluateSystemAlerts(),
    generatedAt: new Date().toISOString(),
  });
}
