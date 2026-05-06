import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { evaluateSystemAlerts } from "@/lib/system-alerts";

export async function GET() {
  const auth = await requireAuth("*");
  if (auth.error) return auth.error;

  if (!["SUPERADMIN", "YONETICI"].includes(auth.user.role)) {
    return NextResponse.json({ message: "Bu alana erisim yetkiniz yok." }, { status: 403 });
  }

  return NextResponse.json({
    alerts: evaluateSystemAlerts(),
    generatedAt: new Date().toISOString(),
  });
}
