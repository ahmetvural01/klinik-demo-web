import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { evaluateSystemAlerts } from "@/lib/system-alerts";

export async function GET() {
  const auth = await requireAuth("audit:read");
  if (auth.error) return auth.error;

  return NextResponse.json({
    alerts: evaluateSystemAlerts(),
    generatedAt: new Date().toISOString(),
  });
}
