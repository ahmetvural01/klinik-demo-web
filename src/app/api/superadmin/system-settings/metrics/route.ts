import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { getMetricsSnapshot } from "@/lib/metrics";
import { evaluateSystemAlerts } from "@/lib/system-alerts";

// Sistem Ayarları › Teknik ölçümler: sayaçlar ve alarmlar tek istekte.
// /api/system/metrics ve /alerts da yalnız süperadmine açık; ama o yollar
// süperadmin yüzeyi sayılmadığı için tarayıcıda açık bir gizli klinik girişi
// (ghost çerezi) varsa onun kimliği (klinik yöneticisi) okunuyor, sekme 403
// alıyordu. /api/superadmin altı her zaman süperadminin kendi oturumunu okur
// ve "settings" modül yetkisine bağlıdır (bkz. lib/superadmin-modules).
export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  return NextResponse.json({
    metrics: getMetricsSnapshot(),
    alerts: evaluateSystemAlerts(),
    generatedAt: new Date().toISOString(),
  });
}
