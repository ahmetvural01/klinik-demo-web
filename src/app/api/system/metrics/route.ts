import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { getMetricsSnapshot } from "@/lib/metrics";

export async function GET() {
  const auth = await requireAuth("*");
  if (auth.error) return auth.error;

  if (!["SUPERADMIN", "YONETICI"].includes(auth.user.role)) {
    return NextResponse.json({ message: "Bu metriklere erisim yetkiniz yok." }, { status: 403 });
  }

  return NextResponse.json(getMetricsSnapshot());
}
