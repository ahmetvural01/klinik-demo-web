import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { getMetricsSnapshot } from "@/lib/metrics";

export async function GET() {
  const auth = await requireAuth("audit:read");
  if (auth.error) return auth.error;

  return NextResponse.json(getMetricsSnapshot());
}
